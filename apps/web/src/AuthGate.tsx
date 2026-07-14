import { type FormEvent, type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import { RumiApiClient } from "@rumi/api-client";
import type { AuthSessionResult } from "@rumi/contracts";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type GateState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; session: AuthSessionResult };

export function AuthGate({ children }: { children: ReactNode }): ReactElement {
  const api = useMemo(() => new RumiApiClient(), []);
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadSession = async () => {
    setState({ status: "loading" });

    try {
      setState({ status: "ready", session: await api.getAuthSession() });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };

  useEffect(() => {
    let active = true;

    api.getAuthSession().then(
      (session) => {
        if (active) {
          setState({ status: "ready", session });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({ status: "error", message: errorMessage(error) });
        }
      }
    );

    return () => {
      active = false;
    };
  }, [api]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLoginError("");

    try {
      const session = await api.login({ username, password });
      setPassword("");
      setState({ status: "ready", session });
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);

    try {
      const session = await api.logout();
      setState({ status: "ready", session });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    } finally {
      setLoggingOut(false);
    }
  };

  if (state.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Opening Rumi…
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/40 px-4">
        <section className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rumi</p>
          <h1 className="mt-2 text-xl font-semibold">Could not reach this instance</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          <Button className="mt-5 w-full" type="button" onClick={() => void loadSession()}>
            Try again
          </Button>
        </section>
      </main>
    );
  }

  if (!state.session.authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/40 px-4">
        <form
          className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm"
          onSubmit={(event) => void submitLogin(event)}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rumi</p>
          <h1 className="mt-2 text-xl font-semibold">Sign in to this instance</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the login configured by the owner of this server.
          </p>

          <label className="mt-5 block text-sm font-medium" htmlFor="rumi-username">
            Username
          </label>
          <Input
            id="rumi-username"
            className="mt-1.5"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <label className="mt-4 block text-sm font-medium" htmlFor="rumi-password">
            Password
          </label>
          <Input
            id="rumi-password"
            className="mt-1.5"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {loginError && <p className="mt-3 text-sm text-destructive">{loginError}</p>}

          <Button className="mt-5 w-full" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <>
      {children}
      {state.session.mode === "password" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="fixed bottom-3 right-3 z-50 bg-background/95 shadow-sm"
          disabled={loggingOut}
          onClick={() => void logout()}
          title={`Signed in as ${state.session.user?.username ?? "user"}`}
        >
          {loggingOut ? "Signing out…" : "Sign out"}
        </Button>
      )}
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
