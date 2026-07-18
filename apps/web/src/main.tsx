import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";
import "./styles.css";

const App = lazy(async () => {
  const module = await import("./App");
  return { default: module.App };
});

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <Suspense
        fallback={
          <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
            Opening workspace…
          </main>
        }
      >
        <App />
      </Suspense>
    </AuthGate>
  </StrictMode>
);
