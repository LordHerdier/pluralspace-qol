// src/modules/95-settings-panel.js

const PANEL_ID = "psqol-panel";
const PANEL_CSS = `
#${PANEL_ID} {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483600;
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;

  border-radius: 12px;
  font: 13px/1.45 system-ui, sans-serif;
  /* Self-contained colors so the app stays legible*/
  color: #1c1a26;
  background: #fff;

  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #${PANEL_ID} {
  color: #e8e6f0;
  background: #191424;
  border-color: #3a3350;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45);
}
#${PANEL_ID} h2 {
  margin: 0 0 2px; font-size: 13px; font-weight: 700; letter-spacing: .02em;
}
#${PANEL_ID} .psqol-ver { margin: 0 0 10px; opacity: .55; font-size: 11px; }
#${PANEL_ID} label {
  display: grid; grid-template-columns: auto 1fr; gap: 2px 9px;
  align-items: start; padding: 7px 0; cursor: pointer;
  border-top: 1px solid rgba(127, 127, 127, .25);
}
#${PANEL_ID} input { margin: 2px 0 0; cursor: pointer; }
#${PANEL_ID} .psqol-desc { grid-column: 2; opacity: .6; font-size: 11.5px; }
#${PANEL_ID} .psqol-css-edit {
  grid-column: 2; justify-self: start; margin-top: 5px; cursor: pointer;
  border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px; padding: 3px 9px;
  font: inherit; font-size: 11px; background: transparent; color: inherit;
}
#${PANEL_ID} .psqol-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 10px; padding-top: 9px;
  border-top: 1px solid rgba(127, 127, 127, .25);
  opacity: .6; font-size: 11px;
}
#${PANEL_ID} button.psqol-close {
  cursor: pointer; border: 0; border-radius: 6px; padding: 4px 9px;
  font: inherit; color: inherit; background: rgba(127, 127, 127, .22);
}
`;

function togglePanel(force) {
  const open = force ?? !document.getElementById(PANEL_ID);
  document.getElementById(PANEL_ID)?.remove();
  if (!open) return;

  if (!document.getElementById("psqol-panel-style")) {
    const st = document.createElement("style");
    st.id = "psqol-panel-style";
    st.textContent = PANEL_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "pluralspace QoL settings");

  const h = document.createElement("h2");
  h.textContent = "pluralspace QoL";
  const ver = document.createElement("p");
  ver.className = "psqol-ver";
  ver.textContent = "v" + VERSION;
  panel.append(h, ver);

  for (const t of TWEAKS) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!cfg[t.key];
    box.addEventListener("change", () => {
      cfg[t.key] = box.checked;
      saveConfig();
      applyAll();
      log(t.key, box.checked ? "enabled" : "disabled");
    });
    const name = document.createElement("span");
    name.textContent = t.label;
    const desc = document.createElement("span");
    desc.className = "psqol-desc";
    desc.textContent = t.desc;
    label.append(box, name, desc);
    if (t.key === "customCss") {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "psqol-css-edit";
      editBtn.textContent = "Edit CSS…";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault(); // stay inside the <label>, not toggle the checkbox
        openCssEditor();
      });
      label.append(editBtn);
    }
    panel.append(label);
  }

  const foot = document.createElement("div");
  foot.className = "psqol-foot";
  const hint = document.createElement("span");
  hint.textContent = "Alt+Shift+P";
  const close = document.createElement("button");
  close.className = "psqol-close";
  close.textContent = "Close";
  close.addEventListener("click", () => togglePanel(false));
  foot.append(hint, close);
  panel.append(foot);

  (document.body || document.documentElement).appendChild(panel);
  panel.querySelector("input")?.focus();
}
