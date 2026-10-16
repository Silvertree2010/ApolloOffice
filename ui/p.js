(() => {
const A = window.A, L = A.L, $ = A.$, esc = A.esc;

A.goFloor = (id) => { A.bld && A.setBld(false); A.cur = id; A.fol = null; A.close(); nav(); const f = A.flo(id); if (f && f.k === "accounting") loadUsage(); };
const loadUsage = async () => { try { A.usage = await A.api("/api/usage?d=7"); } catch {} };

const dd = (html, anchor, onclick) => {
  const d = $("dd");
  d.innerHTML = html; d.hidden = false;
  const r = anchor.getBoundingClientRect();
  d.style.top = r.bottom + 6 + "px";
  d.style.left = Math.max(8, Math.min(innerWidth - d.offsetWidth - 8, r.right - d.offsetWidth)) + "px";
  d.onclick = (e) => { const x = e.target.closest("[data-a]"); if (!x) return; d.hidden = true; onclick(x.dataset.a, x); };
};
addEventListener("pointerdown", (e) => { if (!e.target.closest("#dd") && !e.target.closest(".tb,.us,.me,.fl")) $("dd").hidden = true; });

const top = () => {
  const S = A.S, f = A.flo(A.cur);
  $("tFl").innerHTML = f ? `<b>${A.lvlName(f.lvl)}</b> · ${esc(f.nm)}${A.fol && A.fol.i ? " · " + "follows" + " " + esc(A.fol.i.nm) : ""}` : "";
  const sub = S.acc.filter((a) => a.k !== "api");
  const mx = Math.max(0, ...S.acc.map((a) => (a.st && a.st.pct) || 0));
  const usd = S.usd || 0, lim = S.usd_day || 0;
  $("tUs").innerHTML = `<span class="hm">${S.stop ? "STOPPED" : sub.length ? "Subscription" : ""}</span><i title="${"Peak usage"}"><b style="width:${Math.min(100, mx)}%;background:${mx >= 100 ? "#d9594c" : mx >= 80 ? "#e0675a" : "#62b86f"}"></b></i><span>${usd.toFixed(2)} / ${esc(String(+lim || 0))} $</span>`;
  const bell = S.bell.length + S.acc.filter((a) => a.st && a.st.s === "err").length + S.srv.filter((s) => s.st && s.st.on === false).length;
  $("tBn").hidden = !bell; $("tBn").textContent = bell;
  const o = S.owner || {};
  $("tMe").innerHTML = (o.av ? `<img src="${esc(o.av)}" alt="">` : "<i></i>") + `<span>${esc(o.nm || "")}</span>`;
  const up = S.upd || {};
  $("tUp").hidden = !up.ready;
  if (up.ready) $("tUp").textContent = "Update " + (up.v || "");
  if (S.updated && S.updated.to && !A.updSeen) { A.updSeen = 1; A.toast("Updated to " + S.updated.to); A.api("/api/update", { a: "seen" }).catch(() => {}); }
  const q = A.quest;
  $("tQ").hidden = !A.questOn();
  if (A.questOn()) $("tQ").innerHTML = `${"Starter quest"} <b>${Math.min(q.s, 5)}/5</b>`;
  nav();
};

let nvOn = innerWidth > 720;
try { const v = localStorage.getItem("nav"); if (v && innerWidth > 720) nvOn = v === "1"; } catch {}
const NST = { work: "working", wait: "waiting for an answer", off: "in the lounge", hold: "paused" };
const nav = () => {
  const n = $("nav"), S = A.S;
  if (!S) return;
  n.hidden = !nvOn;
  A.NW = nvOn && innerWidth > 720 ? 220 : 0;
  $("pg").style.left = A.NW + "px";
  if (!nvOn) return;
  const sel = A.sel && A.sel.i ? A.sel.i.id : 0;
  const sh = S.fl.filter((f) => f.k === "shell");
  const fl = [...S.fl].reverse().filter((f) => f.k !== "shell" || f.id === A.cur).map((f) => {
    const ws = S.w.filter((x) => x.fl === f.id);
    return `<div class="f${f.id === A.cur ? " cur" : ""}" data-f="${f.id}"><b>${esc(A.lvlName(f.lvl))}</b><span>${esc(f.nm || L(A.KN[f.k]))}</span><small>${f.k === "shell" ? "+" : ws.length || ""}</small></div>` +
      ws.map((x) => { const st = x.hold ? "hold" : (x.live && x.live.st) || "idle"; return `<div class="w${x.id === sel ? " cur" : ""}" data-w="${x.id}" title="${esc(NST[st] || "waiting for work")}"><i class="${st}"></i><span>${esc(x.nm)}</span><small>${esc(x.tn || x.ty)}</small></div>`; }).join("");
  }).join("");
  n.innerHTML = `<div class="h">${"Building"}</div>${fl}${sh.length ? `<div class="f" data-f="${sh[0].id}"><b>+</b><span>${sh.length} ${"empty floors"}</span></div>` : ""}<div class="h">${"Pages"}</div>` +
    [["house", "Building overview"], ["stats", "Control room"], ["lab", "Lab"], ["types", "HR office"], ["usage", "Accounting"], ["settings", "Settings"]].map(([k, t]) => `<div class="a" data-p="${k}">${t}</div>`).join("");
};
A.nav = nav;
$("nav").onclick = (e) => {
  const f = e.target.closest("[data-f]"), w = e.target.closest("[data-w]"), p = e.target.closest("[data-p]");
  if (innerWidth <= 720 && (f || w || p)) { nvOn = false; nav(); }
  if (p) return A.page(p.dataset.p);
  A.page(null);
  if (f) A.goFloor(+f.dataset.f);
  if (w) { const e2 = A.E[+w.dataset.w]; if (e2) { A.goFloor(e2.fl); A.wBox(e2); } }
};
$("tNav").onclick = () => { nvOn = !nvOn; try { if (innerWidth > 720) localStorage.setItem("nav", nvOn ? "1" : "0"); } catch {} nav(); };
addEventListener("resize", () => nav());

$("tUp").onclick = async () => {
  const run = (A.S.cnt || []).filter((c) => c.st === "run").reduce((a, b) => a + b.n, 0);
  if (!(await A.confirmBox("Install update", ["ApolloOffice installs version " + ((A.S.upd || {}).v || "") + " and restarts. This takes a few seconds.", run ? run + " running task(s) stop and start again after the restart." : "No task is running right now."], "Install now"))) return;
  try { await A.api("/api/update", { a: "now", ok: true }); A.toast("Restarting …"); setTimeout(() => location.reload(), 8000); } catch (x) { A.fail(x); }
};
$("tLg").onclick = () => { A.page(null); const l = A.S.fl.find((f) => f.k === "lobby"); if (l) A.goFloor(l.id); };
$("tFl").onclick = (e) => A.page("house");
$("tUs").onclick = (e) => {
  const S = A.S;
  dd(S.acc.map((a) => `<div data-a="acc:${a.id}"><span>${esc(a.nm)}</span><small>${Math.round((a.st && a.st.pct) || 0)} %</small></div>`).join("") + (S.acc.length ? "<hr>" : "") + `<div data-a="usage"><span>${"Accounting"}</span><small>${(S.usd || 0).toFixed(2)} $ ${"today"}</small></div><div data-a="stop"><span>${S.stop ? "Keep working" : "Pause everything"}</span></div>`, $("tUs"), async (a) => {
    if (a === "usage") return A.page("usage");
    if (a === "stop") { await A.api("/api/stop", { on: !S.stop }); return A.poll(); }
    if (a.startsWith("acc:")) { const k = A.S.fl.find((f) => f.k === "basement"); if (k) A.goFloor(k.id); const g = (A.flo(k.id).lay.fu || []).find((u) => u.acc === +a.slice(4)); if (g) setTimeout(() => A.genBox(g), 60); }
  });
};
$("tBell").onclick = () => {
  const S = A.S;
  const it = [
    ...S.acc.filter((a) => a.st && a.st.s === "err").map((a) => `<div data-a="acc:${a.id}"><span>⚡ ${esc(a.nm)}: ${esc((a.st.err || "").slice(0, 60))}</span></div>`),
    ...S.srv.filter((s) => s.st && s.st.on === false).map((s) => `<div data-a="srv:${s.fl}"><span>▣ ${esc(s.nm)} ${"is offline"}</span></div>`),
    ...S.bell.map((t) => `<div data-a="tk:${t.id}"><span>${t.st === "rej" ? "⛔" : "✕"} ${esc(t.ti.slice(0, 50))}</span><small>${new Date(t.t1).toLocaleTimeString().slice(0, 5)}</small></div>`),
  ];
  dd(it.join("") || `<div><span class="mt">${"All quiet."}</span></div>`, $("tBell"), (a) => {
    if (a.startsWith("tk:")) A.taskView(+a.slice(3));
    if (a.startsWith("srv:")) A.goFloor(+a.slice(4));
    if (a.startsWith("acc:")) { const k = A.S.fl.find((f) => f.k === "basement"); if (k) A.goFloor(k.id); }
  });
};
$("tPlus").onclick = () => {
  dd(`<div data-a="floor"><span>${"Build out floor"}</span></div><div data-a="acc"><span>${"Connect account"}</span><small>${"Basement"}</small></div><div data-a="type"><span>${"Build worker type"}</span><small>${"HR office"}</small></div><div data-a="team"><span>${"Ready-made team"}</span></div><div data-a="srv"><span>${"Add server"}</span></div><hr><div data-a="task"><span>${"Give task"}</span></div>`, $("tPlus"), (a) => {
    A.page(null);
    const S = A.S;
    if (a === "floor") { const r = S.fl.find((f) => f.k === "shell"); if (!r) return A.toast("No shell floor free, build another floor in the elevator"); A.goFloor(r.id); setTimeout(() => A.shellBox(A.flo(r.id), { sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "acc") { const k = S.fl.find((f) => f.k === "basement"); A.goFloor(k.id); setTimeout(() => A.addAcc({ sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "type") A.page("types", { nu: 1 });
    if (a === "team") A.teamBox((S.fl.find((f) => f.id === A.cur && f.k === "office") || {}).id, { sx: innerWidth / 2, sy: 100 });
    if (a === "srv") { const s = S.fl.find((f) => f.k === "server"); if (!s) return A.toast("First build out a shell floor into a server room", 1); A.goFloor(s.id); setTimeout(() => A.addSrv(s.id, { sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "task") {
      const ws = S.w;
      if (!ws.length) return A.toast("No workers yet. Hire someone first.", 1);
      const b = A.box(`<h3>${"Task for whom?"}</h3><div class="li">${S.fl.filter((f) => f.k === "office").map((f) => `<div data-o="${f.id}"><span>${esc(f.nm)}</span><span class="mt">${"to the office"}</span></div>` + ws.filter((w) => w.fl === f.id).map((w) => `<div data-w="${w.id}"><span>&nbsp;&nbsp;${esc(w.nm)}</span><span class="mt">${esc(w.tn || "")}</span></div>`).join("")).join("")}</div>`, { sx: innerWidth / 2, sy: 100 });
      b.onclick = (e) => { const o = e.target.closest("[data-o]"), w = e.target.closest("[data-w]"); if (o) A.taskBox({ fl: +o.dataset.o, nm: (A.flo(+o.dataset.o) || {}).nm }, { sx: innerWidth / 2, sy: 100 }); if (w) A.taskBox({ wk: +w.dataset.w, nm: A.wInfo(+w.dataset.w).nm }, { sx: innerWidth / 2, sy: 100 }); };
    }
  });
};
$("tPg").onclick = () => {
  dd(`<div data-a="house"><span>${"Building overview"}</span></div><div data-a="stats"><span>${"Control room"}</span><small>${"Statistics"}</small></div><div data-a="lab"><span>${"Lab"}</span><small>${"Test prompts"}</small></div><div data-a="types"><span>${"HR office"}</span><small>${"Worker types"}</small></div><div data-a="usage"><span>${"Accounting"}</span></div><hr><div data-a="settings"><span>${"Settings"}</span></div>`, $("tPg"), (a) => A.page(a));
};
$("tMe").onclick = () => dd(`<div data-a="settings"><span>${"Settings"}</span></div><div data-a="out"><span>${"Log out"}</span></div>`, $("tMe"), async (a) => { if (a === "out") { await A.api("/api/logout", {}); location.href = "/"; } else A.page(a); });

const pg = $("pg"), pgi = $("pgi");
A.page = async (k, o = {}) => {
  $("dd").hidden = true;
  if (!k) { pg.hidden = true; history.replaceState(null, "", "/"); return; }
  A.close();
  $("dlg").hidden = true;
  pg.hidden = false;
  pgi.innerHTML = `<div class="mt">${"loading …"}</div>`;
  A.pgK = k;
  try { await PG[k](o); } catch (x) { pgi.innerHTML = `<p class="mt">${esc(x.message)}</p>`; }
};
const head = (t, s) => `<div class="row" style="justify-content:space-between"><h1>${esc(t)}</h1><button data-back>${"Back to the building"}</button></div>${s ? `<div class="sub">${esc(s)}</div>` : ""}`;
pg.addEventListener("click", (e) => { if (e.target.closest("[data-back]")) A.page(null); });

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e3 ? (n / 1e3).toFixed(1) + " k" : String(n || 0));
const PG = {};

PG.house = () => {
  const S = A.S;
  const rows = [...S.fl].reverse().map((f) => {
    const ws = S.w.filter((w) => w.fl === f.id), run = (S.cnt || []).filter((c) => c.fl === f.id && c.st === "run").reduce((a, b) => a + b.n, 0), wait = (S.cnt || []).filter((c) => c.fl === f.id && c.st === "wait").reduce((a, b) => a + b.n, 0);
    const st = f.k === "basement" ? `${S.acc.length} ${"generators"}` : f.k === "server" ? `${S.srv.filter((s) => s.fl === f.id).length} ${"servers"}` : ws.length ? `${ws.length} ${"workers"} · ${run} ${"running"} · ${wait} ${"waiting"}` : "";
    return `<div data-f="${f.id}" class="${f.k === "shell" ? "rb" : ""}"><b>${A.lvlName(f.lvl)}</b><span class="k">${L(A.KN[f.k])}</span><span>${esc(f.nm)}</span><span class="s">${st}</span></div>`;
  });
  pgi.innerHTML = head("Building overview", `${S.fl.length} ${"floors"}, ${S.w.length} ${"workers"}, ${S.acc.length} ${"accounts"}`) + `<div class="house">${rows.join("")}</div>`;
  pgi.onclick = (e) => { const r = e.target.closest("[data-f]"); if (r) { A.page(null); A.goFloor(+r.dataset.f); } };
};

const WK = { num: "Number", list: "List", chart: "Chart", lamp: "Lamp", text: "Text" };
const HQ = { done_today: "Done today", fail_today: "Failed today", run: "Running tasks", wait: "Waiting tasks", workers: "Workers", usd_today: "Cost today ($)", tok_today: "Tokens today", servers_on: "Server online", accounts_ok: "All accounts running", tasks_per_day: "Done per day", usd_per_day: "Cost per day", recent_done: "Last done" };
PG.stats = async () => {
  const ws = await A.api("/api/wid");
  if (A.pgK !== "stats" || pg.hidden) return;
  const val = (w) => {
    const v = w.val || {};
    if (v.e) return `<div class="mt">${esc(v.e)}</div>`;
    const x = v.v;
    if (x === undefined) return `<div class="mt">${"loading …"}</div>`;
    if (w.k === "num") return `<div class="v">${esc(typeof x === "object" ? JSON.stringify(x) : x)}</div>`;
    if (w.k === "lamp") { const up = typeof x === "object" && x ? x.up : !!x; return `<div><span class="lp" style="background:${up ? "#62b86f" : "#d9594c"}"></span>${esc(typeof x === "object" && x ? x.txt || (x.code ? "HTTP " + x.code + " · " + x.ms + " ms" : x.why || "") : up ? "ok" : "off")}</div>`; }
    if (w.k === "list") return `<div class="ls">${(Array.isArray(x) ? x : [x]).slice(0, 8).map((i) => `<div>${esc(typeof i === "object" ? JSON.stringify(i) : i)}</div>`).join("")}</div>`;
    if (w.k === "chart") return `<canvas data-ch='${esc(JSON.stringify(Array.isArray(x) ? x : []))}' width="300" height="80"></canvas>`;
    return `<div>${esc(typeof x === "object" ? JSON.stringify(x) : x)}</div>`;
  };
  pgi.innerHTML = head("Control room", "Numbers from your building and from outside. The service only fetches external data from addresses you enter here.") + `<div class="grid">${ws.map((w) => `<div class="wg"><div class="h"><span>${esc(w.nm || WK[w.k])}</span><span data-ed="${w.id}">⋯</span></div>${val(w)}</div>`).join("")}<div class="wg add" data-nw>+ ${"Widget"}</div></div>`;
  pgi.querySelectorAll("canvas[data-ch]").forEach((c) => {
    const d = JSON.parse(c.dataset.ch), g = c.getContext("2d"), mx = Math.max(1, ...d.map((r) => +r.n || 0));
    const bw = c.width / Math.max(1, d.length);
    d.forEach((r, i) => { const h = Math.round((+r.n || 0) / mx * (c.height - 4)); g.fillStyle = i === d.length - 1 ? "#62b86f" : "#5c7fd6"; g.fillRect(i * bw + 1, c.height - h, Math.max(1, bw - 2), h); });
  });
  pgi.onclick = (e) => {
    if (e.target.closest("[data-nw]")) return wEd({});
    const ed = e.target.closest("[data-ed]"); if (ed) wEd(ws.find((w) => w.id === +ed.dataset.ed));
  };
  clearTimeout(PG.st); PG.st = setTimeout(() => { if (!pg.hidden && pgi.querySelector(".grid")) PG.stats(); }, 15000);
};
const wEd = (w) => {
  const s = w.src || { t: "house", q: "done_today" };
  const b = A.box(`<h3>${w.id ? "Edit widget" : "New widget"}</h3>
    <div class="rw"><span>${"Title"}</span><span><input type="text" id="wNm" value="${esc(w.nm || "")}"></span></div>
    <div class="rw"><span>${"Type"}</span><span><select id="wK">${Object.entries(WK).map(([k, n]) => `<option value="${k}"${(w.k || "num") === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>
    <div class="rw"><span>${"Source"}</span><span><select id="wT">${[["house", "Building"], ["http", "HTTP-JSON"], ["github", "GitHub"], ["uptime", "Reachability"], ["rss", "RSS"], ["text", "Text"]].map(([k, n]) => `<option value="${k}"${s.t === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>
    <div id="wF"></div>
    <div class="rw"><span>${"Poll every (s)"}</span><span><input type="number" id="wEv" min="60" value="${s.every || 300}" style="width:80px"></span></div>
    <div class="acts"><button data-sv>${"Save"}</button>${w.id ? `<button class="d" data-del>${"Delete"}</button>` : ""}</div>`, null, "mid wide");
  const fields = () => {
    const t = $("wT").value;
    $("wF").innerHTML = t === "house" ? `<div class="rw"><span>${"Value"}</span><span><select id="wQ">${Object.entries(HQ).map(([k, n]) => `<option value="${k}"${s.q === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>`
      : t === "http" ? `<div class="rw"><span>URL</span><span><input type="text" id="wU" value="${esc(s.url || "")}" placeholder="https://…"></span></div><div class="rw"><span>${"Field"}</span><span><input type="text" id="wP" value="${esc(s.path || "")}" placeholder="data.count"></span></div>`
      : t === "github" ? `<div class="rw"><span>Repo</span><span><input type="text" id="wR" value="${esc(s.repo || "")}" placeholder="owner/name"></span></div><div class="rw"><span>${"Value"}</span><span><select id="wG">${[["stars", "Stars"], ["issues", "Open issues"], ["prs", "Open PRs"], ["actions", "Last Actions run"]].map(([k, n]) => `<option value="${k}"${s.f === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>`
      : t === "text" ? `<textarea id="wX">${esc(s.text || "")}</textarea>`
      : `<div class="rw"><span>URL</span><span><input type="text" id="wU" value="${esc(s.url || "")}" placeholder="https://…"></span></div>`;
  };
  fields();
  b.onchange = (e) => { if (e.target.id === "wT") fields(); };
  b.onclick = async (e) => {
    const D = (e.target.closest("button") || {}).dataset || {};
    try {
      if ("del" in D) { await A.api(`/api/wid/${w.id}/del`, {}); A.close(); return PG.stats(); }
      if (!("sv" in D)) return;
      const t = $("wT").value, src = { t, every: +$("wEv").value || 300 };
      if (t === "house") src.q = $("wQ").value;
      if (t === "http") { src.url = $("wU").value.trim(); src.path = $("wP").value.trim(); }
      if (t === "github") { src.repo = $("wR").value.trim(); src.f = $("wG").value; }
      if (t === "uptime" || t === "rss") src.url = $("wU").value.trim();
      if (t === "text") src.text = $("wX").value;
      const k = $("wK").value;
      const r = await A.api(w.id ? "/api/wid/" + w.id : "/api/wid", { k, nm: $("wNm").value, src, x: 0, y: 0, w: 1, h: 1 });
      await A.api(`/api/wid/${w.id || r.id}/now`, {});
      A.close(); setTimeout(PG.stats, 600);
    } catch (x) { A.fail(x); }
  };
};

PG.lab = async () => {
  const S = A.S;
  pgi.innerHTML = head("Lab", "Try out prompts, without tools and without a building.") + `<div class="card"><div class="row"><label>${"Account"} <select id="lA">${S.acc.map((a) => `<option value="${a.id}">${esc(a.nm)}</option>`).join("")}</select></label><label>${"Model"} <select id="lM"><option value="small">${"small"}</option><option value="medium" selected>${"medium"}</option><option value="large">${"large"}</option></select></label><input id="lMx" placeholder="${"or model ID"}"><label>${"Thinking effort"} <select id="lE"><option value="low">${"low"}</option><option value="medium" selected>${"medium"}</option><option value="high">${"high"}</option></select></label></div>
    <h2>${"System prompt"}</h2><textarea id="lS" style="min-height:60px" placeholder="${"optional"}"></textarea>
    <h2>Prompt</h2><textarea id="lP"></textarea>
    <div class="row" style="margin-top:10px"><button class="p" id="lGo">${"Run"}</button><span class="mt" id="lI"></span></div></div>
    <h2>${"Answer"}</h2><pre id="lR" class="mt">–</pre>`;
  if (!S.acc.length) $("lI").textContent = "First connect an account in the basement.";
  $("lGo").onclick = async () => {
    $("lI").textContent = "running …"; $("lR").textContent = "";
    try {
      const r = await A.api("/api/lab", { acc: +$("lA").value, md: $("lMx").value.trim() || $("lM").value, ef: $("lE").value, sys: $("lS").value, p: $("lP").value });
      $("lR").textContent = r.txt; $("lR").className = "";
      $("lI").textContent = `${r.md || "Default"} · ${r.tin} ${"in"} / ${r.tout} ${"out"} · ${(r.ms / 1000).toFixed(1)} s${r.usd ? " · " + r.usd.toFixed(4) + " $" : ""}`;
    } catch (x) { $("lI").textContent = "✕ " + x.message; }
  };
};

PG.types = async (o) => {
  const d = await A.loadTypes();
  if (A.pgK !== "types") return;
  const own = (t) => t.own === 1;
  pgi.innerHTML = head("HR office", "Worker types define what a worker can do and how he looks. You can adjust bundled types or build your own.") +
    `<div class="row"><button class="p" data-nt>+ ${"New type"}</button><button data-ntl>+ ${"Custom tool"}</button></div>
    ${(d.props || []).length ? `<h2>${"Proposals from the coach"}</h2>${d.props.map((p) => `<div class="card"><b>${esc(p.type)}</b> <span class="mt">${"from"} ${esc(p.by)}</span><p>${esc(p.why)}</p>${p.role ? `<details><summary>${"New role"}</summary><pre style="white-space:pre-wrap">${esc(p.role)}</pre></details>` : ""}${p.dsc ? `<div class="mt">${"Description"}: ${esc(p.dsc)}</div>` : ""}${p.outf ? `<div class="mt">${"Result"}: ${esc(p.outf)}</div>` : ""}<div class="row" style="margin-top:6px"><button class="p" data-pa="${+p.id}">${"Apply"}</button><button data-pd="${+p.id}">${"Dismiss"}</button></div></div>`).join("")}` : ""}
    <h2>${"Types"}</h2><div class="tw"><table><tr><th></th><th>${"Name"}</th><th>${"Model"}</th><th>${"Tools"}</th><th>${"Description"}</th></tr>${A.grouped(d).map(([g, l]) => `<tr><th colspan="5" class="gh">${esc(g)}</th></tr>` + l.map((t) => `<tr data-t="${esc(t.id)}" style="cursor:pointer"><td><span style="display:inline-block;width:12px;height:12px;background:${esc(t.col)};border-radius:2px"></span></td><td>${esc(t.nm)}${own(t) ? ` <span class="mt">(${"own"})</span>` : ""}</td><td>${esc(L(t.md || ""))}</td><td class="mt">${esc((t.tools || []).join(", "))}</td><td class="mt">${esc(L(t.dsc || ""))}</td></tr>`).join("")).join("")}</table></div>
    <h2>${"Custom tools"}</h2>${d.tools.length ? `<div class="tw"><table>${d.tools.map((t) => `<tr data-tl="${esc(t.id)}" style="cursor:pointer"><td>${esc(t.id)}</td><td class="mt">${esc(t.dsc)}</td></tr>`).join("")}</table></div>` : `<p class="mt">${"None yet. Custom tools are small JavaScript functions without network or file access except through ctx."}</p>`}
    <div id="tEd"></div>`;
  const ed = (t) => {
    const nu = !t;
    t = t || { id: "", nm: "", role: "", tools: ["read", "write", "ls", "grep"], md: "medium", ef: "medium", prov: "", acc: "none", col: "#8a6fd1", dsc: "", outf: "", chk: "" };
    $("tEd").innerHTML = `<h2>${nu ? "New type" : esc(t.nm)}</h2><div class="card">
      <div class="row"><label>ID <input id="eId" value="${esc(t.id)}"${nu ? "" : " disabled"}></label><label>${"Name"} <input id="eNm" value="${esc(t.nm)}"></label><label>${"Color"} <input id="eCol" type="color" value="${esc(t.col)}"></label><label>${"Clothing"} <select id="eAcc">${d.accs.map((a) => `<option${a === t.acc ? " selected" : ""}>${a}</option>`).join("")}</select></label></div>
      <div class="row" style="margin-top:8px"><label>${"Model"} <select id="eMd">${["small", "medium", "large"].map((m) => `<option value="${m}"${t.md === m ? " selected" : ""}>${L(m)}</option>`).join("")}</select></label><label>${"Thinking effort"} <select id="eEf">${["low", "medium", "high"].map((m) => `<option value="${m}"${t.ef === m ? " selected" : ""}>${L(m)}</option>`).join("")}</select></label><label>${"Provider"} <select id="ePv">${[["", "any"], ["claude", "Claude"], ["codex", "Codex"], ["api", "API"]].map(([v, n]) => `<option value="${v}"${(t.prov || "") === v ? " selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <h2>${"Description"}</h2><input id="eDs" style="width:100%" value="${esc(t.dsc)}">
      <h2>${"Role (prompt)"}</h2><textarea id="eRo">${esc(t.role)}</textarea>
      <h2>${"Good result"}</h2><input id="eOf" style="width:100%" value="${esc(t.outf || "")}">
      <h2>${"Tools"}</h2><div class="row">${d.base.map((b) => `<label title="${esc(b.d)}"><input type="checkbox" data-tool="${b.id}"${(t.tools || []).includes(b.id) ? " checked" : ""}> ${b.id}</label>`).join("")}${d.tools.map((b) => `<label><input type="checkbox" data-tool="x:${esc(b.id)}"${(t.tools || []).includes("x:" + b.id) ? " checked" : ""}> ${esc(b.id)}</label>`).join("")}</div>
      <h2>${"Check after every task"}</h2><input id="eCk" style="width:100%" value="${esc(t.chk || "")}" placeholder="sh:npm test  ${"or"}  js:function check(a, ctx) { return { ok: true } }">
      <div class="row" style="margin-top:12px"><button class="p" data-sv>${"Save"}</button>${own(t) ? `<button class="d" data-dl>${"Delete"}</button>` : ""}</div></div>`;
    $("tEd").scrollIntoView({ behavior: "smooth" });
    $("tEd").onclick = async (e) => {
      const D = (e.target.closest("button") || {}).dataset || {};
      try {
        if ("dl" in D) { await A.api(`/api/type/${encodeURIComponent(t.id)}/del`, {}); A.types = null; return PG.types(); }
        if (!("sv" in D)) return;
        const tools = [...$("tEd").querySelectorAll("[data-tool]:checked")].map((x) => x.dataset.tool);
        await A.api("/api/type", { id: $("eId").value, nm: $("eNm").value, col: $("eCol").value, acc: $("eAcc").value, md: $("eMd").value, ef: $("eEf").value, prov: $("ePv").value, dsc: $("eDs").value, role: $("eRo").value, outf: $("eOf").value, tools, chk: $("eCk").value.trim() });
        A.toast("saved"); A.types = null; PG.types();
      } catch (x) { A.fail(x); }
    };
  };
  const tled = (t) => {
    t = t || { id: "", dsc: "", sch: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, src: "function run(args, ctx) {\n  const r = ctx.fetch(\"https://api.example.com/?q=\" + encodeURIComponent(args.q));\n  return r.text.slice(0, 2000);\n}" };
    $("tEd").innerHTML = `<h2>${"Custom tool"}</h2><div class="card"><div class="row"><label>ID <input id="xId" value="${esc(t.id)}"></label><label style="flex:1">${"Description for the model"} <input id="xDs" style="width:100%" value="${esc(t.dsc)}"></label></div>
      <h2>${"Parameters (JSON schema)"}</h2><textarea id="xSc" style="min-height:70px">${esc(JSON.stringify(t.sch, null, 1))}</textarea>
      <h2>${"Code"}</h2><textarea id="xSr" style="min-height:180px">${esc(t.src)}</textarea>
      <p class="mt">ctx.read(p) · ctx.write(p, t) · ctx.ls(p) · ctx.exists(p) · ctx.grep(re, p) · ctx.sh(cmd) → {c, o} · ctx.fetch(url, {method, body, headers}) → {status, text} · ctx.deliver(name, text) · ctx.log(s). ${"Everything with the worker's permissions."}</p>
      <div class="row"><button class="p" data-sv>${"Save"}</button>${t.id ? `<button class="d" data-dl>${"Delete"}</button>` : ""}</div></div>`;
    $("tEd").scrollIntoView({ behavior: "smooth" });
    $("tEd").onclick = async (e) => {
      const D = (e.target.closest("button") || {}).dataset || {};
      try {
        if ("dl" in D) { await A.api(`/api/tool/${encodeURIComponent(t.id)}/del`, {}); A.types = null; return PG.types(); }
        if (!("sv" in D)) return;
        let sch; try { sch = JSON.parse($("xSc").value); } catch { return A.toast("Schema is not valid JSON", 1); }
        await A.api("/api/tool", { id: $("xId").value, dsc: $("xDs").value, sch, src: $("xSr").value });
        A.toast("saved"); A.types = null; PG.types();
      } catch (x) { A.fail(x); }
    };
  };
  pgi.onclick = async (e) => {
    const pp = e.target.closest("[data-pa],[data-pd]");
    if (pp) { try { await A.api("/api/type/prop", { id: +(pp.dataset.pa || pp.dataset.pd), a: pp.dataset.pa ? "apply" : "drop" }); A.toast(pp.dataset.pa ? "applied" : "dismissed"); } catch (x) { A.fail(x); } A.types = null; return PG.types(); }
    if (e.target.closest("[data-nt]")) return ed(null);
    if (e.target.closest("[data-ntl]")) return tled(null);
    const r = e.target.closest("[data-t]"); if (r) return ed(d.ty.find((t) => t.id === r.dataset.t));
    const l = e.target.closest("[data-tl]"); if (l) return tled(d.tools.find((t) => t.id === l.dataset.tl));
  };
  if (o.nu) ed(null);
};

PG.usage = async (o = {}) => {
  const days = o.d || 7;
  const u = await A.api("/api/usage?d=" + days);
  if (A.pgK !== "usage") return;
  A.usage = u;
  const tb = (rows, k) => `<div class="tw"><table><tr><th>${k}</th><th>Tokens ${"in"}</th><th>${"out"}</th><th>$</th></tr>${rows.map((r) => `<tr><td>${esc(r.nm || (r.wk === -1 ? "Lab" : r.wk === 0 ? "Tests" : "–"))}</td><td>${fmt(r.tin)}</td><td>${fmt(r.tout)}</td><td>${(r.usd || 0).toFixed(2)}</td></tr>`).join("") || `<tr><td class="mt" colspan="4">${"nothing yet"}</td></tr>`}</table></div>`;
  const mx = Math.max(1, ...u.day.map((d) => d.tok || 0));
  pgi.innerHTML = head("Accounting", `Today ${(u.today || 0).toFixed(2)} $ of the ${u.usd_day} $ daily limit across all API keys. ${"Subscriptions cost nothing extra per task, but they have window limits."}`) +
    `<div class="row">${[1, 7, 30].map((d) => `<button data-d="${d}" class="${d === days ? "p" : ""}">${d === 1 ? "Today" : d + " days"}</button>`).join("")}</div>
    <h2>${"History"}</h2><div class="card" style="display:flex;align-items:flex-end;gap:4px;height:120px">${u.day.map((d) => `<div title="${esc(d.day)}: ${fmt(d.tok)} Tokens, ${(d.usd || 0).toFixed(2)} $" style="flex:1;background:#5c7fd6;height:${Math.max(2, Math.round((d.tok || 0) / mx * 100))}%"></div>`).join("") || `<span class="mt">${"nothing yet"}</span>`}</div>
    <h2>${"Per account"}</h2>${tb(u.acc, "Account")}<h2>${"Per worker"}</h2>${tb(u.wk, "Worker")}<h2>${"Per floor"}</h2>${tb(u.fl, "Floor")}`;
  pgi.onclick = (e) => { const b = e.target.closest("[data-d]"); if (b) PG.usage({ d: +b.dataset.d }); };
};

PG.settings = async () => {
  const [s, ses, aud, nf] = await Promise.all([A.api("/api/set"), A.api("/api/ses"), A.api("/api/aud"), A.api("/api/ch")]);
  if (A.pgK !== "settings") return;
  const o = A.S.owner || {};
  pgi.innerHTML = head("Settings") + `<div class="card">
    <div class="row"><label>${"Daily cost cap across all API keys ($)"} <input type="number" step="0.5" min="0" id="sUsd" value="${+s.usd_day || 0}" style="width:90px"></label>
    <label><input type="checkbox" id="sLo"${s.lounge !== false ? " checked" : ""}> ${"Workers go to the lounge in their free time"}</label></div>
    <div class="row" style="margin-top:10px"><label>${"Additional addresses (host or host:port, comma-separated)"} <input id="sHo" style="width:340px" value="${esc((s.hosts || []).join(", "))}" placeholder="office.example.com"></label></div>
    <div class="row" style="margin-top:10px"><button class="p" id="sSv">${"Save"}</button></div></div>
    <h2>${"Program"}</h2><div class="card"><div class="row"><span>ApolloOffice ${esc(s.v)}</span><span class="mt">${"Address"} ${esc(s.bind)}:${s.port}</span><span class="mt">${"Data"}: ${esc(s.data)}</span></div>
    <div class="row" style="margin-top:10px"><label><input type="checkbox" id="sAu"${s.autostart ? " checked" : ""}> ${"Start when logging in to the computer"}</label><button id="sStop">${A.S.stop ? "Keep working" : "Pause everything"}</button></div></div>
    <h2>${"Updates"}</h2><div class="card"><div class="row"><label><input type="checkbox" id="sUp"${s.updates !== "off" ? " checked" : ""}> ${"Install updates automatically"}</label><span class="mt">${s.upd && s.upd.t ? "Last check " + new Date(s.upd.t).toLocaleString() + (s.upd.latest ? ", latest " + esc(s.upd.latest) : "") : "Not checked yet"}${s.upd && s.upd.err ? " · " + esc(s.upd.err) : ""}</span><button id="sUc">${"Check now"}</button>${s.upd_ready ? `<button class="p" id="sUi">${"Install"} ${esc((s.upd || {}).ready || "")}</button>` : ""}</div><p class="mt">${"Updates are checked every 6 hours on GitHub, verified with a signature and installed when no task is running. ApolloOffice then restarts by itself."}</p></div>
    <h2>${"Notifications"}</h2><div class="card" id="sNf">${NF.html(nf)}</div>
    <h2>${"Account"}</h2><div class="card"><div class="row"><span>${"Owner"}: ${o.nm ? esc(o.nm) + " (" + esc(o.p || "") + ")" : "nobody yet, the next login binds"}</span><span class="mt">${"Only this account gets in. To rebind: apollo-office reset-owner in the terminal. Emergency login: apollo-office login-link."}</span></div></div>
    <h2>${"Sessions"}</h2><div class="tw"><table><tr><th>${"Device"}</th><th>IP</th><th>${"Last"}</th><th></th></tr>${ses.map((x) => `<tr><td>${esc(x.ua.slice(0, 80))}${x.me ? ` <span class="mt">(${"this"})</span>` : ""}</td><td>${esc(x.ip)}</td><td>${new Date(x.t1).toLocaleString()}</td><td>${x.me ? "" : `<button class="d" data-ses="${esc(x.id)}">${"Log out"}</button>`}</td></tr>`).join("")}</table></div>
    <h2>${"Save"}</h2><div class="card"><div class="row"><a href="/api/export" download><button>${"Export (without credentials)"}</button></a><label><button id="sImB">${"Import …"}</button><input type="file" id="sIm" accept=".json" hidden></label><span class="mt">${"Automatic daily backup of the database, 7 copies, in the data folder under backup."}</span></div></div>
    <h2>${"Log"}</h2><div class="tw"><table>${aud.map((a) => `<tr><td class="mt">${new Date(a.t).toLocaleString()}</td><td>${esc(a.what)}</td><td class="mt">${esc(a.det)}</td></tr>`).join("") || `<tr><td class="mt">${"empty"}</td></tr>`}</table></div>`;
  $("sSv").onclick = async () => {
    try {
      await A.api("/api/set", { usd_day: +$("sUsd").value, lounge: $("sLo").checked, hosts: $("sHo").value.split(",").map((x) => x.trim()).filter(Boolean) });
      A.toast("saved");
    } catch (x) { A.fail(x); }
  };
  $("sUp").onchange = async (e) => { try { await A.api("/api/set", { updates: e.target.checked ? "auto" : "off" }); A.toast(e.target.checked ? "Automatic updates on" : "Automatic updates off"); } catch (x) { A.fail(x); } };
  $("sUc").onclick = async () => { $("sUc").textContent = "checking …"; try { const r = await A.api("/api/update", { a: "check" }); A.toast(r.new ? "Update " + r.latest + " downloaded" : "Up to date (" + r.latest + ")"); } catch (x) { A.fail(x); } PG.settings(); };
  if ($("sUi")) $("sUi").onclick = () => $("tUp").click();
  $("sAu").onchange = async (e) => { try { const r = await A.api("/api/autostart", { on: e.target.checked }); A.toast(r.msg); } catch (x) { A.fail(x); e.target.checked = !e.target.checked; } };
  $("sStop").onclick = async () => { await A.api("/api/stop", { on: !A.S.stop }); await A.poll(); PG.settings(); };
  $("sImB").onclick = () => $("sIm").click();
  $("sIm").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await A.confirmBox("Import", ["Floors, workers, tasks and settings will be replaced by the file. Accounts and servers stay, credentials are not in the file."], "Yes, replace"))) return;
    try { const r = await A.api("/api/import", await f.text()); A.toast(r.msg); A.poll(true); } catch (x) { A.fail(x); }
  };
  NF.bind(nf);
  pgi.onclick = async (e) => { const b = e.target.closest("[data-ses]"); if (b) { await A.api(`/api/ses/${b.dataset.ses}/del`, {}); PG.settings(); } };
};

const NK = { discord: "Discord", ntfy: "ntfy", telegram: "Telegram", email: "E-mail (SMTP)", webhook: "Webhook", desktop: "Desktop" };
const NF = {
  ed: null,
  fields(k, c, has) {
    const i = (id, lb, v, ph, ty = "text", w = 260) => `<label>${lb} <input type="${ty}" id="${id}" value="${esc(v ?? "")}" placeholder="${esc(ph || "")}" style="width:${w}px" autocomplete="off"></label>`;
    const sec = (lb, ph) => i("nSec", lb, "", has ? "unchanged (" + has + ")" : ph, "password");
    if (k === "discord") return sec("Webhook address", "https://discord.com/api/webhooks/…");
    if (k === "ntfy") return i("nUrl", "Server", c.url, "https://ntfy.sh") + i("nTop", "Topic", c.topic, "my-office-alerts", "text", 180) + sec("Access token (optional)", "tk_…");
    if (k === "telegram") return sec("Bot token", "123456:ABC…") + i("nChat", "Chat id", c.chat, "123456789 or @channel", "text", 180);
    if (k === "email") return i("nHost", "SMTP server", c.host, "smtp.example.com", "text", 200) + `<label>${"Encryption"} <select id="nTls"><option value="starttls"${c.tls !== "tls" ? " selected" : ""}>STARTTLS</option><option value="tls"${c.tls === "tls" ? " selected" : ""}>TLS</option></select></label>` + i("nPort", "Port", c.port, "587", "number", 80) + i("nUser", "User", c.user, "", "text", 160) + sec("Password", "") + i("nFrom", "From", c.from, "office@example.com", "text", 220) + i("nTo", "To", c.to, "you@example.com", "text", 220);
    if (k === "webhook") return sec("Address (POST JSON {title, text})", "https://example.com/hook");
    return `<span class="mt">${"Shows a notification on this computer."}</span>`;
  },
  form(c) {
    const k = c.k || "ntfy", has = c.id ? c.sec : "";
    return `<div class="card" style="margin-top:10px"><div class="row">${c.id ? `<b>${esc(NK[k])}</b>` : `<label>${"Kind"} <select id="nK">${Object.entries(NK).map(([v, n]) => `<option value="${v}"${v === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>`}<label>${"Name"} <input id="nNm" value="${esc(c.nm || "")}" placeholder="${"e.g. phone"}" style="width:160px"></label><label><input type="checkbox" id="nOn"${c.on !== 0 ? " checked" : ""}> ${"on"}</label></div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">${NF.fields(k, c.cfg || {}, has)}</div>
      <div class="row" style="margin-top:10px"><button class="p" id="nSv">${"Save"}</button><button class="l" id="nX">${"Cancel"}</button></div></div>`;
  },
  html(nf) {
    const ch = nf.ch;
    const tb = ch.length ? `<div class="tw"><table><tr><th>${"Channel"}</th><th>${"Kind"}</th><th></th></tr>${ch.map((c) => `<tr><td>${esc(c.nm)}${c.on === 0 ? ` <span class="mt">(${"off"})</span>` : ""}</td><td class="mt">${esc(NK[c.k] || c.k)}${c.cfg && c.cfg.topic ? " · " + esc(c.cfg.topic) : ""}${c.cfg && c.cfg.to ? " · " + esc(c.cfg.to) : ""}</td><td><button data-nt="${c.id}">${"Test"}</button><button class="l" data-ne="${c.id}">${"Edit"}</button><button class="d" data-nd="${c.id}">${"Remove"}</button></td></tr>`).join("")}</table></div>` : `<p class="mt">${"No channels yet. Add one to get notifications on your phone, by mail or on the desktop."}</p>`;
    const mx = ch.length ? `<h3 style="margin-top:14px">${"When"}</h3><div class="tw"><table><tr><th></th>${ch.map((c) => `<th>${esc(c.nm)}</th>`).join("")}</tr>${nf.evs.map((e) => `<tr><td>${esc(e.nm)}</td>${ch.map((c) => `<td><input type="checkbox" data-ev="${e.k}" data-ec="${c.id}"${(nf.ev[e.k] || []).includes(c.id) ? " checked" : ""}></td>`).join("")}</tr>`).join("")}</table></div><p class="mt">${"Workers with the notify tool (the Notifier has it) can also send over these channels. Text from outside can end up in a notification."}</p>` : "";
    return tb + `<div class="row" style="margin-top:10px"><button id="nAdd">${"Add channel"}</button></div><div id="nFm">${NF.ed ? NF.form(NF.ed) : ""}</div>` + mx;
  },
  bind(nf) {
    const box = $("sNf");
    const re = async () => { const n = await A.api("/api/ch"); box.innerHTML = NF.html(n); NF.bind(n); };
    const v = (id) => ($(id) ? $(id).value.trim() : "");
    box.onchange = async (e) => {
      const t = e.target;
      if (t.id === "nK") { NF.ed = { k: t.value, nm: v("nNm") }; $("nFm").innerHTML = NF.form(NF.ed); return; }
      if (t.dataset.ev) {
        const r = {}; box.querySelectorAll("[data-ev]").forEach((x) => { (r[x.dataset.ev] ||= []); if (x.checked) r[x.dataset.ev].push(+x.dataset.ec); });
        try { await A.api("/api/ntf", r); A.toast("saved"); } catch (x) { A.fail(x); }
      }
    };
    box.onclick = async (e) => {
      const t = e.target, D = t.dataset;
      if (t.id === "nAdd") { NF.ed = { k: "ntfy" }; $("nFm").innerHTML = NF.form(NF.ed); return; }
      if (t.id === "nX") { NF.ed = null; $("nFm").innerHTML = ""; return; }
      if (D.ne) { NF.ed = nf.ch.find((c) => c.id === +D.ne); $("nFm").innerHTML = NF.form(NF.ed); return; }
      if (D.nd) {
        const c = nf.ch.find((x) => x.id === +D.nd);
        if (!(await A.confirmBox("Remove channel", [c.nm + " will no longer get notifications."], "Remove"))) return;
        try { await A.api(`/api/ch/${D.nd}/del`, {}); re(); } catch (x) { A.fail(x); }
        return;
      }
      if (D.nt) { t.textContent = "sending …"; try { await A.api(`/api/ch/${D.nt}/test`, {}); A.toast("Test sent"); } catch (x) { A.fail(x); } t.textContent = "Test"; return; }
      if (t.id === "nSv") {
        const ed = NF.ed, k = ed.id ? ed.k : v("nK");
        const cfg = { url: v("nUrl"), topic: v("nTop"), chat: v("nChat"), host: v("nHost"), tls: v("nTls"), port: +v("nPort") || undefined, user: v("nUser"), from: v("nFrom"), to: v("nTo") };
        try {
          await A.api("/api/ch/" + (ed.id || 0), { k, nm: v("nNm"), on: $("nOn").checked, cfg, sec: v("nSec") });
          NF.ed = null; A.toast("saved"); re();
        } catch (x) { A.fail(x); }
      }
    };
  },
};

const QS = [
  ["Welcome to your building! I'm Pia from reception. Unfortunately there's no power yet. Take the elevator to the basement and connect a provider to the generator. Do you have Claude Code? Then it's just one click.", "Basement → connect generator"],
  ["It's running! Can you hear the generator? Now you need an office. Take the elevator to a shell floor, build it out into an office and add a desk in build mode.", "Shell floor → office → build desk"],
  ["Nicely furnished. But an office without people is sad. Click a free desk and hire your first worker.", "Click a desk → configure"],
  ["There he is! Click him, give him a folder under Settings → Permissions and then a first task. Something harmless, let him settle in first.", "Click a worker → give task"],
  ["He is working. Feel free to watch. When he is done, he puts the result in the outbox.", "waiting …"],
  ["Done! Click the outbox (OUT) and read your first result.", "Click the outbox → read the result"],
  ["That's it. From now on this is your building. You'll figure out the rest yourself. I'll be down at reception.", ""],
];
A.quest = { s: 0 };
A.questOn = () => A.quest && !A.quest.done && !A.quest.skip;
A.questSet = async (p) => { Object.assign(A.quest, p); try { await A.api("/api/quest", A.quest); } catch {} };
let typing = 0, qtx = "", qti = 0, shown = -1;
const pc = $("pc").getContext("2d");
const fig = document.createElement("canvas"); fig.width = K.W; fig.height = K.H;
const portrait = () => { const p = K.pose(); p.mouth = Math.floor(A.tm * 6) % 2 && typing ? "open" : "smile"; const g = fig.getContext("2d"); g.clearRect(0, 0, K.W, K.H); const { r } = K.figure(g, p, A.tm, A.sk("#4f9fc4")); K.px(g, r.cx - 2, r.top - 4, "#2a5f7d", 5, 4); K.px(g, r.left + 1, r.top + 5, "#e8e6df", r.bw - 2, 1); pc.clearRect(0, 0, 22, 22); pc.drawImage(fig, 13, 18, 22, 22, 0, 0, 22, 22); };
const qShow = () => {
  const q = A.quest; if (!q) return;
  const [t, h] = QS[Math.min(q.s, 6)];
  $("dlg").hidden = false; $("dN").textContent = "PIA · RECEPTION"; $("dSk").textContent = q.s < 6 ? "Skip quest" : "";
  qtx = t; qti = 0; typing = 1; shown = q.s;
  if (/[?&]shot\b/.test(location.search)) { qti = qtx.length; typing = 0; $("dT").textContent = qtx; portrait(); }
  $("dX").textContent = h ? "Task" + ": " + h : "Click to close";
};
A.piaClick = () => { if (A.questOn()) return qShow(); const b = A.box(`<h3>${"Reception"} <small>Pia</small></h3><div class="mt">"${"All good. If you need help: build out a shell floor, hire a worker, give a task. I'm here."}"</div><div class="acts"><button data-q>${"Starter quest again"}</button></div>`, null, "mid"); b.onclick = (e) => { if (e.target.closest("[data-q]")) { A.close(); A.questSet({ s: 0, done: 0, skip: 0, built: 0, read: 0 }); qShow(); } }; };
$("dlg").onclick = (e) => {
  if (e.target.id === "dSk") { A.questSet({ skip: 1 }); $("dlg").hidden = true; return; }
  if (typing) { qti = qtx.length; return; }
  if (A.quest.s >= 6) { A.questSet({ done: 1 }); }
  $("dlg").hidden = true;
};
$("tQ").onclick = qShow;
const qTick = () => {
  if (!A.questOn() || !A.S) return;
  const S = A.S, q = A.quest;
  let s = q.s;
  if (s === 0 && S.acc.length) s = 1;
  if (s === 1 && S.fl.some((f) => f.k === "office") && q.built) s = 2;
  if (s === 1 && S.w.length) s = 2;
  if (s === 2 && S.w.length) s = 3;
  if (s === 3 && (S.cnt || []).length + (S.done || []).length > 0) s = 4;
  if (s === 4 && (S.done || []).length) s = 5;
  if (s === 5 && q.read) s = 6;
  if (s !== q.s) { A.questSet({ s }); qShow(); }
  else if (shown !== q.s && A.S.fl.length) qShow();
};

const loginScreen = (me) => {
  $("login").hidden = false;
  const c = $("lcv").getContext("2d");
  c.fillStyle = "#14161a"; c.fillRect(0, 0, 160, 120);
  const n = 9;
  for (let i = 0; i < n; i++) { const y = 108 - i * 11; c.fillStyle = i % 2 ? "#2a2d33" : "#262a30"; c.fillRect(46, y - 10, 68, 11); for (let j = 0; j < 5; j++) { c.fillStyle = (i * 5 + j) % 3 ? "#35546d" : "#1c2430"; c.fillRect(50 + j * 13, y - 7, 8, 5); } }
  c.fillStyle = "#3a3e45"; c.fillRect(42, 108, 76, 4); c.fillStyle = "#1b1a18"; c.fillRect(74, 12, 12, 7); c.fillRect(71, 18, 18, 2);
  $("lp").textContent = me.owner ? "Log in with the account that owns this building." : "The first login makes you the owner of this building. After that, only this account can get in.";
  $("lb").innerHTML = [["github", "GitHub"], ["google", "Google"], ["gitlab", "GitLab"], ["discord", "Discord"]].map(([k, n]) => `<button data-p="${k}">${"Continue with"} ${n}</button>`).join("");
  $("lb").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) location.href = "/auth/go?p=" + b.dataset.p; };
  const er = new URLSearchParams(location.search).get("e");
  const known = ["Login cancelled", "Link invalid or expired", "token belongs to another installation", "token was issued for another address", "token expired, please log in again", "login unknown or already used", "the login was started in another browser", "token without account", "This installation belongs to another account.", "broken token", "broken signature", "invalid signature"];
  if (er) { $("le").hidden = false; $("le").textContent = known.includes(er) ? er : "Login failed."; }
  $("lf").textContent = "Login goes through auth.apollonet.dev. It only learns who is logging in. Everything else stays on this computer. No access? In the terminal: apollo-office login-link";
};

let polling = false, lastLv = {};
A.poll = async (force) => {
  if (polling && !force) return;
  polling = true;
  try {
    const S = await A.api("/api/state");
    const first = !A.S;
    A.S = S;
    const need = S.fl.filter((f) => force || !A.F[f.id] || lastLv[f.id] !== f.lv);
    await Promise.all(need.map(async (f) => { const d = await A.api("/api/floor/" + f.id); A.F[f.id] = { ...d.f, lay: d.f.lay }; lastLv[f.id] = f.lv; }));
    for (const f of S.fl) if (A.F[f.id]) Object.assign(A.F[f.id], { nm: f.nm, k: f.k, lvl: f.lvl });
    for (const k of Object.keys(A.F)) if (!S.fl.some((f) => f.id === +k)) delete A.F[k];
    if (S.quest && typeof S.quest === "object" && S.quest !== null) A.quest = Object.assign({ s: 0 }, S.quest);
    if (first) {
      const p = new URLSearchParams(location.search);
      const lob = S.fl.find((f) => f.k === "lobby");
      A.cur = p.has("floor") ? (S.fl.find((f) => f.lvl === +p.get("floor")) || lob).id : lob ? lob.id : S.fl[0].id;
    }
    if (!A.flo(A.cur)) A.cur = S.fl[0].id;
    A.sync(first);
    top();
    qTick();
  } catch (x) {
    if (!A.S) throw x;
  } finally { polling = false; }
};

let last = performance.now();
const loop = (n) => {
  const dt = Math.min(.1, (n - last) / 1000); last = n;
  if (A.S && pg.hidden) { A.step(dt); A.draw(); }
  if (typing) { qti += dt * 60; $("dT").textContent = qtx.slice(0, Math.floor(qti)); if (qti >= qtx.length) typing = 0; }
  if (!$("dlg").hidden) portrait();
  requestAnimationFrame(loop);
};

const boot = async () => {
  let me;
  try { me = await A.api("/api/me"); } catch (x) { document.body.textContent = x.message; return; }
  if (!me.in) return loginScreen(me);
  $("top").hidden = false; $("cv").hidden = false;
  await A.poll();
  setInterval(() => { if (!document.hidden) A.poll(); }, 1000);
  setInterval(() => { const f = A.flo(A.cur); if (f && f.k === "accounting" && pg.hidden) loadUsage(); }, 30000);
  const p = new URLSearchParams(location.search);
  if (p.has("page")) A.page(p.get("page"));
  if (p.has("box")) { const [bk, bi] = p.get("box").split(":"), f = A.flo(A.cur), u = (f.lay.fu || []).find((x) => x.k === bk && (!bi || x.id === +bi)); if (u) A.fuClick(f, u); }
  if (p.has("set")) { const e = Object.values(A.E).find((x) => x.i && x.i.nm === p.get("set")); if (e) { A.permOpen = p.has("perm"); A.wSet(e.i.id, e); } }
  if (p.has("add")) A.addAcc({ sx: 700, sy: 100 });
  if (p.has("build")) A.setBld(true);
  if (p.has("pick")) { const e = Object.values(A.E).find((x) => x.i && x.i.nm === p.get("pick")); if (e) { A.cur = e.fl; A.draw(); A.wBox(e); } }
  if (p.has("lift")) { A.draw(); A.liftBox((A.flo(A.cur).lay.fu || []).find((u) => u.k === "lift")); }
  for (let i = 0; i < +(p.get("warm") || 0) * 10; i++) A.step(.1);
  A.draw();
  requestAnimationFrame(loop);
};
boot();
})();
