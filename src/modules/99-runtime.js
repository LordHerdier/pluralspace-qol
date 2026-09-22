// src/modules/99-runtime.js

function applyAll() {
  injectBaseStyle();
  sync24h();
  syncDashboard();
  syncPinStyle();
  syncCustomCss();
  syncExportButton();
  for (const f of FEATURES) {
    if (!cfg[f.key]) continue;
    try {
      f.apply();
    } catch (e) {
      log("feature failed:", f.key, e);
    }
  }
}

// The app is an SPA: the calendar is replaced under you on month changes and
// Inertia visits, so everything has to be idempotent and re-applied.
const schedule = (() => {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyAll();
    });
  };
})();

function boot() {
  applyAll();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", schedule);
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault();
      togglePanel();
    } else if (e.key === "Escape" && document.getElementById(PANEL_ID)) {
      togglePanel(false);
    }
  });
  // Only present when the script is installed with a grant; the keyboard
  // shortcut is the path that always works.
  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Settings", () => togglePanel(true));
  }
  log(`loaded v${VERSION} -- Alt+Shift+P for settings`);
}

// At document-start the root element may not exist yet, and observe() throws
// on a null target, which would kill the whole script before anything ran.
// Usually documentElement is already there, so the poll almost never fires.
if (document.documentElement) {
  boot();
} else {
  const t = setInterval(() => {
    if (!document.documentElement) return;
    clearInterval(t);
    boot();
  }, 0);
}
