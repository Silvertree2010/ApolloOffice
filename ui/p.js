(() => {
  const A = window.AO, { get, post, esc, $ } = A;
  const dr = $("dr"), T = $("drT");
  let B = $("drB"), cur = "", cfg = null, ck = null, jid = 0;
  const PG = { repos: "Repositories", hosts: "Machines", set: "Settings", cost: "Costs", health: "Health" };

  const show = (t, k) => {
    cur = k;
    if (PG[k]) {
      const r = { repos: "repos", hosts: "machines", set: "settings", cost: "costs", health: "health" }[k];
      if (A.route && A.route() !== r) location.hash = "#/" + r;
      B = $("pgB"); B.dataset.k = k; $("vt").textContent = PG[k]; return;
    }
    B = $("drB"); T.textContent = t; clearTimeout(dto); dr.classList.remove("out"); dr.hidden = false;
  };
  let dto = 0;
  const hide = () => {
    cur = ""; jid = 0;
    if (dr.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) { dr.hidden = true; return; }
    dr.classList.add("out");
    clearTimeout(dto);
    dto = setTimeout(() => { dr.hidden = true; dr.classList.remove("out"); }, 170);
  };
  $("drX").onclick = hide;
  dr.onclick = (e) => { if (e.target === dr) hide(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dr.hidden) hide(); });

  const yes = (v) => v === 1 || v === true;
  const tg = (n, v, l) => `<label class="ck"><input type="checkbox" name="${n}" ${yes(v) ? "checked" : ""}> ${l}</label>`;
  const fv = (f) => {
    const o = {};
    for (const e of f.querySelectorAll("[name]")) o[e.name] = e.type === "checkbox" ? e.checked : e.type === "number" ? Number(e.value) : e.value;
    return o;
  };
  const usd = (v) => v == null ? "–" : "$" + (v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2));
  A.usd = usd;
  const busy = (b, on, t) => { b.disabled = on; if (t) b.textContent = t; };


  const tok = (s) => s.match(/\s+|\w+|[^\w\s]/g) || [];
  const wd = (a, b) => {
    const x = tok(a), y = tok(b), n = x.length, m = y.length;
    if (n * m > 40000 || !n || !m) return [esc(a), esc(b)];
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    if (L[0][0] * 2 < Math.max(n, m)) return [esc(a), esc(b)];
    let i = 0, j = 0, A = "", B = "";
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { A += esc(x[i]); B += esc(y[j]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { B += `<mark>${esc(y[j])}</mark>`; j++; }
      else { A += `<mark>${esc(x[i])}</mark>`; i++; }
    }
    return [A.replace(/<\/mark><mark>/g, ""), B.replace(/<\/mark><mark>/g, "")];
  };
  const pf = (d) => {
    const fs = [];
    let f = null, o = 0, n = 0, D = [], P = [];
    const fl = () => {
      const k = Math.min(D.length, P.length);
      for (let i = 0; i < Math.max(D.length, P.length); i++) {
        if (i < k) { const [a, b] = wd(D[i][1], P[i][1]); f.r.push({ t: "p", o: D[i][0], n: P[i][0], a, b }); }
        else if (i < D.length) f.r.push({ t: "d", o: D[i][0], a: esc(D[i][1]) });
        else f.r.push({ t: "a", n: P[i][0], b: esc(P[i][1]) });
      }
      D = []; P = [];
    };
    const ls = (d || "").split("\n");
    if (ls.length && ls[ls.length - 1] === "") ls.pop();
    for (const l of ls) {
      if (l.startsWith("diff --git")) { if (f) fl(); f = { nm: l.replace(/^diff --git a\/(.*) b\/.*$/, "$1"), r: [], ad: 0, rm: 0 }; fs.push(f); continue; }
      if (!f) { f = { nm: "", r: [], ad: 0, rm: 0 }; fs.push(f); }
      if (l.startsWith("@@")) { fl(); const m = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/); o = m ? +m[1] : 0; n = m ? +m[2] : 0; f.r.push({ t: "h", s: esc(l) }); continue; }
      if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary)/.test(l) && !f.r.length) { if (l.startsWith("+++ ") && !f.nm) f.nm = l.slice(6); continue; }
      if (l.startsWith("-")) { D.push([o++, l.slice(1)]); f.rm++; continue; }
      if (l.startsWith("+")) { P.push([n++, l.slice(1)]); f.ad++; continue; }
      fl();
      if (l.startsWith("\\")) continue;
      if (!f.r.length && !l) continue;
      f.r.push({ t: "c", o: o++, n: n++, s: esc(l.slice(1)) });
    }
    if (f) fl();
    return fs.filter((x) => x.r.length || x.nm);
  };
  let dm = "u";
  try { dm = localStorage.getItem("ao.dm") || "u"; } catch {}
  let ldf = "";
  const dview = (d) => {
    ldf = d || "";
    const fs = pf(d);
    if (!fs.length) return `<div class="dv"><div class="empty">no diff</div></div>`;
    const ln = (x) => `<td class="ln">${x ?? ""}</td>`;
    const U = (r) => r.t === "h" ? `<tr class="hh"><td colspan="3">${r.s}</td></tr>` : r.t === "c" ? `<tr>${ln(r.o)}${ln(r.n)}<td class="cd"> ${r.s}</td></tr>` : (r.t === "p" || r.t === "d" ? `<tr class="rm">${ln(r.o)}${ln()}<td class="cd">-${r.a}</td></tr>` : "") + (r.t === "p" || r.t === "a" ? `<tr class="ad">${ln()}${ln(r.n)}<td class="cd">+${r.b}</td></tr>` : "");
    const Sp = (r) => r.t === "h" ? `<tr class="hh"><td colspan="4">${r.s}</td></tr>` : r.t === "c" ? `<tr>${ln(r.o)}<td class="cd">${r.s}</td>${ln(r.n)}<td class="cd">${r.s}</td></tr>` : `<tr>${r.t === "a" ? `${ln()}<td class="cd e"></td>` : `${ln(r.o)}<td class="cd rm">${r.a}</td>`}${r.t === "d" ? `${ln()}<td class="cd e"></td>` : `${ln(r.n)}<td class="cd ad">${r.b}</td>`}</tr>`;
    return `<div class="dv"><div class="dvh"><span>${fs.length} ${fs.length === 1 ? "file" : "files"} · <span class="ok2">+${fs.reduce((s, f) => s + f.ad, 0)}</span> <span class="bad2">−${fs.reduce((s, f) => s + f.rm, 0)}</span></span><span class="sp"></span><div class="tabs"><button type="button" data-dm="u" class="${dm === "u" ? "on" : ""}">unified</button><button type="button" data-dm="s" class="${dm === "s" ? "on" : ""}">split</button></div></div>
      ${fs.map((f) => `<details open><summary><span class="fn">${esc(f.nm)}</span><span class="ok2">+${f.ad}</span> <span class="bad2">−${f.rm}</span></summary><div class="tw"><table class="dt${dm === "s" ? " sp2" : ""}">${f.r.map(dm === "s" ? Sp : U).join("")}</table></div></details>`).join("")}</div>`;
  };
  B.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dm]");
    if (!b) return;
    dm = b.dataset.dm;
    try { localStorage.setItem("ao.dm", dm); } catch {}
    const v = B.querySelector(".dv");
    if (v) v.outerHTML = dview(ldf);
  });

  const ph = (d, act) => `<div class="ph2"><div>${d ? `<p>${d}</p>` : ""}</div><div class="pa2">${act || ""}</div></div>`;
  const kpi = (xs) => `<div class="kpis">${xs.map(([v, l, c]) => `<div><b class="${c || ""}">${v}</b><span>${l}</span></div>`).join("")}</div>`;
  let rq = "";
  const fun = (r) => {
    const d = (r.st || {}).dr || {};
    const it = (k, l, ti, c) => d[k] ? `<div title="${esc(ti)}"><b class="${c || ""}">${d[k]}</b><span>${l}</span></div>` : "";
    const v = [it("done", "submitted", "Fix jobs that ended in a pull request", "ok2"), it("vet", "rejected by Vet", "Vet judged the issue unsuitable: unclear, bundled, already claimed or paused"), it("guard", "blocked by Guard", "Guard found suspicious content such as hidden instructions"), it("repro", "not reproducible", "The bug could not be reproduced on the build machine"), it("fix", "no valid fix", "Fixer, CI or Reviewer could not produce a fix that passes"), it("late", "too late", "Someone else opened a PR or claimed the issue first"), it("host", "machine errors", "Dropped because a build machine failed", "bad2"), it("own", "dropped by you", "Dropped from the queue by hand")].filter(Boolean);
    return v.length ? `<div class="sec"><h4>Fix jobs, last 14 days</h4><div class="stl">${v.join("")}</div></div>` : "";
  };
  const rdet = (full) => {
    const r = cfg.repos.find((x) => x.full === full);
    if (!r) return;
    show(full, "rdr");
    const D = B, x = r.st || {};
    D.innerHTML = `<form class="rfm" data-r="${esc(r.full)}">
      ${r.ci ? "" : `<div class="warn">No test command found. Enter the command that runs this repository's tests, otherwise nothing happens here.</div>`}
      <div class="kp">${[[x.m14 ?? 0, "merged, 14 d", "ok2"], [x.op ?? 0, "open"], [x.old ?? 0, "open > 7 d", x.old ? "bad2" : ""], [x.q ?? 0, "queued"], [usd(x.usd || 0), "cost, 14 d"]].map(([v, l, c]) => `<div><b class="${c || ""}">${v}</b><span>${l}</span></div>`).join("")}</div>
      ${fun(r)}
      <div class="sec"><h4>Work</h4><div class="box"><div class="fm">
        <label>Status</label>${tg("on_", r.on_, "active")}
        <label>Work on</label><div class="acts" style="margin:0">${tg("iss", r.iss, "open issues")}${tg("hunt", r.hunt, "hunt for bugs itself")}${tg("feat", r.feat, "build requested features")}</div>
        <label>Skip labels</label><input type="text" name="skl" value="${esc(r.skl || "")}" placeholder="e.g. area:kernel, needs-design">
        <label>Pull requests</label><select name="mode"><option value="ask" ${r.mode !== "auto" ? "selected" : ""}>wait for my approval</option><option value="auto" ${r.mode === "auto" ? "selected" : ""}>submit automatically</option></select>
        <label>PR footer</label>${tg("nm", r.nm ?? 1, "mention ApolloOffice with a link")}
      </div></div></div>
      <div class="sec"><h4>Build</h4><div class="box"><div class="fm">
        <label>Test command</label><input type="text" name="ci" value="${esc(r.ci)}" placeholder="e.g. cargo test, npm test, pytest">
        <label>Setup command</label><input type="text" name="setup" value="${esc(r.setup)}" placeholder="optional, e.g. npm ci">
      </div></div></div>
      <div class="sec"><h4>Limits</h4><div class="box"><div class="fm">
        <label>Open pull requests</label><input type="number" name="maxo" min="0" max="10000" value="${r.maxo}">
        <label>New per day</label><input type="number" name="maxd" min="0" max="10000" value="${r.maxd}">
        <label>USD per day</label><input type="number" name="bud" min="0" step="0.01" value="${r.bud || 0}">
      </div></div></div>
      <div class="sec"><h4>Your rules</h4><textarea name="rules" placeholder="optional, e.g. never touch the plugin API">${esc(r.rules)}</textarea></div>
      <div class="sbar"><button class="pri" data-op="set" disabled>Saved</button><button type="button" data-op="detect">Detect test command</button><span class="msg"></span><span class="sp"></span><button type="button" class="dng" data-op="del">Remove</button></div></form>`;
    const f = D.querySelector("form"), sb = f.querySelector('[data-op="set"]'), m = f.querySelector(".msg");
    const dirty = () => { sb.disabled = false; sb.textContent = "Save changes"; m.textContent = ""; };
    f.addEventListener("input", dirty);
    f.addEventListener("change", dirty);
    f.onsubmit = (e) => e.preventDefault();
    f.onclick = async (e) => {
      const b = e.target.closest("button[data-op]");
      if (!b) return;
      e.preventDefault();
      const op = b.dataset.op;
      if (op === "del") {
        if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to remove"; return; }
        await post({ op: "del", full }, "/api/repo");
        hide();
        return repos();
      }
      if (op === "detect") {
        busy(b, true, "Detecting…");
        const r2 = await post({ op: "detect", full }, "/api/repo");
        busy(b, false, "Detect test command");
        if (r2.ci) { f.ci.value = r2.ci; if (r2.setup && !f.setup.value) f.setup.value = r2.setup; f.dispatchEvent(new Event("change")); m.className = "msg"; m.textContent = "Detected. Save to keep it."; }
        else { m.className = "msg"; m.textContent = "Nothing detected."; }
        return;
      }
      busy(b, true, "Saving…");
      const r2 = await post({ op: "set", full, ...fv(f) }, "/api/repo");
      if (r2.error) { busy(b, false, "Save changes"); m.className = "msg bad2"; m.textContent = r2.error; return; }
      busy(b, true, "Saved");
      m.className = "msg"; m.textContent = "";
      repos();
    };
  };
  const repos = async () => {
    cfg = await get("/api/cfg");
    show("Repos", "repos");
    const P0 = B, rs = cfg.repos;
    const sum = (k) => rs.reduce((s, r) => s + ((r.st || {})[k] || 0), 0);
    const flags = (r) => { const x = r.st || {}, c = []; if (!yes(r.on_)) c.push(`<i>Paused</i>`); if (!r.ci) c.push(`<i class="bad2">No test command</i>`); if (x.red) c.push(`<i class="bad2">Main is red</i>`); return c.join(""); };
    const work = (r) => { const x = r.st || {}; return [yes(r.iss) && (x.iv > 0 ? `Issues, every ${x.iv >= 60 ? x.iv / 60 + " h" : x.iv + " min"}` : "Issues"), yes(r.hunt) && "Hunt", yes(r.feat) && "Features"].filter(Boolean).join(", ") || `<span class="t2">Nothing</span>`; };
    const row = (r) => { const x = r.st || {}, [o, n] = r.full.includes("/") ? r.full.split("/") : ["", r.full]; return `<tr data-r="${esc(r.full)}" class="${yes(r.on_) ? "" : "dim"}"><td><b>${esc(n)}</b><span class="mut">${esc(o)}${flags(r) ? " · " : ""}${flags(r)}</span></td><td>${work(r)}</td><td>${r.mode === "auto" ? "Automatic" : "Ask me"}</td><td class="n">${x.m14 || 0}</td><td class="n">${x.op || 0}</td><td class="n">${x.old ? `<span class="bad2">${x.old}</span>` : `<span class="t2">0</span>`}</td><td class="n">${x.q || 0}</td><td class="n">${usd(x.usd || 0)}</td></tr>`; };
    P0.innerHTML = ph(`${rs.filter((r) => yes(r.on_)).length} of ${rs.length} active. Click a repository to change what the office does there.`, `<form id="fa" class="inl"><input type="text" name="full" placeholder="owner/name or GitHub link" aria-label="Repository to add"><button class="go">Add repository</button></form>`)
      + `<div class="msg" id="am"></div>`
      + kpi([[sum("m14"), "merged, 14 days"], [sum("op"), "open pull requests"], [sum("q"), "queued jobs"], [usd(sum("usd")), "cost, 14 days"]])
      + (rs.length ? `<div class="flt"><input type="text" id="rq" placeholder="Filter repositories" value="${esc(rq)}" autocomplete="off"></div><div class="tw"><table class="tb2"><thead><tr><th>Repository</th><th>Works on</th><th>Pull requests</th><th class="n">Merged</th><th class="n">Open</th><th class="n" title="Open longer than 7 days without merge">Stale</th><th class="n">Queued</th><th class="n">Cost</th></tr></thead><tbody>${rs.map(row).join("")}</tbody></table></div>` : `<div class="emp"><b>No repository yet</b><span>Add one above, for example owner/name.</span></div>`);
    const flt = () => { const q = rq.trim().toLowerCase(); for (const t of P0.querySelectorAll("tr[data-r]")) t.hidden = !!q && !t.dataset.r.toLowerCase().includes(q); };
    if ($("rq")) { $("rq").oninput = (e) => { rq = e.target.value; flt(); }; flt(); }
    for (const t of P0.querySelectorAll("tr[data-r]")) t.onclick = () => rdet(t.dataset.r);
    $("fa").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button"), m = $("am");
      busy(b, true, "Adding…");
      const r = await post({ op: "add", full: e.target.full.value }, "/api/repo");
      busy(b, false, "Add repository");
      if (r.error) { m.className = "msg bad2"; m.textContent = r.error; return; }
      await repos();
      const n = $("am");
      n.className = "msg";
      n.textContent = r.ci ? `Added ${r.full}. Test command detected: ${r.ci}${r.setup ? " (setup: " + r.setup + ")" : ""}.` : `Added ${r.full}. No test command detected, open it and enter one.`;
      rdet(r.full);
    };
  };

  const hform = (h, nw) => `<form class="hfm" data-h="${esc(h.id || "")}" data-new="${nw ? 1 : ""}">${nw ? `<div class="sec"><h4>${h.id === "local" ? "This computer" : "SSH machine"}</h4>` : `<div class="sec">`}<div class="box"><div class="fm">
        ${nw ? "" : `<label>Status</label>${tg("on", h.on_, "active")}`}
        ${nw && h.id !== "local" ? `<label>SSH host</label><input type="text" name="ssh" placeholder="alias from ~/.ssh/config or user@host"><div class="hint">Key login must work without a password prompt.</div>` : ""}
        <label>Isolation</label><select name="dk"><option value="1" ${h.dk !== 0 ? "selected" : ""}>Docker container (recommended)</option><option value="0" ${h.dk === 0 ? "selected" : ""}>directly on the machine</option></select>
        <div class="hint raw" ${h.dk === 0 ? "" : "hidden"}><span style="color:var(--bad)">Workers build and run code from the repositories you add, directly with your user account, which can reach your GitHub, Claude and SSH logins on this machine. Only do this for repositories you trust.</span><br>${tg("raw", h.dk === 0 && !nw, "I understand")}</div>
        <label>Parallel jobs</label><input type="number" name="ln" min="1" max="8" value="${h.ln || 1}">
        <label>Parallel test runs</label><input type="number" name="ci" min="1" max="8" value="${h.ci || 1}">
        <label>CPU limit</label><input type="number" name="cpu" min="0" value="${h.cpu || 0}"><div class="hint">0 = all but one.</div>
        <label>Skip repos</label><input type="text" name="no" value="${esc(h.no || "")}" placeholder="optional, e.g. owner/big-repo, other-repo">
        <label>Disk limit (GB)</label><input type="number" name="gb" min="5" value="${h.gb || 50}">
      </div></div>
      <div class="acts"><button class="pri" data-op="set">${nw ? "Add" : "Save"}</button><span class="msg"></span>${nw ? "" : `<span class="sp"></span><button type="button" class="dng" data-op="del">Remove</button>`}</div></div></form>`;
  const hbind = (root, hs) => {
    for (const f of root.querySelectorAll("form[data-h]")) {
      f.dk.onchange = () => { f.querySelector(".raw").hidden = f.dk.value === "1"; };
      f.onsubmit = (e) => e.preventDefault();
      f.onclick = async (e) => {
        const b = e.target.closest("button[data-op]");
        if (!b) return;
        e.preventDefault();
        const m = f.querySelector(".msg"), v = fv(f);
        let id = f.dataset.h;
        if (!id) id = (v.ssh || "").replace(/^.*@/, "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
        if (b.dataset.op === "del") {
          if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to remove"; return; }
          await post({ op: "del", id }, "/api/host");
          hide();
          return hosts();
        }
        const ex = hs.find((x) => x.id === id);
        const body = { op: "set", id, ssh: v.ssh ?? ex?.ssh ?? "", dk: v.dk === "1", raw: !!v.raw, ln: v.ln, ci: v.ci, gb: v.gb, cpu: v.cpu, no: v.no, on: v.on ?? true };
        busy(b, true, body.dk ? "Setting up Docker (first time takes several minutes)…" : "Checking…");
        m.className = "msg"; m.textContent = "";
        const r = await post(body, "/api/host");
        busy(b, false, f.dataset.new ? "Add" : "Save");
        if (r.error) { m.className = "msg bad2"; m.textContent = r.error; return; }
        if (!r.ok) { m.className = "msg bad2"; m.textContent = "Saved, but the machine is not ready: " + (r.m || ""); return; }
        hide();
        hosts();
      };
    }
  };
  const hosts = async () => {
    cfg = await get("/api/cfg");
    show("Machines", "hosts");
    const P0 = B, hs = cfg.hosts, hl = hs.some((h) => h.id === "local");
    const S0 = A.S || {}, busyN = {};
    for (const v of Object.values(S0.ln || {})) { const k = String(v).split("#")[0]; busyN[k] = (busyN[k] || 0) + 1; }
    const row = (h) => {
      const up = S0.o?.net?.[h.id] !== false, st = (S0.hst || {})[h.id] || {}, on = h.on_ !== 0;
      const dk = Array.isArray(st.disk) ? st.disk : null, mem = Array.isArray(st.mem) ? st.mem : null;
      const c = (v) => `<td class="n">${v == null ? `<span class="mut">–</span>` : v}</td>`;
      return `<tr data-h="${esc(h.id)}" class="${on ? "" : "dim"}"><td><b><i class="dot2 ${!on ? "" : up ? "up" : "dn"}"></i>${esc(h.id === "local" ? "This computer" : h.id)}</b><span class="mut">${!on ? "Off" : up ? "Online" : "Offline"}${h.ssh ? " · " + esc(h.ssh) : ""} · ${h.dk === 0 ? "directly" : "Docker"}</span></td>${c(`${busyN[h.id] || 0}/${h.ln || 1}`)}${c(st.load != null ? Number(st.load).toFixed(1) : null)}${c(st.cpu != null ? st.cpu : null)}${c(mem ? Math.round((mem[0] - mem[1]) / 1024 * 10) / 10 + ` <span class="mut">/ ${Math.round(mem[0] / 1024)} GB</span>` : null)}${c(dk ? Math.round(dk[1]) + ` <span class="mut">GB</span>` : null)}${c(st.temp ? Math.round(st.temp) + ` <span class="mut">°C</span>` : null)}${c(st.up ? esc(String(st.up).split(",")[0]) : null)}</tr>`;
    };
    const on = hs.filter((h) => h.on_ !== 0), upn = on.filter((h) => S0.o?.net?.[h.id] !== false).length;
    P0.innerHTML = ph(`${upn} of ${on.length} active machines online. Jobs run in parallel lanes on each machine.`, `<button type="button" class="go" id="hAdd">Add a machine</button>`)
      + (hs.length ? `<div class="tw"><table class="tb2 mtb"><thead><tr><th>Machine</th><th class="n">Lanes busy</th><th class="n">Load</th><th class="n">Cores</th><th class="n">Memory</th><th class="n">Disk free</th><th class="n">Temp</th><th class="n">Up</th></tr></thead><tbody>${hs.map(row).join("")}</tbody></table></div>` : `<div class="emp"><b>No machine yet</b><span>Add this computer or an SSH machine.</span></div>`);
    for (const t of P0.querySelectorAll("tr[data-h]")) t.onclick = () => {
      const h = hs.find((x) => x.id === t.dataset.h); if (!h) return;
      show(h.id === "local" ? "This computer" : h.id, "hdr");
      B.innerHTML = hform(h, false);
      hbind(B, hs);
    };
    $("hAdd").onclick = () => { show("Add a machine", "hdr"); B.innerHTML = (hl ? "" : hform({ id: "local", dk: 1 }, true)) + hform({ id: "", dk: 1 }, true); hbind(B, hs); };
  };
  const RK = { scout: [["scout", "Model"]], guard: [["guard", "Model"]], vet: [["vet", "Model"]], watcher: [["watcher", "Model"]], hunter: [["hunter", "Model"]], reviewer: [["reviewer", "Model"]], repro: [["repro", "First try"], ["repro2", "Second try"]], fixer: [["fixer", "Model"], ["big", "Complex bugs"]] };
  const TOOLS = ["hunter", "repro", "fixer"];
  const split = (v) => { const i = (v || "").indexOf(":"), p = i > 0 ? v.slice(0, i) : ""; return cfg.prov.some((x) => x.id === p) ? [p, v.slice(i + 1)] : ["cc", v || ""]; };
  const join = (p, m) => (p === "cc" ? m : p + ":" + m);

  const role = async (w) => {
    cfg = await get("/api/cfg");
    show((window.AO.NM?.[w] || w) + " · model", "role");
    const s = cfg.set, ks = RK[w];
    const popt = (sel) => cfg.prov.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.nm)}${p.has ? "" : " (no key yet)"}</option>`).join("");
    B.innerHTML = `<form id="fr">${ks.map(([k, l]) => { const [p, m] = split(s.md[k]); return `<div class="sec"><h4>${esc(l)}</h4><div class="box" data-k="${k}"><div class="fm" style="margin:0">
        <label>Provider</label><select data-p>${popt(p)}</select>
        <label>Model</label><input type="text" data-m list="dl-${k}" value="${esc(m)}" placeholder="model id"><datalist id="dl-${k}"></datalist>
        <div class="hint" data-h></div>
      </div><div class="acts"><button type="button" data-t>Test</button></div><div class="msg" data-r></div></div></div>`; }).join("")}
      ${w === "fixer" ? `<div class="sec"><div class="box">${tg("big", s.big, "use the complex-bug model for Repro and Fixer when Vet marks a bug complex")}</div></div>` : ""}
      ${TOOLS.includes(w) ? `<div class="msg">This worker reads and edits code with tools. Small local models often fail here; a strong model saves time and tokens.</div>` : ""}
      <div class="acts"><button class="pri">Save</button></div><div class="msg" id="rm"></div></form>`;
    for (const bx of B.querySelectorAll(".box[data-k]")) {
      const ps = bx.querySelector("[data-p]"), mi = bx.querySelector("[data-m]"), dl = bx.querySelector("datalist"), h = bx.querySelector("[data-h]");
      const fill = async (reset) => {
        const pv = cfg.prov.find((x) => x.id === ps.value);
        h.textContent = !pv.has ? "Add the API key for this provider in Settings first." : pv.id === "ollama" ? "Runs on " + pv.base : pv.cli ? "Uses the CLI login on this computer." : "";
        dl.innerHTML = pv.ms.map((m) => `<option value="${esc(m)}">`).join("");
        if (reset) mi.value = pv.ms[0] || "";
        if (!pv.has) return;
        const r = await get("/api/models?p=" + pv.id);
        if (r.ms?.length) { dl.innerHTML = r.ms.map((m) => `<option value="${esc(m)}">`).join(""); if (reset && !mi.value) mi.value = r.ms[0]; }
        else if (r.error) h.textContent = "Could not list models: " + r.error;
      };
      ps.onchange = () => fill(true);
      fill(false);
      bx.querySelector("[data-t]").onclick = async (e) => {
        const b = e.target, m = bx.querySelector("[data-r]");
        busy(b, true, "Testing…"); m.className = "msg"; m.textContent = "";
        const r = await post({ md: join(ps.value, mi.value.trim()) }, "/api/test");
        busy(b, false, "Test");
        m.className = r.ok ? "msg" : "msg bad2"; m.textContent = r.ok ? "Answer: " + r.m : r.m;
      };
    }
    $("fr").onsubmit = async (e) => {
      e.preventDefault();
      const md = {};
      for (const bx of B.querySelectorAll(".box[data-k]")) md[bx.dataset.k] = join(bx.querySelector("[data-p]").value, bx.querySelector("[data-m]").value.trim());
      const body = { md };
      const bg = $("fr").querySelector("[name=big]");
      if (bg) body.big = bg.checked;
      const r = await post(body, "/api/set");
      $("rm").className = r.error ? "msg bad2" : "msg";
      $("rm").textContent = r.error || "Saved.";
    };
  };
  A.role = role;

  const settings = async () => {
    cfg = await get("/api/cfg");
    show("Settings", "set");
    const s = cfg.set, u = cfg.upd || {};
    const keys = cfg.prov.filter((p) => p.key);
    const ol = cfg.prov.find((p) => p.id === "ollama");
    const vg = (x, y) => { const a = String(x || "").replace(/^v/, "").split(".").map(Number), b = String(y || "").replace(/^v/, "").split(".").map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return false; };
    const nu = u.ready && vg(u.ready, A.S?.v);
    const ust = nu ? `Update ${esc(u.ready)} is downloaded.` : u.err ? `Last check: ${esc(u.err)}` : u.latest ? `Latest release: ${esc(u.latest)}` : "Not checked yet.";
    const TB = [["gen", "General"], ["app", "Appearance"], ["md", "Models"], ["prov", "Providers"], ["ntf", "Notifications"], ["int", "Integrations"], ["sys", "System"]];
    let tb = "gen";
    try { tb = localStorage.getItem("ao.st") || "gen"; } catch {}
    if (!TB.some(([k]) => k === tb)) tb = "gen";
    B.innerHTML = `<div class="tabs stb" role="tablist">${TB.map(([k, l]) => `<button type="button" role="tab" data-tb="${k}">${l}</button>`).join("")}</div><form id="fs">
      <div data-tab="prov" class="sec"><h4>Providers</h4><div class="box"><div class="fm" style="margin:0">
        ${keys.map((p) => `<label>${esc(p.nm)}</label><input type="password" autocomplete="off" data-key="${p.id}" placeholder="${p.has ? "saved · type to replace, clear with a single space" : "API key"}">`).join("")}
        <label>Claude Code token</label><input type="password" autocomplete="off" data-key="cc" placeholder="${cfg.prov.find((p) => p.id === "cc").tok ? "saved · type to replace, clear with a single space" : "optional, from claude setup-token"}">
        <label>or keychain item</label><input type="text" name="cckc" value="${esc(s.prov?.cc?.kc || "")}" placeholder="optional, macOS keychain service name">
        <label>Ollama address</label><input type="text" name="ollama" value="${esc(s.prov?.ollama?.base || "")}" placeholder="${esc(ol.dbase)}">
        <label>Ollama context</label><input type="number" name="octx" min="2048" step="1024" value="${s.prov?.ollama?.ctx || 32768}"><div class="hint">Tokens per request. Ollama's default of 4096 is too small for the workers.</div>
      </div></div></div>
      <div data-tab="md" class="sec"><h4>Models</h4><div class="box"><div class="fm" style="margin:0">
        ${["scout", "guard", "vet", "hunter", "repro", "fixer", "reviewer", "watcher"].map((w) => `<label>${esc(A.NM?.[w] || w)}</label><div class="ck"><span style="flex:1">${RK[w].map(([k, l]) => esc((RK[w].length > 1 ? l + ": " : "") + (A.mdn ? A.mdn(s.md[k]) : s.md[k]))).join(" · ")}</span><button type="button" data-role="${w}">Change</button></div>`).join("")}
      </div></div></div>
      <div data-tab="gen" class="sec"><h4>Sign in</h4><div class="box">${cfg.google ? `<div class="ck"><b class="ok2">Google</b> ${esc(cfg.google)} can sign in.</div><div class="acts"><button type="button" class="dng" id="gu">Disconnect Google</button></div>` : `<div class="ck">Sign in with a one-time link from <code>apollo-office login-link</code>, or connect a Google account.</div><div class="acts"><button type="button" id="gl">Connect Google account</button></div>`}</div></div>
      <div data-tab="gen" class="sec"><h4>Work</h4><div class="box"><div class="fm" style="margin:0">
        <label>Hunters</label><input type="number" name="hunters" min="0" max="12" value="${s.hunters}">
        <label>Daily token limit</label><input type="number" name="tokday" min="0" value="${s.tokday}"><div class="hint">0 = no limit.</div>
        <label>Working hours</label><div class="acts" style="margin:0;align-items:center">${tg("whon", s.wh?.on, "only work from")}<input type="time" name="whf" value="${esc(s.wh?.from || "08:00")}" style="width:auto"> to <input type="time" name="wht" value="${esc(s.wh?.to || "22:00")}" style="width:auto"></div>
      </div></div></div>
      <div data-tab="app" class="sec"><h4>Appearance</h4><div class="box"><div class="fm" style="margin:0">
        <label>Style</label><div class="thc" id="tys">${[["calm", "Calm", "Quiet and roomy, soft corners"], ["dense", "Dense", "More rows per screen, numbers in mono"], ["pixel", "Pixel", "Square and bold, like the office"]].map(([v, l, d]) => `<button type="button" data-v="${v}" class="ty-${v}"><span class="pv"><i></i><i></i><i></i></span><b>${l}</b><span>${d}</span></button>`).join("")}</div>
        <label>Theme</label><div class="seg" id="thm">${[["dark", "Dark"], ["light", "Light"], ["system", "Like the system"]].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div>
        <label>Accent</label><div class="sw2" id="acc">${window.TH.AC.map((k) => `<button type="button" data-v="${k}" title="${k}" aria-label="${k}" class="a-${k}"></button>`).join("")}</div>
        <label>Density</label><div class="seg" id="dns">${[["cozy", "Comfortable"], ["compact", "Compact"]].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div>
        <label>Motion</label><div class="seg" id="rmo">${[["0", "Full"], ["1", "Reduced"]].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div>
      </div></div></div>
      <div data-tab="ntf" class="sec"><h4>Notifications</h4><div class="box"><div class="fm" style="margin:0">
        <label>In this browser</label><label class="ck"><input type="checkbox" id="bnt"> show a desktop notification when a pull request waits for review</label>
        <div class="hint" id="bnh">Only while this tab is open somewhere.</div>
        <label>ntfy topic URL</label><input type="text" name="ntfy" value="${esc(s.ntfy)}" placeholder="https://ntfy.sh/your-secret-topic">
        <label>Discord webhook</label><input type="text" name="discord" value="${esc(s.discord)}" placeholder="https://discord.com/api/webhooks/…">
      </div><div class="acts"><button type="button" id="bt">Send test</button></div></div></div>
      <div data-tab="int" class="sec"><h4>API</h4><div class="box">
        <div class="ck">${cfg.api.on ? `<b class="ok2">On</b> token created ${new Date(cfg.api.t0).toLocaleDateString()}${cfg.api.last ? ", last used " + new Date(cfg.api.last).toLocaleString() : ", not used yet"}` : "Off. Create a token to send bug reports from your own tools (error trackers, CI, scripts)."}</div>
        <div id="atk" hidden><input type="text" readonly id="atv" style="margin-top:8px"><div class="hint" style="margin-top:6px">Copy it now, it is shown only once.</div></div>
        <pre class="df" style="margin-top:8px;white-space:pre-wrap">curl -X POST http://127.0.0.1:${cfg.api.port}/v1/report \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"repo":"owner/name","title":"Crash on empty input","body":"Steps and what happens","logs":"stack trace","src":"Sentry"}'</pre>
        <div class="acts"><button type="button" id="an">${cfg.api.on ? "Replace token" : "Create token"}</button>${cfg.api.on ? `<button type="button" class="dng" id="ao">Revoke</button>` : ""}</div></div></div>
      <div data-tab="int" class="sec"><h4>API and MCP</h4><div class="box">
        <div id="tkl"></div>
        <div class="acts"><input type="text" id="tkn" placeholder="Name, e.g. Claude Code" maxlength="40" style="flex:1;min-width:160px"><select id="tks" style="width:auto"><option value="write">Can change things</option><option value="read">Read only</option></select><button type="button" class="go" id="tkc">Create token</button></div>
        <div id="tkv" hidden><input type="text" readonly id="tkt" style="margin-top:8px"><div class="hint" style="margin-top:6px">Copy it now, it is shown only once.</div></div>
        <pre class="df" style="margin-top:10px;white-space:pre-wrap">curl http://127.0.0.1:${cfg.api.port}/v2/status -H "Authorization: Bearer $TOKEN"</pre>
        <div class="hint"><code>GET /v2/openapi.json</code> · MCP</div>
        <pre class="df" style="margin-top:6px;white-space:pre-wrap" id="tkm"></pre></div></div>
      <div data-tab="int" class="sec"><h4>Error trackers</h4><div class="box">
        <div class="ck">${cfg.hook.on ? `<b class="ok2">On</b> link created ${new Date(cfg.hook.t0).toLocaleDateString()}` : "Off. Create a link to let Sentry or GlitchTip send errors as reports."}</div>
        <div id="htk" hidden><input type="text" readonly id="htv" style="margin-top:8px"><div class="hint" style="margin-top:6px">Copy it now, the key is shown only once. Replace owner/name with the repository.</div></div>
        <div class="acts"><button type="button" id="hn">${cfg.hook.on ? "Replace link" : "Create link"}</button>${cfg.hook.on ? `<button type="button" class="dng" id="ho">Revoke</button>` : ""}</div></div></div>
      <div data-tab="sys" class="sec"><h4>Updates</h4><div class="box">${tg("updates", s.updates, "install updates automatically when the office is idle")}<div class="msg" id="um">${ust}</div><div class="acts"><button type="button" id="uc">Check now</button>${nu ? `<button type="button" class="pri" id="ua">Install and restart</button>` : ""}</div></div></div>
      <div data-tab="sys" class="sec"><h4>Export and import</h4><div class="box"><div class="ck">Settings, repositories, machines and models as a JSON file. API keys, tokens, logins and notification addresses are not included.</div>
        <div class="acts"><button type="button" id="ex">Export</button><button type="button" id="im">Import…</button><input type="file" id="imf" accept="application/json,.json" hidden></div><div class="msg" id="xm"></div></div></div>
      <div data-tab="sys" class="sec"><h4>This installation</h4><div class="box"><div class="fm" style="margin:0">
        <label>Start at login</label>${tg("auto", cfg.auto, "start ApolloOffice when I log in")}
        <label>Data folder</label><span class="mono" style="font-size:12px;word-break:break-all">${esc(cfg.data)}</span>
        <label>Version</label><span class="mono" style="font-size:12px">${esc(A.S?.v || "")} · ${esc(cfg.asset)}</span>
      </div></div></div>
      <div class="sbar" id="sbar" hidden><span id="sm">Unsaved changes</span><span class="sp"></span><button type="button" id="sx">Discard</button><button class="pri">Save</button></div></form>
      <div data-tab="sys" class="sec dz"><h4>Danger zone</h4><div class="box">
        <div class="dzr"><div><b>Sign out everywhere</b><div class="hint">Ends every session, including this one. You need a new link from <code>apollo-office login-link</code>.</div></div><button type="button" class="dng" data-dz="logout">Sign out everywhere</button></div>
        <div class="dzr"><div><b>Clear job history</b><div class="hint">Deletes finished and dropped jobs and their log. Pull requests and costs stay.</div></div><button type="button" class="dng" data-dz="history">Clear history</button></div>
        <div class="dzr"><div><b>Reset settings</b><div class="hint">Models, limits, budgets, notifications and paused workers go back to defaults. Keys, repositories and machines stay.</div></div><button type="button" class="dng" data-dz="reset">Reset settings</button></div>
        <div class="dzr"><div><b>Delete all data</b><div class="hint">Deletes repositories, machines, jobs, pull request history, costs, settings and stored API keys. Nothing on GitHub changes. Type <code>delete</code> to confirm.</div><input type="text" id="dzw" placeholder="delete" autocomplete="off" style="margin-top:6px;max-width:160px"></div><button type="button" class="dng" data-dz="wipe">Delete everything</button></div>
        <div class="msg" id="dzm"></div></div></div>`;
    const stab = (k) => {
      tb = k;
      try { localStorage.setItem("ao.st", k); } catch {}
      for (const b of B.querySelectorAll("[data-tb]")) b.classList.toggle("on", b.dataset.tb === k);
      for (const x of B.querySelectorAll("[data-tab]")) x.hidden = x.dataset.tab !== k;
    };
    for (const b of B.querySelectorAll("[data-tb]")) b.onclick = () => stab(b.dataset.tb);
    stab(tb);
    const ign = new Set(["thm", "tys", "bnt", "imf", "atv", "htv", "dzw"]);
    const dirty = (e) => { if (ign.has(e.target.id)) return; $("sbar").hidden = false; $("sbar").className = "sbar"; $("sm").className = ""; $("sm").textContent = "Unsaved changes"; };
    $("fs").addEventListener("input", dirty);
    $("fs").addEventListener("change", dirty);
    $("sx").onclick = () => settings();
    const seg = (id, cur, fn) => { const el = $(id); for (const b of el.querySelectorAll("[data-v]")) { b.classList.toggle("on", b.dataset.v === cur); b.onclick = () => { fn(b.dataset.v); for (const x of el.querySelectorAll("[data-v]")) x.classList.toggle("on", x === b); }; } };
    seg("thm", window.TH.get(), (v) => window.TH.set(v));
    seg("acc", window.TH.pref("ac", "raspberry"), (v) => window.TH.setPref("ac", v));
    seg("tys", window.TH.pref("ty", "calm"), (v) => { window.TH.setPref("ty", v); const a = window.TH.TY[v]; window.TH.setPref("ac", a); for (const x of $("acc").querySelectorAll("[data-v]")) x.classList.toggle("on", x.dataset.v === a); });
    seg("dns", window.TH.pref("dn", "cozy"), (v) => window.TH.setPref("dn", v));
    seg("rmo", window.TH.pref("rm", "0"), (v) => window.TH.setPref("rm", v));
    try { $("bnt").checked = localStorage.getItem("ao.nt") === "1" && "Notification" in window && Notification.permission === "granted"; } catch {}
    if (!("Notification" in window)) { $("bnt").disabled = true; $("bnh").textContent = "This browser does not support notifications."; }
    $("bnt").onchange = async (e) => {
      let on = e.target.checked;
      if (on && Notification.permission !== "granted") on = (await Notification.requestPermission()) === "granted";
      e.target.checked = on;
      if (!on && e.target.checked !== on) $("bnh").textContent = "The browser blocked notifications for this page.";
      try { localStorage.setItem("ao.nt", on ? "1" : "0"); } catch {}
    };
    $("ex").onclick = async () => {
      const d = await get("/api/export");
      const u = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = u; a.download = "apollo-office-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      $("xm").className = "msg"; $("xm").textContent = "Exported.";
    };
    $("im").onclick = () => $("imf").click();
    $("imf").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      let d;
      try { d = JSON.parse(await f.text()); } catch { $("xm").className = "msg bad2"; $("xm").textContent = "This file is not valid JSON."; return; }
      const r = await post(d, "/api/import");
      if (r.error) { $("xm").className = "msg bad2"; $("xm").textContent = r.error; return; }
      await settings();
      $("xm").className = "msg"; $("xm").textContent = r.m;
    };
    for (const b of B.querySelectorAll("[data-dz]")) b.onclick = async () => {
      const op = b.dataset.dz, m = $("dzm");
      if (op === "wipe" && $("dzw").value.trim() !== "delete") { m.className = "msg bad2"; m.textContent = "Type delete into the field first."; return; }
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to confirm"; return; }
      busy(b, true, "Working…");
      const r = await post({ op, sure: op === "wipe" ? "delete" : undefined }, "/api/danger");
      if (r.error) { busy(b, false, "Try again"); b.dataset.sure = ""; m.className = "msg bad2"; m.textContent = r.error; return; }
      if (op === "logout") { location.reload(); return; }
      if (op === "wipe") { hide(); location.reload(); return; }
      await settings();
      $("dzm").className = "msg"; $("dzm").textContent = op === "history" ? "Job history cleared." : "Settings reset.";
    };
    const send = async (test) => {
      const f = $("fs"), v = fv(f);
      for (const e of f.querySelectorAll("[data-key]")) {
        if (!e.value) continue;
        const r = await post({ id: e.dataset.key, key: e.value.trim() }, "/api/prov");
        if (r.error) { $("sbar").hidden = false; $("sm").className = "bad2"; $("sm").textContent = r.error; return; }
      }
      const r = await post({ wh: { on: v.whon, from: v.whf, to: v.wht }, hunters: v.hunters, tokday: v.tokday, ntfy: v.ntfy, discord: v.discord, auto: v.auto, updates: v.updates, ollama: v.ollama, octx: v.octx, cckc: v.cckc, test }, "/api/set");
      if (r.error) { $("sbar").hidden = false; $("sm").className = "bad2"; $("sm").textContent = r.error; return; }
      await settings();
      const sb = $("sbar");
      sb.hidden = false; sb.className = "sbar done"; $("sm").textContent = test ? "Saved and test sent." : "Saved.";
      setTimeout(() => { if (sb.isConnected && sb.classList.contains("done")) sb.hidden = true; }, 1800);
    };
    $("fs").onsubmit = (e) => { e.preventDefault(); send(false); };
    for (const b of B.querySelectorAll("[data-role]")) b.onclick = () => role(b.dataset.role);
    $("bt").onclick = () => send(true);
    if ($("gl")) $("gl").onclick = async () => { const r = await post({ op: "link" }, "/api/google"); if (r.url) location.href = r.url; };
    if ($("gu")) $("gu").onclick = async (e) => { if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again to disconnect"; return; } await post({ op: "unlink" }, "/api/google"); settings(); };
    $("an").onclick = async (e) => {
      if (cfg.api.on && e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again, the old token stops working"; return; }
      const r = await post({ op: "new" }, "/api/apitok");
      if (!r.tok) return;
      await settings();
      $("atk").hidden = false; $("atv").value = r.tok; $("atv").select();
    };
    const tk = async (r) => {
      const d = r || await get("/api/toks");
      $("tkl").innerHTML = (d.toks || []).length ? `<div class="tw"><table class="tb2 ro"><thead><tr><th>Name</th><th>Access</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>${d.toks.map((t) => `<tr><td>${esc(t.n)}</td><td>${t.sc === "read" ? "read only" : "can change"}</td><td>${new Date(t.t0).toLocaleDateString()}</td><td>${t.last ? new Date(t.last).toLocaleString() : "never"}</td><td class="n"><button type="button" class="dng sm2" data-tkd="${esc(t.id)}">Revoke</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="hint" style="margin:0">No tokens yet.</div>`;
      if (d.mcp) $("tkm").textContent = `claude mcp add apollo-office -e APOLLO_OFFICE_TOKEN=$TOKEN -- ${d.mcp.replace(" --token <token>", "")}\n\nor over HTTP: http://127.0.0.1:${cfg.api.port}/mcp with header Authorization: Bearer $TOKEN`;
      for (const b of $("tkl").querySelectorAll("[data-tkd]")) b.onclick = async (e) => { if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again"; return; } tk(await post({ op: "del", id: b.dataset.tkd }, "/api/toks")); };
    };
    tk();
    $("tkc").onclick = async () => { const r = await post({ op: "new", n: $("tkn").value, sc: $("tks").value }, "/api/toks"); if (!r.token) return; $("tkn").value = ""; $("tkv").hidden = false; $("tkt").value = r.token; $("tkt").select(); tk(r); };
    $("hn").onclick = async (e) => {
      if (cfg.hook.on && e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again, the old link stops working"; return; }
      const r = await post({ op: "new" }, "/api/hooktok");
      if (!r.tok) return;
      await settings();
      $("htk").hidden = false; $("htv").value = `http://127.0.0.1:${cfg.api.port}/v1/hook?repo=owner/name&key=${r.tok}`; $("htv").select();
    };
    if ($("ho")) $("ho").onclick = async (e) => { if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again to revoke"; return; } await post({ op: "off" }, "/api/hooktok"); settings(); };
    if ($("ao")) $("ao").onclick = async (e) => { if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Click again to revoke"; return; } await post({ op: "off" }, "/api/apitok"); settings(); };
    $("uc").onclick = async (e) => { busy(e.target, true, "Checking…"); const r = await post({ op: "check" }, "/api/update"); await settings(); $("um").textContent = r.ok ? (r.r.new ? `Update ${r.r.latest} downloaded.` : `Up to date (latest ${r.r.latest}).`) : r.m; };
    if ($("ua")) $("ua").onclick = async (e) => { busy(e.target, true, "Restarting…"); await post({ op: "apply" }, "/api/update"); setTimeout(() => location.reload(), 6000); };
  };

  const costs = async () => {
    const c = await get("/api/cost");
    if (c.error) return;
    show("Costs", "cost");
    const t = c.today || {}, px = c.px || {};
    const tb = (h, rs) => `<div class="tw"><table class="tb2 ro"><thead><tr>${h.map((x) => `<th class="${x[1] || ""}">${x[0]}</th>`).join("")}</tr></thead><tbody>${rs.join("")}</tbody></table></div>`;
    const rate = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";
    const d14 = c.days.reduce((s, d) => s + (d.usd || 0), 0), v14 = c.days.reduce((s, d) => s + (d.val || 0), 0);
    const dd = c.days.slice(0, 14).reverse(), mx = Math.max(0.01, ...dd.map((d) => (d.usd || 0) + (d.val || 0)));
    const nil = `<div class="emp"><b>Nothing yet</b><span>Costs show up after the first jobs ran.</span></div>`;
    B.innerHTML = ph(`API keys are billed per token. Claude Code and Codex logins cost nothing extra, their value is shown for comparison.${t.unk ? ` ${t.unk} calls today had no known price.` : ""}`)
      + kpi([[usd(t.usd || 0), "API today"], [usd(t.val || 0), "login value today"], [usd(d14), "API, 14 days"], [c.budday ? usd(c.budday) : "none", "daily budget"]])
      + (c.hints.length ? `<section class="sec2"><h3>Cheaper models <span class="mut">${c.hints.length} ${c.hints.length === 1 ? "hint" : "hints"}</span></h3><div class="lst">${c.hints.slice(0, 3).map((h) => `<div class="hr2"><div><span class="t1">${esc(h)}</span></div></div>`).join("")}${c.hints.length > 3 ? `<details class="more"><summary>Show ${c.hints.length - 3} more</summary>${c.hints.slice(3).map((h) => `<div class="hr2"><div><span class="t1">${esc(h)}</span></div></div>`).join("")}</details>` : ""}</div></section>` : "")
      + `<section class="sec2"><h3>Last 14 days <span class="mut">${usd(d14)} API · ${usd(v14)} login value</span></h3>${dd.length ? `<div class="cch">${dd.map((d) => `<div title="${esc(d.day)}: ${usd(d.usd)} API, ${usd(d.val)} login value"><i class="v" style="height:${((d.val || 0) / mx) * 100}%"></i><i class="u" style="height:${((d.usd || 0) / mx) * 100}%"></i><span>${esc(d.day.slice(8))}</span></div>`).join("")}</div><div class="lgd"><span><i class="u"></i>API</span><span><i class="v"></i>Login value</span></div>` : nil}</section>`
      + `<section class="sec2"><h3>Repositories <span class="mut">30 days</span></h3>${c.repos.length ? tb([["Repository"], ["Jobs", "n"], ["API", "n"], ["Login value", "n"]], c.repos.map((r) => `<tr><td>${esc(r.repo)}</td><td class="n">${r.jobs}</td><td class="n">${usd(r.usd)}</td><td class="n">${usd(r.val)}</td></tr>`)) : nil}</section>`
      + `<section class="sec2"><h3>Models per worker <span class="mut">90 days</span></h3>${c.stats.length ? tb([["Repository"], ["Worker"], ["Model"], ["Jobs", "n"], ["PRs", "n"], ["Merged", "n"], ["Rejected", "n"], ["Per job", "n"], ["Per merge", "n"]], c.stats.map((r) => `<tr><td>${esc(r.repo)}</td><td>${esc(A.NM?.[r.w] || r.w)}</td><td>${esc(r.nm)}${r.sub ? ` <span class="mut">login</span>` : ""}</td><td class="n">${r.jobs}</td><td class="n">${r.prs}</td><td class="n">${r.mg} <span class="mut">${rate(r.mg, r.prs)}</span></td><td class="n">${r.cl}</td><td class="n">${usd(r.usd == null ? null : r.usd / r.jobs)}</td><td class="n">${r.mg && r.usd != null ? usd(r.usd / r.mg) : "–"}</td></tr>`)) : nil}</section>`
      + `<section class="sec2"><h3>Budget and prices</h3><div class="box"><form id="fb" class="fm"><label>Daily budget</label><input type="number" name="budday" min="0" step="0.01" value="${c.budday || 0}"><div class="hint">USD for API keys, 0 = no limit.</div>
        <label>Prices</label><textarea id="px" placeholder="model input output, e.g. gpt-5.5 5 30">${esc(Object.entries(px).map(([k, v]) => k + " " + v.join(" ")).join("\n"))}</textarea><div class="hint">USD per million tokens, one model per line: <code>model input output</code> or <code>model input cache-write cache-read output</code>. Overrides the built-in prices. Claude Code reports its own cost.</div></form>
        <div class="acts"><button class="pri" id="bb">Save</button><span class="msg" id="bm"></span></div></div></section>`;
    $("fb").onsubmit = (e) => e.preventDefault();
    $("bb").onclick = async () => {
      const o = {}, bad = [];
      for (const l of $("px").value.split("\n").map((x) => x.trim()).filter(Boolean)) {
        const [k, ...v] = l.split(/\s+/), n = v.map(Number);
        if ((n.length === 2 || n.length === 4) && n.every((x) => isFinite(x) && x >= 0)) o[k] = n; else bad.push(k);
      }
      if (bad.length) { $("bm").className = "msg bad2"; $("bm").textContent = "Check the price line for " + bad.join(", "); return; }
      const r = await post({ budday: Number($("fb").budday.value), px: o }, "/api/set");
      $("bm").className = r.error ? "msg bad2" : "msg"; $("bm").textContent = r.error || "Saved.";
    };
  };

  const health = async (f) => {
    show("Health", "health");
    if (!A.H || f) { B.innerHTML = `<div class="empty">Checking…</div>`; await A.hlt(f); }
    const H = A.H || {};
    const row = (ok, k, m) => `<div class="hr2"><i class="dot2 ${ok ? "up" : "dn"}"></i><div><b>${esc(k || (ok ? "OK" : "Problem"))}</b><span>${esc(m)}</span></div></div>`;
    const sec = (t, x) => `<section class="sec2"><h3>${t}</h3><div class="lst">${x}</div></section>`;
    const ls = (v) => (Array.isArray(v.m) ? v.m.map((y) => row(y.ok, y.k, y.m)).join("") : row(v.ok, "", v.m));
    B.innerHTML = ph(H.t ? `Checked ${new Date(H.t).toLocaleTimeString()}. The office checks again every 5 minutes.` : "", `<button id="hr">Check now</button>`) + (H.gh ? sec("GitHub", row(H.gh.ok, "", H.gh.m)) + sec("AI providers in use", ls(H.ai)) + sec("Docker", row(H.docker.ok, "", H.docker.m)) + sec("Machines", ls(H.hosts)) : `<div class="emp"><b>Could not check</b></div>`);
    $("hr").onclick = () => health(true);
  };
  A.health = health;

  const job = async (id) => {
    const j = await get("/api/job?id=" + id);
    if (j.error) return;
    jid = id;
    show(j.st === "approve" ? "Review pull request" : "Job " + id, "job");
    const tag = (j.repo.split("/")[1] || j.repo) + (j.num ? "#" + j.num : "");
    const cs = j.cost && j.cost.n ? `<div class="msg">Cost: ${j.cost.usd != null ? usd(j.cost.usd) + " API" : ""}${j.cost.usd != null && j.cost.val != null ? " · " : ""}${j.cost.val != null ? usd(j.cost.val) + " login value" : ""}${j.cost.usd == null && j.cost.val == null ? "unknown" : ""} · ${Math.round((j.cost.ti || 0) / 1000)}k in, ${Math.round((j.cost.tou || 0) / 1000)}k out</div>` : "";
    const ev = (j.ev || []).map((e) => `<div><span class="tm">${new Date(e.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><span>${esc(e.w)}</span><span>${esc(e.m)}</span></div>`).join("");
    if (j.st === "approve") {
      B.innerHTML = `<div class="sec"><div class="box"><div class="hd2"><b>${esc(j.repo)}${j.num ? " #" + j.num : j.ext ? " (reported by " + esc(j.ext) + ")" : " (found by Hunter)"}</b>${j.url ? `<a class="a" href="#" data-u="${esc(j.url)}">${j.num ? "open issue" : "open repository"}</a>` : ""}</div><div class="msg">Built and tested on ${esc(j.h || "")}. Nothing is on GitHub yet.</div>${cs}</div></div>
      <div class="sec"><h4>Pull request</h4><input type="text" id="pt" value="${esc(j.pt || j.title)}"><textarea id="pb" style="min-height:220px;margin-top:8px">${esc(j.pb || "")}</textarea></div>
      ${j.proof ? `<div class="sec"><h4>Proof</h4><pre class="df">${esc((j.proof.a || "") + "\n\n" + (j.proof.b || ""))}</pre></div>` : ""}
      <div class="sec"><h4>Diff</h4>${dview(j.df)}</div>
      <div class="acts"><button class="pri" id="ba">Submit pull request</button><button class="dng" id="bd">Drop</button></div><div class="msg" id="jm"></div>
      <div class="sec" style="margin-top:20px"><h4>Log</h4><div class="log">${ev}</div></div>`;
      $("ba").onclick = async () => {
        busy($("ba"), true, "Submitting…");
        const r = await post({ a: "approve", id, pt: $("pt").value, pb: $("pb").value });
        if (r.error) { busy($("ba"), false, "Submit pull request"); $("jm").className = "msg bad2"; $("jm").textContent = r.error; return; }
        A.apply(r); hide();
      };
      $("bd").onclick = async () => {
        if ($("bd").dataset.sure !== "1") { $("bd").dataset.sure = "1"; $("bd").textContent = "Click again to drop"; return; }
        A.apply(await post({ a: "drop", id })); hide();
      };
      return;
    }
    B.innerHTML = `<div class="sec"><div class="box"><div class="hd2"><b>${esc(j.title)}</b><span class="pill">${esc(j.st)}</span></div><div class="msg">${esc(j.repo)} ${esc(tag)} · ${esc(j.kind)}${j.h ? " · " + esc(j.h) : ""}\n${esc(j.why || "")}</div>${cs}
      <div class="acts">${j.url ? `<button data-u="${esc(j.url)}">Open on GitHub</button>` : ""}${!["done", "drop"].includes(j.st) ? `<button class="dng" data-d="${id}">Drop</button>` : ""}${j.st === "drop" && j.kind === "fix" ? `<button data-rq="${id}">Try again</button>` : ""}</div></div></div>
      ${j.df ? `<div class="sec"><h4>Diff</h4>${dview(j.df)}</div>` : ""}
      <div class="sec"><h4>Log</h4><div class="log">${ev || `<div class="empty">nothing yet</div>`}</div></div>`;
  };
  A.job = job;

  const setup = async () => {
    ck = ck || (await get("/api/check"));
    cfg = await get("/api/cfg");
    show("Set up ApolloOffice", "setup");
    const row = (k, l) => `<div class="ck" style="margin:4px 0"><b class="${ck[k].ok ? "ok2" : "bad2"}">${ck[k].ok ? "ok" : "missing"}</b> ${l}: ${esc(ck[k].m)}</div>`;
    const hs = cfg.hosts.length, rs = cfg.repos.length;
    B.innerHTML = `<div class="sec"><h4>1 · Tools</h4><div class="box">${row("git", "git")}${row("bash", "bash")}${row("gh", "GitHub CLI")}${row("claude", "Claude Code")}${row("docker", "Docker")}<div class="acts"><button id="br">Check again</button></div></div></div>
      <div class="sec"><h4>2 · Where code is built</h4><div class="box"><div class="ck"><b class="${hs ? "ok2" : "bad2"}">${hs ? "ok" : "todo"}</b> ${hs ? hs + " machine(s)" : "Add this computer (Docker recommended)."}</div><div class="acts"><button id="bh">${hs ? "Machines" : "Add machine"}</button></div></div></div>
      <div class="sec"><h4>3 · Repositories</h4><div class="box"><div class="ck"><b class="${rs ? "ok2" : "bad2"}">${rs ? "ok" : "todo"}</b> ${rs ? rs + " repository(s)" : "Add a GitHub repository to work on."}</div><div class="acts"><button id="bp">${rs ? "Repos" : "Add repository"}</button></div></div></div>
      <div class="msg">Workers use your own Claude Code login and your own GitHub account. Pull requests wait for your approval unless you change that per repository.</div>`;
    $("br").onclick = async () => { ck = await get("/api/check"); setup(); };
    $("bh").onclick = hosts;
    $("bp").onclick = repos;
  };

  const cz = () => {
    const P = $("cz"), F = window.AO.surf, U = window.AO.furn;
    const close = () => { P.hidden = true; document.body.classList.remove("ed"); U.edit(false); U.on(() => {}); document.removeEventListener("keydown", esc0); };
    const esc0 = (e) => { if (e.key === "Escape" && !U.cur().tool && $("dr").hidden) close(); };
    if (!P.hidden) return close();
    const NMS = { check: "Checker", plain: "Plain", planks: "Planks", tiles: "Tiles", parquet: "Parquet", carpet: "Carpet", stripes: "Stripes", panels: "Panels", brick: "Brick", dots: "Dots", boards: "Boards" };
    const TT = { floor: "Floor", wall: "Wall" };
    let tm;
    const save = () => { clearTimeout(tm); tm = setTimeout(() => post({ office: { floor: F.get("floor"), wall: F.get("wall") } }, "/api/set").catch(() => {}), 400); };
    const prev = () => { for (const b of P.querySelectorAll("[data-p]")) { const [x, y] = F.eff(b.dataset.k, true); F.pat(b.querySelector("canvas").getContext("2d"), b.dataset.p, x, y, 0, 0, 48, 24); } };
    const sec = (k) => {
      const f = F.get(k), [ca, cb] = F.eff(k);
      return `<h5><span>${TT[k]}</span></h5>
        <div class="pg">${F.pats[k].map((p) => `<button type="button" data-k="${k}" data-p="${p}" class="${f.p === p ? "on" : ""}"><canvas width="48" height="24"></canvas>${NMS[p]}</button>`).join("")}</div>
        <div class="cl"><label><input type="color" data-k="${k}" data-c="a" value="${ca}"> Base</label><label><input type="color" data-k="${k}" data-c="b" value="${cb}"> ${k === "wall" ? "Trim" : "Pattern"}</label></div>`;
    };
    const draw = () => {
      const cu = U.cur();
      P.innerHTML = `<h5><span>Customize office</span></h5>
        <h5><span>Room</span><b id="czSz" class="k"></b></h5>
        <div class="cl rs"><label>Width <input type="range" id="czW" min="30" max="80"></label></div>
        <div class="cl rs"><label>Depth <input type="range" id="czH" min="16" max="40"></label></div>
        <h5><span>Furniture</span></h5>
        <div class="pg fu">${Object.entries(U.cat).map(([k, f]) => `<button type="button" data-f="${k}" class="${cu.tool === k ? "on" : ""}"><canvas width="96" height="60"></canvas>${f.n}</button>`).join("")}</div>
        <div class="ac"><button type="button" id="czU" ${cu.undo ? "" : "disabled"} title="Ctrl+Z">Undo</button><button type="button" id="czRd" ${cu.redo ? "" : "disabled"} title="Ctrl+Shift+Z">Redo</button><span class="sp"></span><button type="button" id="czClr" ${cu.n ? "" : "disabled"}>Clear all</button></div>
        ${sec("wall")}${sec("floor")}
        <div class="ac"><button type="button" id="czR">Reset</button><button type="button" id="czD">Done</button></div>`;
      prev();
      for (const b of P.querySelectorAll("[data-f]")) {
        U.prev(b.querySelector("canvas").getContext("2d"), b.dataset.f, 96, 60);
        let dg = false;
        b.onpointerdown = (e) => {
          if (e.button) return;
          dg = false;
          const sx = e.clientX, sy = e.clientY;
          const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) { dg = true; off(); U.grab(b.dataset.f); } };
          const off = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", off); };
          window.addEventListener("pointermove", mv);
          window.addEventListener("pointerup", off);
        };
        b.onclick = () => { if (!dg) U.tool(b.dataset.f); dg = false; };
        b.ondragstart = (e) => e.preventDefault();
      }
      const rm = U.room(), sz = () => { const r = U.room(); $("czSz").textContent = `${r.w} × ${r.h}`; $("czW").value = r.w; $("czH").value = r.h; };
      $("czW").min = Math.max(30, rm.min[0]); $("czH").min = Math.max(16, rm.min[1]);
      sz();
      $("czW").oninput = () => { U.size(+$("czW").value, U.room().h); sz(); };
      $("czH").oninput = () => { U.size(U.room().w, +$("czH").value); sz(); };
      $("czU").onclick = () => U.undo();
      $("czRd").onclick = () => U.redo();
      $("czClr").onclick = () => { if (confirm("Remove all furniture?")) U.clear(); };
      for (const b of P.querySelectorAll("[data-p]")) b.onclick = () => { F.set(b.dataset.k, { ...F.get(b.dataset.k), p: b.dataset.p }); save(); draw(); };
      for (const i of P.querySelectorAll("[data-c]")) i.oninput = () => { F.set(i.dataset.k, { ...F.get(i.dataset.k), [i.dataset.c]: i.value }); save(); prev(); };
      $("czR").onclick = () => { F.load({}); save(); draw(); };
      $("czD").onclick = close;
    };
    U.on(draw);
    U.edit(true);
    document.body.classList.add("ed");
    document.addEventListener("keydown", esc0);
    draw();
    P.hidden = false;
  };
  $("bCz").onclick = cz;
  A.hosts = hosts;
  A.drawer = (t, html) => { show(t, "run"); B.innerHTML = html; return B; };
  A.drawerOpen = () => !dr.hidden && cur === "run";
  A.repos = repos;
  A.costs = costs;
  A.settings = settings;
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s" && cur === "set" && document.body.classList.contains("pgm") && $("sbar") && !$("sbar").hidden) { e.preventDefault(); $("fs").requestSubmit(); }
  });
  let asked = false;
  A.onState = (s) => {
    if (!asked && (s.nr === 0 || !s.hs.length)) { asked = true; setup(); }
    if (cur === "job" && jid && !dr.hidden) {
      const q = s.q.find((x) => x.id === jid);
      if (!q && T.textContent.startsWith("Review")) hide();
    }
  };
})();
