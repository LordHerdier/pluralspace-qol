// Verifies the custom-CSS tweak: the panel's "Edit CSS..." editor saves and
// persists the text, the style applies live without a reload, and unchecking
// the tweak removes the <style> element without discarding the saved CSS.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "edit-front.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

const CSS = "body { background: rgb(1, 2, 3) !important; }";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    locale: "en-US",
  });
  await page.goto("file://" + snap);
  await page.evaluate(script);
  await page.waitForTimeout(80);

  const state = () =>
    page.evaluate(() => ({
      styleText:
        document.getElementById("psqol-custom-style")?.textContent || null,
      bg: getComputedStyle(document.body).backgroundColor,
      stored: localStorage.getItem("psqolCustomCss"),
    }));

  // nothing injected until there is something to inject
  let s = await state();
  check("no custom style element with empty CSS", s.styleText === null);

  // open the editor from the panel
  await page.keyboard.press("Alt+Shift+P");
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    const p = document.getElementById("psqol-panel");
    const row = [...p.querySelectorAll("label")].find((l) =>
      l.textContent.startsWith("Custom CSS"),
    );
    row.querySelector("button.psqol-css-edit").click();
  });
  await page.waitForTimeout(60);
  check(
    "editor modal opens",
    await page.evaluate(() => !!document.getElementById("psqol-css-modal")),
  );

  await page.fill("#psqol-css-textarea", CSS);
  await page.click("#psqol-css-save");
  await page.waitForTimeout(60);
  check(
    "modal closes on save",
    !(await page.evaluate(() => !!document.getElementById("psqol-css-modal"))),
  );

  s = await state();
  check("style element carries the saved CSS", s.styleText === CSS);
  check("background actually changed", s.bg === "rgb(1, 2, 3)");
  check("CSS persisted to its own localStorage key", s.stored === CSS);

  // survives a reload
  await page.reload();
  await page.evaluate(script);
  await page.waitForTimeout(80);
  s = await state();
  check("CSS re-applied after reload", s.bg === "rgb(1, 2, 3)");

  // toggling the tweak off removes the style but keeps the saved text
  await page.keyboard.press("Alt+Shift+P");
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    const p = document.getElementById("psqol-panel");
    const row = [...p.querySelectorAll("label")].find((l) =>
      l.textContent.startsWith("Custom CSS"),
    );
    row.querySelector("input").click();
  });
  await page.waitForTimeout(60);
  s = await state();
  check("unchecking removes the style element live", s.styleText === null);
  check("bg reverts once the style is gone", s.bg !== "rgb(1, 2, 3)");
  check("saved CSS text is untouched", s.stored === CSS);

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
