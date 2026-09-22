// Offline layout check. Runs against the scrubbed fixtures, which ship with a
// vendored copy of the app's stylesheet, so the real geometry is verifiable
// from a fresh clone with no network and no login.
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
  page.on("console", (m) => console.log("  [page]", m.text()));
  await page.goto("file://" + snap);

  const before = await page.evaluate(() => {
    const m = document.querySelector("#main-content");
    const w = document.querySelector("#main-content > div.fixed");
    return {
      mainPadRight: getComputedStyle(m).paddingRight,
      wrapBg: getComputedStyle(w).backgroundColor,
      wrapPointer: getComputedStyle(w).pointerEvents,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    };
  });

  await page.evaluate(script);

  const after = await page.evaluate(() => {
    const m = document.querySelector("#main-content");
    const w = document.querySelector("#main-content > div.fixed");
    const a = document.querySelector(
      'aside[aria-labelledby="day-drawer-title"]',
    );
    const grid = document.querySelector("button[data-date]")?.parentElement;
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return {
        x: Math.round(b.x),
        w: Math.round(b.width),
        top: Math.round(b.top),
      };
    };
    return {
      mainPadRight: getComputedStyle(m).paddingRight,
      wrapBg: getComputedStyle(w).backgroundColor,
      wrapPointer: getComputedStyle(w).pointerEvents,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      drawer: r(a),
      drawerPointer: getComputedStyle(a).pointerEvents,
      grid: grid ? r(grid) : null,
    };
  });

  console.log("BEFORE", before);
  console.log("AFTER ", after);

  const overlap = after.grid && after.grid.x + after.grid.w > after.drawer.x;
  console.log("\ncalendar overlaps drawer?", overlap ? "YES (bug)" : "no");
  console.log(
    "drawer below app header?",
    after.drawer.top > 0 ? `yes (top=${after.drawer.top})` : "NO (bug)",
  );

  // snapshots/ is gitignored, so the render never lands in the repo.
  await page.screenshot({
    path: path.join(ROOT, "snapshots", "pinned.png"),
    fullPage: false,
  });
  await browser.close();

  const ok =
    !overlap &&
    after.drawer.top > 0 &&
    after.wrapPointer === "none" &&
    after.htmlOverflow !== "hidden" &&
    after.mainPadRight !== before.mainPadRight;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
