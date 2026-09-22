// src/modules/30-pin-drawer.js

// All CSS. The drawer is a plain v-if'd element inside #main-content
const CSS = `
:root { --psqol-panel-w: min(28rem, 34vw); }

@media (min-width: 1024px) {
  html:has(${SEL.drawer}) { overflow: auto !important; }

  #main-content > div:has(> ${SEL.drawer}) {
    top: var(--app-header-h, 63px);
    bottom: 0;
    right: 0;
    left: auto;
    width: var(--psqol-panel-w);
    background: transparent !important;
    pointer-events: none;
  }

  #main-content ${SEL.drawer} {
    pointer-events: auto;
    inset: 0;
    width: 100%;
    max-width: none;
    box-shadow: none;
  }

  #main-content:has(${SEL.drawer}) {
    padding-right: calc(var(--psqol-panel-w) + 1.5rem);
  }
}
`;

// A second stylesheet, always present. The pinned-drawer rules live in their
// own element that is removed when that tweak is off
const BASE_CSS = `
[data-psqol-nav] { cursor: pointer; }
[data-psqol-nav]:hover { text-decoration: underline; }
`;

function injectBaseStyle() {
  if (document.getElementById("psqol-base-style")) return;
  const parent = document.head || document.documentElement;
  if (!parent) return;
  const el = document.createElement("style");
  el.id = "psqol-base-style";
  el.textContent = BASE_CSS;
  parent.appendChild(el);
}

function syncPinStyle() {
  const existing = document.getElementById("psqol-style");
  if (!cfg.pinDrawer) {
    existing?.remove();
    return;
  }
  if (existing) return;

  // Prevent flash when page loading
  const parent = document.head || document.documentElement;
  if (!parent) return;
  const el = document.createElement("style");
  el.id = "psqol-style";
  el.textContent = CSS;
  parent.appendChild(el);
}
