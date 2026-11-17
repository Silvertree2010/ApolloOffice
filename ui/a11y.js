// Accessibility pass over whatever the views render. The views build HTML strings,
// so instead of touching every template this fills in the semantics afterwards:
// labels for form rows, names for icon buttons, keyboard access for clickable rows,
// tab/segment/nav state, a heading outline without skipped levels, dialog focus.
(() => {
  const D = document;
  const NAT = "a[href],button,input,select,textarea,summary,[contenteditable=true],audio[controls],video[controls]";
  const FOC = NAT + ",[tabindex]:not([tabindex='-1'])";
  let uid = 0;
  const id = (e) => e.id || (e.id = "a11y" + ++uid);
  const txt = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();

  const label = (r) => {
    for (const l of r.querySelectorAll("label:not([for])")) {
      if (l.querySelector("input,select,textarea")) continue;
      let c = null;
      for (let s = l.nextElementSibling; s && !c; s = s.nextElementSibling) c = s.matches("input,select,textarea") ? s : s.querySelector("input:not([type=hidden]),select,textarea");
      if (c && !c.labels?.length && !c.getAttribute("aria-label")) l.htmlFor = id(c);
    }
    for (const c of r.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select:not(.ddn)")) {
      if (c.labels?.length || c.getAttribute("aria-label") || c.getAttribute("aria-labelledby")) continue;
      const n = c.placeholder || c.title || c.closest("[data-lab]")?.dataset.lab || c.parentElement?.closest(".fr3,.hr2,.row,td")?.querySelector("label,b,.t1")?.textContent;
      if (n) c.setAttribute("aria-label", n.trim());
    }
  };
  const names = (r) => {
    for (const b of r.querySelectorAll("button,a[href]")) {
      for (const s of b.querySelectorAll("svg:not([aria-hidden])")) s.setAttribute("aria-hidden", "true");
      if (!txt(b) && !b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    }
  };
  // elements with a click handler that a keyboard can't reach
  const keys = (r) => {
    for (const e of r.querySelectorAll("div,tr,li,span,section,article")) {
      if (typeof e.onclick !== "function" || e.matches(NAT) || e.hasAttribute("tabindex") || e.querySelector(FOC) || e.closest(".sbl")) continue;
      if (e.id === "dr" || e.classList.contains("cmdk") || e.classList.contains("ddm")) continue; // backdrops close on click, Esc does the same
      e.tabIndex = 0;
      if (e.tagName !== "TR" && !e.getAttribute("role")) e.setAttribute("role", "button");
      e.classList.add("kb1");
    }
  };
  D.addEventListener("keydown", (ev) => {
    const e = ev.target;
    if (!e.classList?.contains("kb1") || ev.target !== D.activeElement) return;
    if (ev.key === "Enter" || (ev.key === " " && e.getAttribute("role") === "button")) { ev.preventDefault(); e.click(); }
  });
  const state = (r) => {
    for (const t of r.querySelectorAll("[role=tab]")) {
      const on = t.classList.contains("on");
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    }
    for (const l of r.querySelectorAll("[role=tablist]")) if (!l.querySelector("[role=tab].on")) { const f = l.querySelector("[role=tab]"); if (f) f.tabIndex = 0; }
    for (const b of r.querySelectorAll(".seg button:not([role]),.tabs:not([role=tablist]) button:not([role]),.thc button:not([role])")) b.setAttribute("aria-pressed", b.classList.contains("on"));
    for (const t of r.querySelectorAll(".tile .tn[aria-pressed]")) t.setAttribute("aria-pressed", t.closest(".tile").classList.contains("hold"));
    for (const a of r.querySelectorAll(".nv a")) a.classList.contains("on") ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  };
  // arrow keys inside a tablist move between tabs (and activate them, like the mouse does)
  D.addEventListener("keydown", (ev) => {
    const t = ev.target.closest?.("[role=tab]"), l = t?.closest("[role=tablist]");
    if (!l || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(ev.key)) return;
    const ts = [...l.querySelectorAll("[role=tab]")].filter((x) => !x.hidden && !x.disabled), i = ts.indexOf(t), n = ts.length;
    const j = ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : (i + (ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 1) + n) % n;
    ev.preventDefault();
    ts[j].focus(); ts[j].click();
  });
  // no skipped levels below the page title (h1): a section h3 directly under h1 reads as level 2
  const outline = () => {
    const st = [{ a: 1, e: 1 }];
    for (const h of D.querySelectorAll(".app h1,.app h2,.app h3,.app h4,.app h5,.app h6,#dr h3,#dr h4")) {
      if (!h.offsetParent && !h.getClientRects().length) continue;
      if (h.closest("#dr") && st.length && !st.dr) { st.length = 1; st.dr = 1; }
      const a = +h.tagName[1];
      while (st.length > 1 && st[st.length - 1].a >= a) st.pop();
      const e = a === 1 ? 1 : st[st.length - 1].e + 1;
      st.push({ a, e });
      e === a ? h.removeAttribute("aria-level") : h.setAttribute("aria-level", e);
    }
  };
  const run = () => { const r = D.body; label(r); names(r); keys(r); state(r); outline(); };
  let q = 0;
  const later = () => { if (!q) q = setTimeout(() => { q = 0; run(); }, 120); };
  new MutationObserver(later).observe(D.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });

  // drawer: dialog semantics, focus moves in, Tab stays in, focus returns on close
  const go = () => {
    const dr = D.getElementById("dr"), pn = dr?.querySelector(".pn");
    if (pn) {
      pn.setAttribute("role", "dialog"); pn.setAttribute("aria-modal", "true"); pn.setAttribute("aria-labelledby", "drT");
      let back = null;
      const sync = () => {
        const open = !dr.hidden && !dr.classList.contains("out");
        for (const x of [D.querySelector(".nv"), D.querySelector(".app")]) x && (x.inert = open);
        if (open && !pn.contains(D.activeElement)) {
          back = back || D.activeElement;
          requestAnimationFrame(() => D.getElementById("drX").focus({ preventScroll: true }));
        } else if (!open && back) { const b = back; back = null; if (b.isConnected) b.focus({ preventScroll: true }); }
      };
      new MutationObserver(sync).observe(dr, { attributes: true, attributeFilter: ["hidden", "class"] });
    }
    // skip link: jump to whichever main region is showing
    const sk = D.getElementById("skip");
    if (sk) sk.onclick = (ev) => { ev.preventDefault(); const m = ["pg", "fe", "main", "lay"].map((k) => D.getElementById(k)).find((x) => x && x.getClientRects().length); if (m && m.tabIndex < 0 && !m.hasAttribute("tabindex")) m.tabIndex = -1; m?.focus(); };
    // live status for the connection chip
    const net = D.getElementById("cNet"); if (net) { net.setAttribute("role", "status"); net.setAttribute("aria-live", "polite"); }
    run();
  };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", go); else go();
})();
