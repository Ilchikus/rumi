import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { WorkspaceLoadingShell } from "./components/layout/WorkspaceLoadingShell";
import "./styles.css";

const appModule = import("./App");
const App = lazy(async () => {
  const module = await appModule;
  return { default: module.App };
});

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <Suspense fallback={<WorkspaceLoadingShell />}>
        <App />
      </Suspense>
    </AuthGate>
  </StrictMode>
);
