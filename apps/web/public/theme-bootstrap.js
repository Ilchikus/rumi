(() => {
  let preference = "auto";
  try {
    const snapshot = JSON.parse(
      localStorage.getItem("rumi-new-workspace-startup:v1") || "null"
    );
    const workspaceRootPath = snapshot?.workspace?.rootPath;
    const saved = workspaceRootPath
      ? localStorage.getItem(`rumi-new-theme:${workspaceRootPath}`)
      : null;
    if (saved === "auto" || saved === "light" || saved === "dark") {
      preference = saved;
    }
  } catch {
    // Theme persistence is optional; system appearance remains the default.
  }

  const systemPrefersDark = typeof matchMedia === "function"
    && matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preference === "dark" || (preference === "auto" && systemPrefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
