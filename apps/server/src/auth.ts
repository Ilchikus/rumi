import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AUTH_STATE_VERSION = 1;
const PASSWORD_KEY_LENGTH = 32;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const AUTH_LOCK_STALE_MS = 30_000;
const AUTH_LOCK_WAIT_MS = 5_000;

export type RumiAuthOptions =
  | { mode: "none" }
  | {
      mode: "password";
      statePath?: string;
      sessionTtlMs?: number;
      secureCookies?: boolean;
    };

export interface SetLocalPasswordOptions {
  workspacePath: string;
  statePath?: string;
  username: string;
  password: string;
}

interface StoredAuthState {
  version: typeof AUTH_STATE_VERSION;
  user: {
    username: string;
    passwordHash: string;
  };
  sessions: Record<string, StoredSession>;
}

interface StoredSession {
  username: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreatedSession {
  token: string;
  username: string;
  expiresAt: string;
}

export class LocalPasswordAuth {
  readonly statePath: string;
  readonly sessionTtlMs: number;
  private mutationQueue: Promise<void> = Promise.resolve();

  private constructor(statePath: string, sessionTtlMs: number) {
    this.statePath = statePath;
    this.sessionTtlMs = sessionTtlMs;
  }

  static async open(options: {
    workspacePath: string;
    statePath?: string;
    sessionTtlMs?: number;
  }): Promise<LocalPasswordAuth> {
    const statePath = await resolveAuthStatePath(options.workspacePath, options.statePath);
    const state = await readAuthState(statePath);

    if (!state) {
      throw new Error(
        `Password authentication is not configured. Run \`rumi auth set-password ${options.workspacePath} --username <username>\` first.`
      );
    }

    return new LocalPasswordAuth(statePath, options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS);
  }

  async authenticate(token: string | undefined): Promise<string | null> {
    if (!token) {
      return null;
    }

    const state = await readRequiredAuthState(this.statePath);
    const session = state.sessions[hashSessionToken(token)];
    const expiresAt = session ? Date.parse(session.expiresAt) : Number.NaN;

    if (!session || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }

    return session.username === state.user.username ? session.username : null;
  }

  async login(username: string, password: string): Promise<CreatedSession | null> {
    return this.withMutationLock(async () => {
      const state = await readRequiredAuthState(this.statePath);

      if (username !== state.user.username || !(await verifyPassword(password, state.user.passwordHash))) {
        return null;
      }

      removeExpiredSessions(state);
      const token = randomBytes(32).toString("base64url");
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + this.sessionTtlMs);
      state.sessions[hashSessionToken(token)] = {
        username: state.user.username,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
      await writeAuthState(this.statePath, state);

      return {
        token,
        username: state.user.username,
        expiresAt: expiresAt.toISOString()
      };
    });
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.withMutationLock(async () => {
      const state = await readRequiredAuthState(this.statePath);
      delete state.sessions[hashSessionToken(token)];
      removeExpiredSessions(state);
      await writeAuthState(this.statePath, state);
    });
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => undefined;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await withAuthStateLock(this.statePath, operation);
    } finally {
      release();
    }
  }
}

export async function setLocalPassword(options: SetLocalPasswordOptions): Promise<{ statePath: string }> {
  validateUsername(options.username);
  validatePassword(options.password);

  const statePath = await resolveAuthStatePath(options.workspacePath, options.statePath);
  const passwordHash = await hashPassword(options.password);
  await withAuthStateLock(statePath, async () => {
    await writeAuthState(statePath, {
      version: AUTH_STATE_VERSION,
      user: {
        username: options.username,
        passwordHash
      },
      sessions: {}
    });
  });

  return { statePath };
}

export async function resolveAuthStatePath(
  workspacePath: string,
  statePath?: string
): Promise<string> {
  if (statePath) {
    return path.resolve(statePath);
  }

  let canonicalWorkspacePath = path.resolve(workspacePath);

  try {
    canonicalWorkspacePath = await fs.realpath(canonicalWorkspacePath);
  } catch {
    // The runtime will provide the more useful missing-workspace error when it opens the workspace.
  }

  const stateRoot = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(os.homedir(), ".local", "state");
  const workspaceId = createHash("sha256").update(canonicalWorkspacePath).digest("hex");
  return path.join(stateRoot, "rumi", "auth", `${workspaceId}.json`);
}

function validateUsername(username: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(username)) {
    throw new Error(
      "Username must be 1-64 characters and contain only letters, numbers, dots, underscores, or hyphens"
    );
  }
}

function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters");
  }

  if (password.length > 1_024) {
    throw new Error("Password must be at most 1024 characters");
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION
  });

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText, extra] =
    encodedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !costText ||
    !blockSizeText ||
    !parallelizationText ||
    !saltText ||
    !hashText ||
    extra !== undefined
  ) {
    return false;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);

  if (
    !Number.isSafeInteger(cost) ||
    !Number.isSafeInteger(blockSize) ||
    !Number.isSafeInteger(parallelization) ||
    cost < SCRYPT_COST ||
    cost > SCRYPT_COST * 8 ||
    blockSize < 1 ||
    blockSize > 32 ||
    parallelization < 1 ||
    parallelization > 16
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await derivePassword(password, Buffer.from(saltText, "base64url"), {
      cost,
      blockSize,
      parallelization
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function derivePassword(
  password: string,
  salt: Buffer,
  options: { cost: number; blockSize: number; parallelization: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      {
        N: options.cost,
        r: options.blockSize,
        p: options.parallelization,
        maxmem: SCRYPT_MAX_MEMORY
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }
    );
  });
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function removeExpiredSessions(state: StoredAuthState): void {
  const now = Date.now();

  for (const [tokenHash, session] of Object.entries(state.sessions)) {
    const expiresAt = Date.parse(session.expiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      delete state.sessions[tokenHash];
    }
  }
}

async function readRequiredAuthState(statePath: string): Promise<StoredAuthState> {
  const state = await readAuthState(statePath);

  if (!state) {
    throw new Error(`Password authentication state disappeared: ${statePath}`);
  }

  return state;
}

async function readAuthState(statePath: string): Promise<StoredAuthState | null> {
  let source: string;

  try {
    source = await fs.readFile(statePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const value = JSON.parse(source) as unknown;

  if (!isStoredAuthState(value)) {
    throw new Error(`Invalid Rumi authentication state: ${statePath}`);
  }

  return value;
}

async function writeAuthState(statePath: string, state: StoredAuthState): Promise<void> {
  const directory = path.dirname(statePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);

  const temporaryPath = `${statePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    await fs.rename(temporaryPath, statePath);
    await fs.chmod(statePath, 0o600);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function withAuthStateLock<T>(statePath: string, operation: () => Promise<T>): Promise<T> {
  const directory = path.dirname(statePath);
  const lockPath = `${statePath}.lock`;
  const deadline = Date.now() + AUTH_LOCK_WAIT_MS;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);

      try {
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, "utf8");
        return await operation();
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      const lockIsStale = await isStaleLock(lockPath);

      if (lockIsStale) {
        await fs.rm(lockPath, { force: true });
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for the Rumi authentication state lock: ${lockPath}`);
      }

      await delay(25);
    }
  }
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(lockPath);
    return Date.now() - stats.mtimeMs > AUTH_LOCK_STALE_MS;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isStoredAuthState(value: unknown): value is StoredAuthState {
  if (!isRecord(value) || value.version !== AUTH_STATE_VERSION || !isRecord(value.user)) {
    return false;
  }

  if (
    typeof value.user.username !== "string" ||
    typeof value.user.passwordHash !== "string" ||
    !isRecord(value.sessions)
  ) {
    return false;
  }

  return Object.values(value.sessions).every(
    (session) =>
      isRecord(session) &&
      typeof session.username === "string" &&
      typeof session.createdAt === "string" &&
      Number.isFinite(Date.parse(session.createdAt)) &&
      typeof session.expiresAt === "string" &&
      Number.isFinite(Date.parse(session.expiresAt))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
