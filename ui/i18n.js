(() => {
  let lg = "de";
  try { lg = localStorage.getItem("ao-lang") || (navigator.language || "de").slice(0, 2); } catch {}
  window.LANG = lg === "en" ? "en" : "de";
  const EN = window.EN || {};
  window.L = (s) => (window.LANG === "en" && EN[s]) || s;
})();
