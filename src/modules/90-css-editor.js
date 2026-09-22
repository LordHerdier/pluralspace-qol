// src/modules/90-css-editor.js

// custom CSS injector (Stylus alternative)
// A pop-up rather than a textarea in the panel itself: the panel is a fixed
// 320px box meant to stay out of the way, and a chunk of CSS needs real room
// to write in.
const CSS_EDITOR_CSS = `
#psqol-css-modal {
  position: fixed; inset: 0; z-index: 2147483600; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, .5);
  font: 13px/1.45 system-ui, sans-serif;
}
#psqol-css-dialog {
  width: 520px; max-width: calc(100vw - 32px); border-radius: 12px;
  padding: 16px 18px; color: #1c1a26; background: #fff; border: 1px solid #d6d2e2;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #psqol-css-dialog {
  color: #e8e6f0; background: #191424; border-color: #3a3350;
}
#psqol-css-dialog h2 { margin: 0 0 4px; font-size: 14px; }
#psqol-css-dialog p.psqol-css-hint { margin: 0 0 10px; opacity: .6; font-size: 11.5px; }
#psqol-css-textarea {
  display: block; width: 100%; box-sizing: border-box; min-height: 260px;
  resize: vertical; font: 12px/1.4 ui-monospace, SFMono-Regular, monospace;
  padding: 8px; border-radius: 6px; border: 1px solid rgba(127, 127, 127, .4);
  background: transparent; color: inherit;
}
#psqol-css-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
#psqol-css-actions button {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px;
  padding: 5px 12px; font: inherit; background: transparent; color: inherit;
}
`;

function injectCssEditorStyle() {
  if (document.getElementById("psqol-css-editor-style")) return;
  const el = document.createElement("style");
  el.id = "psqol-css-editor-style";
  el.textContent = CSS_EDITOR_CSS;
  (document.head || document.documentElement).appendChild(el);
}

function openCssEditor() {
  document.getElementById("psqol-css-modal")?.remove();
  injectCssEditorStyle();

  const overlay = document.createElement("div");
  overlay.id = "psqol-css-modal";
  overlay.innerHTML = `
      <div id="psqol-css-dialog" role="dialog" aria-label="Custom CSS">
        <h2>Custom CSS</h2>
        <p class="psqol-css-hint">Applied on every pluralspace page while "Custom CSS" is checked above.</p>
        <textarea id="psqol-css-textarea" spellcheck="false" autocapitalize="off"></textarea>
        <div id="psqol-css-actions">
          <button type="button" id="psqol-css-cancel">Cancel</button>
          <button type="button" id="psqol-css-save">Save</button>
        </div>
      </div>`;
  document.body.appendChild(overlay);

  // Assigned as a property, not interpolated into the template above
  const textarea = overlay.querySelector("#psqol-css-textarea");
  textarea.value = customCss;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay
    .querySelector("#psqol-css-cancel")
    .addEventListener("click", () => overlay.remove());
  overlay.querySelector("#psqol-css-save").addEventListener("click", () => {
    saveCustomCss(textarea.value);
    syncCustomCss();
    overlay.remove();
    log("custom CSS saved");
  });
  textarea.focus();
}
