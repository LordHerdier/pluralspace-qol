// src/modules/80-weekly-export.js

// Front Log Export
// Generates a clinician readable report of a selected time-frame

const EXPORT_CSS = `
#psqol-export-btn {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 8px;
  padding: 6px 14px; font: inherit; font-size: 13px; background: transparent;
  color: inherit; margin-left: auto;
}
#psqol-export-btn:hover { background: rgba(127, 127, 127, .12); }
#psqol-export-modal {
  position: fixed; inset: 0; z-index: 2147483600; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, .5);
  font: 13px/1.45 system-ui, sans-serif;
}
#psqol-export-dialog {
  width: 300px; max-width: calc(100vw - 32px); border-radius: 12px;
  padding: 16px 18px; color: #1c1a26; background: #fff; border: 1px solid #d6d2e2;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #psqol-export-dialog {
  color: #e8e6f0; background: #191424; border-color: #3a3350;
}
#psqol-export-dialog h2 { margin: 0 0 12px; font-size: 14px; }
#psqol-export-dialog label { display: block; margin-bottom: 10px; }
#psqol-export-dialog input {
  display: block; margin-top: 3px; width: 100%; box-sizing: border-box;
  font: inherit; padding: 5px 7px; border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, .4); background: transparent; color: inherit;
}
#psqol-export-error { color: #c0392b; font-size: 12px; margin-bottom: 8px; display: none; }
#psqol-export-actions { display: flex; justify-content: flex-end; gap: 8px; }
#psqol-export-actions button {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px;
  padding: 5px 12px; font: inherit; background: transparent; color: inherit;
}
`;

function injectExportStyle() {
  if (document.getElementById("psqol-export-style")) return;
  const el = document.createElement("style");
  el.id = "psqol-export-style";
  el.textContent = EXPORT_CSS;
  (document.head || document.documentElement).appendChild(el);
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function fmtLocalYmd(d) {
  const p2 = (n) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

// Sunday-Saturday, matching the calendar's own weeks prop grouping (each
// week row runs Sun..Sat), so the default range lines up with what the user
// is already looking at.
function currentWeekRange() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
  );
  return [start, end];
}

function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h > 0 ? h + "h " + m + "m" : m + "m";
}

// Fronts spanning multiple days appear once per day they are active, so the
// same id turns up in several day cells; a Map by id is what dedupes that.
function collectFronts(weeks, startYmd, endYmd) {
  const seen = new Map();
  (weeks || []).forEach((week) => {
    (week || []).forEach((day) => {
      const ymd = day && day.date && day.date.slice(0, 10);
      if (!ymd || ymd < startYmd || ymd > endYmd) return;
      (day.fronts || []).forEach((f) => {
        if (f && f.id && !seen.has(f.id)) seen.set(f.id, f);
      });
    });
  });
  return [...seen.values()].sort(
    (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at),
  );
}

// Parsed from the YMD strings directly rather than via Date arithmetic on
// the boundaries, so a range that starts or ends at a month edge can't
// shift a day off under a timezone offset.
function monthsInRange(startYmd, endYmd) {
  const months = [];
  const cursor = new Date(
    Number(startYmd.slice(0, 4)),
    Number(startYmd.slice(5, 7)) - 1,
    1,
  );
  const last = new Date(
    Number(endYmd.slice(0, 4)),
    Number(endYmd.slice(5, 7)) - 1,
    1,
  );
  while (cursor <= last) {
    months.push(
      cursor.getFullYear() +
        "-" +
        String(cursor.getMonth() + 1).padStart(2, "0"),
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthLabel(value) {
  const [y, m] = value.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// A month past this many fetches is a range wide enough that a clinician
// weekly report was probably the wrong tool for it, so it stops there
// rather than firing off dozens of requests for one export click.
const MAX_MONTHS_FETCHED = 24;

// The bridged weeks only ever cover whatever month the calendar currently
// has open. A range reaching outside that gets its other months the same
// Inertia-protocol way as everything else here.
// One request per month, in parallel, each falling back to "missing"
// rather than failing the whole export if the structure changes
async function collectAllWeeks(bridge, startYmd, endYmd) {
  const months = monthsInRange(startYmd, endYmd);
  const toFetch = months.slice(0, MAX_MONTHS_FETCHED);
  const versionHeader = bridge.version
    ? { "X-Inertia-Version": bridge.version }
    : {};

  const results = await Promise.all(
    toFetch.map(async (month) => {
      if (month === bridge.month) return { month, weeks: bridge.weeks || [] };
      try {
        const { value } = await fetchDeferrable(
          "/space/fronts?month=" + month,
          "weeks",
          versionHeader,
        );
        return { month, weeks: value || null };
      } catch (e) {
        log("fetching fronts for", month, "failed:", e);
        return { month, weeks: null };
      }
    }),
  );

  const allWeeks = [];
  const missingMonths = months.slice(MAX_MONTHS_FETCHED);
  results.forEach((r) => {
    if (r.weeks) allWeeks.push(...r.weeks);
    else missingMonths.push(r.month);
  });
  return { allWeeks, missingMonths };
}

// Keyed by id rather than the label text: two members can share a display
// label (the drawer name-linking code hits the same ambiguity), and once
// names are resolved separately below, id is the only thing guaranteed to
// still point at one member.
function summarizeFronts(fronts) {
  const byMember = new Map();
  fronts.forEach((f) => {
    const id = (f.member && f.member.id) || null;
    const start = Date.parse(f.started_at);
    const end = f.ended_at ? Date.parse(f.ended_at) : Date.now();
    const cur = byMember.get(id) || { member: f.member, count: 0, ms: 0 };
    cur.count += 1;
    cur.ms += Math.max(0, end - start);
    byMember.set(id, cur);
  });
  return [...byMember.values()].sort((a, b) => b.ms - a.ms);
}

// The Fronts page's weeks prop only ever carries display_label and the real
// "Name" field only shows up on a member's own profile page.
async function resolveMemberNames(members, version) {
  const versionHeader = version ? { "X-Inertia-Version": version } : {};
  const names = new Map();
  await Promise.all(
    members.map(async (m) => {
      if (!m || !m.id || names.has(m.id)) return;
      let resolved = null;
      try {
        const body = await inertiaFetch("/members/" + m.id, versionHeader);
        const raw =
          body && body.props && body.props.member && body.props.member.name;
        if (raw) {
          // Sanitised the same way as htmlDescriptions
          const html = sanitize(raw);
          const text = new DOMParser()
            .parseFromString(html, "text/html")
            .body.textContent.trim();
          resolved = { html, text: text || raw };
        }
      } catch (e) {
        log("member name fetch failed for", m.id, e);
      }
      names.set(m.id, resolved);
    }),
  );
  return names;
}

function displayName(member, nameMap) {
  const label = (member && member.display_label) || "Unknown";
  const resolved = member && member.id && nameMap.get(member.id);
  return resolved || { html: escapeHtml(label), text: label };
}

// The Inertia-protocol headers its own client-side router sends for a
// partial visit
async function inertiaFetch(url, extraHeaders) {
  const headers = Object.assign(
    {
      "X-Inertia": "true",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, application/xhtml+xml",
    },
    extraHeaders || {},
  );
  const res = await fetch(url, { headers, credentials: "same-origin" });
  if (!res.ok) throw new Error("activity request failed (" + res.status + ")");
  return res.json();
}

// Fetches one prop that might be Inertia-deferred (absent from
// the plain response until a second request explicitly asks for it).
// Returns the prop's value plus headers that ask for it
// directly, for a caller that needs to repeat the request (paging).
async function fetchDeferrable(url, propKey, versionHeader) {
  let body = await inertiaFetch(url, versionHeader);
  let value = body.props && body.props[propKey];
  let partialHeaders = Object.assign(
    {
      "X-Inertia-Partial-Component": body.component,
      "X-Inertia-Partial-Data": propKey,
    },
    versionHeader,
  );
  if (value === undefined && body.deferredProps) {
    const group = Object.values(body.deferredProps).find((keys) =>
      keys.includes(propKey),
    );
    if (group) {
      partialHeaders = Object.assign(
        {
          "X-Inertia-Partial-Component": body.component,
          "X-Inertia-Partial-Data": group.join(","),
        },
        versionHeader,
      );
      body = await inertiaFetch(url, partialHeaders);
      value = body.props && body.props[propKey];
    }
  }
  return { value, partialHeaders };
}

// Don't fetch too much data
const ACTIVITY_PAGE_SIZE = 200;
const MAX_ACTIVITY_PAGES = 10;

async function fetchMoodEvents(version, rangeStart, rangeEnd) {
  const versionHeader = version ? { "X-Inertia-Version": version } : {};
  const pageUrl = (n) =>
    "/activity?per_page=" + ACTIVITY_PAGE_SIZE + (n > 1 ? "&page=" + n : "");

  const first = await fetchDeferrable(pageUrl(1), "logs", versionHeader);
  const partialHeaders = first.partialHeaders;
  let logs = first.value;
  let rows = (logs && logs.data) || [];
  let lastPage = (logs && logs.last_page) || 1;
  let page = 1;
  let cappedByPageLimit = false;

  // Rows come back newest-first, so the last row on a page is its oldest.
  while (page < lastPage) {
    const oldest = rows.length
      ? Date.parse(rows[rows.length - 1].created_at)
      : null;
    if (oldest !== null && oldest <= rangeStart.getTime()) break;
    if (page >= MAX_ACTIVITY_PAGES) {
      cappedByPageLimit = true;
      break;
    }
    page += 1;
    const next = await inertiaFetch(pageUrl(page), partialHeaders);
    const nextLogs = next.props && next.props.logs;
    const nextRows = (nextLogs && nextLogs.data) || [];
    if (!nextRows.length) break;
    rows = rows.concat(nextRows);
    lastPage = (nextLogs && nextLogs.last_page) || lastPage;
  }

  const events = rows
    .filter((r) => r && r.subject_type === "App\\Models\\SystemMoodEntry")
    .map((r) => {
      const m = /mood to (.+)$/i.exec(r.description || "");
      return {
        at: Date.parse(r.created_at),
        mood: m ? m[1].trim() : r.description || "Unknown",
      };
    })
    .filter(
      (e) =>
        !isNaN(e.at) &&
        e.at >= rangeStart.getTime() &&
        e.at <= rangeEnd.getTime(),
    )
    .sort((a, b) => a.at - b.at);

  // Only actually incomplete if the page cap cut it off before reaching the
  // range's start. Running out of real pages (page === lastPage) means
  // there just isn't any older activity, which is a normal, complete answer.
  const oldestFetched = rows.length
    ? Date.parse(rows[rows.length - 1].created_at)
    : null;
  const truncated =
    cappedByPageLimit &&
    oldestFetched !== null &&
    oldestFetched > rangeStart.getTime();
  return { events, truncated };
}

// Approximate time-in-mood: each change lasts until the next one, or until
// the end of the range for the last
function moodDurations(events, rangeEnd) {
  return events.map((e, i) => {
    const nextAt =
      i + 1 < events.length ? events[i + 1].at : rangeEnd.getTime();
    return { ...e, ms: Math.max(0, nextAt - e.at) };
  });
}

function totalByMood(durEvents) {
  const byMood = new Map();
  durEvents.forEach((e) => {
    const cur = byMood.get(e.mood) || { count: 0, ms: 0 };
    cur.count += 1;
    cur.ms += e.ms;
    byMood.set(e.mood, cur);
  });
  return [...byMood.entries()]
    .map(([mood, v]) => ({ mood, ...v }))
    .sort((a, b) => b.ms - a.ms);
}

// Every day in the range, zero-filled, so a quiet stretch shows as a gap
// rather than just being absent from the chart.
function switchesPerDay(fronts, startYmd, endYmd) {
  const counts = new Map();
  for (
    let d = new Date(startYmd + "T00:00:00"),
      end = new Date(endYmd + "T00:00:00");
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    counts.set(fmtLocalYmd(d), 0);
  }
  fronts.forEach((f) => {
    const day = fmtLocalYmd(new Date(f.started_at));
    if (counts.has(day)) counts.set(day, counts.get(day) + 1);
  });
  return [...counts.entries()].map(([day, count]) => ({ day, count }));
}

function renderChart(daily, accentColor) {
  if (!daily.length) return "";
  const max = Math.max(1, ...daily.map((d) => d.count));
  const bars = daily
    .map((d) => {
      const h = Math.round((d.count / max) * 100);
      const label = new Date(d.day + "T00:00:00").toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" },
      );
      return (
        '<div class="bar-col"><div class="bar-count">' +
        d.count +
        "</div>" +
        '<div class="bar-track"><div class="bar" style="height:' +
        h +
        "%;background:" +
        accentColor +
        '" title="' +
        escapeHtml(label) +
        ": " +
        d.count +
        '"></div></div>' +
        '<div class="bar-label">' +
        escapeHtml(label) +
        "</div></div>"
      );
    })
    .join("");
  return (
    '<div class="chart-scroll"><div class="chart">' + bars + "</div></div>"
  );
}

function buildTimelineRows(fronts, moodEvents, nameMap) {
  const rows = fronts.map((f) => ({
    type: "switch",
    at: Date.parse(f.started_at),
    endAt: f.ended_at ? Date.parse(f.ended_at) : null,
    member: displayName(f.member, nameMap),
    frontType: (f.front_type && f.front_type.name) || "",
    note: f.comment || "",
  }));
  moodEvents.forEach((e) =>
    rows.push({ type: "mood", at: e.at, mood: e.mood }),
  );
  return rows.sort((a, b) => a.at - b.at);
}

function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(timeline) {
  const header = ["when", "type", "who", "duration_minutes", "note"]
    .map(csvField)
    .join(",");
  const lines = timeline.map((r) => {
    if (r.type === "switch") {
      const dur = Math.round(((r.endAt || Date.now()) - r.at) / 60000);
      return [
        new Date(r.at).toISOString(),
        "switch",
        r.member.text,
        dur,
        r.note,
      ]
        .map(csvField)
        .join(",");
    }
    return [new Date(r.at).toISOString(), "mood", r.mood, "", ""]
      .map(csvField)
      .join(",");
  });
  return [header, ...lines].join("\r\n");
}

function renderReport({
  system,
  startYmd,
  endYmd,
  summary,
  moodTotals,
  timeline,
  truncatedMood,
  daily,
  missingMonths,
}) {
  // The system's own accent colour if it looks like a real one
  const accentColor = /^#[0-9a-f]{3,8}$/i.test((system && system.color) || "")
    ? system.color
    : "#7c3aed";
  const dateFmt = (t) =>
    new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const rowsHtml =
    timeline
      .map((r) => {
        if (r.type === "switch") {
          const range = r.endAt
            ? dateFmt(r.at) + " → " + dateFmt(r.endAt)
            : dateFmt(r.at) + " → ongoing";
          const dur = fmtDuration((r.endAt || Date.now()) - r.at);
          const type = r.frontType
            ? ' <span class="muted">(' + escapeHtml(r.frontType) + ")</span>"
            : "";

          return (
            '<tr><td class="when">' +
            escapeHtml(range) +
            "</td><td>Switch</td><td>" +
            r.member.html +
            type +
            "</td><td>" +
            dur +
            "</td><td>" +
            escapeHtml(r.note) +
            "</td></tr>"
          );
        }
        return (
          '<tr><td class="when">' +
          escapeHtml(dateFmt(r.at)) +
          "</td><td>Mood</td><td>" +
          escapeHtml(r.mood) +
          "</td><td></td><td></td></tr>"
        );
      })
      .join("") ||
    '<tr><td colspan="5" class="muted">Nothing in this range.</td></tr>';

  const summaryHtml =
    summary
      .map(
        (s) =>
          "<tr><td>" +
          s.name.html +
          "</td><td>" +
          s.count +
          "</td><td>" +
          fmtDuration(s.ms) +
          "</td></tr>",
      )
      .join("") ||
    '<tr><td colspan="3" class="muted">No switches in this range.</td></tr>';

  const moodHtml =
    moodTotals
      .map(
        (m) =>
          "<tr><td>" +
          escapeHtml(m.mood) +
          "</td><td>" +
          m.count +
          "</td><td>" +
          fmtDuration(m.ms) +
          "</td></tr>",
      )
      .join("") ||
    '<tr><td colspan="3" class="muted">No mood changes in this range.</td></tr>';

  const csvHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(buildCsv(timeline));
  const fileStem = "fronting-report-" + startYmd + "-to-" + endYmd;
  const title =
    (system && system.name ? system.name + " - " : "") + "Fronting report";

  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
    escapeHtml(title) +
    "</title><style>" +
    "body{font:14px/1.5 system-ui,sans-serif;color:#1c1a26;max-width:900px;margin:2rem auto;padding:0 1rem}" +
    "h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin:22px 0 6px}" +
    ".muted{color:#6b6b76;font-size:12px}" +
    "table{width:100%;border-collapse:collapse;margin:8px 0 18px}" +
    "th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;vertical-align:top}" +
    "th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6b76}" +
    ".when{white-space:nowrap;width:1%}" +
    ".actions{margin:16px 0}.actions a,.actions button{font:inherit;font-size:13px;margin-right:10px}" +
    ".warn{background:#fff6e5;border:1px solid #f0c36d;padding:8px 12px;border-radius:8px;font-size:13px;margin:12px 0}" +
    // Horizontal scroll rather than squeezing, so a range with many days
    // still has one readable bar per day instead of illegibly thin ones.
    // TODO: Change chart type if we reach this point
    ".chart-scroll{overflow-x:auto;margin:8px 0 18px}" +
    ".chart{display:flex;align-items:flex-end;gap:6px;min-width:max-content;padding:4px 4px 0}" +
    ".bar-col{display:flex;flex-direction:column;align-items:center;width:30px}" +
    ".bar-track{display:flex;align-items:flex-end;height:100px;width:100%}" +
    ".bar{width:100%;border-radius:3px 3px 0 0;min-height:2px}" +
    ".bar-count{font-size:10px;color:#6b6b76;margin-bottom:2px}" +
    ".bar-label{font-size:10px;color:#6b6b76;margin-top:4px;white-space:nowrap}" +
    "@media print{.actions{display:none}}" +
    "</style></head><body>" +
    "<h1>" +
    escapeHtml(title) +
    "</h1>" +
    '<p class="muted">' +
    escapeHtml(startYmd) +
    " to " +
    escapeHtml(endYmd) +
    " - generated " +
    escapeHtml(new Date().toLocaleString()) +
    "</p>" +
    (truncatedMood
      ? '<div class="warn">This range needed more than ' +
        MAX_ACTIVITY_PAGES * ACTIVITY_PAGE_SIZE +
        " activity entries to reach its start, so the search for mood changes stopped there. Mood data for the earlier part of this range may be missing.</div>"
      : "") +
    (missingMonths && missingMonths.length
      ? '<div class="warn">Fronting data for ' +
        escapeHtml(missingMonths.map(monthLabel).join(", ")) +
        " could not be loaded -- switch and summary totals for those months are missing from this report.</div>"
      : "") +
    '<div class="actions"><button onclick="window.print()">Print / Save as PDF</button>' +
    '<a download="' +
    escapeHtml(fileStem) +
    '.csv" href="' +
    csvHref +
    '">Download CSV</a></div>' +
    "<h2>Summary</h2><table><thead><tr><th>Member</th><th>Switches</th><th>Time fronting</th></tr></thead><tbody>" +
    summaryHtml +
    "</tbody></table>" +
    "<h2>Switches per day</h2>" +
    (daily.some((d) => d.count > 0)
      ? renderChart(daily, accentColor)
      : '<p class="muted">No switches in this range.</p>') +
    "<h2>Mood</h2><table><thead><tr><th>Mood</th><th>Changes</th><th>Approx. time</th></tr></thead><tbody>" +
    moodHtml +
    "</tbody></table>" +
    "<h2>Timeline</h2><table><thead><tr><th>When</th><th>Type</th><th>Who / what</th><th>Duration</th><th>Note</th></tr></thead><tbody>" +
    rowsHtml +
    "</tbody></table>" +
    "</body></html>"
  );
}

async function buildReport(bridge, startYmd, endYmd) {
  const rangeStart = new Date(startYmd + "T00:00:00");
  const rangeEnd = new Date(endYmd + "T23:59:59.999");

  let allWeeks = bridge.weeks;
  let missingMonths = [];
  try {
    const collected = await collectAllWeeks(bridge, startYmd, endYmd);
    allWeeks = collected.allWeeks;
    missingMonths = collected.missingMonths;
  } catch (e) {
    log(
      "collecting fronts across months failed, using only the bridged month:",
      e,
    );
  }
  const fronts = collectFronts(allWeeks, startYmd, endYmd);

  let moodResult = { events: [], truncated: false };
  try {
    moodResult = await fetchMoodEvents(bridge.version, rangeStart, rangeEnd);
  } catch (e) {
    log("mood fetch failed, continuing without it:", e);
  }

  let nameMap = new Map();
  try {
    nameMap = await resolveMemberNames(
      fronts.map((f) => f.member),
      bridge.version,
    );
  } catch (e) {
    log("member name lookup failed, falling back to display labels:", e);
  }

  const moodTotals = totalByMood(moodDurations(moodResult.events, rangeEnd));
  const summary = summarizeFronts(fronts).map((s) => ({
    name: displayName(s.member, nameMap),
    count: s.count,
    ms: s.ms,
  }));
  return renderReport({
    system: bridge.system,
    startYmd,
    endYmd,
    summary,
    moodTotals,
    timeline: buildTimelineRows(fronts, moodResult.events, nameMap),
    truncatedMood: moodResult.truncated,
    daily: switchesPerDay(fronts, startYmd, endYmd),
    missingMonths,
  });
}

function runExport(overlay) {
  const startInput = overlay.querySelector("#psqol-export-start");
  const endInput = overlay.querySelector("#psqol-export-end");
  const errEl = overlay.querySelector("#psqol-export-error");
  const start = startInput.value,
    end = endInput.value;
  if (!start || !end || start > end) {
    errEl.textContent = "Pick a valid start and end date.";
    errEl.style.display = "block";
    return;
  }

  const dataEl = document.getElementById("psqol-export-data");
  let bridge = null;
  try {
    bridge =
      dataEl && dataEl.textContent ? JSON.parse(dataEl.textContent) : null;
  } catch (e) {
    /* leave bridge null */
  }
  if (!bridge || !bridge.weeks) {
    errEl.textContent =
      "Calendar data is not ready yet -- wait a moment and try again.";
    errEl.style.display = "block";
    return;
  }

  overlay.remove();

  // Opened synchronously, before any await, so it reads as a direct
  // response to the click rather than a background pop-up.
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(
      '<title>Generating report…</title><body style="font:14px system-ui;padding:2rem;">Generating report…</body>',
    );
    win.document.close();
  }

  buildReport(bridge, start, end)
    .then((html) => {
      if (!win) {
        log("export: pop-up blocked -- allow pop-ups for pluralspace.app");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    })
    .catch((e) => {
      log("export failed:", e);
      if (!win) return;
      win.document.open();
      win.document.write(
        '<title>Export failed</title><body style="font:14px system-ui;padding:2rem;">Could not build the report: ' +
          escapeHtml(String((e && e.message) || e)) +
          "</body>",
      );
      win.document.close();
    });
}

function openExportModal() {
  document.getElementById("psqol-export-modal")?.remove();
  const [defStart, defEnd] = currentWeekRange();

  const overlay = document.createElement("div");
  overlay.id = "psqol-export-modal";
  overlay.innerHTML = `
      <div id="psqol-export-dialog" role="dialog" aria-label="Export fronting report">
        <h2>Export fronting report</h2>
        <label>From<input type="date" id="psqol-export-start" value="${fmtLocalYmd(defStart)}"></label>
        <label>To<input type="date" id="psqol-export-end" value="${fmtLocalYmd(defEnd)}"></label>
        <div id="psqol-export-error"></div>
        <div id="psqol-export-actions">
          <button type="button" id="psqol-export-cancel">Cancel</button>
          <button type="button" id="psqol-export-go">Export</button>
        </div>
      </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay
    .querySelector("#psqol-export-cancel")
    .addEventListener("click", () => overlay.remove());
  overlay
    .querySelector("#psqol-export-go")
    .addEventListener("click", () => runExport(overlay));
  overlay.querySelector("#psqol-export-start").focus();
}

// A sync*(), not a FEATURES entry: disabling this tweak needs the button (and
// any open modal) to actually go away, whereas the FEATURES loop just skips
// apply() when a tweak is off and leaves whatever it last did in place.
function syncExportButton() {
  if (!cfg.weeklyExport || location.pathname !== SEL.fronts) {
    document.getElementById("psqol-export-btn")?.remove();
    document.getElementById("psqol-export-modal")?.remove();
    return;
  }
  if (document.getElementById("psqol-export-btn")) return;
  const header = document.querySelector("#main-content " + SEL.frontsHeader);
  if (!header) return;
  injectExportStyle();
  const btn = document.createElement("button");
  btn.id = "psqol-export-btn";
  btn.type = "button";
  btn.textContent = "Export…";
  btn.addEventListener("click", openExportModal);
  header.appendChild(btn);
}
