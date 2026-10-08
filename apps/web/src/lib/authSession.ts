import { useSyncExternalStore } from "react";
import { RumiApiClient } from "@rumi/api-client";

export interface AuthSessionSnapshot {
  /** The server rejected a request because the session is missing or expired. */
  expired: boolean;
  /** Increments every time an expired session is restored by signing in again. */
  restoredCount: number;
}

type Listener = () => void;

let snapshot: AuthSessionSnapshot = { expired: false, restoredCount: 0 };
const listeners = new Set<Listener>();

function publish(next: AuthSessionSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function markAuthSessionExpired(): void {
  if (!snapshot.expired) publish({ ...snapshot, expired: true });
}

export function markAuthSessionRestored(): void {
  if (snapshot.expired) {
    publish({ expired: false, restoredCount: snapshot.restoredCount + 1 });
  }
}

export function authSessionSnapshot(): AuthSessionSnapshot {
  return snapshot;
}

export function subscribeAuthSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthSession(): AuthSessionSnapshot {
  return useSyncExternalStore(subscribeAuthSession, authSessionSnapshot, authSessionSnapshot);
}

/** API client for the official web app: a missing session opens the sign-in screen. */
export function createWorkspaceApiClient(): RumiApiClient {
  return new RumiApiClient({ onAuthenticationRequired: markAuthSessionExpired });
}

export function resetAuthSessionForTests(): void {
  snapshot = { expired: false, restoredCount: 0 };
  listeners.clear();
}
