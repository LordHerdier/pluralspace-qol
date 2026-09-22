// Verifies clicking a fronting member's name navigates to their profile, and
// that the avatar's own click target is left alone.
//
// $inertia is stubbed rather than mocked away

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

const IDS = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  await page.goto("file://" + snap);

  const stub = (canView) =>
    page.evaluate(
      ({ ids, canView }) => {
        const card = document.querySelector('[data-tour="dashboard-fronting"]');
        const names = [...card.querySelector(".grid").children]
          .filter((c) => c.querySelector("img"))
          .map((c) => c.querySelector("button[title]").getAttribute("title"));
        window.__visits = [];
        window.__opens = [];
        window.open = (url) => window.__opens.push(url);
        document.getElementById("app").__vue_app__ = {
          config: {
            globalProperties: {
              $inertia: { visit: (url) => window.__visits.push(url) },
              $page: {
                props: {
                  currentFronts: names.map((n, i) => ({
                    member: { name: n },
                    member_id: ids[i],
                    can_view_member: canView[i],
                    started_at: new Date(Date.now() - 60000).toISOString(),
                  })),
                },
              },
            },
          },
        };
        return names;
      },
      { ids: IDS, canView },
    );

  const names = await stub([true, true]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);

  const nav = () =>
    page.evaluate(() => {
      const card = document.querySelector('[data-tour="dashboard-fronting"]');
      return [...card.querySelector(".grid").children]
        .filter((c) => c.querySelector("img"))
        .map((c) => {
          const el = c.querySelector("span.max-w-full.truncate.text-center");
          return el ? el.getAttribute("data-psqol-nav") : null;
        });
    });

  check(
    "fixture has fronting cells",
    names.length >= 2,
    `(${names.join(", ")})`,
  );
  let marked = await nav();
  check(
    "both names marked navigable",
    marked[0] === IDS[0] && marked[1] === IDS[1],
    `(${marked})`,
  );
  check(
    "name shows a pointer cursor",
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-psqol-nav]")).cursor ===
        "pointer",
    ),
  );

  // Plain click -> client-side Inertia visit.
  await page.click("[data-psqol-nav]");
  await page.waitForTimeout(80);
  let r = await page.evaluate(() => ({
    visits: window.__visits,
    opens: window.__opens,
  }));
  check(
    "click visits the profile via Inertia",
    r.visits[0] === "/members/" + IDS[0],
    `(${r.visits})`,
  );
  check("no full page load", r.opens.length === 0);

  // Modified click -> new tab.
  await page.evaluate(() => {
    window.__visits = [];
    window.__opens = [];
  });
  await page.click("[data-psqol-nav]", { modifiers: ["Control"] });
  await page.waitForTimeout(80);
  r = await page.evaluate(() => ({
    visits: window.__visits,
    opens: window.__opens,
  }));
  check(
    "ctrl-click opens a new tab instead",
    r.opens[0] === "/members/" + IDS[0] && r.visits.length === 0,
  );

  // The avatar must keep its own behaviour.
  await page.evaluate(() => {
    window.__visits = [];
    window.__opens = [];
  });
  await page.click('[data-tour="dashboard-fronting"] button[title]');
  await page.waitForTimeout(80);
  r = await page.evaluate(() => ({
    visits: window.__visits,
    opens: window.__opens,
  }));
  check(
    "clicking the avatar does not navigate",
    r.visits.length === 0 && r.opens.length === 0,
  );

  // A member the viewer cannot see must not be linked.
  await page.reload();
  await stub([true, false]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  marked = await nav();
  check(
    "unviewable member is not linked",
    marked[0] === IDS[0] && marked[1] === null,
    `(${marked})`,
  );

  // Toggle off.
  await page.evaluate(() =>
    localStorage.setItem("psqolConfig", JSON.stringify({ nameLinks: false })),
  );
  await page.reload();
  await stub([true, true]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  marked = await nav();
  check(
    "disabled: no names marked",
    marked.every((m) => m === null),
    `(${marked})`,
  );

  // fronting history drawer
  // Different page, different container, same delegated click handler. The
  // drawer has no member id in its markup, so ids come from the weeks prop.
  const fronts = path.join(ROOT, "fixtures", "fronts-slideover.html");
  await page.goto("file://" + fronts);
  // The toggle-off case above persisted nameLinks:false, and localStorage
  // survives the navigation because both fixtures share a file:// origin.
  await page.evaluate(() => localStorage.removeItem("psqolConfig"));
  await page.reload();

  const labels = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'aside[aria-labelledby="day-drawer-title"] span.truncate.text-sm.font-semibold.text-text-heading',
      ),
    ].map((e) => e.textContent.trim()),
  );
  check(
    "drawer has named entries",
    labels.length >= 3,
    `(${labels.length}: ${labels.join(", ")})`,
  );

  const stubWeeks = (pairs) =>
    page.evaluate((pairs) => {
      window.__visits = [];
      window.__opens = [];
      window.open = (url) => window.__opens.push(url);
      document.getElementById("app").__vue_app__ = {
        config: {
          globalProperties: {
            $inertia: { visit: (url) => window.__visits.push(url) },
            $page: {
              props: {
                weeks: [
                  [
                    {
                      date: "2026-09-04",
                      fronts: pairs.map(([label, id]) => ({
                        member: { id, display_label: label },
                      })),
                    },
                  ],
                ],
              },
            },
          },
        },
      };
    }, pairs);

  await stubWeeks(labels.map((l, i) => [l, `id-${i}`]));
  await page.evaluate(script);
  await page.waitForTimeout(1200);

  const drawerNav = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'aside[aria-labelledby="day-drawer-title"] span.truncate.text-sm.font-semibold.text-text-heading',
        ),
      ].map((e) => e.getAttribute("data-psqol-nav")),
    );
  let dn = await drawerNav();
  check(
    "drawer names marked from the weeks prop",
    dn.every((d, i) => d === `id-${i}`),
    `(${dn})`,
  );

  await page.click("[data-psqol-nav]");
  await page.waitForTimeout(80);
  let dr = await page.evaluate(() => window.__visits);
  check(
    "drawer name click visits the profile",
    dr[0] === "/members/id-0",
    `(${dr})`,
  );

  // Two members sharing a display label cannot be told apart from the rendered
  // name, so neither should be linked rather than guessing.
  await page.reload();
  await stubWeeks([
    [labels[0], "dup-a"],
    [labels[0], "dup-b"],
    [labels[1], "unique"],
  ]);
  await page.evaluate(script);
  await page.waitForTimeout(1200);
  dn = await drawerNav();
  check(
    "ambiguous display label is not linked",
    dn[0] === null && dn[1] === "unique",
    `(${dn})`,
  );

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
