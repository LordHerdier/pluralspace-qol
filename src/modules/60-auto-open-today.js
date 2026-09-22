// src/modules/60-auto-open-today.js

// Calendar page: automatically open today's date.
const autoOpenToday = (() => {
  let doneFor = null;
  return {
    key: "autoOpenToday",
    apply() {
      if (location.pathname !== SEL.fronts) {
        doneFor = null;
        return;
      }
      if (doneFor === location.pathname) return;
      if (document.querySelector(SEL.drawer)) {
        doneFor = location.pathname;
        return;
      }
      const cell = document.querySelector(SEL.todayCell);
      if (!cell) return; // not rendered yet, or viewing another month
      doneFor = location.pathname;
      log("opening today", cell.dataset.date);
      cell.click();
      setTimeout(() => {
        if (document.querySelector(SEL.drawer)) return;
        if (location.pathname !== SEL.fronts || !cfg.autoOpenToday) return;
        const again = document.querySelector(SEL.todayCell);
        if (!again) return;
        log("drawer did not open, retrying once");
        again.click();
      }, 1200);
    },
  };
})();
