#!/usr/bin/env bash
set -Eeuo pipefail

HARDENING_CONFIG=/etc/ssh/sshd_config.d/00-rumi-hardening.conf
SOCKET_OVERRIDE=/etc/systemd/system/ssh.socket.d/10-rumi-listen.conf
MODE=${1:---check}

if [[ "$MODE" == "--check" ]]; then
  printf '%s\n' \
    "This script will require SSH public keys, disable root/password/X11/agent logins," \
    "allow only local TCP forwarding, and bind SSH to the current Tailscale and LAN addresses." \
    "It keeps established SSH sessions open while restarting the listener." \
    "Run: sudo $0 --apply"
  exit 0
fi

if [[ ${EUID} -ne 0 ]]; then
  printf 'Run this operation with sudo: sudo %q %q\n' "$0" "$MODE" >&2
  exit 1
fi

restore_file() {
  local backup_directory=$1
  local backup_name=$2
  local target=$3

  if [[ -e "$backup_directory/$backup_name.missing" ]]; then
    rm -f "$target"
  else
    install -D -m 0644 "$backup_directory/$backup_name" "$target"
  fi
}

restart_ssh() {
  systemctl daemon-reload
  systemctl restart ssh.socket
  systemctl restart ssh.service
}

if [[ "$MODE" == "--rollback" ]]; then
  BACKUP_DIRECTORY=${2:?Pass the backup directory printed by --apply}
  restore_file "$BACKUP_DIRECTORY" sshd-hardening.conf "$HARDENING_CONFIG"
  restore_file "$BACKUP_DIRECTORY" ssh-socket.conf "$SOCKET_OVERRIDE"
  /usr/sbin/sshd -t
  restart_ssh
  printf 'SSH hardening rolled back from %s\n' "$BACKUP_DIRECTORY"
  exit 0
fi

if [[ "$MODE" != "--apply" ]]; then
  printf 'Unknown mode: %s\n' "$MODE" >&2
  exit 1
fi

TARGET_USER=${RUMI_SSH_USER:-${SUDO_USER:-ilchik}}

if [[ "$TARGET_USER" == "root" ]]; then
  TARGET_USER=ilchik
fi

id "$TARGET_USER" >/dev/null

TAILSCALE_IPV4=$(tailscale ip -4 | head -n 1)
TAILSCALE_IPV6=$(tailscale ip -6 | head -n 1)
LAN_IPV4=$(ip -4 route get 1.1.1.1 | awk '{for (index = 1; index <= NF; index += 1) if ($index == "src") {print $(index + 1); exit}}')

if [[ -z "$TAILSCALE_IPV4" || -z "$LAN_IPV4" ]]; then
  printf 'Could not determine both Tailscale and LAN addresses; refusing to change SSH listeners.\n' >&2
  exit 1
fi

BACKUP_DIRECTORY=/var/backups/rumi-ssh-hardening/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$BACKUP_DIRECTORY"

if [[ -e "$HARDENING_CONFIG" ]]; then
  cp -a "$HARDENING_CONFIG" "$BACKUP_DIRECTORY/sshd-hardening.conf"
else
  touch "$BACKUP_DIRECTORY/sshd-hardening.conf.missing"
fi

if [[ -e "$SOCKET_OVERRIDE" ]]; then
  cp -a "$SOCKET_OVERRIDE" "$BACKUP_DIRECTORY/ssh-socket.conf"
else
  touch "$BACKUP_DIRECTORY/ssh-socket.conf.missing"
fi

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  restore_file "$BACKUP_DIRECTORY" sshd-hardening.conf "$HARDENING_CONFIG"
  restore_file "$BACKUP_DIRECTORY" ssh-socket.conf "$SOCKET_OVERRIDE"
  /usr/sbin/sshd -t || true
  restart_ssh || true
  printf 'SSH hardening failed and was rolled back from %s\n' "$BACKUP_DIRECTORY" >&2
  exit "$exit_code"
}
trap rollback_on_error ERR

HARDENING_TEMP=$(mktemp)
SOCKET_TEMP=$(mktemp)
trap 'rm -f "$HARDENING_TEMP" "$SOCKET_TEMP"' EXIT

printf '%s\n' \
  'PasswordAuthentication no' \
  'KbdInteractiveAuthentication no' \
  'PubkeyAuthentication yes' \
  'AuthenticationMethods publickey' \
  'PermitRootLogin no' \
  'PermitEmptyPasswords no' \
  'HostbasedAuthentication no' \
  'IgnoreRhosts yes' \
  'X11Forwarding no' \
  'AllowAgentForwarding no' \
  'AllowTcpForwarding local' \
  'GatewayPorts no' \
  'PermitTunnel no' \
  'PermitUserEnvironment no' \
  'LoginGraceTime 30' \
  'MaxAuthTries 3' \
  'MaxSessions 10' \
  'MaxStartups 10:30:30' \
  'UseDNS no' \
  'LogLevel VERBOSE' \
  "AllowUsers $TARGET_USER" >"$HARDENING_TEMP"

{
  printf '%s\n' '[Socket]' 'ListenStream='
  printf 'ListenStream=%s:22\n' "$TAILSCALE_IPV4"

  if [[ -n "$TAILSCALE_IPV6" ]]; then
    printf 'ListenStream=[%s]:22\n' "$TAILSCALE_IPV6"
  fi

  printf 'ListenStream=%s:22\n' "$LAN_IPV4"
} >"$SOCKET_TEMP"

install -D -m 0644 "$HARDENING_TEMP" "$HARDENING_CONFIG"
install -D -m 0644 "$SOCKET_TEMP" "$SOCKET_OVERRIDE"

/usr/sbin/sshd -t
EFFECTIVE_CONFIG=$(/usr/sbin/sshd -T)

for expected in \
  'passwordauthentication no' \
  'kbdinteractiveauthentication no' \
  'authenticationmethods publickey' \
  'permitrootlogin no' \
  'x11forwarding no' \
  'allowagentforwarding no' \
  'allowtcpforwarding local'; do
  if ! grep -qx "$expected" <<<"$EFFECTIVE_CONFIG"; then
    printf 'Effective SSH configuration is missing: %s\n' "$expected" >&2
    false
  fi
done

restart_ssh

if ss -lntH '( sport = :22 )' | grep -Eq '0\.0\.0\.0:22|\[::\]:22|\*:22'; then
  printf 'SSH still has a wildcard listener; refusing this configuration.\n' >&2
  false
fi

ssh-keyscan -T 3 "$TAILSCALE_IPV4" >/dev/null 2>&1
trap - ERR

printf '%s\n' \
  'SSH hardening applied.' \
  "Allowed user: $TARGET_USER" \
  "Tailscale listener: $TAILSCALE_IPV4:22" \
  "LAN listener: $LAN_IPV4:22" \
  "Backup: $BACKUP_DIRECTORY" \
  "Rollback: sudo $0 --rollback $BACKUP_DIRECTORY"
