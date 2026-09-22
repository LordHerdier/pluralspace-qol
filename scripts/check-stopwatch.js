// Verifies the fronting stopwatch against the real dashboard markup.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "dashboard.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  await page.goto("file://" + snap);

  // Names as they appear in the scrubbed fixture's avatar titles.
  const names = await page.evaluate(() => {
    const card = document.querySelector('[data-tour="dashboard-fronting"]');
    const grid = card.querySelector(".grid");
    return [...grid.children]
      .filter((c) => c.querySelector("img"))
      .map((c) => c.querySelector("button[title]")?.getAttribute("title"));
  });
  check(
    "fixture has fronting cells",
    names.length >= 2,
    `(${names.length}: ${names.join(", ")})`,
  );

  const stub = (offsets) =>
    page.evaluate(
      ({ names, offsets }) => {
        const app = document.getElementById("app");
        app.__vue_app__ = {
          config: {
            globalProperties: {
              $page: {
                props: {
                  currentFronts: names.map((n, i) => ({
                    member: { name: n },
                    started_at: new Date(Date.now() - offsets[i]).toISOString(),
                  })),
                },
              },
            },
          },
        };
      },
      { names, offsets },
    );

  const MIN = 60000,
    HOUR = 60 * MIN,
    DAY = 24 * HOUR;
  await stub([90 * MIN, 3 * DAY + 4 * HOUR]);
  await page.evaluate(script);
  await page.waitForTimeout(120);

  const read = () =>
    page.evaluate(() => {
      const card = document.querySelector('[data-tour="dashboard-fronting"]');
      const grid = card.querySelector(".grid");
      return [...grid.children]
        .filter((c) => c.querySelector("img"))
        .map((c) => {
          const sw = c.querySelector(".psqol-stopwatch");
          return sw
            ? {
                text: sw.textContent,
                last: sw === c.lastElementChild,
                title: sw.title,
              }
            : null;
        });
    });

  let got = await read();
  check(
    "stopwatch rendered in every cell",
    got.every((g) => g),
  );
  check(
    "90 minutes formats as 1h 30m",
    got[0]?.text === "1h 30m",
    `got "${got[0]?.text}"`,
  );
  check(
    "3d 4h formats as 3d 04h",
    got[1]?.text === "3d 04h",
    `got "${got[1]?.text}"`,
  );
  check(
    "sits at the end of the cell",
    got.every((g) => g.last),
  );
  check(
    "exact start time in the tooltip",
    /^Fronting since /.test(got[0]?.title || ""),
  );

  // Sub-minute and sub-hour formats.
  await page.evaluate(() =>
    document.querySelectorAll(".psqol-stopwatch").forEach((e) => e.remove()),
  );
  await stub([42000, 5 * MIN + 7000]);
  await page.waitForTimeout(1200);
  got = await read();
  check(
    "42 seconds formats as 42s",
    got[0]?.text === "42s",
    `got "${got[0]?.text}"`,
  );
  check(
    "5m 07s keeps seconds",
    got[1]?.text === "5m 07s",
    `got "${got[1]?.text}"`,
  );

  // It has to keep ticking, and survive a re-render dropping the elements.
  const before = (await read())[0].text;
  await page.waitForTimeout(2100);
  check("ticks live", (await read())[0].text !== before);

  await page.evaluate(() =>
    document.querySelectorAll(".psqol-stopwatch").forEach((e) => e.remove()),
  );
  await page.waitForTimeout(1200);
  check(
    "reappears after a re-render removes it",
    (await read()).every((g) => g),
  );

  // Toggle off must clean up, and back on must restore, without a reload.
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-psqol-stopwatch", "off"),
  );
  await page.waitForTimeout(1200);
  check(
    "toggling off removes them",
    (await read()).every((g) => !g),
  );
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-psqol-stopwatch", "on"),
  );
  await page.waitForTimeout(1200);
  check(
    "toggling on restores them",
    (await read()).every((g) => g),
  );

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
