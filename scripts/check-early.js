// Verifies the document-start path: the script must survive being run before
// <head> exists and still have the pinned layout in place by first paint.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "fronts-slideover.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.text().includes("ps-qol")) console.log("  [page]", m.text());
  });

  // Runs at document-start, before any markup is parsed. head is null here.
  await page.addInitScript(script);
  await page.goto("file://" + snap);
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const st = document.getElementById("psqol-style");
    const m = document.querySelector("#main-content");
    const a = document.querySelector(
      'aside[aria-labelledby="day-drawer-title"]',
    );
    return {
      styleInjected: !!st,
      styleParent: st ? st.parentElement.tagName : null,
      styleCount: document.querySelectorAll("#psqol-style").length,
      mainPadRight: getComputedStyle(m).paddingRight,
      drawerX: a ? Math.round(a.getBoundingClientRect().x) : null,
    };
  });

  console.log("document-start result:", r);
  console.log("page errors:", errors.length ? errors : "none");
  const ok =
    r.styleInjected &&
    r.styleCount === 1 &&
    r.mainPadRight === "472px" &&
    !errors.length;
  console.log(ok ? "\nPASS" : "\nFAIL");
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
