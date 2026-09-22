// Verifies the day panel gains a date beside any front time that falls on
// another day, and leaves same-day fronts alone.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "fronts-slideover.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

const DRAWER = 'aside[aria-labelledby="day-drawer-title"]';
const NAME = "span.truncate.text-sm.font-semibold.text-text-heading";

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// The fixture's open day, and its three entries: two ongoing (5:25 pm and
// 8:10 pm) and one finished (10:00 am -> 11:34 am).
const DAY = "2026-09-04";
const at = (d, h, m) => new Date(2026, 8, d, h, m).toISOString();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  await page.goto("file://" + snap);
  await page.evaluate(() => localStorage.removeItem("psqolConfig"));
  await page.reload();

  const labels = await page.evaluate(
    ([d, n]) =>
      [...document.querySelectorAll(d + " " + n)].map((e) =>
        e.textContent.trim(),
      ),
    [DRAWER, NAME],
  );
  check(
    "drawer has three entries",
    labels.length === 3,
    `(${labels.join(", ")})`,
  );

  // Entry 1 started the previous evening, entry 2 is same-day, entry 3 ran
  // into the next morning.
  const stub = (fronts) =>
    page.evaluate(
      ({ day, fronts }) => {
        document.getElementById("app").__vue_app__ = {
          config: {
            globalProperties: {
              $page: { props: { weeks: [[{ date: day, fronts }]] } },
            },
          },
        };
      },
      { day: DAY, fronts },
    );

  const times = () =>
    page.evaluate(
      ([d, n]) =>
        [...document.querySelectorAll(d + " " + n)].map((e) =>
          e
            .closest(".min-w-0")
            .querySelector("p.tabular-nums")
            .textContent.trim(),
        ),
      [DRAWER, NAME],
    );

  const base = await times();
  check(
    "fixture times start bare",
    base.every((t) => !/[A-Z][a-z]{2} \d/.test(t)),
    `(${base.join(" | ")})`,
  );

  await stub([
    { member: { display_label: labels[0] }, started_at: at(3, 17, 25) },
    { member: { display_label: labels[1] }, started_at: at(4, 20, 10) },
    {
      member: { display_label: labels[2] },
      started_at: at(4, 10, 0),
      ended_at: at(5, 11, 34),
    },
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);

  let t = await times();
  check(
    "start from the previous day is dated",
    /^Sep 3, .*Ongoing$/.test(t[0]),
    `(${t[0]})`,
  );
  check("same-day ongoing front is untouched", t[1] === base[1], `(${t[1]})`);
  check(
    "end on the next day is dated",
    /→ Sep 5,/.test(t[2]) && !/^Sep/.test(t[2]),
    `(${t[2]})`,
  );

  // A front wholly inside the shown day must not be annotated at all.
  await page.reload();
  await stub([
    { member: { display_label: labels[0] }, started_at: at(4, 17, 25) },
    { member: { display_label: labels[1] }, started_at: at(4, 20, 10) },
    {
      member: { display_label: labels[2] },
      started_at: at(4, 10, 0),
      ended_at: at(4, 11, 34),
    },
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  t = await times();
  check(
    "same-day fronts left as the app rendered them",
    t.every((v, i) => v === base[i]),
    `(${t.join(" | ")})`,
  );

  // Idempotence: the tick reruns every second and must not stack prefixes, and
  // it must leave no residue once the tweak is switched off.
  await page.reload();
  await stub([
    { member: { display_label: labels[0] }, started_at: at(3, 17, 25) },
    { member: { display_label: labels[1] }, started_at: at(4, 20, 10) },
    {
      member: { display_label: labels[2] },
      started_at: at(4, 10, 0),
      ended_at: at(5, 11, 34),
    },
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(3200);
  t = await times();
  check(
    "no prefix stacking after several ticks",
    /^Sep 3, 5:25/.test(t[0]),
    `(${t[0]})`,
  );

  await page.evaluate(() =>
    document.documentElement.setAttribute("data-psqol-frontdate", "off"),
  );
  await page.waitForTimeout(1400);
  t = await times();
  check(
    "toggling off restores the original text",
    t.every((v, i) => v === base[i]),
    `(${t.join(" | ")})`,
  );
  check(
    "and leaves no attributes behind",
    await page.evaluate(
      () =>
        document.querySelectorAll("[data-psqol-time-raw],[data-psqol-time-out]")
          .length === 0,
    ),
  );

  // Two fronts by the same member on one day: the panel's order is not the
  // prop's, so the entry must be matched by the time already on screen.
  await page.reload();
  await stub([
    {
      member: { display_label: labels[0] },
      started_at: at(4, 8, 0),
      ended_at: at(4, 9, 0),
    },
    { member: { display_label: labels[0] }, started_at: at(3, 17, 25) },
    { member: { display_label: labels[1] }, started_at: at(4, 20, 10) },
    {
      member: { display_label: labels[2] },
      started_at: at(4, 10, 0),
      ended_at: at(4, 11, 34),
    },
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  t = await times();
  check(
    "duplicate member matched by the shown start time",
    /^Sep 3, 5:25/.test(t[0]) && t[1] === base[1] && t[2] === base[2],
    `(${t.join(" | ")})`,
  );

  // Without the prop there is nothing to say, and nothing may be invented.
  await page.reload();
  await page.evaluate(() => {
    document.getElementById("app").__vue_app__ = {
      config: {
        globalProperties: {
          $page: { props: {} },
        },
      },
    };
  });
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  t = await times();
  check(
    "missing weeks prop changes nothing",
    t.every((v, i) => v === base[i]),
    `(${t.join(" | ")})`,
  );

  // Disabled in settings.
  await page.evaluate(() =>
    localStorage.setItem("psqolConfig", JSON.stringify({ frontDates: false })),
  );
  await page.reload();
  await stub([
    { member: { display_label: labels[0] }, started_at: at(3, 17, 25) },
    { member: { display_label: labels[1] }, started_at: at(4, 20, 10) },
    {
      member: { display_label: labels[2] },
      started_at: at(4, 10, 0),
      ended_at: at(5, 11, 34),
    },
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  t = await times();
  check(
    "disabled: no dates added",
    t.every((v, i) => v === base[i]),
    `(${t.join(" | ")})`,
  );

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
