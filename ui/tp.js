// Time fields. Every <input type="time"> gets a 24-hour field with two typed
// segments (hours, minutes) and a picker; the native input stays in the form,
// hidden, and carries the value (HH:MM) so form code reads it as before.
(() => {
  const CK = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/></svg>`;
  const p2 = (n) => String(n).padStart(2, "0");
  const parse = (v) => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ""); return m ? [Math.min(23, +m[1]), Math.min(59, +m[2])] : null; };
  const name = (s) => s.getAttribute("aria-label") || s.labels?.[0]?.textContent.trim() || s.title || "Time";
  let M = null, cur = null, uid = 0;

  const fire = (s) => { s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); };
  const set = (s, h, m, quiet) => {
    const v = h == null ? "" : `${p2(h)}:${p2(m)}`;
    if (s.value === v) return sync(s);
    D.set.call(s, v); sync(s);
    if (!quiet) fire(s);
  };
  const sync = (s) => {
    const w = s._tp; if (!w) return;
    const t = parse(s.value), [hs, ms] = w.querySelectorAll(".tps");
    hs.textContent = t ? p2(t[0]) : "--"; ms.textContent = t ? p2(t[1]) : "--";
    hs.setAttribute("aria-valuenow", t ? t[0] : ""); hs.setAttribute("aria-valuetext", t ? `${t[0]} hours` : "empty");
    ms.setAttribute("aria-valuenow", t ? t[1] : ""); ms.setAttribute("aria-valuetext", t ? `${t[1]} minutes` : "empty");
    w.classList.toggle("dis", s.disabled);
    for (const x of w.querySelectorAll(".tps,.tpb")) { if (s.disabled) x.setAttribute("aria-disabled", "true"); else x.removeAttribute("aria-disabled"); x.tabIndex = s.disabled ? -1 : 0; }
    w.hidden = s.hidden;
    if (M && cur === s) mark();
  };

  // picker
  const close = (f) => {
    if (!M) return;
    const s = cur; M.remove(); M = null; cur = null;
    document.removeEventListener("pointerdown", out, true);
    removeEventListener("resize", rz); document.removeEventListener("scroll", rz, true);
    if (s?._tp) { const b = s._tp.querySelector(".tpb"); b.setAttribute("aria-expanded", "false"); s._tp.classList.remove("on"); if (f) b.focus(); }
  };
  const out = (e) => { if (M && !M.contains(e.target) && !cur?._tp.contains(e.target)) close(false); };
  const rz = (e) => { if (e?.type === "scroll" && M?.contains(e.target)) return; close(false); };
  const mark = () => {
    const t = parse(cur.value) || [-1, -1];
    for (const [k, v] of [["h", t[0]], ["m", t[1]]]) for (const o of M.querySelectorAll(`[data-${k}]`)) { const on = +o.dataset[k] === v; o.classList.toggle("on", on); o.setAttribute("aria-selected", on); }
  };
  const open = (s) => {
    if (cur === s) return close(true);
    close(false); cur = s;
    const t = parse(s.value) || [8, 0], ms = [...Array(12)].map((_, i) => i * 5);
    if (!ms.includes(t[1])) ms.push(t[1]), ms.sort((a, b) => a - b);
    const id = "tpm" + ++uid;
    M = document.createElement("div");
    M.className = "tpm"; M.id = id;
    M.setAttribute("role", "dialog"); M.setAttribute("aria-label", name(s));
    M.innerHTML = `<div class="tpc" role="listbox" aria-label="Hours">${[...Array(24)].map((_, h) => `<button type="button" role="option" data-h="${h}" tabindex="-1">${p2(h)}</button>`).join("")}</div><div class="tpc" role="listbox" aria-label="Minutes">${ms.map((m) => `<button type="button" role="option" data-m="${m}" tabindex="-1">${p2(m)}</button>`).join("")}</div>`;
    document.body.appendChild(M);
    mark();
    const r = s._tp.getBoundingClientRect(), h = M.offsetHeight, up = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8;
    M.style.left = Math.max(8, Math.min(r.left, innerWidth - M.offsetWidth - 8)) + "px";
    M.style.top = (up ? r.top - 6 - h : r.bottom + 6) + "px";
    M.style.transformOrigin = up ? "50% 100%" : "50% 0";
    for (const c of M.querySelectorAll(".tpc")) { const o = c.querySelector(".on"); if (o) c.scrollTop = o.offsetTop - c.clientHeight / 2 + o.offsetHeight / 2; }
    const b = s._tp.querySelector(".tpb"); b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-controls", id); s._tp.classList.add("on");
    M.onclick = (e) => {
      const o = e.target.closest("button"); if (!o) return;
      const t0 = parse(s.value) || [8, 0];
      if (o.dataset.h != null) set(s, +o.dataset.h, t0[1]);
      else { set(s, t0[0], +o.dataset.m); close(true); }
    };
    M.onkeydown = (e) => {
      const o = e.target.closest("button"), c = o?.closest(".tpc"); if (!c) { if (e.key === "Escape") close(true); return; }
      const xs = [...c.children], i = xs.indexOf(o), cols = [...M.querySelectorAll(".tpc")];
      const go = (x) => { e.preventDefault(); x?.focus(); x?.scrollIntoView({ block: "nearest" }); };
      if (e.key === "ArrowDown") go(xs[Math.min(xs.length - 1, i + 1)]);
      else if (e.key === "ArrowUp") go(xs[Math.max(0, i - 1)]);
      else if (e.key === "Home") go(xs[0]);
      else if (e.key === "End") go(xs[xs.length - 1]);
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = cols[(cols.indexOf(c) + 1) % 2]; go(n.querySelector(".on") || n.firstChild); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") close(false);
    };
    (M.querySelector(".tpc .on") || M.querySelector(".tpc button")).focus({ preventScroll: true });
    document.addEventListener("pointerdown", out, true);
    addEventListener("resize", rz); document.addEventListener("scroll", rz, true);
  };

  // segments: arrows step, digits type (two digits or a digit that can't start a longer number move on)
  const seg = (s, x, k) => {
    let buf = "", bt = 0;
    x.onkeydown = (e) => {
      if (s.disabled) return;
      const t = parse(s.value) || [k ? 0 : 8, 0], max = k ? 59 : 23, other = x.parentElement.querySelectorAll(".tps")[k ? 0 : 1];
      const put = (v) => set(s, k ? t[0] : v, k ? v : t[1]);
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const d = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey && k ? 5 : 1); put((t[k] + d + max + 1) % (max + 1)); }
      else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); const d = (e.key === "PageUp" ? 1 : -1) * (k ? 10 : 3); put((t[k] + d + max + 1) % (max + 1)); }
      else if (e.key === "Home") { e.preventDefault(); put(0); }
      else if (e.key === "End") { e.preventDefault(); put(max); }
      else if (e.key === "ArrowRight" && !k) { e.preventDefault(); other.focus(); }
      else if (e.key === "ArrowLeft" && k) { e.preventDefault(); other.focus(); }
      else if (/^\d$/.test(e.key)) {
        e.preventDefault(); clearTimeout(bt);
        buf = (buf + e.key).slice(-2);
        const v = Math.min(max, +buf);
        put(v);
        if (buf.length === 2 || v * 10 > max) { buf = ""; if (!k) other.focus(); }
        else bt = setTimeout(() => { buf = ""; }, 1200);
      }
      else if (e.key === "Enter" || (e.key === " " && !buf)) { e.preventDefault(); open(s); }
      else if (e.key === "Escape" && M) { e.preventDefault(); close(true); }
    };
    x.onblur = () => { buf = ""; };
    x.onclick = () => { if (!s.disabled) x.focus(); };
  };

  const up = (s) => {
    if (s._tp) return;
    const w = document.createElement("span");
    w.className = "tp";
    w.setAttribute("role", "group");
    w.setAttribute("aria-label", name(s));
    w.innerHTML = `<span class="tps" role="spinbutton" aria-label="Hours" aria-valuemin="0" aria-valuemax="23"></span><span class="tpx" aria-hidden="true">:</span><span class="tps" role="spinbutton" aria-label="Minutes" aria-valuemin="0" aria-valuemax="59"></span><button type="button" class="tpb" aria-haspopup="dialog" aria-expanded="false" aria-label="Pick ${name(s).toLowerCase()}">${CK}</button>`;
    s.parentNode.insertBefore(w, s);
    s.classList.add("tpn"); s.tabIndex = -1; s.setAttribute("aria-hidden", "true");
    s._tp = w;
    const [hs, ms] = w.querySelectorAll(".tps");
    seg(s, hs, 0); seg(s, ms, 1);
    w.querySelector(".tpb").onclick = () => !s.disabled && open(s);
    w.onclick = (e) => { if (e.target === w && !s.disabled) hs.focus(); };
    new MutationObserver(() => sync(s)).observe(s, { attributes: true, attributeFilter: ["disabled", "hidden", "value"] });
    s.addEventListener("input", () => sync(s));
    sync(s);
  };
  const D = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(HTMLInputElement.prototype, "value", { configurable: true, enumerable: D.enumerable, get() { return D.get.call(this); }, set(v) { D.set.call(this, v); if (this._tp) sync(this); } });
  const scan = (r) => { if (r.matches?.("input[type=time]")) up(r); else r.querySelectorAll?.("input[type=time]").forEach(up); };
  const go = () => {
    scan(document.body);
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); if (cur && !cur.isConnected) close(false); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
