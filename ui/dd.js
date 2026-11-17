(() => {
  const CH = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>`;
  const OK = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let M = null, cur = null, hi = -1, ty = "", tyT = 0;
  const opts = (s) => [...s.options].filter((o) => !o.hidden);
  const lab = (s) => { const o = s.options[s.selectedIndex]; return o ? o.textContent : ""; };
  const sync = (s) => {
    const b = s._ddb; if (!b) return;
    b.querySelector("span").textContent = lab(s);
    const al = s.getAttribute("aria-label") || s.labels?.[0]?.textContent.trim();
    if (al && al.trim() !== lab(s).trim()) b.setAttribute("aria-label", `${al}: ${lab(s)}`); else b.removeAttribute("aria-label");
    b.disabled = s.disabled;
    b.hidden = s.hidden;
  };
  const close = (f) => {
    if (!M) return;
    const b = cur?._ddb;
    M.remove(); M = null;
    if (b) { b.removeAttribute("aria-activedescendant"); b.removeAttribute("aria-controls"); b.setAttribute("aria-expanded", "false"); b.classList.remove("on"); if (f) b.focus(); }
    cur = null;
    document.removeEventListener("pointerdown", out, true);
    window.removeEventListener("resize", rz);
    document.removeEventListener("scroll", rz, true);
  };
  const out = (e) => { if (M && !M.contains(e.target) && e.target !== cur?._ddb && !cur?._ddb.contains(e.target)) close(false); };
  const rz = (e) => { if (e && e.type === "scroll" && M && M.contains(e.target)) return; close(false); };
  const pick = (i) => {
    const s = cur, o = opts(s)[i];
    if (!o || o.disabled) return;
    const ch = s.value !== o.value;
    s.value = o.value;
    close(true);
    if (ch) { s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  const mark = () => {
    const it = M.querySelectorAll(".ddi");
    it.forEach((x, i) => x.classList.toggle("hi", i === hi));
    it[hi]?.scrollIntoView({ block: "nearest" });
    const x = M.querySelector(`[data-i="${hi}"]`);
    if (x) cur._ddb.setAttribute("aria-activedescendant", x.id); else cur._ddb.removeAttribute("aria-activedescendant");
  };
  const place = () => {
    const r = cur._ddb.getBoundingClientRect(), h = M.offsetHeight, W = innerWidth, H = innerHeight;
    const up = r.bottom + 6 + h > H - 8 && r.top - 6 - h > 8;
    M.style.minWidth = r.width + "px";
    M.style.left = Math.max(8, Math.min(r.left, W - M.offsetWidth - 8)) + "px";
    M.style.top = (up ? r.top - 6 - h : r.bottom + 6) + "px";
    M.style.transformOrigin = up ? "50% 100%" : "50% 0";
  };
  const open = (s) => {
    if (cur === s) return close(true);
    close(false);
    cur = s;
    const b = s._ddb, os = opts(s);
    M = document.createElement("div");
    M.className = "ddm";
    M.setAttribute("role", "listbox");
    M.id = "ddm";
    const al = s.getAttribute("aria-label") || s.labels?.[0]?.textContent.trim();
    if (al) M.setAttribute("aria-label", al);
    let g = null, h = "";
    os.forEach((o, i) => {
      const pg = o.parentElement.tagName === "OPTGROUP" ? o.parentElement : null;
      if (pg !== g) { g = pg; if (g) h += `<div class="ddg">${esc(g.label)}</div>`; }
      h += `<button type="button" class="ddi${o.selected ? " on" : ""}" id="ddo${i}" tabindex="-1" role="option" aria-selected="${o.selected}" data-i="${i}" ${o.disabled ? "disabled" : ""}><span>${esc(o.textContent)}</span>${o.selected ? OK : ""}</button>`;
    });
    M.innerHTML = h || `<div class="ddg">Nothing to choose</div>`;
    document.body.appendChild(M);
    hi = Math.max(0, os.findIndex((o) => o.selected));
    place(); mark();
    b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-controls", "ddm"); b.classList.add("on");
    M.onclick = (e) => { const x = e.target.closest(".ddi"); if (x) pick(+x.dataset.i); };
    M.onpointermove = (e) => { const x = e.target.closest(".ddi"); if (x && +x.dataset.i !== hi) { hi = +x.dataset.i; mark(); } };
    document.addEventListener("pointerdown", out, true);
    window.addEventListener("resize", rz);
    document.addEventListener("scroll", rz, true);
  };
  const key = (s, e) => {
    const os = opts(s), n = os.length;
    if (!M) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(s); }
      return;
    }
    const mv = (d) => { let i = hi; for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!os[i].disabled) break; } hi = i; mark(); };
    if (e.key === "ArrowDown") { e.preventDefault(); mv(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mv(-1); }
    else if (e.key === "Home") { e.preventDefault(); hi = 0; mark(); }
    else if (e.key === "End") { e.preventDefault(); hi = n - 1; mark(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(hi); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      clearTimeout(tyT); ty += e.key.toLowerCase(); tyT = setTimeout(() => { ty = ""; }, 600);
      const i = os.findIndex((o) => o.textContent.trim().toLowerCase().startsWith(ty));
      if (i >= 0) { hi = i; mark(); }
    }
  };
  const up = (s) => {
    if (s._ddb || s.multiple || s.size > 1) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dd";
    b.setAttribute("aria-haspopup", "listbox");
    b.setAttribute("aria-expanded", "false");
    if (s.title) b.title = s.title;
    b.innerHTML = `<span></span>${CH}`;
    const w = s.getBoundingClientRect().width;
    if (w > 0) b.style.minWidth = Math.ceil(w) + "px";
    s.parentNode.insertBefore(b, s);
    s.classList.add("ddn");
    s.tabIndex = -1;
    s.setAttribute("aria-hidden", "true");
    s._ddb = b;
    b.onclick = () => open(s);
    b.onkeydown = (e) => key(s, e);
    new MutationObserver(() => sync(s)).observe(s, { attributes: true, childList: true, subtree: true, attributeFilter: ["disabled", "hidden", "selected"] });
    sync(s);
  };
  for (const [P, k] of [[HTMLSelectElement.prototype, "value"], [HTMLSelectElement.prototype, "selectedIndex"]]) {
    const d = Object.getOwnPropertyDescriptor(P, k);
    Object.defineProperty(P, k, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(this); } });
  }
  const scan = (r) => { if (r.tagName === "SELECT") up(r); else if (r.querySelectorAll) r.querySelectorAll("select").forEach(up); };
  const go = () => {
    scan(document.body);
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); if (cur && !cur.isConnected) close(false); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
