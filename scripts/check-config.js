// Verifies the config layer: defaults, persistence, that each toggle actually
// gates its tweak, and that the settings panel opens on the shortcut.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "edit-front.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);
// Derived from the script rather than hardcoded, so adding a tweak does not
// fail this check for the wrong reason.
const LABELS = [...script.matchAll(/^\s*label: '(.+?)',$/gm)].map((m) => m[1]);

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    locale: "en-US",
  });
  await page.goto("file://" + snap);

  const state = () =>
    page.evaluate(() => ({
      styleOn: !!document.getElementById("psqol-style"),
      attr24h: document.documentElement.getAttribute("data-psqol-24h"),
      padRight: getComputedStyle(document.querySelector("#main-content"))
        .paddingRight,
      time: new Date("2026-09-04T17:25:00Z")
        .toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "UTC",
        })
        .toLowerCase(),
      stored: localStorage.getItem("psqolConfig"),
      panel: !!document.getElementById("psqol-panel"),
    }));

  const setCfg = (patch) =>
    page.evaluate((p) => {
      const cur = JSON.parse(localStorage.getItem("psqolConfig") || "{}");
      localStorage.setItem("psqolConfig", JSON.stringify({ ...cur, ...p }));
    }, patch);

  // defaults: everything on
  await page.evaluate(script);
  await page.waitForTimeout(80);
  let s = await state();
  check("default: pin style injected", s.styleOn);
  check("default: calendar column reserved", s.padRight !== "32px");
  check("default: times are 24h", s.time === "17:25");
  check("default: 24h attribute on", s.attr24h === "on");

  // settings panel
  await page.keyboard.press("Alt+Shift+P");
  await page.waitForTimeout(60);
  const panel = await page.evaluate(() => {
    const p = document.getElementById("psqol-panel");
    return p
      ? {
          boxes: p.querySelectorAll("input[type=checkbox]").length,
          checked: [...p.querySelectorAll("input")].filter((b) => b.checked)
            .length,
        }
      : null;
  });
  check("panel opens on Alt+Shift+P", !!panel);
  check(
    `panel lists all ${LABELS.length} tweaks, all on`,
    panel && panel.boxes === LABELS.length && panel.checked === LABELS.length,
    panel ? `(${panel.boxes} boxes, ${panel.checked} checked)` : "",
  );

  // Toggling a box in the panel must take effect and persist.
  await page.evaluate((label) => {
    const p = document.getElementById("psqol-panel");
    const row = [...p.querySelectorAll("label")].find((l) =>
      l.textContent.startsWith(label),
    );
    row.querySelector("input").click();
  }, "Pin the day drawer");
  await page.waitForTimeout(60);
  s = await state();
  check("unchecking pin removes the style live", !s.styleOn);
  check(
    "choice persisted to localStorage",
    JSON.parse(s.stored).pinDrawer === false,
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check("Escape closes the panel", !(await state()).panel);

  // each toggle gates its tweak, from a fresh load
  await setCfg({
    pinDrawer: false,
    force24h: false,
    prefillEnd: false,
    autoOpenToday: false,
    stopwatch: false,
  });
  await page.reload();
  await page.evaluate(() => {
    const s = document.querySelector("#front-start");
    const e = document.querySelector("#front-end");
    s.value = "2026-09-04T17:25";
    e.value = "";
    e.disabled = false;
  });
  await page.evaluate(script);
  await page.waitForTimeout(120);
  s = await state();
  check(
    "pin off: no style, no reserved column",
    !s.styleOn && s.padRight === "32px",
  );
  check("24h off: times revert to am/pm", s.time === "5:25 pm");
  check(
    "prefill off: end left blank",
    (await page.evaluate(() => document.querySelector("#front-end").value)) ===
      "",
  );

  // re-enabling works without a reload
  await page.evaluate(() => {
    document.getElementById("psqol-panel")?.remove();
  });
  await page.keyboard.press("Alt+Shift+P");
  await page.waitForTimeout(60);
  await page.evaluate((label) => {
    const p = document.getElementById("psqol-panel");
    const row = [...p.querySelectorAll("label")].find((l) =>
      l.textContent.startsWith(label),
    );
    row.querySelector("input").click();
  }, "24-hour times");
  await page.waitForTimeout(60);
  check("24h re-enables live, no reload", (await state()).time === "17:25");

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
