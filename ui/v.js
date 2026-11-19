(() => {
  const A = window.AO, { get, post, esc, $ } = A;
  const P = () => $("pgB");
  const ago = (t) => { if (!t) return "–"; const d = (Date.now() - (typeof t === "number" ? t : Date.parse(t))) / 1000; return d < 60 ? "now" : d < 3600 ? Math.floor(d / 60) + " min ago" : d < 86400 ? Math.floor(d / 3600) + " h ago" : Math.floor(d / 86400) + " d ago"; };
  const usd = (v) => (A.usd ? A.usd(v) : "$" + (v || 0).toFixed(2));
  const TLN = { shell: "Run commands", files: "Read and change files", github: "GitHub (read, comment, label)", web: "Web" };
  const STN = { vet: "Checking", ready: "Ready", hunt: "Hunting", repro: "Reproducing", fix: "Fixing", ci: "Testing", review: "Reviewing", gate: "Final check", approve: "Waiting for you", submit: "Submitting", done: "Done", drop: "Dropped", park: "Parked" };
  const v2 = (m, p, b) => (m === "GET" ? get("/api/v2" + p) : fetch("/api/v2" + p, { method: m, headers: { "content-type": "application/json", "x-ao": "1" }, body: JSON.stringify(b || {}) }).then((r) => r.json()));
  const head = (t, d, act = "") => act || d ? `<div class="ph2"><div>${d ? `<p>${d}</p>` : ""}</div><div class="pa2">${act}</div></div>` : "";
  const empty = (t, d) => `<div class="emp"><b>${t}</b>${d ? `<span>${d}</span>` : ""}</div>`;

  A.team = async () => {
    const [F, C, SE] = await Promise.all([get("/api/flows"), get("/api/cfg"), get("/api/secrets")]);
    if (A.route() !== "team") return;
    let open = null, cat = false, q = "", sec = SE.secrets || [], sedit = null, snew = false;
    const sop = async (b) => { const r = await post(b, "/api/secrets"); if (r.error) { alert(r.error); return false; } sec = r.secrets; return true; };
    const BID = { scout: "Finds issues worth fixing", guard: "Blocks hidden instructions", vet: "Checks the issue is a single clear bug", watcher: "Keeps open pull requests up to date", hunter: "Hunts for bugs in the code", repro: "Writes a failing test", fixer: "Fixes the bug", reviewer: "Reviews the fix" };
    const save = async () => { const r = await post({ crew: F.crew, rev: F.rev }, "/api/flows"); if (r.error === "conflict") alert("The team was changed in another tab or by the API. The newest version is loaded now, your last change was not saved."); F.crew = r.crew; F.rev = r.rev; draw(); };
    const uniq = (n) => { let x = n, k = 2; while (F.crew.some((w) => w.n === x)) x = `${n} ${k++}`; return x; };
    const hire = (r) => { const n = uniq(r.n); let b = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "w", i = 1; while (F.crew.some((w) => w.id === `${b}-${i}`)) i++; F.crew.push({ id: `${b}-${i}`, n, r: r.n === n ? r.n : r.n, md: r.md || "", p: r.p || "", tl: r.tl || [] }); open = `${b}-${i}`; cat = false; save(); };
    const draw = () => {
      const md = C.set?.md || {};
      const rs = (F.roles || []).filter((r) => !q || (r.n + " " + r.d).toLowerCase().includes(q.toLowerCase()));
      const groups = [["check", "Checks"], ["code", "Code"], ["text", "Writing"], ["data", "Data and research"], ["ops", "Operations"], ["lead", "Planning"]];
      P().innerHTML = head("Team", `${F.crew.filter((w) => w.core).length} in the bug-fix team · ${F.crew.filter((w) => !w.core).length} hired · ${sec.length} ${sec.length === 1 ? "secret" : "secrets"}`, `<button type="button" class="go" id="tHire">${cat ? "Close catalog" : "Hire someone"}</button>`)
        + (cat ? `<section class="sec2"><div class="frow2"><input type="text" id="tQ" placeholder="Search roles" value="${esc(q)}" autocomplete="off"></div>${groups.map(([g, gn]) => { const xs = rs.filter((r) => r.g === g); return xs.length ? `<h3>${gn}</h3><div class="grd">${xs.map((r) => `<button type="button" class="rcard" data-r="${esc(r.t)}"><b>${esc(r.n)}</b><span>${esc(r.d)}</span></button>`).join("")}</div>` : ""; }).join("")}<h3>Something else</h3><form class="rcard frm" id="tCu"><input type="text" name="n" placeholder="Name" maxlength="40" required><textarea name="p" rows="3" placeholder="What is their job?" maxlength="8000"></textarea><button class="go">Hire</button></form></section>` : "")
        + `<section class="sec2"><h3>Your team <span class="mut">${F.crew.length}</span></h3><p class="mut sdesc">Everyone here works in pipelines: the bug-fix team in the Bug-fix team pipeline, people you hire in your own. Each takes a desk with a chair in the office.</p>${F.crew.length ? `<div class="lst">${F.crew.map((w) => w.core ? `<div class="li2 bi"><div class="lh2"><span class="av">${esc(w.n.slice(0, 1))}</span><div class="lt"><b>${esc(w.n)}</b><span>${esc(BID[w.id] || w.d || "")} · Bug-fix team${w.id === "submit" ? "" : " · " + esc(A.mdn ? A.mdn(md[w.id] || "") : md[w.id] || "default model")}</span></div>${w.id === "submit" ? "" : `<button type="button" class="sm2" data-role="${esc(w.id)}" title="Pick the AI model and provider this worker uses">Change model</button>`}</div></div>` : `<div class="li2 ${open === w.id ? "on" : ""}" data-w="${esc(w.id)}"><div class="lh2" data-tog><span class="av">${esc((w.n || "?").slice(0, 1).toUpperCase())}</span><div class="lt"><b>${esc(w.n)}</b><span>${esc([w.r && w.r !== w.n ? w.r : "", w.md ? (A.mdn ? A.mdn(w.md) : w.md) : "default model", (w.tl || []).map((t) => TLN[t] || t).join(", ")].filter(Boolean).join(" · "))}</span></div><span class="chev"></span></div>
          ${open === w.id ? `<form class="le" data-f="${esc(w.id)}"><div class="g2"><label>Name<input type="text" name="n" value="${esc(w.n)}" maxlength="40"></label><label>Role<input type="text" name="r" value="${esc(w.r || "")}" maxlength="40"></label><label>Model<input type="text" name="md" value="${esc(w.md || "")}" placeholder="default model" maxlength="120"></label><div class="tlg"><span>Allowed to</span>${(F.tl || []).map((t) => `<label class="ck"><input type="checkbox" name="tl" value="${t}" ${(w.tl || []).includes(t) ? "checked" : ""}> ${TLN[t] || t}</label>`).join("")}</div></div><label>Instructions<textarea name="p" rows="8" maxlength="8000">${esc(w.p || "")}</textarea></label><div class="acts"><button class="go">Save</button><span class="sp"></span><button type="button" class="dng" data-fire>Remove from team</button></div></form>` : ""}</div>`).join("")}</div>` : empty("Nobody hired yet", "")}</section>`
        + `<section class="sec2"><h3>Secrets <span class="mut">${sec.length}</span><button type="button" class="sm2" id="sNew">${snew ? "Cancel" : "Add secret"}</button></h3>
          ${snew ? `<form class="rcard frm sform" id="sF"><div class="g2"><label>Name<input type="text" name="n" placeholder="e.g. SLACK_TOKEN" maxlength="40" required></label><label>Value<input type="password" name="v" autocomplete="new-password" required></label></div><label>What is it for<input type="text" name="d" maxlength="200" placeholder="optional"></label><div class="whos">${F.crew.filter((w) => !w.core).map((w) => `<label class="ck"><input type="checkbox" name="who" value="${esc(w.id)}"> ${esc(w.n)}</label>`).join("") || `<span class="mut">Hire someone first to give them access.</span>`}</div><div class="acts"><button class="go">Save secret</button></div></form>` : ""}
          ${sec.length ? `<div class="lst">${sec.map((x) => `<div class="li2 srow" data-s="${esc(x.n)}"><div class="lh2"><span class="av">${x.has ? "•" : "!"}</span><div class="lt"><b class="mono">${esc(x.n)}</b><span>${esc(x.d || "")}${x.d ? " · " : ""}${(x.who || []).length ? "used by " + (x.who || []).map((id) => esc((F.crew.find((w) => w.id === id) || {}).n || id)).join(", ") : "nobody may use it yet"}</span></div><button type="button" class="sm2" data-se="${esc(x.n)}">${sedit === x.n ? "Close" : "Edit"}</button></div>
            ${sedit === x.n ? `<form class="le sedit" data-sf="${esc(x.n)}"><label>New value<input type="password" name="v" autocomplete="new-password" placeholder="leave empty to keep the current value"></label><label>What is it for<input type="text" name="d" value="${esc(x.d || "")}" maxlength="200"></label><div class="whos">${F.crew.filter((w) => !w.core).map((w) => `<label class="ck"><input type="checkbox" name="who" value="${esc(w.id)}" ${(x.who || []).includes(w.id) ? "checked" : ""}> ${esc(w.n)}</label>`).join("")}</div><div class="acts"><button class="go">Save</button><span class="sp"></span><button type="button" class="dng" data-sd="${esc(x.n)}">Delete</button></div></form>` : ""}</div>`).join("")}</div>` : snew ? "" : empty("No secrets yet", "")}</section>`;
      $("tHire").onclick = () => { cat = !cat; draw(); if (cat) $("tQ").focus(); };
      const tq = $("tQ"); if (tq) tq.oninput = () => { q = tq.value; draw(); const i = $("tQ"); i.focus(); i.setSelectionRange(q.length, q.length); };
      for (const b of P().querySelectorAll("[data-r]")) b.onclick = () => hire(F.roles.find((r) => r.t === b.dataset.r));
      const cu = $("tCu"); if (cu) cu.onsubmit = (e) => { e.preventDefault(); if (cu.n.value.trim()) hire({ n: cu.n.value.trim(), p: cu.p.value.trim(), tl: [] }); };
      for (const t of P().querySelectorAll("[data-tog]")) t.onclick = () => { const id = t.closest("[data-w]").dataset.w; open = open === id ? null : id; draw(); };
      for (const f of P().querySelectorAll("form[data-f]")) {
        const w = F.crew.find((x) => x.id === f.dataset.f);
        f.onsubmit = (e) => { e.preventDefault(); Object.assign(w, { n: f.n.value.trim() || w.n, r: f.r.value.trim(), md: f.md.value.trim(), p: f.p.value, tl: [...f.querySelectorAll("[name=tl]:checked")].map((x) => x.value) }); save(); };
        f.querySelector("[data-fire]").onclick = async () => { const uses = (F.flows || []).reduce((s, x) => s + x.nodes.filter((m) => m.c?.w === w.id).length, 0); if (!(await A.danger({ title: `Remove ${w.n} from the team?`, items: [uses ? `${w.n} is taken off ${uses} pipeline ${uses === 1 ? "step" : "steps"}; those steps need someone new.` : `${w.n} is not used in any pipeline.`, "Their instructions, model and permissions are deleted.", "Their chair becomes free."], ok: `Remove ${w.n}` }))) return; F.crew = F.crew.filter((x) => x !== w); open = null; save(); };
      }
      for (const b of P().querySelectorAll("[data-role]")) b.onclick = () => A.role && A.role(b.dataset.role);
      $("sNew").onclick = () => { snew = !snew; sedit = null; draw(); };
      const sf = $("sF");
      if (sf) sf.onsubmit = async (e) => { e.preventDefault(); if (await sop({ op: "set", n: sf.n.value.trim().toUpperCase(), v: sf.v.value, d: sf.d.value, who: [...sf.querySelectorAll("[name=who]:checked")].map((x) => x.value) })) { snew = false; draw(); } };
      for (const b of P().querySelectorAll("[data-se]")) b.onclick = () => { sedit = sedit === b.dataset.se ? null : b.dataset.se; draw(); };
      for (const f of P().querySelectorAll("form[data-sf]")) {
        f.onsubmit = async (e) => { e.preventDefault(); if (await sop({ op: "set", n: f.dataset.sf, v: f.v.value, d: f.d.value, who: [...f.querySelectorAll("[name=who]:checked")].map((x) => x.value) })) { sedit = null; draw(); } };
        f.querySelector("[data-sd]").onclick = async () => { if (!(await A.danger({ title: `Delete the secret ${f.dataset.sf}?`, items: ["The stored value is deleted and cannot be shown or restored.", "Workers that use it lose access on their next step."], ok: "Delete secret" }))) return; if (await sop({ op: "del", n: f.dataset.sf })) { sedit = null; draw(); } };
      }
    };
    draw();
  };

  let wtab = "jobs";
  try { wtab = localStorage.getItem("ao.wt") || "jobs"; } catch {}
  const wtabs = (n1, n2) => `<div class="seg wtb" role="tablist">${[["jobs", "Jobs"], ["runs", "Runs"]].map(([k, l]) => `<button type="button" role="tab" data-wt="${k}" class="${wtab === k ? "on" : ""}" aria-selected="${wtab === k}">${l}</button>`).join("")}</div>`;
  const wbind = () => { for (const b of P().querySelectorAll("[data-wt]")) b.onclick = () => { wtab = b.dataset.wt; try { localStorage.setItem("ao.wt", wtab); } catch {} A.jobs(); }; };
  const runs = async () => {
    const F = await get("/api/flows");
    if (A.route() !== "jobs") return;
    let f = { flow: "", st: A.runFilter || "" }, rows = [];
    A.runFilter = "";
    const load = async () => { const ps = new URLSearchParams({ limit: "200" }); for (const k in f) if (f[k] && !(k === "st" && f[k] === "blk")) ps.set(k, f[k]); if (f.st === "blk") ps.set("st", "queued"); rows = await get("/api/v2/runs?" + ps); if (f.st === "blk") rows = rows.filter((r) => r.blk); draw(); };
    const fn = (id) => (F.flows.find((x) => x.id === id) || {}).n || id;
    const draw = () => {
      if (A.route() !== "jobs" || wtab !== "runs") return;
      const S = A.S || {}, rn = S.rn || [];
      P().innerHTML = head("Jobs & runs", `Runs are your pipelines at work. Showing ${rows.length} ${rows.length === 1 ? "run" : "runs"}, finished ones included, newest first. ${rn.length} ${rn.length === 1 ? "is" : "are"} still open. Up to 3 run at the same time, the rest wait as queued. Click one to see every step.`)
        + wtabs((S.q || []).length, rn.length)
        + `<div class="flt"><select data-f="flow" aria-label="Pipeline"><option value="">All pipelines</option>${F.flows.map((x) => `<option value="${esc(x.id)}" ${f.flow === x.id ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</select><select data-f="st" aria-label="State"><option value="">All states</option>${Object.entries(RST).map(([k, l]) => `<option value="${k}" ${f.st === k ? "selected" : ""}>${l}</option>`).join("")}<option value="blk" ${f.st === "blk" ? "selected" : ""}>Needs a desk</option></select></div>`
        + (rows.length ? `<div class="tw"><table class="tb2"><thead><tr><th>Run</th><th>Pipeline</th><th>State</th><th class="n">Steps</th><th class="n">Took</th><th class="n">Started</th></tr></thead><tbody>${rows.map((r) => `<tr data-run="${r.id}"><td><b>Run ${r.id}</b>${r.err ? `<span class="mut bad2">${esc(r.err)}</span>` : r.ask && r.st === "wait" ? `<span class="mut">${esc(r.ask)}</span>` : ""}</td><td>${esc(r.name || fn(r.flow))}</td><td><span class="stt rs-${esc(r.blk ? "fail" : r.st)}">${esc(r.blk ? "Needs a desk" : RST[r.st] || r.st)}</span></td><td class="n">${r.steps ?? "–"}</td><td class="n">${r.t1 && r.t0 ? Math.max(1, Math.round((r.t1 - r.t0) / 1000)) + " s" : "–"}</td><td class="n mut">${ago(r.t0)}</td></tr>`).join("")}</tbody></table></div>` : (f.flow || f.st ? empty("No runs match this filter", "Choose All pipelines and All states to see every run.") : empty("No runs yet", F.flows.length ? "Start one with Run now on the Pipelines page." : "Build a pipeline first.")));
      wbind();
      for (const s of P().querySelectorAll("[data-f]")) s.onchange = () => { f[s.dataset.f] = s.value; load(); };
      for (const r of P().querySelectorAll("[data-run]")) r.onclick = () => A.runView && A.runView(+r.dataset.run);
    };
    await load();
  };

  A.jobs = async () => {
    if (wtab === "runs") return runs();
    const C = await get("/api/cfg");
    if (A.route() !== "jobs") return;
    let f = { st: "", repo: "", kind: "" }, q = "", rows = [], more = false;
    const load = async (add) => {
      const ps = new URLSearchParams({ limit: "100" });
      for (const k in f) if (f[k]) ps.set(k, f[k]);
      if (add && rows.length) ps.set("before", rows[rows.length - 1].id);
      const r = await get("/api/v2/jobs?" + ps);
      rows = add ? rows.concat(r) : r; more = r.length === 100; draw();
    };
    const draw = () => {
      if (A.route() !== "jobs" || wtab !== "jobs") return;
      const sel = (k, l, o) => `<select data-f="${k}" aria-label="${l}"><option value="">${l}</option>${o.map(([v, t]) => `<option value="${esc(v)}" ${f[k] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
      const vis = rows.filter((j) => !q || (j.title + " " + j.repo + " " + j.num + " " + (j.why || "")).toLowerCase().includes(q.toLowerCase()));
      P().innerHTML = head("Jobs & runs", `Jobs are the issues the Bug-fix team pipeline works on. Showing ${vis.length}${more ? "+" : ""} ${vis.length === 1 ? "job" : "jobs"}, finished ones included, newest first. ${(A.S?.q || []).length} ${(A.S?.q || []).length === 1 ? "is" : "are"} still open. Click one for its log and diff.`)
        + wtabs((A.S?.q || []).length, (A.S?.rn || []).length)
        + `<div class="flt">${sel("st", "All states", Object.entries(STN))}${sel("repo", "All repositories", (C.repos || []).map((r) => [r.full, r.full]))}${sel("kind", "All kinds", [["fix", "Fix"], ["hunt", "Hunt"], ["rebase", "Rebase"], ["review", "Review changes"]])}<input type="text" id="jQ" placeholder="Search title, repo or reason" value="${esc(q)}" autocomplete="off"></div>`
        + (vis.length ? `<div class="tw"><table class="tb2"><thead><tr><th>Job</th><th>Repository</th><th>State</th><th>Kind</th><th class="n">Updated</th></tr></thead><tbody>${vis.map((j) => `<tr data-j="${j.id}"><td><b>${esc(j.title || "Untitled")}</b>${j.why ? `<span class="mut">${esc(j.why)}</span>` : ""}</td><td class="mono">${esc((j.repo || "").split("/")[1] || j.repo)}${j.num ? "#" + j.num : ""}</td><td><span class="stt st-${esc(j.st)}">${esc(STN[j.st] || j.st)}</span></td><td>${esc(j.kind)}</td><td class="n mut">${ago(j.t1 || j.t0)}</td></tr>`).join("")}</tbody></table></div>${more ? `<div class="acts c"><button type="button" id="jMore">Load more</button></div>` : ""}` : (f.st || f.repo || f.kind || q ? empty("No jobs match this filter", "Clear the filters to see every job.") : empty("No jobs yet", "Add a repository and the bug-fix team starts looking for issues.")));
      wbind();
      for (const s of P().querySelectorAll("[data-f]")) s.onchange = () => { f[s.dataset.f] = s.value; load(false); };
      const jq = $("jQ"); jq.oninput = () => { q = jq.value; draw(); const i = $("jQ"); i.focus(); i.setSelectionRange(q.length, q.length); };
      for (const r of P().querySelectorAll("[data-j]")) r.onclick = () => A.job && A.job(+r.dataset.j);
      const m = $("jMore"); if (m) m.onclick = () => load(true);
    };
    await load(false);
  };

  A.prs = async () => {
    const C = await get("/api/cfg");
    if (A.route() !== "prs") return;
    let f = { st: "", repo: "" }, rows = [];
    const load = async () => { const ps = new URLSearchParams({ limit: "200" }); for (const k in f) if (f[k]) ps.set(k, f[k]); rows = await get("/api/v2/prs?" + ps); draw(); };
    const draw = () => {
      if (A.route() !== "prs") return;
      const n = (s) => rows.filter((p) => p.st === s).length;
      P().innerHTML = head("Pull requests", "Opened by the office. Click one to open it on GitHub.")
        + `<div class="kpis"><div><b>${n("open")}</b><span>open</span></div><div><b>${n("merged")}</b><span>merged</span></div><div><b>${n("closed")}</b><span>closed</span></div><div><b>${rows.length ? Math.round(n("merged") / Math.max(1, n("merged") + n("closed")) * 100) + "%" : "–"}</b><span>merge rate</span></div></div>`
        + `<div class="flt"><select data-f="st"><option value="">All states</option>${["open", "merged", "closed"].map((s) => `<option ${f.st === s ? "selected" : ""}>${s}</option>`).join("")}</select><select data-f="repo"><option value="">All repositories</option>${(C.repos || []).map((r) => `<option ${f.repo === r.full ? "selected" : ""}>${esc(r.full)}</option>`).join("")}</select></div>`
        + (rows.length ? `<div class="tw"><table class="tb2"><thead><tr><th>Pull request</th><th>Repository</th><th>State</th><th class="n">Updated</th></tr></thead><tbody>${rows.map((p) => `<tr data-u="${esc(p.url || "")}" title="Opens on GitHub"><td><b>${esc(p.title || "")} <span class="ext">↗</span></b></td><td class="mono">${esc((p.repo || "").split("/")[1] || "")}#${p.num}</td><td><span class="stt pr-${esc(p.st)}">${esc(p.st)}</span></td><td class="n mut">${ago(p.merged || p.upd || p.t0)}</td></tr>`).join("")}</tbody></table></div>` : empty("No pull requests", ""));
      for (const s of P().querySelectorAll("[data-f]")) s.onchange = () => { f[s.dataset.f] = s.value; load(); };
      for (const r of P().querySelectorAll("[data-u]")) r.onclick = () => A.open && A.open(r.dataset.u);
    };
    await load();
  };

  const RST = { queued: "Queued", run: "Running", wait: "Waiting for you", done: "Done", fail: "Failed", stop: "Stopped" };
  const RTN = { "t.manual": "Started by hand", "t.cron": "Schedule", "t.issue": "New issue", "t.pr": "New pull request", "t.hook": "Called by an app", worker: "Step", check: "Check", branch: "Choice", approve: "Your approval", end: "Done", parallel: "Split", join: "Join" };
  A.runSt = RST;
  let rvT = 0;
  const pretty = (o) => {
    if (o == null) return "";
    if (typeof o !== "object") return esc(String(o));
    const parts = [];
    for (const [k, v] of Object.entries(o)) parts.push(`<div class="kvr"><span>${esc(k)}</span><pre>${esc(typeof v === "string" ? v : JSON.stringify(v, null, 2))}</pre></div>`);
    return parts.join("");
  };
  A.runView = async (id) => {
    clearTimeout(rvT);
    const r = await get("/api/v2/runs/" + id);
    if (r.error) return;
    const live = ["queued", "run"].includes(r.st);
    const B = A.drawer(`Run ${r.id} · ${r.name || r.flow}`, `<div class="rvh"><span class="stt rs-${esc(r.st)}">${esc(RST[r.st] || r.st)}</span><span class="mut">${new Date(r.t0).toLocaleString()}${(() => { const wk = Math.round((r.steps || []).reduce((s, x) => s + Math.max(0, (x.t1 || 0) - (x.t0 || 0)), 0) / 1000), tot = r.t1 ? Math.round((r.t1 - r.t0) / 1000) : 0; return tot ? ` · worked ${Math.max(1, wk)} s${tot - wk > 5 ? `, waited ${tot - wk} s` : ""}` : ""; })()}</span><span class="sp"></span>${live || r.st === "wait" ? `<button type="button" class="dng" id="rvStop">Stop</button>` : ""}</div>
      ${r.st === "wait" ? (() => { const rv = [...(r.steps || [])].reverse(), ls = rv.find((x) => x.t === "worker" && x.out) || rv.find((x) => x.t === "check" && x.out), o = ls?.out || {}, txt = typeof o === "string" ? o : o.result || o.summary || o.text || (Object.keys(o).length ? JSON.stringify(o, null, 2) : ""); return `<div class="rvask col"><div class="rvq"><b>${esc(r.ask || "Continue?")}</b><span class="sp"></span><button type="button" class="go" data-ans="1">Yes</button><button type="button" data-ans="0">No</button></div>${txt ? `<div class="rvsum"><span class="mut">What you approve${ls?.w ? `, from ${esc(ls.w)}` : ""}</span><pre>${esc(String(txt).slice(0, 4000))}</pre></div>` : ""}</div>`; })() : ""}
      ${r.blk ? `<div class="rvask blk"><span>${esc(r.blk)} Every worker needs a desk with a chair.</span><span class="sp"></span><button type="button" id="rvDesk">Edit office</button></div>` : ""}
      ${r.err ? `<div class="warn">${esc(r.err)}</div>` : ""}
      <div class="tln">${(r.steps || []).map((x) => `<div class="tli ${x.err ? "bad" : x.ok === false ? "back" : ""}"><i></i><div class="tlb"><div class="tlh"><b>${esc(x.w || RTN[x.t] || x.t)}</b><span>${esc(RTN[x.t] || x.t)}${x.t1 && x.t0 ? " · " + Math.max(0, Math.round((x.t1 - x.t0) / 1000)) + " s" : ""}</span></div>${x.err ? `<div class="tle">${esc(x.err)}</div>` : ""}${x.out ? `<details ${x.t === "worker" || x.t === "check" ? "open" : ""}><summary>Output</summary>${pretty(x.out)}</details>` : ""}</div></div>`).join("")}${live ? `<div class="tli run"><i></i><div class="tlb"><div class="tlh"><b>${r.blk ? "Waiting for a desk" : "Working…"}</b></div></div></div>` : ""}</div>`);
    for (const b of B.querySelectorAll("[data-ans]")) b.onclick = async () => { await v2("POST", `/runs/${id}/answer`, { yes: b.dataset.ans === "1" }); A.runView(id); get("/api/state").then((s) => A.apply && A.apply(s)).catch(() => {}); };
    const dk = B.querySelector("#rvDesk"); if (dk) dk.onclick = () => { $("drX").click(); A.go("office"); setTimeout(() => $("bCz").click(), 250); };
    const st = B.querySelector("#rvStop"); if (st) st.onclick = async () => { await v2("POST", `/runs/${id}/stop`); A.runView(id); };
    if (live) rvT = setTimeout(() => { if (A.drawerOpen()) A.runView(id); }, 2500);
  };

  let cc = null, cf = null, cfl = null, ct = 0, crw = [], crt = 0;
  const refresh = async () => {
    if (Date.now() - ct < 30000) return;
    ct = Date.now();
    try { [cc, cf, cfl] = await Promise.all([get("/api/cost"), get("/api/cfg"), get("/api/flows")]); } catch {}
  };
  const vis = (k) => { const e = document.querySelector(`[data-lp="${k}"]`); return e && e.offsetParent !== null; };
  const bars = (vals, cls = "") => { const mx = Math.max(1, ...vals); return `<div class="wb ${cls}">${vals.map((v) => `<i style="height:${v ? Math.max(6, v / mx * 100) : 2}%" class="${v ? "" : "z"}"></i>`).join("")}</div>`; };
  A.wdg = async (S) => {
    if (!document.body.classList.contains("lay") || document.body.classList.contains("pgm")) return;
    const any = ["approvals", "costs", "machines", "pipelines", "team", "merges", "repohealth"].some(vis);
    if (!any) return;
    if (["costs", "pipelines", "team", "repohealth"].some(vis)) await refresh();
    if (vis("approvals")) {
      if (S.rw && Date.now() - crt > 8000) { crt = Date.now(); try { crw = await get("/api/v2/runs?st=wait&limit=20"); } catch {} } else if (!S.rw) crw = [];
      const ap = S.q.filter((q) => q.st === "approve");
      $("wApN").textContent = ap.length + crw.length || "";
      $("wAp").innerHTML = ap.length || crw.length ? crw.map((r) => `<div class="wr"><div class="wt"><b>${esc(r.ask || "Continue?")}</b><span>${esc(r.name || r.flow)} · run ${r.id}</span></div><button type="button" class="go" data-ry="${r.id}">Yes</button><button type="button" data-rn="${r.id}">No</button></div>`).join("") + ap.map((j) => `<div class="wr"><div class="wt"><b>${esc(j.title)}</b><span>${esc(j.repo)}${j.num ? "#" + j.num : ""}</span></div><button type="button" class="go" data-ap="${j.id}">Approve</button><button type="button" data-dr="${j.id}">Drop</button></div>`).join("") : `<div class="wmut">Nothing waits for you.</div>`;
      for (const b of $("wAp").querySelectorAll("[data-ry],[data-rn]")) b.onclick = async () => { const id = b.dataset.ry || b.dataset.rn; await v2("POST", `/runs/${id}/answer`, { yes: !!b.dataset.ry }); crt = 0; A.wdg(S); };
      for (const b of $("wAp").querySelectorAll("[data-ap]")) b.onclick = () => post({ a: "approve", id: +b.dataset.ap }).then(A.apply);
      for (const b of $("wAp").querySelectorAll("[data-dr]")) b.onclick = async () => { if (!(await A.danger({ title: `Drop the fix for job #${b.dataset.dr}?`, items: ["The fix and its proof are discarded; no pull request is opened."], ok: "Drop fix" }))) return; A.apply(await post({ a: "drop", id: +b.dataset.dr })); };
    }
    if (vis("costs") && cc) {
      const t = cc.today || {}, d = (cc.days || []).slice(0, 14).reverse();
      $("wCo").innerHTML = `<div class="kp"><div><b>${usd((t.usd || 0))}</b><span>API today</span></div><div><b>${usd(t.val || 0)}</b><span>login value today</span></div></div>${bars(d.map((x) => (x.usd || 0) + (x.val || 0)))}<div class="wmut">last 14 days</div>`;
    }
    if (vis("machines")) {
      const busy = {}; for (const v of Object.values(S.ln || {})) { const h = String(v).split("#")[0]; busy[h] = (busy[h] || 0) + 1; }
      $("wMa").innerHTML = (S.hs || []).filter((h) => h.on_).map((h) => { const up = S.o.net?.[h.id] !== false, st = (S.hst || {})[h.id] || {}; return `<div class="wr"><i class="dot2 ${up ? "up" : "dn"}"></i><div class="wt"><b>${esc(h.id)}</b><span>${up ? `${busy[h.id] || 0}/${h.ln || 1} lanes busy${st.load != null ? " · load " + Number(st.load).toFixed(1) : ""}${st.temp ? " · " + Math.round(st.temp) + "°C" : ""}` : "offline"}</span></div></div>`; }).join("") || `<div class="wmut">No machines.</div>`;
    }
    if (vis("pipelines") && cfl) {
      $("wPi").innerHTML = (cfl.flows || []).length ? cfl.flows.map((f) => `<div class="wr"><i class="dot2 ${f.on ? "up" : ""}"></i><div class="wt"><b>${esc(f.n)}</b><span>${f.nodes.length} steps · ${f.on ? "on" : "off"}</span></div></div>`).join("") + `<button type="button" class="wl" data-go="pipelines">Open pipelines</button>` : `<div class="wmut">No pipelines yet.</div><button type="button" class="wl" data-go="pipelines">Create one</button>`;
    }
    if (vis("team") && cfl) {
      $("wTe").innerHTML = (cfl.crew || []).length ? cfl.crew.map((w) => `<div class="wr"><span class="av sm">${esc(w.n.slice(0, 1).toUpperCase())}</span><div class="wt"><b>${esc(w.n)}</b><span>${esc(w.r || w.md || "")}</span></div></div>`).join("") : `<div class="wmut">Nobody hired yet.</div><button type="button" class="wl" data-go="team">Hire someone</button>`;
    }
    if (vis("merges")) {
      const m = Object.fromEntries((S.mg || []).map((x) => [x.day, x.n])), days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)), vs = days.map((d) => m[d] || 0);
      $("wMgN").textContent = vs.reduce((a, b) => a + b, 0) + " in 30 days";
      $("wMg").innerHTML = bars(vs, "ok");
    }
    if (vis("repohealth") && cf) {
      $("wRe").innerHTML = (cf.repos || []).filter((r) => r.on_).map((r) => { const x = r.st || {}; return `<div class="wr"><i class="dot2 ${x.red ? "dn" : "up"}"></i><div class="wt"><b>${esc(r.full.split("/")[1] || r.full)}</b><span>${x.m14 || 0} merged · ${x.op || 0} open · ${x.q || 0} queued${x.red ? " · main red" : ""}</span></div></div>`; }).join("") || `<div class="wmut">No active repositories.</div>`;
    }
    for (const b of document.querySelectorAll("#lay [data-go]")) b.onclick = () => A.go(b.dataset.go);
  };
})();
