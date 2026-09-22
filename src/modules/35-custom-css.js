// src/modules/35-custom-css.js

// A single <style> element with whatever the user pasted into the panel's CSS
// editor. In own element so only this is removed when it's disabled.
function syncCustomCss() {
  const existing = document.getElementById("psqol-custom-style");
  if (!cfg.customCss || !customCss) {
    existing?.remove();
    return;
  }
  const parent = document.head || document.documentElement;
  if (!parent) return;
  let el = existing;
  if (!el) {
    el = document.createElement("style");
    el.id = "psqol-custom-style";
    parent.appendChild(el);
  }
  if (el.textContent !== customCss) el.textContent = customCss;
}
