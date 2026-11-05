// Verifies the fronting seconds patch against the app's own duration element.

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
    names.length >= 1,
    `(${names.length}: ${names.join(", ")})`,
  );

  const ids = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-tour="dashboard-fronting"] [data-current-front-id]',
      ),
    ].map((c) => c.getAttribute("data-current-front-id")),
  );
  check("fixture has app duration elements", ids.length >= 1);

  const stub = (offsets) =>
    page.evaluate(
      ({ ids, offsets }) => {
        const app = document.getElementById("app");
        app.__vue_app__ = {
          config: {
            globalProperties: {
              $page: {
                props: {
                  currentFronts: ids.map((id, i) => ({
                    id,
                    member: { name: "x" },
                    started_at: new Date(Date.now() - offsets[i]).toISOString(),
                  })),
                },
              },
            },
          },
        };
      },
      { ids, offsets },
    );

  const MIN = 60000,
    HOUR = 60 * MIN,
    DAY = 24 * HOUR;
  const read = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-tour="dashboard-fronting"] time[data-front-duration]',
        ),
      ].map((t) => ({ text: t.textContent, title: t.title })),
    );

  const original = await read();
  const offs = [90 * MIN, 3 * DAY + 4 * HOUR].slice(0, ids.length);
  await stub(offs);
  await page.evaluate(script);
  await page.waitForTimeout(150);

  let got = await read();
  check(
    "no extra element added",
    (await page.locator(".psqol-stopwatch").count()) === 0,
  );
  check(
    "90 minutes formats as 1h 30m",
    got[0]?.text === "1h 30m",
    `got "${got[0]?.text}"`,
  );
  if (ids.length > 1)
    check(
      "3d 4h formats as 3d 04h",
      got[1]?.text === "3d 04h",
      `got "${got[1]?.text}"`,
    );
  check(
    "exact start time in the tooltip",
    /^Fronting since /.test(got[0]?.title || ""),
  );

  // Sub-minute and sub-hour formats: the part the app itself rounds away.
  await stub([42000, 5 * MIN + 7000].slice(0, ids.length));
  await page.waitForTimeout(1200);
  got = await read();
  check(
    "42 seconds formats as 42s",
    got[0]?.text === "42s",
    `got "${got[0]?.text}"`,
  );
  if (ids.length > 1)
    check(
      "5m 07s keeps seconds",
      got[1]?.text === "5m 07s",
      `got "${got[1]?.text}"`,
    );

  const before = got[0].text;
  await page.waitForTimeout(2100);
  check("ticks live", (await read())[0].text !== before);

  // The app re-rendering its own text must be overwritten again.
  await page.evaluate(() => {
    document.querySelector(
      '[data-tour="dashboard-fronting"] time[data-front-duration]',
    ).textContent = "<1m";
  });
  await page.waitForTimeout(1200);
  check("recovers after a re-render", (await read())[0].text !== "<1m");

  // Off restores what the app rendered; on brings it back, without a reload.
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-psqol-stopwatch", "off"),
  );
  await page.waitForTimeout(1200);
  got = await read();
  check("toggling off restores the app's text", got[0].text === "<1m");
  check(
    "toggling off restores the app's title",
    got[0].title === original[0].title,
  );
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-psqol-stopwatch", "on"),
  );
  await page.waitForTimeout(1200);
  check("toggling on restores seconds", /s$/.test((await read())[0].text));

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
