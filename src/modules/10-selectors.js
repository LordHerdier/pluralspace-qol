// src/modules/10-selectors.js

// Vue 3 + Inertia, Tailwind, no hashed class names. The calendar exposes real
// data attributes and the drawer and form fields have stable ids, so these
// are about as durable as userscript selectors get.
const SEL = {
  fronts: "/space/fronts",

  // The app rings today's cell itself
  todayCell: "button[data-date].ring-accent",

  drawer: 'aside[aria-labelledby="day-drawer-title"]',
  startInput: "#front-start",
  endInput: "#front-end",
  frontingCard: '[data-tour="dashboard-fronting"]',
  prose: "div.prose",
  frontName: "span.max-w-full.truncate.text-center",
  drawerName: "span.truncate.text-sm.font-semibold.text-text-heading",
  drawerTime: "p.tabular-nums",
  drawerTitle: "#day-drawer-title",

  // Scoped by :has(h1) rather than a class chain: the fronting history page
  // has more than one <header> (the day drawer has its own), and this is
  // the only one with a heading in it.
  frontsHeader: "header:has(h1)",
};
