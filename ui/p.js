(() => {
const A = window.A, L = A.L, $ = A.$, esc = A.esc;

A.goFloor = (id) => { A.cur = id; A.fol = null; A.close(); A.bld && A.setBld(false); const f = A.flo(id); if (f && f.k === "buch") loadUsage(); };
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
  $("tFl").innerHTML = f ? `<b>${A.lvlName(f.lvl)}</b> · ${esc(f.nm)}${A.fol && A.fol.i ? " · " + L("folgt") + " " + esc(A.fol.i.nm) : ""}` : "";
  const sub = S.acc.filter((a) => a.k !== "api");
  const mx = Math.max(0, ...S.acc.map((a) => (a.st && a.st.pct) || 0));
  const usd = S.usd || 0, lim = S.usd_day || 0;
  $("tUs").innerHTML = `<span class="hm">${S.stop ? L("ANGEHALTEN") : sub.length ? L("Abo") : ""}</span><i title="${L("Höchste Auslastung")}"><b style="width:${Math.min(100, mx)}%;background:${mx >= 100 ? "#d9594c" : mx >= 80 ? "#e0675a" : "#62b86f"}"></b></i><span>${usd.toFixed(2)} / ${lim} $</span>`;
  const bell = S.bell.length + S.acc.filter((a) => a.st && a.st.s === "err").length + S.srv.filter((s) => s.st && s.st.on === false).length;
  $("tBn").hidden = !bell; $("tBn").textContent = bell;
  const o = S.owner || {};
  $("tMe").innerHTML = (o.av ? `<img src="${esc(o.av)}" alt="">` : "<i></i>") + `<span>${esc(o.nm || "")}</span>`;
  const q = A.quest;
  $("tQ").hidden = !A.questOn();
  if (A.questOn()) $("tQ").innerHTML = `${L("Start-Quest")} <b>${Math.min(q.s, 5)}/5</b>`;
};

$("tLg").onclick = () => { A.page(null); const l = A.S.fl.find((f) => f.k === "lobby"); if (l) A.goFloor(l.id); };
$("tFl").onclick = (e) => A.page("house");
$("tUs").onclick = (e) => {
  const S = A.S;
  dd(S.acc.map((a) => `<div data-a="acc:${a.id}"><span>${esc(a.nm)}</span><small>${Math.round((a.st && a.st.pct) || 0)} %</small></div>`).join("") + (S.acc.length ? "<hr>" : "") + `<div data-a="usage"><span>${L("Buchhaltung")}</span><small>${(S.usd || 0).toFixed(2)} $ ${L("heute")}</small></div><div data-a="stop"><span>${S.stop ? L("Weiterarbeiten") : L("Alles anhalten")}</span></div>`, $("tUs"), async (a) => {
    if (a === "usage") return A.page("usage");
    if (a === "stop") { await A.api("/api/stop", { on: !S.stop }); return A.poll(); }
    if (a.startsWith("acc:")) { const k = A.S.fl.find((f) => f.k === "keller"); if (k) A.goFloor(k.id); const g = (A.flo(k.id).lay.fu || []).find((u) => u.acc === +a.slice(4)); if (g) setTimeout(() => A.genBox(g), 60); }
  });
};
$("tBell").onclick = () => {
  const S = A.S;
  const it = [
    ...S.acc.filter((a) => a.st && a.st.s === "err").map((a) => `<div data-a="acc:${a.id}"><span>⚡ ${esc(a.nm)}: ${esc((a.st.err || "").slice(0, 60))}</span></div>`),
    ...S.srv.filter((s) => s.st && s.st.on === false).map((s) => `<div data-a="srv:${s.fl}"><span>▣ ${esc(s.nm)} ${L("ist offline")}</span></div>`),
    ...S.bell.map((t) => `<div data-a="tk:${t.id}"><span>${t.st === "rej" ? "⛔" : "✕"} ${esc(t.ti.slice(0, 50))}</span><small>${new Date(t.t1).toLocaleTimeString().slice(0, 5)}</small></div>`),
  ];
  dd(it.join("") || `<div><span class="mt">${L("Alles ruhig.")}</span></div>`, $("tBell"), (a) => {
    if (a.startsWith("tk:")) A.taskView(+a.slice(3));
    if (a.startsWith("srv:")) A.goFloor(+a.slice(4));
    if (a.startsWith("acc:")) { const k = A.S.fl.find((f) => f.k === "keller"); if (k) A.goFloor(k.id); }
  });
};
$("tPlus").onclick = () => {
  dd(`<div data-a="floor"><span>${L("Etage ausbauen")}</span></div><div data-a="acc"><span>${L("Konto anschliessen")}</span><small>${L("Keller")}</small></div><div data-a="type"><span>${L("Worker-Typ bauen")}</span><small>${L("Personalbüro")}</small></div><div data-a="team"><span>${L("Fertiges Team")}</span></div><div data-a="srv"><span>${L("Server hinzufügen")}</span></div><hr><div data-a="task"><span>${L("Auftrag geben")}</span></div>`, $("tPlus"), (a) => {
    A.page(null);
    const S = A.S;
    if (a === "floor") { const r = S.fl.find((f) => f.k === "rohbau"); if (!r) return A.toast(L("Kein Rohbau frei, im Lift ein Stockwerk dazubauen")); A.goFloor(r.id); setTimeout(() => A.rohBox(A.flo(r.id), { sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "acc") { const k = S.fl.find((f) => f.k === "keller"); A.goFloor(k.id); setTimeout(() => A.addAcc({ sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "type") A.page("types", { nu: 1 });
    if (a === "team") A.teamBox((S.fl.find((f) => f.id === A.cur && f.k === "office") || {}).id, { sx: innerWidth / 2, sy: 100 });
    if (a === "srv") { const s = S.fl.find((f) => f.k === "server"); if (!s) return A.toast(L("Erst einen Rohbau zum Serverraum ausbauen"), 1); A.goFloor(s.id); setTimeout(() => A.addSrv(s.id, { sx: innerWidth / 2, sy: 100 }), 50); }
    if (a === "task") {
      const ws = S.w;
      if (!ws.length) return A.toast(L("Noch keine Worker. Erst jemanden einstellen."), 1);
      const b = A.box(`<h3>${L("Auftrag an wen?")}</h3><div class="li">${S.fl.filter((f) => f.k === "office").map((f) => `<div data-o="${f.id}"><span>${esc(f.nm)}</span><span class="mt">${L("ans Büro")}</span></div>` + ws.filter((w) => w.fl === f.id).map((w) => `<div data-w="${w.id}"><span>&nbsp;&nbsp;${esc(w.nm)}</span><span class="mt">${esc(w.tn || "")}</span></div>`).join("")).join("")}</div>`, { sx: innerWidth / 2, sy: 100 });
      b.onclick = (e) => { const o = e.target.closest("[data-o]"), w = e.target.closest("[data-w]"); if (o) A.taskBox({ fl: +o.dataset.o, nm: (A.flo(+o.dataset.o) || {}).nm }, { sx: innerWidth / 2, sy: 100 }); if (w) A.taskBox({ wk: +w.dataset.w, nm: A.wInfo(+w.dataset.w).nm }, { sx: innerWidth / 2, sy: 100 }); };
    }
  });
};
$("tPg").onclick = () => {
  dd(`<div data-a="house"><span>${L("Hausübersicht")}</span></div><div data-a="stats"><span>${L("Kontrollraum")}</span><small>${L("Statistik")}</small></div><div data-a="lab"><span>${L("Labor")}</span><small>${L("Prompts testen")}</small></div><div data-a="types"><span>${L("Personalbüro")}</span><small>${L("Worker-Typen")}</small></div><div data-a="usage"><span>${L("Buchhaltung")}</span></div><hr><div data-a="settings"><span>${L("Einstellungen")}</span></div>`, $("tPg"), (a) => A.page(a));
};
$("tMe").onclick = () => dd(`<div data-a="settings"><span>${L("Einstellungen")}</span></div><div data-a="out"><span>${L("Abmelden")}</span></div>`, $("tMe"), async (a) => { if (a === "out") { await A.api("/api/logout", {}); location.href = "/"; } else A.page(a); });

const pg = $("pg"), pgi = $("pgi");
A.page = async (k, o = {}) => {
  $("dd").hidden = true;
  if (!k) { pg.hidden = true; history.replaceState(null, "", "/"); return; }
  A.close();
  $("dlg").hidden = true;
  pg.hidden = false;
  pgi.innerHTML = `<div class="mt">${L("lädt …")}</div>`;
  try { await PG[k](o); } catch (x) { pgi.innerHTML = `<p class="mt">${esc(x.message)}</p>`; }
};
const head = (t, s) => `<div class="row" style="justify-content:space-between"><h1>${esc(t)}</h1><button data-back>${L("Zurück zum Gebäude")}</button></div>${s ? `<div class="sub">${esc(s)}</div>` : ""}`;
pg.addEventListener("click", (e) => { if (e.target.closest("[data-back]")) A.page(null); });

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e3 ? (n / 1e3).toFixed(1) + " k" : String(n || 0));
const PG = {};

PG.house = () => {
  const S = A.S;
  const rows = [...S.fl].reverse().map((f) => {
    const ws = S.w.filter((w) => w.fl === f.id), run = (S.cnt || []).filter((c) => c.fl === f.id && c.st === "run").reduce((a, b) => a + b.n, 0), wait = (S.cnt || []).filter((c) => c.fl === f.id && c.st === "wait").reduce((a, b) => a + b.n, 0);
    const st = f.k === "keller" ? `${S.acc.length} ${L("Generatoren")}` : f.k === "server" ? `${S.srv.filter((s) => s.fl === f.id).length} ${L("Server")}` : ws.length ? `${ws.length} ${L("Worker")} · ${run} ${L("laufend")} · ${wait} ${L("wartend")}` : "";
    return `<div data-f="${f.id}" class="${f.k === "rohbau" ? "rb" : ""}"><b>${A.lvlName(f.lvl)}</b><span class="k">${L(A.KN[f.k])}</span><span>${esc(f.nm)}</span><span class="s">${st}</span></div>`;
  });
  pgi.innerHTML = head(L("Hausübersicht"), `${S.fl.length} ${L("Stockwerke")}, ${S.w.length} ${L("Worker")}, ${S.acc.length} ${L("Konten")}`) + `<div class="house">${rows.join("")}</div>`;
  pgi.onclick = (e) => { const r = e.target.closest("[data-f]"); if (r) { A.page(null); A.goFloor(+r.dataset.f); } };
};

const WK = { num: L("Zahl"), list: L("Liste"), chart: L("Diagramm"), lamp: L("Lampe"), text: L("Text") };
const HQ = { done_today: L("Heute erledigt"), fail_today: L("Heute fehlgeschlagen"), run: L("Laufende Aufgaben"), wait: L("Wartende Aufgaben"), workers: L("Worker"), usd_today: L("Kosten heute ($)"), tok_today: L("Tokens heute"), servers_on: L("Server online"), accounts_ok: L("Alle Konten laufen"), tasks_per_day: L("Erledigt pro Tag"), usd_per_day: L("Kosten pro Tag"), recent_done: L("Zuletzt erledigt") };
PG.stats = async () => {
  const ws = await A.api("/api/wid");
  const val = (w) => {
    const v = w.val || {};
    if (v.e) return `<div class="mt">${esc(v.e)}</div>`;
    const x = v.v;
    if (x === undefined) return `<div class="mt">${L("wird geladen …")}</div>`;
    if (w.k === "num") return `<div class="v">${esc(typeof x === "object" ? JSON.stringify(x) : x)}</div>`;
    if (w.k === "lamp") { const up = typeof x === "object" && x ? x.up : !!x; return `<div><span class="lp" style="background:${up ? "#62b86f" : "#d9594c"}"></span>${esc(typeof x === "object" && x ? x.txt || (x.code ? "HTTP " + x.code + " · " + x.ms + " ms" : x.why || "") : up ? L("ok") : L("aus"))}</div>`; }
    if (w.k === "list") return `<div class="ls">${(Array.isArray(x) ? x : [x]).slice(0, 8).map((i) => `<div>${esc(typeof i === "object" ? JSON.stringify(i) : i)}</div>`).join("")}</div>`;
    if (w.k === "chart") return `<canvas data-ch='${esc(JSON.stringify(Array.isArray(x) ? x : []))}' width="300" height="80"></canvas>`;
    return `<div>${esc(typeof x === "object" ? JSON.stringify(x) : x)}</div>`;
  };
  pgi.innerHTML = head(L("Kontrollraum"), L("Zahlen aus deinem Gebäude und von aussen. Der Dienst holt externe Daten nur von Adressen, die du hier einträgst.")) + `<div class="grid">${ws.map((w) => `<div class="wg"><div class="h"><span>${esc(w.nm || WK[w.k])}</span><span data-ed="${w.id}">⋯</span></div>${val(w)}</div>`).join("")}<div class="wg add" data-nw>+ ${L("Widget")}</div></div>`;
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
  const b = A.box(`<h3>${w.id ? L("Widget bearbeiten") : L("Neues Widget")}</h3>
    <div class="rw"><span>${L("Titel")}</span><span><input type="text" id="wNm" value="${esc(w.nm || "")}"></span></div>
    <div class="rw"><span>${L("Art")}</span><span><select id="wK">${Object.entries(WK).map(([k, n]) => `<option value="${k}"${(w.k || "num") === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>
    <div class="rw"><span>${L("Quelle")}</span><span><select id="wT">${[["house", L("Gebäude")], ["http", "HTTP-JSON"], ["github", "GitHub"], ["uptime", L("Erreichbarkeit")], ["rss", "RSS"], ["text", L("Text")]].map(([k, n]) => `<option value="${k}"${s.t === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>
    <div id="wF"></div>
    <div class="rw"><span>${L("Abruf alle (s)")}</span><span><input type="number" id="wEv" min="60" value="${s.every || 300}" style="width:80px"></span></div>
    <div class="acts"><button data-sv>${L("Speichern")}</button>${w.id ? `<button class="d" data-del>${L("Löschen")}</button>` : ""}</div>`, null, "mid wide");
  const fields = () => {
    const t = $("wT").value;
    $("wF").innerHTML = t === "house" ? `<div class="rw"><span>${L("Wert")}</span><span><select id="wQ">${Object.entries(HQ).map(([k, n]) => `<option value="${k}"${s.q === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>`
      : t === "http" ? `<div class="rw"><span>URL</span><span><input type="text" id="wU" value="${esc(s.url || "")}" placeholder="https://…"></span></div><div class="rw"><span>${L("Feld")}</span><span><input type="text" id="wP" value="${esc(s.path || "")}" placeholder="data.count"></span></div>`
      : t === "github" ? `<div class="rw"><span>Repo</span><span><input type="text" id="wR" value="${esc(s.repo || "")}" placeholder="owner/name"></span></div><div class="rw"><span>${L("Wert")}</span><span><select id="wG">${[["stars", "Stars"], ["issues", L("Offene Issues")], ["prs", L("Offene PRs")], ["actions", L("Letzter Actions-Lauf")]].map(([k, n]) => `<option value="${k}"${s.f === k ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>`
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
  pgi.innerHTML = head(L("Labor"), L("Prompts ausprobieren, ohne Werkzeuge und ohne Gebäude.")) + `<div class="card"><div class="row"><label>${L("Konto")} <select id="lA">${S.acc.map((a) => `<option value="${a.id}">${esc(a.nm)}</option>`).join("")}</select></label><label>${L("Modell")} <select id="lM"><option value="klein">${L("klein")}</option><option value="mittel" selected>${L("mittel")}</option><option value="gross">${L("gross")}</option></select></label><input id="lMx" placeholder="${L("oder Modell-ID")}"><label>${L("Denkaufwand")} <select id="lE"><option value="niedrig">${L("niedrig")}</option><option value="mittel" selected>${L("mittel")}</option><option value="hoch">${L("hoch")}</option></select></label></div>
    <h2>${L("System-Prompt")}</h2><textarea id="lS" style="min-height:60px" placeholder="${L("optional")}"></textarea>
    <h2>Prompt</h2><textarea id="lP"></textarea>
    <div class="row" style="margin-top:10px"><button class="p" id="lGo">${L("Ausführen")}</button><span class="mt" id="lI"></span></div></div>
    <h2>${L("Antwort")}</h2><pre id="lR" class="mt">–</pre>`;
  if (!S.acc.length) $("lI").textContent = L("Erst im Keller ein Konto anschliessen.");
  $("lGo").onclick = async () => {
    $("lI").textContent = L("läuft …"); $("lR").textContent = "";
    try {
      const r = await A.api("/api/lab", { acc: +$("lA").value, md: $("lMx").value.trim() || $("lM").value, ef: $("lE").value, sys: $("lS").value, p: $("lP").value });
      $("lR").textContent = r.txt; $("lR").className = "";
      $("lI").textContent = `${r.md || L("Standard")} · ${r.tin} ${L("rein")} / ${r.tout} ${L("raus")} · ${(r.ms / 1000).toFixed(1)} s${r.usd ? " · " + r.usd.toFixed(4) + " $" : ""}`;
    } catch (x) { $("lI").textContent = "✕ " + x.message; }
  };
};

PG.types = async (o) => {
  const d = await A.loadTypes();
  const own = (t) => t.own === 1;
  pgi.innerHTML = head(L("Personalbüro"), L("Worker-Typen legen fest, was ein Worker kann und wie er aussieht. Mitgelieferte Typen kannst du anpassen, eigene bauen.")) +
    `<div class="row"><button class="p" data-nt>+ ${L("Neuer Typ")}</button><button data-ntl>+ ${L("Eigenes Werkzeug")}</button></div>
    <h2>${L("Typen")}</h2><div class="tw"><table><tr><th></th><th>${L("Name")}</th><th>${L("Modell")}</th><th>${L("Werkzeuge")}</th><th>${L("Beschreibung")}</th></tr>${d.ty.map((t) => `<tr data-t="${esc(t.id)}" style="cursor:pointer"><td><span style="display:inline-block;width:12px;height:12px;background:${esc(t.col)};border-radius:2px"></span></td><td>${esc(t.nm)}${own(t) ? ` <span class="mt">(${L("eigen")})</span>` : ""}</td><td>${esc(L(t.md || ""))}</td><td class="mt">${esc((t.tools || []).join(", "))}</td><td class="mt">${esc(L(t.dsc || ""))}</td></tr>`).join("")}</table></div>
    <h2>${L("Eigene Werkzeuge")}</h2>${d.tools.length ? `<div class="tw"><table>${d.tools.map((t) => `<tr data-tl="${esc(t.id)}" style="cursor:pointer"><td>${esc(t.id)}</td><td class="mt">${esc(t.dsc)}</td></tr>`).join("")}</table></div>` : `<p class="mt">${L("Noch keine. Eigene Werkzeuge sind kleine JavaScript-Funktionen ohne Netz- und Dateizugriff ausser über ctx.")}</p>`}
    <div id="tEd"></div>`;
  const ed = (t) => {
    const nu = !t;
    t = t || { id: "", nm: "", role: "", tools: ["read", "write", "ls", "grep"], md: "mittel", ef: "mittel", prov: "", acc: "none", col: "#8a6fd1", dsc: "", outf: "", chk: "" };
    $("tEd").innerHTML = `<h2>${nu ? L("Neuer Typ") : esc(t.nm)}</h2><div class="card">
      <div class="row"><label>ID <input id="eId" value="${esc(t.id)}"${nu ? "" : " disabled"}></label><label>${L("Name")} <input id="eNm" value="${esc(t.nm)}"></label><label>${L("Farbe")} <input id="eCol" type="color" value="${esc(t.col)}"></label><label>${L("Kleidung")} <select id="eAcc">${d.accs.map((a) => `<option${a === t.acc ? " selected" : ""}>${a}</option>`).join("")}</select></label></div>
      <div class="row" style="margin-top:8px"><label>${L("Modell")} <select id="eMd">${["klein", "mittel", "gross"].map((m) => `<option value="${m}"${t.md === m ? " selected" : ""}>${L(m)}</option>`).join("")}</select></label><label>${L("Denkaufwand")} <select id="eEf">${["niedrig", "mittel", "hoch"].map((m) => `<option value="${m}"${t.ef === m ? " selected" : ""}>${L(m)}</option>`).join("")}</select></label><label>${L("Anbieter")} <select id="ePv">${[["", L("egal")], ["claude", "Claude"], ["codex", "Codex"], ["gemini", "Gemini"], ["api", "API"]].map(([v, n]) => `<option value="${v}"${(t.prov || "") === v ? " selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <h2>${L("Beschreibung")}</h2><input id="eDs" style="width:100%" value="${esc(t.dsc)}">
      <h2>${L("Rolle (Prompt)")}</h2><textarea id="eRo">${esc(t.role)}</textarea>
      <h2>${L("Gutes Ergebnis")}</h2><input id="eOf" style="width:100%" value="${esc(t.outf || "")}">
      <h2>${L("Werkzeuge")}</h2><div class="row">${d.base.map((b) => `<label title="${esc(b.d)}"><input type="checkbox" data-tool="${b.id}"${(t.tools || []).includes(b.id) ? " checked" : ""}> ${b.id}</label>`).join("")}${d.tools.map((b) => `<label><input type="checkbox" data-tool="x:${esc(b.id)}"${(t.tools || []).includes("x:" + b.id) ? " checked" : ""}> ${esc(b.id)}</label>`).join("")}</div>
      <h2>${L("Prüfung nach jeder Aufgabe")}</h2><input id="eCk" style="width:100%" value="${esc(t.chk || "")}" placeholder="sh:npm test  ${L("oder")}  js:function check(a, ctx) { return { ok: true } }">
      <div class="row" style="margin-top:12px"><button class="p" data-sv>${L("Speichern")}</button>${own(t) ? `<button class="d" data-dl>${L("Löschen")}</button>` : ""}</div></div>`;
    $("tEd").scrollIntoView({ behavior: "smooth" });
    $("tEd").onclick = async (e) => {
      const D = (e.target.closest("button") || {}).dataset || {};
      try {
        if ("dl" in D) { await A.api(`/api/type/${encodeURIComponent(t.id)}/del`, {}); A.types = null; return PG.types(); }
        if (!("sv" in D)) return;
        const tools = [...$("tEd").querySelectorAll("[data-tool]:checked")].map((x) => x.dataset.tool);
        await A.api("/api/type", { id: $("eId").value, nm: $("eNm").value, col: $("eCol").value, acc: $("eAcc").value, md: $("eMd").value, ef: $("eEf").value, prov: $("ePv").value, dsc: $("eDs").value, role: $("eRo").value, outf: $("eOf").value, tools, chk: $("eCk").value.trim() });
        A.toast(L("gespeichert")); A.types = null; PG.types();
      } catch (x) { A.fail(x); }
    };
  };
  const tled = (t) => {
    t = t || { id: "", dsc: "", sch: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, src: "function run(args, ctx) {\n  const r = ctx.fetch(\"https://api.example.com/?q=\" + encodeURIComponent(args.q));\n  return r.text.slice(0, 2000);\n}" };
    $("tEd").innerHTML = `<h2>${L("Eigenes Werkzeug")}</h2><div class="card"><div class="row"><label>ID <input id="xId" value="${esc(t.id)}"></label><label style="flex:1">${L("Beschreibung für das Modell")} <input id="xDs" style="width:100%" value="${esc(t.dsc)}"></label></div>
      <h2>${L("Parameter (JSON-Schema)")}</h2><textarea id="xSc" style="min-height:70px">${esc(JSON.stringify(t.sch, null, 1))}</textarea>
      <h2>${L("Code")}</h2><textarea id="xSr" style="min-height:180px">${esc(t.src)}</textarea>
      <p class="mt">ctx.read(p) · ctx.write(p, t) · ctx.ls(p) · ctx.exists(p) · ctx.grep(re, p) · ctx.sh(cmd) → {c, o} · ctx.fetch(url, {method, body, headers}) → {status, text} · ctx.deliver(name, text) · ctx.log(s). ${L("Alles mit den Rechten des Workers.")}</p>
      <div class="row"><button class="p" data-sv>${L("Speichern")}</button>${t.id ? `<button class="d" data-dl>${L("Löschen")}</button>` : ""}</div></div>`;
    $("tEd").scrollIntoView({ behavior: "smooth" });
    $("tEd").onclick = async (e) => {
      const D = (e.target.closest("button") || {}).dataset || {};
      try {
        if ("dl" in D) { await A.api(`/api/tool/${encodeURIComponent(t.id)}/del`, {}); A.types = null; return PG.types(); }
        if (!("sv" in D)) return;
        let sch; try { sch = JSON.parse($("xSc").value); } catch { return A.toast(L("Schema ist kein gültiges JSON"), 1); }
        await A.api("/api/tool", { id: $("xId").value, dsc: $("xDs").value, sch, src: $("xSr").value });
        A.toast(L("gespeichert")); A.types = null; PG.types();
      } catch (x) { A.fail(x); }
    };
  };
  pgi.onclick = (e) => {
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
  A.usage = u;
  const tb = (rows, k) => `<div class="tw"><table><tr><th>${k}</th><th>Tokens ${L("rein")}</th><th>${L("raus")}</th><th>$</th></tr>${rows.map((r) => `<tr><td>${esc(r.nm || (r.wk === -1 ? L("Labor") : r.wk === 0 ? L("Tests") : "–"))}</td><td>${fmt(r.tin)}</td><td>${fmt(r.tout)}</td><td>${(r.usd || 0).toFixed(2)}</td></tr>`).join("") || `<tr><td class="mt" colspan="4">${L("noch nichts")}</td></tr>`}</table></div>`;
  const mx = Math.max(1, ...u.day.map((d) => d.tok || 0));
  pgi.innerHTML = head(L("Buchhaltung"), `${L("Heute")} ${(u.today || 0).toFixed(2)} $ ${L("von")} ${u.usd_day} $ ${L("Tageslimit über alle API-Keys")}. ${L("Abos kosten pro Aufgabe nichts extra, sie haben Fenster-Limits.")}`) +
    `<div class="row">${[1, 7, 30].map((d) => `<button data-d="${d}" class="${d === days ? "p" : ""}">${d === 1 ? L("Heute") : d + " " + L("Tage")}</button>`).join("")}</div>
    <h2>${L("Verlauf")}</h2><div class="card" style="display:flex;align-items:flex-end;gap:4px;height:120px">${u.day.map((d) => `<div title="${esc(d.day)}: ${fmt(d.tok)} Tokens, ${(d.usd || 0).toFixed(2)} $" style="flex:1;background:#5c7fd6;height:${Math.max(2, Math.round((d.tok || 0) / mx * 100))}%"></div>`).join("") || `<span class="mt">${L("noch nichts")}</span>`}</div>
    <h2>${L("Pro Konto")}</h2>${tb(u.acc, L("Konto"))}<h2>${L("Pro Worker")}</h2>${tb(u.wk, L("Worker"))}<h2>${L("Pro Etage")}</h2>${tb(u.fl, L("Etage"))}`;
  pgi.onclick = (e) => { const b = e.target.closest("[data-d]"); if (b) PG.usage({ d: +b.dataset.d }); };
};

PG.settings = async () => {
  const [s, ses, aud] = await Promise.all([A.api("/api/set"), A.api("/api/ses"), A.api("/api/aud")]);
  const o = A.S.owner || {};
  pgi.innerHTML = head(L("Einstellungen")) + `<div class="card">
    <div class="row"><label>${L("Tageskostenstopp über alle API-Keys ($)")} <input type="number" step="0.5" min="0" id="sUsd" value="${s.usd_day}" style="width:90px"></label>
    <label><input type="checkbox" id="sLo"${s.lounge !== false ? " checked" : ""}> ${L("Worker gehen in der Freizeit in die Lounge")}</label>
    <label>${L("Sprache")} <select id="sLg"><option value="de"${s.lang === "de" ? " selected" : ""}>Deutsch</option><option value="en"${s.lang === "en" ? " selected" : ""}>English</option></select></label></div>
    <div class="row" style="margin-top:10px"><label>${L("Zusätzliche Adressen (Host:Port, mit Komma)")} <input id="sHo" style="width:340px" value="${esc((s.hosts || []).join(", "))}" placeholder="office.example.com:443"></label></div>
    <div class="row" style="margin-top:10px"><button class="p" id="sSv">${L("Speichern")}</button></div></div>
    <h2>${L("Programm")}</h2><div class="card"><div class="row"><span>ApolloOffice ${esc(s.v)}</span><span class="mt">${L("Adresse")} ${esc(s.bind)}:${s.port}</span><span class="mt">${L("Daten")}: ${esc(s.data)}</span></div>
    <div class="row" style="margin-top:10px"><label><input type="checkbox" id="sAu"${s.autostart ? " checked" : ""}> ${L("Beim Anmelden am Rechner starten")}</label><button id="sStop">${A.S.stop ? L("Weiterarbeiten") : L("Alles anhalten")}</button></div></div>
    <h2>${L("Konto")}</h2><div class="card"><div class="row"><span>${L("Besitzer")}: ${o.nm ? esc(o.nm) + " (" + esc(o.p || "") + ")" : L("noch keiner, der nächste Login bindet")}</span><span class="mt">${L("Nur dieses Konto kommt hinein. Neu binden: apollo-office reset-owner im Terminal. Notfall-Login: apollo-office login-link.")}</span></div></div>
    <h2>${L("Sitzungen")}</h2><div class="tw"><table><tr><th>${L("Gerät")}</th><th>IP</th><th>${L("Zuletzt")}</th><th></th></tr>${ses.map((x) => `<tr><td>${esc(x.ua.slice(0, 80))}${x.me ? ` <span class="mt">(${L("dieses")})</span>` : ""}</td><td>${esc(x.ip)}</td><td>${new Date(x.t1).toLocaleString()}</td><td>${x.me ? "" : `<button class="d" data-ses="${esc(x.id)}">${L("Abmelden")}</button>`}</td></tr>`).join("")}</table></div>
    <h2>${L("Sichern")}</h2><div class="card"><div class="row"><a href="/api/export" download><button>${L("Export (ohne Zugangsdaten)")}</button></a><label><button id="sImB">${L("Import …")}</button><input type="file" id="sIm" accept=".json" hidden></label><span class="mt">${L("Täglich automatisches Backup der Datenbank, 7 Stück, im Daten-Ordner unter backup.")}</span></div></div>
    <h2>${L("Protokoll")}</h2><div class="tw"><table>${aud.map((a) => `<tr><td class="mt">${new Date(a.t).toLocaleString()}</td><td>${esc(a.what)}</td><td class="mt">${esc(a.det)}</td></tr>`).join("") || `<tr><td class="mt">${L("leer")}</td></tr>`}</table></div>`;
  $("sSv").onclick = async () => {
    try {
      await A.api("/api/set", { usd_day: +$("sUsd").value, lounge: $("sLo").checked, lang: $("sLg").value, hosts: $("sHo").value.split(",").map((x) => x.trim()).filter(Boolean) });
      A.toast(L("gespeichert"));
      if ($("sLg").value !== (window.LANG || "de")) { try { localStorage.setItem("ao-lang", $("sLg").value); } catch {} location.reload(); }
    } catch (x) { A.fail(x); }
  };
  $("sAu").onchange = async (e) => { try { const r = await A.api("/api/autostart", { on: e.target.checked }); A.toast(r.msg); } catch (x) { A.fail(x); e.target.checked = !e.target.checked; } };
  $("sStop").onclick = async () => { await A.api("/api/stop", { on: !A.S.stop }); await A.poll(); PG.settings(); };
  $("sImB").onclick = () => $("sIm").click();
  $("sIm").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await A.confirmBox(L("Import"), [L("Etagen, Worker, Aufgaben und Einstellungen werden durch die Datei ersetzt. Konten und Server bleiben, Zugangsdaten sind nicht in der Datei.")], L("Ja, ersetzen")))) return;
    try { const r = await A.api("/api/import", await f.text()); A.toast(r.msg); A.poll(true); } catch (x) { A.fail(x); }
  };
  pgi.onclick = async (e) => { const b = e.target.closest("[data-ses]"); if (b) { await A.api(`/api/ses/${b.dataset.ses}/del`, {}); PG.settings(); } };
};

const QS = [
  [L("Willkommen in deinem Gebäude! Ich bin Pia vom Empfang. Leider fehlt noch Strom. Fahr mit dem Lift in den Keller und schliess am Generator einen Anbieter an. Hast du Claude Code? Dann geht es mit einem Klick."), L("Keller → Generator anschliessen")],
  [L("Es läuft! Hörst du den Generator? Jetzt brauchst du ein Büro. Fahr in einen Rohbau-Stock, bau ihn zum Office aus und stell im Bau-Modus einen Schreibtisch dazu."), L("Rohbau → Office → Schreibtisch bauen")],
  [L("Schön eingerichtet. Ein Büro ohne Leute ist aber traurig. Klick auf einen freien Schreibtisch und stell deinen ersten Worker ein."), L("Schreibtisch anklicken → einstellen")],
  [L("Da ist er ja! Klick ihn an, gib ihm unter Einstellungen → Rechte einen Ordner und dann einen ersten Auftrag. Etwas Harmloses, er soll sich erst einleben."), L("Worker anklicken → Auftrag geben")],
  [L("Er arbeitet. Schau ihm ruhig zu. Wenn er fertig ist, legt er das Ergebnis in die Ablage."), L("warten …")],
  [L("Fertig! Klick auf die Ablage (OUT) und lies dein erstes Ergebnis."), L("Ablage anklicken → Ergebnis lesen")],
  [L("Das war's schon. Ab jetzt ist das dein Gebäude. Den Rest findest du selbst heraus. Ich bin unten am Empfang."), ""],
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
  $("dlg").hidden = false; $("dN").textContent = L("PIA · EMPFANG"); $("dSk").textContent = q.s < 6 ? L("Quest überspringen") : "";
  qtx = t; qti = 0; typing = 1; shown = q.s;
  if (/[?&]shot\b/.test(location.search)) { qti = qtx.length; typing = 0; $("dT").textContent = qtx; portrait(); }
  $("dX").textContent = h ? L("Aufgabe") + ": " + h : L("Klicken zum Schliessen");
};
A.piaClick = () => { if (A.questOn()) return qShow(); const b = A.box(`<h3>${L("Empfang")} <small>Pia</small></h3><div class="mt">„${L("Alles läuft. Wenn du Hilfe brauchst: Rohbau ausbauen, Worker einstellen, Auftrag geben. Ich bin hier.")}“</div><div class="acts"><button data-q>${L("Start-Quest nochmal")}</button></div>`, null, "mid"); b.onclick = (e) => { if (e.target.closest("[data-q]")) { A.close(); A.questSet({ s: 0, done: 0, skip: 0, built: 0, read: 0 }); qShow(); } }; };
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
  $("lp").textContent = me.owner ? L("Melde dich mit dem Konto an, dem dieses Gebäude gehört.") : L("Der erste Login macht dich zum Besitzer dieses Gebäudes. Danach kommt nur noch dieses Konto hinein.");
  $("lb").innerHTML = [["github", "GitHub"], ["google", "Google"], ["gitlab", "GitLab"], ["discord", "Discord"]].map(([k, n]) => `<button data-p="${k}">${L("Weiter mit")} ${n}</button>`).join("");
  $("lb").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) location.href = "/auth/go?p=" + b.dataset.p; };
  const er = new URLSearchParams(location.search).get("e");
  if (er) { $("le").hidden = false; $("le").textContent = er; }
  $("lf").textContent = L("Der Login läuft über auth.apollonet.dev. Er erfährt nur, wer sich anmeldet. Alles andere bleibt auf diesem Rechner. Kein Zugang? Im Terminal: apollo-office login-link");
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
  if (A.S && pg.hidden) { A.step(dt); A.draw(); A.replace(); }
  if (typing) { qti += dt * 60; $("dT").textContent = qtx.slice(0, Math.floor(qti)); if (qti >= qtx.length) typing = 0; }
  if (!$("dlg").hidden) portrait();
  requestAnimationFrame(loop);
};

const boot = async () => {
  let me;
  try { me = await A.api("/api/me"); } catch (x) { document.body.textContent = x.message; return; }
  if (me.lang && me.lang !== window.LANG) { try { localStorage.setItem("ao-lang", me.lang); } catch {} location.reload(); return; }
  document.documentElement.lang = window.LANG;
  if (!me.in) return loginScreen(me);
  $("top").hidden = false; $("cv").hidden = false;
  await A.poll();
  setInterval(() => { if (!document.hidden) A.poll(); }, 1000);
  setInterval(() => { const f = A.flo(A.cur); if (f && f.k === "buch" && pg.hidden) loadUsage(); }, 30000);
  const p = new URLSearchParams(location.search);
  if (p.has("page")) A.page(p.get("page"));
  if (p.has("box")) { const f = A.flo(A.cur), u = (f.lay.fu || []).find((x) => x.k === p.get("box")); if (u) A.fuClick(f, u); }
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
