// src/modules/65-prefill-end.js

// Seeds the "ended at" field on the calendar's "edit front" with the start time.
// Reduces the number of keystrokes by a bit if fronts are typically on the same day.
const prefillEnd = (() => {
  // Per-element, so reopening the modal on a fresh input prefills again while
  // a field the user has deliberately cleared is left alone.
  const filled = new WeakSet();
  return {
    key: "prefillEnd",
    apply() {
      const start = document.querySelector(SEL.startInput);
      const end = document.querySelector(SEL.endInput);
      if (!start || !end || filled.has(end)) return;
      // Disabled means "Still fronting" is on and an end time is meaningless.
      if (end.disabled || end.value || !start.value) return;
      filled.add(end);
      end.value = start.value;
      end.dispatchEvent(new Event("change", { bubbles: true }));
      log("prefilled end time from start:", start.value);
    },
  };
})();
