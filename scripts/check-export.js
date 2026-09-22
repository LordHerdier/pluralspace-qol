// Verifies the weekly export

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "fronts.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

const ymd = (d) => d.toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  // The export button is gated on location.pathname '/space/fronts',
  // which a plain file:// load can never satisfy. To bypass, the fixture is served
  // from a fake same-origin URL instead.
  const FRONTS_URL = "https://pluralspace.test/space/fronts";
  const fixtureHtml = fs.readFileSync(snap, "utf8");
  await context.route("https://pluralspace.test/**", (route) => route.abort());
  await context.route(FRONTS_URL, (route) =>
    route.fulfill({ contentType: "text/html", body: fixtureHtml }),
  );

  // Any page (including the popup the export opens) gets this stub for the
  // Inertia-protocol activity fetch, so the mood side of the report is real
  // data rather than a network error. `logs` is a real deferred prop; it is
  // genuinely absent from the plain request, and only shows up once the
  // partial-reload headers for it are sent, the same way the real app's
  // second request behaves. Page 1's oldest row is still inside the exported
  // range, so a correct implementation must go on to fetch page 2 for the
  // third, older mood change to show up at all.
  let activityRequests = 0;
  const activityPagesFetched = [];
  await context.route("**/activity*", (route) => {
    activityRequests += 1;
    const url = new URL(route.request().url());
    const pageNum = Number(url.searchParams.get("page") || "1");
    const partial = route.request().headers()["x-inertia-partial-data"];
    if (partial !== "logs") {
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          component: "App/Activity/Index",
          props: {},
          deferredProps: { default: ["logs"] },
        }),
      });
      return;
    }
    activityPagesFetched.push(pageNum);
    const page1 = {
      total: 3,
      last_page: 2,
      data: [
        {
          subject_type: "App\\Models\\SystemMoodEntry",
          description: "Updated headspace mood to Cozy",
          created_at: "2026-09-02T15:00:00+00:00",
        },
        {
          subject_type: "App\\Models\\SystemMoodEntry",
          description: "Updated headspace mood to Tired",
          created_at: "2026-09-01T09:00:00+00:00",
        },
      ],
    };
    const page2 = {
      total: 3,
      last_page: 2,
      data: [
        {
          subject_type: "App\\Models\\SystemMoodEntry",
          description: "Updated headspace mood to Ancient",
          created_at: "2026-08-30T12:00:00+00:00",
        },
      ],
    };
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ props: { logs: pageNum === 2 ? page2 : page1 } }),
    });
  });

  // The real "Name" field only shows up on a member's own profile page, so
  // the export resolves it with one Inertia-protocol fetch per member. Ada's
  // has the app's own rich-formatting flourish; Fishie's fetch is made to
  // fail, to exercise the fall-back to the plain display_label.
  let memberFetches = [];
  await context.route("**/members/*", (route) => {
    const id = route.request().url().split("/").pop();
    memberFetches.push(id);
    if (id !== "ada-id") {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        props: { member: { name: "<b><i>Ada</i></b>" } },
      }),
    });
  });

  // A front that only shows up in August, which the calendar's currently-open
  // month (September) never bridges
  await context.route(
    "https://pluralspace.test/space/fronts?month=2026-08",
    (route) => {
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          props: {
            weeks: [
              [
                {
                  date: "2026-08-15",
                  fronts: [
                    {
                      id: "f3",
                      started_at: "2026-08-15T10:00:00+00:00",
                      ended_at: "2026-08-15T11:00:00+00:00",
                      comment: "",
                      member: { id: "root-id", display_label: "root" },
                      front_type: { name: "Front" },
                    },
                  ],
                },
              ],
            ],
          },
        }),
      });
    },
  );

  const page = await context.newPage();
  await page.goto(FRONTS_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("psqolConfig"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(script);
  await page.waitForTimeout(300);

  check(
    "export button appears on the fronting history header",
    await page.evaluate(() => !!document.getElementById("psqol-export-btn")),
  );

  // Stub the weeks prop the way the app supplies it: two fronts in the same
  // week, one with a note that looks like an XSS attempt.
  const stub = () =>
    page.evaluate(() => {
      document.getElementById("app").__vue_app__ = {
        config: {
          globalProperties: {
            $page: {
              version: "v1",
              props: {
                currentSystem: { name: "Test System", color: "#22c55e" },
                month: { value: "2026-09" },
                weeks: [
                  [
                    { date: "2026-08-30", fronts: [] },
                    { date: "2026-08-31", fronts: [] },
                    {
                      date: "2026-09-01",
                      fronts: [
                        {
                          id: "f1",
                          started_at: "2026-09-01T12:00:00+00:00",
                          ended_at: "2026-09-01T13:00:00+00:00",
                          comment:
                            "<script>window.__psqolPwned = true</script>",
                          member: { id: "ada-id", display_label: "Ada" },
                          front_type: { name: "Front" },
                        },
                      ],
                    },
                    {
                      date: "2026-09-02",
                      fronts: [
                        {
                          id: "f2",
                          started_at: "2026-09-02T09:00:00+00:00",
                          ended_at: null,
                          comment: "still going",
                          member: { id: "fishie-id", display_label: "Fishie" },
                          front_type: { name: "Co-fronting" },
                        },
                      ],
                    },
                    { date: "2026-09-03", fronts: [] },
                    { date: "2026-09-04", fronts: [] },
                    { date: "2026-09-05", fronts: [] },
                  ],
                ],
              },
            },
          },
        },
      };
    });
  await stub();
  await page.waitForTimeout(1200);

  const bridged = await page.evaluate(() => {
    const el = document.getElementById("psqol-export-data");
    return el ? JSON.parse(el.textContent) : null;
  });
  check(
    "weeks prop bridged to the sandbox",
    !!(bridged && bridged.weeks && bridged.version === "v1"),
  );

  await page.click("#psqol-export-btn");
  await page.waitForSelector("#psqol-export-dialog");

  const defaults = await page.evaluate(() => ({
    start: document.getElementById("psqol-export-start").value,
    end: document.getElementById("psqol-export-end").value,
  }));
  const startDow = new Date(defaults.start + "T00:00:00").getDay();
  const spanDays = Math.round(
    (new Date(defaults.end + "T00:00:00") -
      new Date(defaults.start + "T00:00:00")) /
      86400000,
  );
  check(
    "default range starts on a Sunday and spans a week",
    startDow === 0 && spanDays === 6,
    `(${defaults.start} .. ${defaults.end})`,
  );

  // Point the range at the stubbed week regardless of today's real date.
  await page.fill("#psqol-export-start", "2026-08-30");
  await page.fill("#psqol-export-end", "2026-09-05");

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.click("#psqol-export-go"),
  ]);
  await popup.waitForSelector("table", { timeout: 5000 });

  check(
    "modal closes after export",
    await page.evaluate(() => !document.getElementById("psqol-export-modal")),
  );

  const reportText = await popup.evaluate(() => document.body.innerText);
  const reportHtml = await popup.evaluate(() => document.body.innerHTML);

  check(
    "report titled with the system name",
    reportText.includes("Test System"),
  );
  check(
    "summary lists both members with their switch time",
    reportText.includes("Ada") && reportText.includes("Fishie"),
  );
  check(
    'timeline shows the ongoing front as "ongoing"',
    /Fishie[\s\S]*ongoing/.test(reportText),
  );
  check(
    "mood section shows both stubbed mood changes",
    reportText.includes("Cozy") && reportText.includes("Tired"),
  );
  check(
    "deferred logs prop fetched with a partial-reload request",
    activityRequests >= 2,
    `(${activityRequests} requests)`,
  );
  check(
    "paged into activity page 2 for the older mood change still in range",
    activityPagesFetched.includes(2) && reportText.includes("Ancient"),
    `(pages: ${activityPagesFetched.join(",")})`,
  );
  check(
    "CSV download link is present",
    await popup.evaluate(() => !!document.querySelector('a[download$=".csv"]')),
  );

  check(
    "resolved Name field renders its formatting, not display_label",
    reportHtml.includes("<b><i>Ada</i></b>"),
    "",
  );
  check(
    "failed member fetch falls back to the plain display_label",
    reportText.includes("Fishie") && !reportHtml.includes("<b><i>Fishie"),
  );
  check(
    "one name lookup per distinct member",
    memberFetches.sort().join(",") === "ada-id,fishie-id",
    `(${memberFetches.join(",")})`,
  );

  const csvHref = await popup.evaluate(() =>
    document.querySelector('a[download$=".csv"]').getAttribute("href"),
  );
  const csv = decodeURIComponent(csvHref.slice(csvHref.indexOf(",") + 1));
  check(
    "CSV carries the plain-text name, not markup",
    csv.includes(",Ada,") && !csv.includes("<b>"),
    `(${csv.split("\r\n")[1]})`,
  );

  const chart = await popup.evaluate(() => {
    const cols = [...document.querySelectorAll(".bar-col")];
    return cols.map((c) => ({
      count: c.querySelector(".bar-count").textContent.trim(),
      label: c.querySelector(".bar-label").textContent.trim(),
      barStyle: c.querySelector(".bar").getAttribute("style"),
    }));
  });
  check(
    "chart has one bar per day in the range, zero-filled",
    chart.length === 7 && chart.filter((c) => c.count === "0").length === 5,
    `(${chart.map((c) => c.label + ":" + c.count).join(", ")})`,
  );
  check(
    "chart uses the system accent colour",
    chart.every((c) => c.barStyle.includes("#22c55e")),
  );

  // A range reaching into August, which the bridged (September) weeks never
  // cover. Only shows up in the month fetch
  await page.click("#psqol-export-btn");
  await page.waitForSelector("#psqol-export-dialog");
  await page.fill("#psqol-export-start", "2026-08-10");
  await page.fill("#psqol-export-end", "2026-09-05");
  const crossMonthPopup = (
    await Promise.all([
      context.waitForEvent("page"),
      page.click("#psqol-export-go"),
    ])
  )[0];
  await crossMonthPopup.waitForSelector("table");
  const crossMonthText = await crossMonthPopup.evaluate(
    () => document.body.innerText,
  );
  check(
    "front from a month outside the bridged calendar view is included",
    crossMonthText.includes("root"),
  );
  check(
    'no "could not be loaded" warning when the month fetch succeeds',
    !crossMonthText.includes("could not be loaded"),
  );

  // July has no stub route at all, so its fetch genuinely fails
  await page.click("#psqol-export-btn");
  await page.waitForSelector("#psqol-export-dialog");
  await page.fill("#psqol-export-start", "2026-07-01");
  await page.fill("#psqol-export-end", "2026-09-05");
  const failedMonthPopup = (
    await Promise.all([
      context.waitForEvent("page"),
      page.click("#psqol-export-go"),
    ])
  )[0];
  await failedMonthPopup.waitForSelector("table");
  const failedMonthText = await failedMonthPopup.evaluate(
    () => document.body.innerText,
  );
  check(
    "a month whose fetch fails is called out by name, not silently dropped",
    /could not be loaded/.test(failedMonthText) &&
      /July 2026/.test(failedMonthText),
  );

  // A range with no switches at all shows the "nothing" message instead of a
  // chart of flat zero bars.
  await page.click("#psqol-export-btn");
  await page.waitForSelector("#psqol-export-dialog");
  await page.fill("#psqol-export-start", "2026-08-01");
  await page.fill("#psqol-export-end", "2026-08-02");
  const emptyPopup = (
    await Promise.all([
      context.waitForEvent("page"),
      page.click("#psqol-export-go"),
    ])
  )[0];
  await emptyPopup.waitForSelector("table");
  const emptyChartText = await emptyPopup.evaluate(
    () => document.body.innerText,
  );
  check(
    "all-zero range shows a message instead of an empty chart",
    !emptyChartText.includes("bar-col") &&
      /No switches in this range/.test(emptyChartText) &&
      (await emptyPopup.evaluate(
        () => document.querySelectorAll(".bar-col").length,
      )) === 0,
  );

  check(
    "hostile comment is escaped, not executed",
    reportHtml.includes("&lt;script&gt;") &&
      !reportHtml.includes("<script>window.__psqolPwned"),
  );
  check(
    "hostile comment never actually ran",
    await popup.evaluate(() => window.__psqolPwned === undefined),
  );

  // Disabling the tweak removes the button (and any open modal) live.
  await page.evaluate(() =>
    localStorage.setItem(
      "psqolConfig",
      JSON.stringify({ weeklyExport: false }),
    ),
  );
  await page.reload();
  await stub();
  await page.evaluate(script);
  await page.waitForTimeout(300);
  check(
    "disabled: no export button",
    await page.evaluate(() => !document.getElementById("psqol-export-btn")),
  );

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
