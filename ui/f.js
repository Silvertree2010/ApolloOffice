(() => {
const A = window.A, $ = A.$, esc = A.esc, PG = A.PG;
const pg = $("pg"), pgi = $("pgi");
const OFK = ["office", "accounting", "server"];
let X = {}, dr = null, sn = new Set();

const lum = (c) => { const n = parseInt((c || "#888888").slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ink = (c) => (lum(c) > 0.6 ? "#1b1a18" : "#f6f4ee");
const fid = (f) => (f && typeof f === "object" ? f.w : f);
const ev = (s) => (s.at ? "every day at " + esc(s.at) : "every " + (+s.every || 0) + " min");
const nm = (id) => ((A.wInfo(id) || {}).nm || "#" + id);

const chips = (x) => {
  const c = X[x.id] || {}, o = [];
  const f = (c.r || []).length + (c.rw || []).length;
  if (f) o.push(f + (f === 1 ? " folder" : " folders"));
  if (c.sh === true) o.push("any command");
  else if (Array.isArray(c.sh) && c.sh.length) o.push(c.sh.length + (c.sh.length === 1 ? " command" : " commands"));
  if (c.pu) o.push("push");
  return o.map((t) => `<i>${t}</i>`).join("");
};

const blk = (x, p) => {
  const c = x.tcol || "#8a8a8a", st = A.wSt(x);
  return `<div class="fk${sn.has(x.id) ? " snap" : ""}" data-w="${x.id}" data-p="${p}" style="--c:${c};color:${ink(c)}"><div class="t"><span class="d ${st}" title="${esc(A.NST[st])}"></span><b>${esc(x.nm)}</b><small>${esc(x.tn || x.ty)}</small></div><div class="cs">${chips(x)}</div></div>`;
};

const hats = (x, root) => {
  const sc = (X[x.id] || {}).sc || [];
  const h = sc.map((s, i) => `<div class="fh" data-hw="${x.id}"><span>${ev(s)}</span><b>${esc(s.ti)}</b><em data-rs="${x.id}:${i}" title="Remove">✕</em></div>`).join("");
  return h || (root ? `<div class="fh u"><span>when you give a task</span></div>` : "");
};

const tree = (x, ws, seen, p) => {
  seen.add(x.id);
  const ks = ws.filter((k) => (k.fr || []).some((f) => fid(f) === x.id));
  const one = (k) => (seen.has(k.id) ? `<div class="fr">continues at <b>${esc(k.nm)}</b></div>` : tree(k, ws, seen, x.id));
  const kid = ks.length > 1 ? `<div class="fn"><div class="fg">passes on to all of</div><div class="fo">${ks.map((k) => `<div class="fl">${one(k)}</div>`).join("")}</div></div>` : ks.length ? one(ks[0]) : "";
  return (p ? hats(x, false) : "") + blk(x, p) + kid;
};

const zone = (f) => {
  const S = A.S, ws = S.w.filter((x) => x.fl === f.id), ids = new Set(ws.map((x) => x.id));
  const seen = new Set(), st = [];
  const root = (x) => !(x.fr || []).some((r) => ids.has(fid(r)) && fid(r) !== x.id);
  for (const x of ws.filter(root)) st.push(`<div class="fs">${hats(x, true)}${tree(x, ws, seen, 0)}</div>`);
  for (const x of ws) if (!seen.has(x.id)) st.push(`<div class="fs">${hats(x, true)}${tree(x, ws, seen, 0)}</div>`);
  const hk = (A.F[f.id] || {}).hook;
  return `<section class="fz"><div class="zh"><b>${esc(A.lvlName(f.lvl))}</b><span>${esc(f.nm || "")}</span><span class="sp"></span><button data-tm="${f.id}">${"Hire team"}</button><button data-gf="${f.id}">${"Show floor"}</button></div>
    <div class="fa" data-fl="${f.id}">${hk ? `<div class="fs"><div class="fh"><span>webhook</span><b>next free worker</b></div></div>` : ""}${st.join("") || `<div class="fe">${"Drag a worker type here, or hire a ready-made team."}</div>`}</div></section>`;
};

const pal = () => {
  const g = A.grouped(A.types).map(([n, l]) => `<div class="pg">${esc(n)}</div>` + l.map((t) => `<div class="pk" data-ty="${esc(t.id)}" style="--c:${esc(t.col || "#8a8a8a")};color:${ink(t.col)}" title="${esc(t.dsc || "")}">${esc(t.nm)}</div>`).join("")).join("");
  return `<aside class="fp"><div class="pg">${"Triggers"}</div><div class="ph" data-tg="every">${"Every … min"}</div><div class="ph" data-tg="at">${"Every day at …"}</div>${g}</aside>`;
};

PG.flows = async () => {
  const [fx] = await Promise.all([A.api("/api/flows"), A.types ? 0 : A.loadTypes()]);
  if (A.pgK !== "flows" || pg.hidden || dr) return;
  X = {}; for (const r of fx) X[r.id] = r;
  const fl = A.S.fl.filter((f) => OFK.includes(f.k)).sort((a, b) => b.lvl - a.lvl);
  const h = `<div class="hd"><h1>${"Flows"}</h1></div><div class="sub">${"Who passes work to whom, as blocks. Drag a type onto a block to hire and connect, drag a block to move it, drop it on empty space to cut it loose. A trigger on a block runs it on a schedule. Click a block for its settings."}</div>` +
    (fl.length ? `<div class="fw">${pal()}<div class="fc">${fl.map(zone).join("")}</div></div>`
      : `<div class="emp"><p>${"Flows live in offices. Build one on an empty floor first."}</p><button class="p" data-of>${"Build an office"}</button></div>`);
  sn.clear();
  if (pgi._h !== h) { pgi.innerHTML = h; pgi._h = h; }
  clearTimeout(PG.ft); PG.ft = setTimeout(() => { if (A.pgK === "flows" && !pg.hidden) PG.flows(); }, 5000);
};

const save = async (id, cfg, ok) => { await A.api("/api/worker/" + id, ok ? { cfg, ok: true } : { cfg }); };
const done = async (m, id) => { if (m) A.toast(m); if (id) sn.add(id); await A.poll(true); PG.flows(); };
const desc = (a, b) => { const S = A.S, q = [a], v = new Set(); while (q.length) { const x = q.pop(); if (x === b) return true; if (v.has(x)) continue; v.add(x); for (const k of S.w) if ((k.fr || []).some((f) => fid(f) === x)) q.push(k.id); } return false; };

const link = async (w, p, t) => {
  const x = A.wInfo(w), y = A.wInfo(t);
  if (!x || !y || w === t) return;
  if (x.fl !== y.fl) return A.toast("Both workers must be on the same floor. Drop the block on the other floor first.", 1);
  if (desc(w, t)) return A.toast(y.nm + " already gets work from " + x.nm + ".", 1);
  const fr = (x.fr || []).filter((f) => fid(f) !== p && fid(f) !== t).concat([{ w: t }]);
  if (!(await A.confirmBox("Connect", [x.nm + " carries out orders from " + y.nm + ", with its own permissions."]))) return;
  await save(w, { from: fr }, true);
  done(x.nm + " now takes work from " + y.nm, w);
};

const cut = async (w, p, fl) => {
  const x = A.wInfo(w); if (!x) return;
  if (fl !== x.fl) {
    await A.api("/api/worker/" + w, { fl });
    if ((x.fr || []).length) await save(w, { from: [] }, true);
    return done(x.nm + " moves to " + ((A.flo(fl) || {}).nm || "the other floor"), w);
  }
  if (!p) return;
  await save(w, { from: (x.fr || []).filter((f) => fid(f) !== p) }, true);
  done(x.nm + " no longer takes work from " + nm(p), w);
};

const hire = async (ty, fl, t) => {
  const tn = ((A.types.ty.find((x) => x.id === ty) || {}).nm) || ty;
  if (t && !(await A.confirmBox("Hire and connect", ["A new " + tn + " joins this floor.", "It carries out orders from " + nm(t) + ", with its own permissions."], "Hire"))) return;
  const r = await A.api("/api/hire", { ty, fl });
  if (t) await save(r.id, { from: [{ w: t }] }, true);
  done(tn + " hired", r.id);
};

const trig = (k, w) => {
  const b = A.box(`<h3>${"Trigger for"} ${esc(nm(w))}</h3><div class="mt">${k === "at" ? "Runs this task every day at this time." : "Runs this task again and again."}</div>
    <p><input type="text" class="wd" id="gTi" placeholder="${"Task, e.g. Check new issues on github.com/me/app"}"></p>
    <div class="rw"><span>${k === "at" ? "Time" : "Every (min)"}</span><span><input type="text" id="gEv" value="${k === "at" ? "08:00" : "60"}" style="width:80px"></span></div>
    <div class="acts"><button data-y>${"Add trigger"}</button><button class="l" data-x>${"Cancel"}</button></div>`, null, "mid");
  setTimeout(() => $("gTi") && $("gTi").focus(), 30);
  b.onclick = async (e) => {
    if (!e.target.closest("[data-y]")) return;
    const ti = $("gTi").value.trim(), v = $("gEv").value.trim();
    if (!ti) return A.toast("What should happen? Enter the task.", 1);
    if (k === "at" && !/^\d{1,2}:\d{2}$/.test(v)) return A.toast("Time like 08:00", 1);
    const s = k === "at" ? { ti, tx: ti, at: v.padStart(5, "0") } : { ti, tx: ti, every: Math.max(5, +v || 60) };
    try { await save(w, { sched: [...((X[w] || {}).sc || []), s] }); A.close(); done("Trigger added"); } catch (x) { A.fail(x); }
  };
};

const drop = async (s, e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tb = el && el.closest(".fk[data-w]"), za = el && el.closest(".fa[data-fl]");
  const t = tb ? +tb.dataset.w : 0, fl = za ? +za.dataset.fl : 0;
  try {
    if (s.ty) { if (t) return hire(s.ty, A.wInfo(t).fl, t); if (fl) return hire(s.ty, fl, 0); }
    if (s.tg) { if (t) return trig(s.tg, t); return A.toast("Drop the trigger on a worker block.", 1); }
    if (s.w) { if (t) return t !== s.w && link(s.w, s.p, t); if (fl) return cut(s.w, s.p, fl); }
  } catch (x) { A.fail(x); A.poll(true).then(() => PG.flows()); }
};

pgi.addEventListener("pointerdown", (e) => {
  if (A.pgK !== "flows" || e.button) return;
  const el = e.target.closest(".fk[data-w],.pk[data-ty],.ph[data-tg]");
  if (!el || e.target.closest("[data-rs]")) return;
  const D = el.dataset;
  dr = { el, x: e.clientX, y: e.clientY, on: 0, s: { w: D.w ? +D.w : 0, p: D.p ? +D.p : 0, ty: D.ty || "", tg: D.tg || "" } };
  el.setPointerCapture(e.pointerId);
});
pgi.addEventListener("pointermove", (e) => {
  if (!dr) return;
  if (!dr.on && Math.hypot(e.clientX - dr.x, e.clientY - dr.y) < 5) return;
  if (!dr.on) {
    dr.on = 1;
    const g = dr.el.cloneNode(true);
    g.className += " fgh"; g.style.width = dr.el.offsetWidth + "px";
    document.body.appendChild(g); dr.g = g;
    if (dr.s.w) dr.el.classList.add("fdm");
  }
  dr.g.style.left = e.clientX + 6 + "px"; dr.g.style.top = e.clientY + 6 + "px";
  dr.g.hidden = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  dr.g.hidden = false;
  for (const o of pgi.querySelectorAll(".fov")) o.classList.remove("fov");
  const t = el && (el.closest(".fk[data-w]") || el.closest(".fa[data-fl]"));
  if (t) t.classList.add("fov");
});
const end = (e, ok) => {
  if (!dr) return;
  const d = dr; dr = null;
  for (const o of pgi.querySelectorAll(".fov")) o.classList.remove("fov");
  d.el.classList.remove("fdm");
  if (d.g) { d.g.remove(); if (ok) drop(d.s, e); else PG.flows(); return; }
  if (ok && d.s.w) { const x = A.E[d.s.w]; if (x) A.wBox(x); }
  else if (ok && (d.s.ty || d.s.tg)) A.toast("Drag it onto a block or a floor.");
};
pgi.addEventListener("pointerup", (e) => end(e, 1));
pgi.addEventListener("pointercancel", (e) => end(e, 0));

pgi.addEventListener("click", async (e) => {
  if (A.pgK !== "flows") return;
  const rs = e.target.closest("[data-rs]"), tm = e.target.closest("[data-tm]"), gf = e.target.closest("[data-gf]");
  if (e.target.closest("[data-of]")) return A.buildFirst("office");
  if (tm) return A.teamBox(+tm.dataset.tm);
  if (gf) { A.page(null); return A.goFloor(+gf.dataset.gf); }
  if (rs) {
    const [w, i] = rs.dataset.rs.split(":").map(Number), sc = [...((X[w] || {}).sc || [])];
    sc.splice(i, 1);
    try { await save(w, { sched: sc }); done("Trigger removed"); } catch (x) { A.fail(x); }
  }
});
})();
