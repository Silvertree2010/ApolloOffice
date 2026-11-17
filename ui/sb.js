// Overlay scrollbars. Native bars are hidden in style.css; every scroll container
// gets a thin thumb drawn in one fixed layer above the app. Scrolling itself stays
// native (wheel, touch, keyboard, find-in-page), the bar only shows and drags it.
(() => {
  if (matchMedia("(forced-colors: active)").matches) { document.documentElement.classList.add("sbn"); return; }
  const MIN = 28, IDLE = 900;
  const L = document.createElement("div");
  L.className = "sbl";
  L.setAttribute("aria-hidden", "true");
  const live = new Map(); // scroller -> { y: bar, x: bar, t: hide timer, hov }
  let raf = 0, drag = null, over = null;
  const SC = /(auto|scroll|overlay)/;
  const root = () => document.scrollingElement || document.documentElement;
  const canY = (e) => e.scrollHeight > e.clientHeight + 1 && (e === root() ? getComputedStyle(document.body).overflowY !== "hidden" : SC.test(getComputedStyle(e).overflowY));
  const canX = (e) => e.scrollWidth > e.clientWidth + 1 && (e === root() ? getComputedStyle(document.body).overflowX !== "hidden" : SC.test(getComputedStyle(e).overflowX));
  const box = (e) => {
    if (e === root()) return { l: 0, t: 0, r: innerWidth, b: innerHeight };
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const bl = parseFloat(s.borderLeftWidth), bt = parseFloat(s.borderTopWidth);
    return { l: r.left + bl, t: r.top + bt, r: r.left + bl + e.clientWidth, b: r.top + bt + e.clientHeight };
  };
  // visible part of the scroller after clipping by scrolling/clipping ancestors
  const vis = (e, b) => {
    let { l, t, r, b: bb } = b;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const q = p.getBoundingClientRect();
      l = Math.max(l, q.left); t = Math.max(t, q.top); r = Math.min(r, q.right); bb = Math.min(bb, q.bottom);
    }
    return { l: Math.max(l, 0), t: Math.max(t, 0), r: Math.min(r, innerWidth), b: Math.min(bb, innerHeight) };
  };
  const mk = (ax) => {
    const tr = document.createElement("div");
    tr.className = "sbt sb" + ax;
    tr.innerHTML = `<i></i>`;
    tr.dataset.ax = ax;
    L.appendChild(tr);
    return tr;
  };
  const show = (e, hov) => {
    let o = live.get(e);
    if (!o) { o = { t: 0 }; live.set(e, o); }
    clearTimeout(o.t);
    if (hov !== undefined) o.hov = hov;
    o.on = true;
    if (!o.hov && drag?.e !== e) o.t = setTimeout(() => hide(e), IDLE);
    tick();
  };
  const hide = (e) => {
    const o = live.get(e);
    if (!o || o.hov || drag?.e === e) return;
    o.on = false;
    for (const ax of ["y", "x"]) o[ax]?.classList.remove("on");
    setTimeout(() => { const n = live.get(e); if (n && !n.on) { n.y?.remove(); n.x?.remove(); live.delete(e); } }, 250);
  };
  const place = (e, o) => {
    if (!e.isConnected) { o.y?.remove(); o.x?.remove(); live.delete(e); return false; }
    const b = box(e), v = vis(e, b), ok = v.r - v.l > 8 && v.b - v.t > 8;
    for (const ax of ["y", "x"]) {
      const can = ok && (ax === "y" ? canY(e) : canX(e));
      if (!can) { o[ax]?.classList.remove("on"); continue; }
      const tr = o[ax] || (o[ax] = mk(ax)), th = tr.firstChild, both = ax === "y" ? canX(e) : canY(e);
      const pad = 2, gap = both ? 10 : 0;
      const len = ax === "y" ? b.b - b.t - pad * 2 - gap : b.r - b.l - pad * 2 - gap;
      const cl = ax === "y" ? e.clientHeight : e.clientWidth, sl = ax === "y" ? e.scrollHeight : e.scrollWidth, sp = ax === "y" ? e.scrollTop : e.scrollLeft;
      const tl = Math.max(MIN, Math.round(len * cl / sl)), pos = Math.round((len - tl) * Math.min(1, Math.max(0, sp / (sl - cl))));
      if (ax === "y") tr.style.cssText = `left:${b.r - 12}px;top:${b.t + pad}px;height:${len}px`;
      else tr.style.cssText = `left:${b.l + pad}px;top:${b.b - 12}px;width:${len}px`;
      // clip to the visible area so bars of half-hidden scrollers don't leak out
      const tb = ax === "y" ? { l: b.r - 12, t: b.t + pad, r: b.r, b: b.t + pad + len } : { l: b.l + pad, t: b.b - 12, r: b.l + pad + len, b: b.b };
      tr.style.clipPath = `inset(${Math.max(0, v.t - tb.t)}px ${Math.max(0, tb.r - v.r)}px ${Math.max(0, tb.b - v.b)}px ${Math.max(0, v.l - tb.l)}px)`;
      th.style.cssText = ax === "y" ? `height:${tl}px;transform:translateY(${pos}px)` : `width:${tl}px;transform:translateX(${pos}px)`;
      tr._g = { len, tl, cl, sl };
      // hide bars of scrollers covered by a drawer, menu or dialog
      const cx = ax === "y" ? b.r - 6 : (Math.max(v.l, b.l) + Math.min(v.r, b.r)) / 2, cy = ax === "y" ? (Math.max(v.t, b.t) + Math.min(v.b, b.b)) / 2 : b.b - 6;
      L.style.visibility = "hidden";
      const hit = document.elementFromPoint(cx, cy);
      L.style.visibility = "";
      const top = !hit || e === root() ? true : e.contains(hit) || hit === e;
      tr.classList.toggle("on", !!(o.on && top) || drag?.e === e);
      tr.classList.toggle("dg", drag?.e === e && drag.ax === ax);
    }
    return true;
  };
  const frame = () => {
    raf = 0;
    let any = false;
    for (const [e, o] of live) if (place(e, o)) any = any || o.on || drag?.e === e;
    if (any) raf = requestAnimationFrame(frame);
  };
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  // nearest scrollable ancestors of a node, innermost first
  const chain = (n) => {
    const out = [];
    for (let e = n?.nodeType === 1 ? n : n?.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      if (e === document.body) break;
      if (L.contains(e)) return [];
      if ((e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && (canY(e) || canX(e))) out.push(e);
    }
    const r = root();
    if (canY(r) || canX(r)) out.push(r);
    return out;
  };
  document.addEventListener("scroll", (ev) => {
    const e = ev.target === document ? root() : ev.target;
    if (e.nodeType === 1 && !L.contains(e)) show(e);
  }, { capture: true, passive: true });
  document.addEventListener("pointerover", (ev) => {
    if (drag || ev.pointerType === "touch" || L.contains(ev.target)) return;
    const c = chain(ev.target), s = new Set(c);
    for (const [e, o] of live) if (o.hov && !s.has(e)) { o.hov = false; show(e); }
    for (const e of c) { const o = live.get(e); if (!o?.hov) show(e, true); }
    over = c[0] || null;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { for (const [e, o] of live) if (o.hov) { o.hov = false; show(e); } });
  addEventListener("resize", tick, { passive: true });
  // content growing under a resting pointer (logs, live lists) should update the thumb
  new MutationObserver(() => { if (live.size) tick(); }).observe(document.documentElement, { childList: true, subtree: true });

  L.addEventListener("pointerdown", (ev) => {
    const tr = ev.target.closest(".sbt");
    if (!tr || ev.button !== 0) return;
    const e = [...live].find(([, o]) => o.y === tr || o.x === tr)?.[0];
    if (!e) return;
    ev.preventDefault();
    const ax = tr.dataset.ax, g = tr._g, th = tr.firstChild, p = ax === "y" ? ev.clientY : ev.clientX;
    if (ev.target !== th) return;
    drag = { e, ax, p0: p, s0: ax === "y" ? e.scrollTop : e.scrollLeft, k: (g.sl - g.cl) / Math.max(1, g.len - g.tl) };
    tr.setPointerCapture(ev.pointerId);
    document.documentElement.classList.add("sbd");
    show(e);
  });
  L.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const d = ((drag.ax === "y" ? ev.clientY : ev.clientX) - drag.p0) * drag.k;
    if (drag.ax === "y") drag.e.scrollTop = drag.s0 + d; else drag.e.scrollLeft = drag.s0 + d;
  });
  const end = () => {
    if (!drag) return;
    const e = drag.e; drag = null;
    document.documentElement.classList.remove("sbd");
    const o = live.get(e);
    if (o) { o.hov = over ? chain(over).includes(e) : false; show(e); }
  };
  L.addEventListener("pointerup", end);
  L.addEventListener("pointercancel", end);
  L.addEventListener("lostpointercapture", end);
  // the pointer resting on a bar keeps it (and its scroller) visible
  L.addEventListener("pointerover", (ev) => { const tr = ev.target.closest(".sbt"); const e = tr && [...live].find(([, o]) => o.y === tr || o.x === tr)?.[0]; if (e) show(e, true); });

  const go = () => document.body.appendChild(L);
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  window.SB = { show: (e) => show(e) };
})();
