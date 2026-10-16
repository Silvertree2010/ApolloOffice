(() => {
const A = window.A, L = A.L, $ = A.$, esc = A.esc, T = A.T, FS = A.FS;

const toast = (s, bad) => { const t = $("tst"); t.textContent = s; t.className = bad ? "bad" : ""; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), bad ? 4500 : 2400); };
A.toast = toast;
const fail = (e) => toast(e.message || String(e), true);
A.fail = fail;

const place = (el, at) => {
  if (innerWidth <= 720 || !at) return;
  let sx, sy;
  if (at.fx !== undefined) [sx, sy] = A.toS(at.fx + 16, at.fy - 6);
  else if (at.k) [sx, sy] = A.toS((at.x + FS[at.k][0]) * T + 4, at.y * T);
  else [sx, sy] = [at.sx || innerWidth / 2, at.sy || 80];
  el.style.left = Math.min(innerWidth - el.offsetWidth - 8, Math.max(8, sx + 8)) + "px";
  el.style.top = Math.min(innerHeight - el.offsetHeight - 8, Math.max(52, sy - 20)) + "px";
};
let boxAt = null;
const box = (html, at, cls) => {
  const b = $("bx");
  if (!/[?&]shot\b/.test(location.search)) $("dlg").hidden = true;
  b.className = "bx" + (cls ? " " + cls : "");
  b.innerHTML = `<span class="ar" data-x>✕</span>` + html;
  b.hidden = false; b.onclick = null; b.onchange = null; b.oninput = null;
  boxAt = at;
  b.style.left = "50%"; b.style.top = "56px";
  if (!cls || !cls.includes("mid")) place(b, at);
  if (!b.dataset.xl) { b.dataset.xl = 1; b.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) close(); }); }
  return b;
};
const close = () => { $("bx").hidden = true; A.sel = null; boxAt = null; };
A.box = box; A.close = close;
A.replace = () => { const b = $("bx"); if (!b.hidden && boxAt && boxAt.fx !== undefined) place(b, boxAt); };

const confirmBox = (title, lines, ok, at) => new Promise((res) => {
  const b = box(`<h3>${esc(title)}</h3><div class="mt">${"Please read carefully. This happens when you confirm:"}</div><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><div class="acts"><button data-y>${esc(ok || "Yes, allow")}</button><button class="l" data-n>${"Cancel"}</button></div>`, at, "mid");
  b.onclick = (e) => { if (e.target.closest("[data-y]")) { close(); res(true); } else if (e.target.closest("[data-n],[data-x]")) { close(); res(false); } };
});
A.confirmBox = confirmBox;

const tyOf = (id) => (A.types ? A.types.ty.find((t) => t.id === id) : null);
A.loadTypes = async () => { A.types = await A.api("/api/types"); return A.types; };

const wName = (id) => { const x = A.wInfo(id); return x ? x.nm : "#" + id; };
const stTxt = (lv) => ({ work: "working", idle: "waiting for work", off: "has free", hold: "paused", wait: "waiting for an answer" })[lv && lv.st] || "waiting for work";

A.wBox = async (e) => {
  A.sel = e;
  const i = e.i;
  let d;
  try { d = await A.api("/api/worker/" + i.id); } catch (x) { return fail(x); }
  const w = d.w, lv = d.live || {}, cur = (d.tk || []).find((t) => t.st === "run");
  const b = box(`<h3>${esc(w.nm)} <small>${esc(w.tn || w.ty)}</small></h3>
    <div class="rw"><span>${"Status"}</span><span>${stTxt(lv)}</span></div>
    ${cur ? `<div class="rw"><span>${"Task"}</span><span>${esc(cur.ti)}</span></div>` : ""}
    ${lv.say ? `<div class="rw"><span>${"Last"}</span><span>${esc(lv.say.slice(0, 120))}</span></div>` : ""}
    <div class="rw"><span>${"Today"}</span><span>${(d.us && d.us.tok) || 0} Tokens${d.us && d.us.usd ? " · " + d.us.usd.toFixed(2) + " $" : ""}</span></div>
    <div class="rw"><span>${"Takes tasks from"}</span><span>${(w.cfg.from || []).map((f) => esc(wName(f.w ?? f))).join(", ") || "only from you"}</span></div>
    <div class="acts"><button data-t>${"Give task"}</button><button class="l" data-f>${A.fol === e ? "Unfollow" : "Follow"}</button><button class="l" data-h>${w.hold ? "Next" : "Pause"}</button><button class="l" data-s>${"Settings"}</button></div>
    <details><summary>${"Recent tasks"}</summary><div class="li">${(d.tk || []).slice(0, 12).map((t) => `<div data-k="${t.id}"><span>${esc(t.ti.slice(0, 40))}</span><span class="mt">${L(t.st)}</span></div>`).join("") || `<span class="mt">${"none yet"}</span>`}</div></details>`, e);
  b.onclick = async (ev) => {
    const ds = ev.target.closest("button,[data-k]");
    if (!ds) return;
    const D = ds.dataset;
    if ("t" in D) return A.taskBox({ wk: w.id, nm: w.nm }, e);
    if ("f" in D) { A.fol = A.fol === e ? null : e; close(); }
    if ("h" in D) { try { await A.api("/api/worker/" + w.id, { hold: !w.hold }); A.poll(); A.wBox(e); } catch (x) { fail(x); } }
    if ("s" in D) return A.wSet(w.id, e);
    if (D.k) return A.taskView(+D.k);
  };
};

A.taskBox = (to, at) => {
  const ex = A.questOn && A.questOn() && A.quest.s === 3 ? "Look at the files in your folder and summarize in three sentences what they are about." : "";
  const b = box(`<h3>${"Task for"} ${esc(to.nm)}</h3>
    <div class="mt">${to.wk ? "What should " + esc(to.nm) + " do?" : "The matching free worker on this floor takes over."}</div>
    <p><input type="text" class="wd" id="tTi" placeholder="${"Short title"}" value="${esc(ex ? "First summary" : "")}"></p>
    <textarea id="tTx" placeholder="${"What exactly? Folders, links, expectations …"}">${esc(ex)}</textarea>
    <div class="rw"><span>${"Priority"}</span><span><select id="tPr">${[1, 2, 3, 4, 5].map((p) => `<option value="${p}"${p === 3 ? " selected" : ""}>${p}${p === 5 ? " " + "(urgent)" : p === 1 ? " " + "(someday)" : ""}</option>`).join("")}</select></span></div>
    <div class="acts"><button data-go>${"Give task"}</button></div>`, at, "wide");
  setTimeout(() => $("tTi") && $("tTi").focus(), 30);
  b.onclick = async (e) => {
    if (!e.target.closest("[data-go]")) return;
    const ti = $("tTi").value.trim();
    if (!ti) return toast("Title missing", 1);
    try {
      await A.api("/api/task", { ti, tx: $("tTx").value, prio: +$("tPr").value, wk: to.wk, fl: to.fl });
      close(); toast("Task given"); A.poll();
    } catch (x) { fail(x); }
  };
};

A.taskView = async (id) => {
  let d;
  try { d = await A.api("/api/task/" + id); } catch (x) { return fail(x); }
  const t = d.t;
  if (t.st === "done" && A.quest && A.quest.s === 5) A.questSet({ read: 1 });
  const files = (t.files || []).map((n) => `<a href="/api/file?fl=${t.fl}&n=${encodeURIComponent(n)}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ");
  const b = box(`<h3>#${t.id} ${esc(t.ti.slice(0, 60))} <small>${L(t.st)}</small></h3>
    <div class="rw"><span>${"From"}</span><span>${esc(t.src === "user" ? "you" : t.src === "hook" ? "Webhook" : t.src === "sched" ? "Schedule" : wName(+t.src.slice(2)))}</span></div>
    <div class="rw"><span>${"On"}</span><span>${t.wk ? esc(wName(t.wk)) : "the office"}</span></div>
    ${t.tx ? `<details><summary>${"Task"}</summary><pre>${esc(t.tx)}</pre></details>` : ""}
    ${t.res ? `<pre>${esc(t.res)}</pre>` : `<div class="mt">${t.st === "wait" ? "waiting for a free worker" : t.st === "run" ? "running now" : ""}</div>`}
    ${files ? `<div class="rw"><span>${"Files"}</span><span>${files}</span></div>` : ""}
    <details><summary>${"History"}</summary><div class="li">${(d.ev || []).map((e) => `<div><span>${esc(e.m.slice(0, 140))}</span><span class="mt">${new Date(e.t).toLocaleTimeString().slice(0, 5)}</span></div>`).join("")}</div></details>
    <div class="acts">${["fail", "rej"].includes(t.st) ? `<button data-r>${"Try again"}</button>` : ""}${["wait", "run"].includes(t.st) ? `<button class="d" data-c>${"Cancel"}</button>` : ""}${["done", "fail", "rej"].includes(t.st) ? `<button class="d" data-d>${"Delete"}</button>` : ""}</div>`, null, "wide mid");
  b.onclick = async (e) => {
    const D = (e.target.closest("button") || {}).dataset || {};
    try {
      if ("r" in D) { await A.api(`/api/task/${id}/retry`, {}); toast("Runs again"); close(); }
      if ("c" in D) { await A.api(`/api/task/${id}/cancel`, {}); toast("Cancelled"); close(); }
      if ("d" in D) { await A.api(`/api/task/${id}/del`, {}); close(); }
      A.poll();
    } catch (x) { fail(x); }
  };
};

const chips = (k, arr, ph) => `<div data-ch="${k}">${(arr || []).map((v, i) => `<span class="chip">${esc(v)}<b data-rm="${k}:${i}">✕</b></span>`).join("")}</div><input type="text" class="wd" data-add="${k}" placeholder="${esc(ph)}">`;
const COLS = A.COLS;

A.wSet = async (id, at) => {
  let d;
  try { d = await A.api("/api/worker/" + id); if (!A.types) await A.loadTypes(); } catch (x) { return fail(x); }
  const w = d.w, c = JSON.parse(JSON.stringify(w.cfg || {}));
  const old = JSON.parse(JSON.stringify(c));
  const others = A.S.w.filter((x) => x.id !== id);
  const ty = tyOf(w.ty) || {};
  const tools = c.tools || ty.tools || [];
  let col = w.col, nm = w.nm;
  const hrs = c.hrs && typeof c.hrs === "object" ? c.hrs : null;
  const render = () => {
    const b = box(`<h3>${esc(nm)} <small>${"Settings"}</small></h3>
      <div class="rw"><span>${"Name"}</span><span><input type="text" id="sNm" value="${esc(nm)}"></span></div>
      <div class="rw"><span>${"Color"}</span><span>${COLS.map((x) => `<span class="sw" data-col="${x}" style="background:${x};${x === col ? "outline:2px solid #2a2723" : ""}"></span>`).join(" ")}</span></div>
      <div class="rw"><span>${"Model"}</span><span><select data-c="md">${["", "small", "medium", "large"].map((m) => `<option value="${m}"${(c.md || "") === m ? " selected" : ""}>${m ? L(m) : "Type default" + " (" + L(ty.md || "medium") + ")"}</option>`).join("")}${c.md && !["small", "medium", "large"].includes(c.md) ? `<option selected>${esc(c.md)}</option>` : ""}</select></span></div>
      <div class="rw"><span>${"Own model"}</span><span><input type="text" data-c="md" value="${esc(["small", "medium", "large"].includes(c.md) ? "" : c.md || "")}" placeholder="e.g. claude-opus-5-5"></span></div>
      <div class="rw"><span>${"Thinking effort"}</span><span><select data-c="ef">${["low", "medium", "high", "max"].map((m) => `<option value="${m}"${(c.ef || "medium") === m ? " selected" : ""}>${L(m)}</option>`).join("")}</select></span></div>
      <div class="rw"><span>${"Provider"}</span><span><select data-c="pk">${[["", "any"], ["claude", "Claude"], ["codex", "ChatGPT (Codex)"], ["api", "API-Key"]].map(([v, n]) => `<option value="${v}"${(c.pk || "") === v ? " selected" : ""}>${n}</option>`).join("")}</select></span></div>
      <div class="rw"><span>${"Account"}</span><span><select data-c="acct" data-n>${[[0, "automatic (least busy)"], ...A.S.acc.map((a) => [a.id, a.nm])].map(([v, n]) => `<option value="${v}"${(c.acct || 0) === v ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></span></div>
      <div class="rw"><span>${"Subscription only, never API key"}</span><span><input type="checkbox" data-c="sub"${c.sub ? " checked" : ""}></span></div>
      <div class="rw"><span>${"Switch to API when the subscription is full"}</span><span><input type="checkbox" data-c="fb"${c.fb ? " checked" : ""}></span></div>
      <div class="rw"><span>${"Working time"}</span><span><select id="sHr"><option value="">${"all day"}</option><option value="z"${hrs ? " selected" : ""}>${"on schedule"}</option></select></span></div>
      ${hrs ? `<div class="rw"><span>${"from – to (time)"}</span><span><input type="number" id="sHv" min="0" max="23" value="${+(hrs.from ?? 22) || 0}" style="width:52px"> – <input type="number" id="sHb" min="0" max="24" value="${+(hrs.to ?? 7) || 0}" style="width:52px"></span></div>` : ""}
      <div class="rw"><span>${"Priority"}</span><span><select data-c="prio" data-n>${[1, 2, 3, 4, 5].map((p) => `<option${(c.prio || 3) === p ? " selected" : ""}>${p}</option>`).join("")}</select></span></div>
      <details><summary>${"Advanced"}</summary>
        <div class="rw"><span>${"At the same time"}</span><span><select data-c="par" data-n>${[1, 2, 3, 4].map((p) => `<option${(c.par || 1) === p ? " selected" : ""}>${p}</option>`).join("")}</select></span></div>
        <div class="rw"><span>${"Tasks per day (0 = any)"}</span><span><input type="number" data-c="perday" data-n min="0" value="${+c.perday || 0}" style="width:70px"></span></div>
        <div class="rw"><span>${"Pause at subscription usage"}</span><span><select data-c="cut" data-n>${[50, 60, 70, 80, 90, 100].map((p) => `<option value="${p}"${(c.cut || 100) === p ? " selected" : ""}>${p === 100 ? "never" : p + " %"}</option>`).join("")}</select></span></div>
        <div class="rw"><span>${"Tokens per day (0 = any)"}</span><span><input type="number" data-c="tokd" data-n min="0" step="10000" value="${+c.tokd || 0}" style="width:90px"></span></div>
        <div class="rw"><span>${"Time limit per task (min)"}</span><span><input type="number" data-c="min" data-n min="1" max="600" value="${+c.min || 30}" style="width:70px"></span></div>
        <div class="rw"><span>${"Check afterwards"}</span><span><input type="text" data-c="chk" value="${esc(c.chk || "")}" placeholder="sh:npm test"></span></div>
        <div class="mt">${"Tools"}</div>
        <div>${A.types.base.map((t) => `<label style="display:inline-flex;margin-right:8px"><input type="checkbox" data-tool="${t.id}"${tools.includes(t.id) ? " checked" : ""}>${esc(t.id)}</label>`).join("")}${A.types.tools.map((t) => `<label style="display:inline-flex;margin-right:8px"><input type="checkbox" data-tool="x:${esc(t.id)}"${tools.includes("x:" + t.id) ? " checked" : ""}>${esc(t.id)}</label>`).join("")}</div>
        <div class="mt" style="margin-top:6px">${"Recurring tasks"}</div>
        <div>${(c.sched || []).map((s, i) => `<span class="chip">${esc(s.ti)} · ${s.at ? esc(s.at) : "every " + (+s.every || 0) + " min"}<b data-rs="${i}">✕</b></span>`).join("")}</div>
        <div class="row" style="display:flex;gap:4px;margin-top:4px"><input type="text" id="sSt" placeholder="${"Title"}" style="flex:1"><input type="text" id="sSe" placeholder="${"08:00 or 60"}" style="width:90px"><button class="l" data-as>+</button></div>
      </details>
      <details${A.permOpen ? " open" : ""}><summary>${"Permissions"}</summary>
        <div class="mt">${"Read folder"}</div>${chips("fsr", c.fsr, "Path, e.g. C:\\Users\\you\\Project")}
        <div class="mt">${"Read and change folder"}</div>${chips("fsw", c.fsw, "Path")}
        <div class="rw"><span>${"Commands"}</span><span><select id="sSh"><option value="no"${c.sh === false || c.sh == null ? " selected" : ""}>${"none"}</option><option value="ls"${Array.isArray(c.sh) ? " selected" : ""}>${"only these"}</option><option value="any"${c.sh === true ? " selected" : ""}>${"any"}</option></select></span></div>
        ${Array.isArray(c.sh) ? chips("sh", c.sh, "e.g. npm test or git diff *") : ""}
        <div class="mt">${"Websites (domains)"}</div>${chips("net", c.net, "api.github.com")}
        <div class="rw"><span>${"git push allowed"}</span><span><input type="checkbox" data-c="push"${c.push ? " checked" : ""}></span></div>
        ${A.S.srv.length ? `<div class="mt">${"Servers in the server room"}</div><div>${A.S.srv.map((s) => `<label style="display:inline-flex;margin-right:8px"><input type="checkbox" data-srv="${s.id}"${(c.srv || []).includes(s.id) ? " checked" : ""}>${esc(s.nm)}</label>`).join("")}</div>` : ""}
        ${w.ty === "ceo" ? `<div class="rw"><span>${"May hire workers"}</span><span><input type="checkbox" data-c="ceo_hire"${c.ceo_hire ? " checked" : ""}></span></div><div class="rw"><span>${"May connect workers"}</span><span><input type="checkbox" data-c="ceo_conn"${c.ceo_conn ? " checked" : ""}></span></div>` : ""}
        <div class="mt">${"Accepts tasks from"}</div>
        <div>${others.map((o) => { const r = (c.from || []).find((f) => (f.w ?? f) === o.id); return `<label style="display:flex;justify-content:space-between"><span><input type="checkbox" data-from="${o.id}"${r ? " checked" : ""}> ${esc(o.nm)} <span class="mt">${esc(o.tn || "")}</span></span>${r ? `<input type="number" min="0" data-fmax="${o.id}" value="${+r.max || 0}" title="${"max. per day, 0 = any"}" style="width:50px">` : ""}</label>`; }).join("") || `<span class="mt">${"no other workers yet"}</span>`}</div>
      </details>
      <div class="acts"><button data-sv>${"Save"}</button><button class="l" data-mv>${"Move"}</button><button class="d" data-fire>${"Dismiss"}</button></div>`, at, "wide");
    b.oninput = (e) => { if (e.target.id === "sNm") nm = e.target.value; };
    b.onchange = (e) => {
      const t = e.target, D = t.dataset;
      if (D.c) c[D.c] = t.type === "checkbox" ? t.checked : "n" in D ? +t.value : t.value;
      if (D.tool) { const s = new Set(c.tools || tools); t.checked ? s.add(D.tool) : s.delete(D.tool); c.tools = [...s]; }
      if (D.srv) { const s = new Set(c.srv || []); t.checked ? s.add(+D.srv) : s.delete(+D.srv); c.srv = [...s]; }
      if (D.from) { const f = (c.from || []).filter((x) => (x.w ?? x) !== +D.from); if (t.checked) f.push({ w: +D.from }); c.from = f; A.permOpen = 1; render(); }
      if (D.fmax) { const r = (c.from || []).find((x) => (x.w ?? x) === +D.fmax); if (r) r.max = +t.value; }
      if (t.id === "sHr") { c.hrs = t.value ? { from: 22, to: 7 } : null; render(); }
      if (t.id === "sHv" || t.id === "sHb") c.hrs = { from: +$("sHv").value, to: +$("sHb").value };
      if (t.id === "sSh") { c.sh = t.value === "any" ? true : t.value === "ls" ? (Array.isArray(c.sh) ? c.sh : []) : false; A.permOpen = 1; render(); }
      if (D.add) {
        const v = t.value.trim(); if (!v) return;
        c[D.add] = [...(Array.isArray(c[D.add]) ? c[D.add] : []), v]; A.permOpen = 1; render();
      }
    };
    b.onclick = async (e) => {
      const D = e.target.dataset;
      if (D.col) { col = D.col; render(); return; }
      if (D.rm) { const [k, i] = D.rm.split(":"); c[k].splice(+i, 1); A.permOpen = 1; render(); return; }
      if (D.rs) { c.sched.splice(+D.rs, 1); render(); return; }
      if ("as" in D) {
        const ti = $("sSt").value.trim(), ev = $("sSe").value.trim();
        if (!ti || !ev) return toast("Enter a title and a time (08:00) or minutes (60)", 1);
        const s = /^\d{1,2}:\d{2}$/.test(ev) ? { ti, tx: ti, at: ev.padStart(5, "0") } : { ti, tx: ti, every: Math.max(5, +ev || 60) };
        c.sched = [...(c.sched || []), s]; render(); return;
      }
      if ("fire" in D) {
        if (!(await confirmBox("Dismiss?", [nm + " " + "leaves the building. Waiting tasks will be cancelled."], "Yes, dismiss"))) return;
        try { await A.api(`/api/worker/${id}/fire`, {}); toast(nm + " " + "is gone"); A.poll(); } catch (x) { fail(x); }
        return;
      }
      if ("mv" in D) return A.moveBox(id, nm, at);
      if ("sv" in D) {
        const lines = perms(nm, old, c);
        const body = { cfg: c, nm, col };
        try {
          if (lines.length) {
            if (!(await confirmBox("Change permissions", lines))) return render();
            body.ok = true;
          }
          await A.api("/api/worker/" + id, body);
          toast("saved"); A.permOpen = 0; close(); A.poll();
        } catch (x) { fail(x); render(); }
      }
    };
  };
  render();
};

const perms = (nm, o, n) => {
  const l = [];
  const add = (k) => (n[k] || []).filter((x) => !(o[k] || []).includes(x));
  for (const p of add("fsr")) l.push(`${nm} may read all files in ${p}.`);
  for (const p of add("fsw")) l.push(`${nm} may read, change and delete all files in ${p}.`);
  if (n.sh === true && o.sh !== true) l.push(`${nm} may run any command. That can do anything your user can do.`);
  if (Array.isArray(n.sh)) for (const c of n.sh.filter((x) => !(Array.isArray(o.sh) ? o.sh : []).includes(x))) l.push(`${nm} may run commands like "${c}".`);
  for (const d of add("net")) l.push(`${nm} may fetch data from ${d} and send data there.`);
  if (n.push && !o.push) l.push(`${nm} may publish code with git push.`);
  for (const s of (n.srv || []).filter((x) => !(o.srv || []).includes(x))) l.push(`${nm} may start jobs on ${(A.srvOf(s) || {}).nm || s}.`);
  if (n.ceo_hire && !o.ceo_hire) l.push(`${nm} may hire new workers (without permissions).`);
  if (n.ceo_conn && !o.ceo_conn) l.push(`${nm} may connect workers that have no more permissions than it has.`);
  for (const f of (n.from || []).filter((x) => !(o.from || []).some((y) => (y.w ?? y) === (x.w ?? x)))) l.push(`${nm} carries out orders from ${wName(f.w ?? f)}, with its own permissions.`);
  if (n.chk && n.chk !== o.chk) l.push(`The check "${n.chk}" runs after every task.`);
  if (n.fb && !o.fb) l.push(`${nm} may switch to API keys when the subscription is full (costs money).`);
  if (n.tools && JSON.stringify(n.tools) !== JSON.stringify(o.tools)) l.push(`${nm} gets these tools: ${n.tools.join(", ")}.`);
  if (!!n.sub !== !!o.sub) l.push(n.sub ? `${nm} only uses subscriptions, never API keys.` : `${nm} may also use API keys (costs money).`);
  const dk = ["fsr", "fsw", "sh", "net", "push", "ceo_hire", "ceo_conn", "srv", "from", "chk", "tools", "fb", "sub"];
  const j = (v) => JSON.stringify(v ?? null);
  const ch = dk.filter((k) => n[k] !== undefined && n[k] !== null && j(n[k]) !== j(o[k]));
  if (ch.length && !l.length) l.push(`Permissions of ${nm} get narrower (${ch.join(", ")}).`);
  return l;
};

A.moveBox = (id, nm, at) => {
  const offs = A.S.fl.filter((f) => ["office", "accounting", "server"].includes(f.k));
  const b = box(`<h3>${esc(nm)} ${"move"}</h3><div class="li">${offs.map((f) => `<div data-f="${f.id}"><span>${A.lvlName(f.lvl)} · ${esc(f.nm)}</span></div>`).join("")}</div>`, at);
  b.onclick = async (e) => { const f = e.target.closest("[data-f]"); if (!f) return; try { await A.api("/api/worker/" + id, { fl: +f.dataset.f }); close(); toast(nm + " is moving"); A.poll(); } catch (x) { fail(x); } };
};

A.hireBox = async (f, u) => {
  if (!A.types) await A.loadTypes();
  const b = box(`<h3>${"Free desk"}</h3><div class="mt">${"Whom do you want to hire here?"}</div><div class="li">${A.types.ty.map((t) => `<div data-h="${esc(t.id)}"><span><span class="sw" style="background:${esc(t.col)}"></span> ${esc(t.nm)}</span><span class="mt">${esc(L(t.dsc || ""))}</span></div>`).join("")}</div>
    <div class="acts"><button class="l" data-tm>${"Hire the whole team"}</button></div>`, u);
  b.onclick = async (e) => {
    if (e.target.closest("[data-tm]")) return A.teamBox(f.id, u);
    const h = e.target.closest("[data-h]"); if (!h) return;
    try { await A.api("/api/hire", { ty: h.dataset.h, fl: f.id, desk: u.id }); close(); toast("hired"); await A.poll(); } catch (x) { fail(x); }
  };
};

A.teamBox = async (fl, at) => {
  if (!A.types) await A.loadTypes();
  const offs = A.S.fl.filter((f) => f.k === "office");
  if (!offs.length) return toast("Build out an office first", 1);
  const b = box(`<h3>${"Ready-made team"}</h3><div class="li">${A.types.teams.map((t) => `<div data-t="${t.id}"><span>${esc(L(t.nm))}</span><span class="mt">${esc(t.dsc)}</span></div>`).join("")}</div>
    <div class="rw"><span>${"Floor"}</span><span><select id="tmF">${offs.map((f) => `<option value="${f.id}"${f.id === fl ? " selected" : ""}>${esc(f.nm)}</option>`).join("")}</select></span></div>
    <div class="mt">${"Hires the workers, places desks and connects them one after another."}</div>`, at);
  b.onclick = async (e) => { const t = e.target.closest("[data-t]"); if (!t) return; try { await A.api("/api/team", { id: t.dataset.t, fl: +$("tmF").value }); close(); toast("Team is here"); A.cur = +$("tmF").value || A.cur; await A.poll(); } catch (x) { fail(x); } };
};

A.trayBox = async (f, u) => {
  let d;
  try { d = await A.api("/api/floor/" + f.id); } catch (x) { return fail(x); }
  const b = box(`<h3>${"Outbox"} <small>${d.tray.length} ${"Results"}</small></h3><div class="li">${d.tray.map((t) => `<div data-k="${t.id}"><span>${t.st === "done" ? "" : t.st === "rej" ? "⛔ " : "✕ "}${esc(t.ti.slice(0, 44))}</span><span class="mt">${esc(wName(t.wk))}</span></div>`).join("") || `<span class="mt">${"Still empty. Results land here."}</span>`}</div>
    <div class="acts"><button class="l" data-o>${"Task for the office"}</button></div>`, u);
  b.onclick = (e) => { const k = e.target.closest("[data-k]"); if (k) return A.taskView(+k.dataset.k); if (e.target.closest("[data-o]")) A.taskBox({ fl: f.id, nm: f.nm }, u); };
};

const kname = (a) => ({ claude: "Claude subscription (Claude Code)", codex: "ChatGPT subscription (Codex CLI)", gemini: "Gemini CLI", api: "API key" })[a.k] || a.k;
const stName = (a) => { const s = a.st || {}; return s.s === "off" ? "off" + (s.reset ? " " + "until" + " " + new Date(s.reset).toLocaleTimeString().slice(0, 5) : "") : s.s === "warn" ? "almost full" : s.s === "err" ? "Error" : "running"; };

A.genBox = (u) => {
  const a = A.accOf(u.acc);
  if (!a) return A.addAcc(u);
  const s = a.st || {}, pct = Math.round(s.pct || 0);
  const tiers = (a.cfg && a.cfg.tiers) || {};
  const b = box(`<h3>${esc(a.nm)} <small>${esc(L(kname(a)))}</small></h3>
    <div class="rw"><span>${"Status"}</span><span>${stName(a)}</span></div>
    ${s.err ? `<div class="er">${esc(s.err)}</div>` : ""}
    <div class="rw"><span>${a.k === "api" ? "Daily limit" : "Subscription window"}</span><span>${a.k === "api" && !(a.cfg && (a.cfg.tok_day || a.cfg.usd_day)) ? "no limit of its own" : pct + " %"}</span></div><div class="bar"><i style="width:${pct}%;background:${pct >= 100 ? "#d9594c" : pct >= 80 ? "#e0675a" : "#62b86f"}"></i></div>
    <div class="rw"><span>${"Today"}</span><span>${(a.today.tin || 0) + (a.today.tout || 0)} Tokens${a.today.usd ? " · " + a.today.usd.toFixed(2) + " $" : ""}</span></div>
    ${a.k === "api" ? `<div class="rw"><span>${"Key"}</span><span>${esc(a.sec || "–")}</span></div><div class="rw"><span>${"Address"}</span><span>${esc(a.base)}</span></div>` : `<div class="rw"><span>${"Login"}</span><span>${a.dir ? "own folder" : "Default login of this computer"}</span></div>`}
    <details><summary>${"Advanced"}</summary>
      ${["small", "medium", "large"].map((t) => `<div class="rw"><span>${"Model"} "${L(t)}"</span><span><input type="text" data-tier="${t}" value="${esc(tiers[t] || "")}" placeholder="${a.k === "api" ? esc(a.md) : "Default"}"></span></div>`).join("")}
      ${a.k === "api" ? `<div class="rw"><span>${"Max. tokens per day"}</span><span><input type="number" data-cf="tok_day" value="${(a.cfg && a.cfg.tok_day) || 0}"></span></div><div class="rw"><span>${"Max. $ per day"}</span><span><input type="number" step="0.5" data-cf="usd_day" value="${(a.cfg && a.cfg.usd_day) || 0}"></span></div><div class="rw"><span>${"Price $/M in / out"}</span><span><input type="number" step="0.01" data-cf="pin" value="${(a.cfg && a.cfg.pin) ?? ""}" style="width:60px"> <input type="number" step="0.01" data-cf="pout" value="${(a.cfg && a.cfg.pout) ?? ""}" style="width:60px"></span></div><div class="rw"><span>${"New key"}</span><span><input type="password" id="gKey" autocomplete="off"></span></div>` : ""}
      <div class="acts"><button class="l" data-sv>${"Save"}</button></div>
    </details>
    <div class="acts"><button data-t>${"Test"}</button>${a.k !== "api" ? `<button class="l" data-lg>${"Log in"}</button>` : ""}<button class="d" data-del>${"Disconnect"}</button></div><div id="gMsg" class="mt"></div>`, u);
  const cf = {};
  b.onchange = (e) => { const D = e.target.dataset; if (D.tier) { cf.tiers = { ...(cf.tiers || tiers), [D.tier]: e.target.value.trim() }; } if (D.cf) cf[D.cf] = e.target.value === "" ? null : +e.target.value; };
  b.onclick = async (e) => {
    const D = (e.target.closest("button") || {}).dataset || {};
    try {
      if ("t" in D) { $("gMsg").textContent = "testing …"; const r = await A.api(`/api/acc/${a.id}/test`, {}); $("gMsg").textContent = "✓ " + r.msg; A.poll(); }
      if ("lg" in D) { const r = await A.api(`/api/acc/${a.id}/login`, {}); $("gMsg").innerHTML = (r.opened ? "A terminal window is open. Log in there, then test here." : "Run in the terminal:") + `<pre>${esc(r.cmd)}</pre>`; }
      if ("sv" in D) {
        const k = $("gKey") && $("gKey").value.trim();
        const body = { cfg: cf };
        if (k) { if (!(await confirmBox("Replace key", ["The old key will be overwritten. The new one is stored encrypted on this computer."]))) return A.genBox(u); body.key = k; body.ok = true; }
        await A.api("/api/acc/" + a.id, body); toast("saved"); A.poll();
      }
      if ("del" in D) { if (!(await confirmBox("Disconnect account?", [a.nm + " " + "will be deleted. Workers tied to it will wait afterwards."], "Yes, disconnect"))) return; await A.api(`/api/acc/${a.id}/del`, {}); toast("disconnected"); A.poll(); }
    } catch (x) { if ($("gMsg")) $("gMsg").innerHTML = `<span class="er">✕ ${esc(x.message)}</span>`; else fail(x); }
  };
};

const PRE = [["anthropic", "Anthropic"], ["openai", "OpenAI"], ["deepseek", "DeepSeek"], ["mistral", "Mistral"], ["openrouter", "OpenRouter"], ["groq", "Groq"], ["gemini", "Google Gemini"], ["ollama", "Ollama (local)"], ["lmstudio", "LM Studio (local)"], ["custom", "Own address"]];
A.addAcc = async (at) => {
  const b = box(`<h3>${"Connect power"}</h3><div class="mt">${"Looking for programs on this computer …"}</div>`, at, "wide");
  let det = {};
  try { det = await A.api("/api/detect"); } catch {}
  let k = det.claude && det.claude.found ? "claude" : "api";
  const render = () => {
    const same = A.S.acc.filter((a) => a.k === k).length;
    const dk = det[k] || {};
    b.innerHTML = `<span class="ar" data-x>✕</span><h3>${"Connect power"}</h3>
      <div class="li">${[["claude", "Claude subscription", "Claude Code"], ["codex", "ChatGPT subscription", "Codex CLI"], ["api", "API key", "Anthropic, OpenAI, Gemini, DeepSeek, Ollama …"]].map(([v, n, s]) => `<div data-k="${v}" class="${k === v ? "cur" : ""}"><span>${L(n)}</span><span>${v !== "api" ? (det[v] && det[v].found ? "✓ " + "found" : "not installed") : esc(s)}</span></div>`).join("")}</div>
      ${k !== "api" ? `
        ${dk.found ? `<div class="rw"><span>${"Program"}</span><span>${esc(dk.ver || dk.path || "")}</span></div>` : `<div class="er">${esc(k === "claude" ? "Claude Code is not installed: claude.com/claude-code" : k === "codex" ? "Codex CLI is not installed: npm i -g @openai/codex" : "Gemini CLI is not installed: npm i -g @google/gemini-cli")}</div>`}
        <div class="rw"><span>${"Name"}</span><span><input type="text" id="aNm" placeholder="${"e.g. private"}"></span></div>
        <div class="rw"><span>${"Own login (second account)"}</span><span><input type="checkbox" id="aOwn"${same ? " checked disabled" : ""}></span></div>
        ${same ? `<div class="er">${"Note: Using several subscription accounts with the same provider to get around limits may violate its terms of use. Your call."}</div>` : ""}
        ${det.bash === null && navigator.platform.startsWith("Win") ? `<div class="er">${"Git for Windows is missing (git-scm.com). Without it, workers cannot run commands."}</div>` : ""}
      ` : `
        <div class="rw"><span>${"Provider"}</span><span><select id="aPre">${PRE.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select></span></div>
        <div class="rw"><span>${"Name"}</span><span><input type="text" id="aNm" placeholder="${"e.g. work"}"></span></div>
        <div class="rw"><span>${"API key"}</span><span><input type="password" id="aKey" autocomplete="off"></span></div>
        <details><summary>${"Address and model"}</summary>
          <div class="rw"><span>${"Address"}</span><span><input type="text" id="aBase" placeholder="${"Default"}"></span></div>
          <div class="rw"><span>${"Model"}</span><span><input type="text" id="aMd" placeholder="${"Default"}"></span></div>
          <div class="rw"><span>${"Format"}</span><span><select id="aFmt"><option value="">${"automatic"}</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></span></div>
        </details>
        <div class="mt">${"The key is stored encrypted on this computer and never given to workers."}</div>`}
      <div class="acts"><button data-go>${"Connect"}</button></div><div id="aMsg" class="mt"></div>`;
  };
  render();
  b.onclick = async (e) => {
    const kk = e.target.closest("[data-k]");
    if (kk) { k = kk.dataset.k; render(); return; }
    if (!e.target.closest("[data-go]")) return;
    const body = { k, nm: $("aNm").value.trim(), ok: true };
    if (k === "api") Object.assign(body, { pre: $("aPre").value, key: $("aKey").value.trim(), base: $("aBase").value.trim(), md: $("aMd").value.trim(), fmt: $("aFmt").value });
    else body.own = $("aOwn").checked;
    try {
      $("aMsg").textContent = "connecting …";
      const r = await A.api("/api/acc", body);
      await A.poll();
      const a = A.accOf(r.id);
      if (k !== "api" && body.own) { const l = await A.api(`/api/acc/${r.id}/login`, {}); $("aMsg").innerHTML = (l.opened ? "A terminal is open: log in there with the second account." : "Log in in the terminal:") + `<pre>${esc(l.cmd)}</pre>` + `<button data-tt="${r.id}">${"Test afterwards"}</button>`; return; }
      $("aMsg").textContent = "testing …";
      try { const t = await A.api(`/api/acc/${r.id}/test`, {}); toast("✓ " + (a ? a.nm : "") + ": " + t.msg); close(); } catch (x) { $("aMsg").innerHTML = `<span class="er">${"Connected, but the test failed"}: ${esc(x.message)}</span>`; }
      A.poll();
    } catch (x) { $("aMsg").innerHTML = `<span class="er">✕ ${esc(x.message)}</span>`; }
  };
  if (A._tt) b.removeEventListener("click", A._tt);
  A._tt = async (e) => { const t = e.target.dataset.tt; if (!t) return; try { const r = await A.api(`/api/acc/${t}/test`, {}); toast("✓ " + r.msg); close(); A.poll(); } catch (x) { $("aMsg").innerHTML += `<div class="er">${esc(x.message)}</div>`; } };
  b.addEventListener("click", A._tt);
};

A.rackBox = async (u) => {
  const s = A.srvOf(u.srv);
  if (!s) return;
  let jobs = [];
  try { jobs = await A.api("/api/jobs?srv=" + s.id); } catch {}
  const st = s.st || {}, c = s.cfg || {};
  const bar = (v) => `<div class="bar"><i style="width:${Math.round(v || 0)}%;background:${v > 90 ? "#d9594c" : "#62b86f"}"></i></div>`;
  const cmds = [...(c.cmds || [])];
  const render = () => {
    const b = box(`<h3>${esc(s.nm)} <small>${esc(s.host)}</small></h3>
      <div class="rw"><span>${"Status"}</span><span>${st.t === undefined ? "is being checked" : st.on ? "online" : "offline" + (st.why ? ": " + esc(st.why) : "")}</span></div>
      ${st.on ? `<div class="rw"><span>CPU</span><span>${Math.round(st.cpu || 0)} %</span></div>${bar(st.cpu)}<div class="rw"><span>RAM</span><span>${Math.round(st.ram || 0)} %</span></div>${bar(st.ram)}<div class="rw"><span>Disk</span><span>${Math.round(st.disk || 0)} %</span></div>${bar(st.disk)}` : ""}
      <div class="rw"><span>${"Lanes"}</span><span>${st.jobs || 0} / ${st.lanes || c.lanes} ${"occupied"}</span></div>
      <div class="rw"><span>Docker</span><span>${s.dock ? "yes, jobs in containers" : "no, jobs directly"}</span></div>
      <details><summary>${"Jobs"}</summary><div class="li">${jobs.map((j) => `<div><span>#${j.id} ${esc(j.cmd.slice(0, 40))}</span><span class="mt">${L(j.st)}${j.ex != null ? " " + j.ex : ""}</span></div>`).join("") || `<span class="mt">${"none yet"}</span>`}</div></details>
      <details><summary>${"Settings"}</summary>
        <div class="rw"><span>${"Lanes"}</span><span><input type="number" min="1" max="32" data-c="lanes" value="${c.lanes || 2}" style="width:60px"></span></div>
        <div class="rw"><span>${"Daytime (8am–6pm) lanes"}</span><span><input type="number" min="0" max="32" id="rDay" value="${(c.hours && c.hours["9"]) ?? ""}" placeholder="=" style="width:60px"></span></div>
        ${s.dock ? `<div class="rw"><span>${"CPU per job"}</span><span><input type="number" step="0.5" data-c="cpu" value="${c.cpu || 2}" style="width:60px"></span></div><div class="rw"><span>${"RAM per job (MB)"}</span><span><input type="number" step="256" data-c="mem" value="${c.mem || 2048}" style="width:80px"></span></div><div class="rw"><span>${"Image"}</span><span><input type="text" data-c="img" value="${esc(c.img || "")}"></span></div>` : ""}
        <div class="rw"><span>${"Check every (s)"}</span><span><input type="number" min="10" data-c="every" value="${c.every || 30}" style="width:60px"></span></div>
        <div class="mt">${"Allowed commands"}</div>${chips("cmds", cmds, "e.g. make test or ./run.sh *")}
        <div class="acts"><button class="l" data-sv>${"Save"}</button></div>
      </details>
      <div class="acts"><button class="d" data-del>${"Remove server"}</button></div>`, u, "wide");
    const nc = {};
    b.onchange = (e) => {
      const D = e.target.dataset;
      if (D.c) nc[D.c] = e.target.type === "number" ? +e.target.value : e.target.value;
      if (e.target.id === "rDay") { const v = e.target.value; const h = {}; if (v !== "") for (let i = 8; i < 18; i++) h[i] = +v; nc.hours = h; }
      if (D.add) { const v = e.target.value.trim(); if (v) { cmds.push(v); render(); } }
    };
    b.onclick = async (e) => {
      const D = e.target.dataset;
      if (D.rm) { cmds.splice(+D.rm.split(":")[1], 1); render(); return; }
      try {
        if ("sv" in D) {
          const body = { cfg: { ...nc, cmds } };
          const added = cmds.filter((x) => !(c.cmds || []).includes(x));
          if (JSON.stringify(cmds) !== JSON.stringify(c.cmds || [])) {
            if (!(await confirmBox("Commands on the server", added.length ? added.map((x) => `Workers with server access may run "${x}" on ${s.nm}.`) : ["Allowed commands will be restricted."]))) return render();
            body.ok = true;
          }
          await A.api("/api/srv/" + s.id, body); toast("saved"); A.poll(); close();
        }
        if ("del" in D) { if (!(await confirmBox("Remove server?", [s.nm + " " + "disappears from the server room. The user apollo stays on the server until you delete it there."], "Yes, remove"))) return; await A.api(`/api/srv/${s.id}/del`, {}); A.poll(); }
      } catch (x) { fail(x); }
    };
  };
  render();
};

A.addSrv = (fl, at) => {
  const b = box(`<h3>${"Add server"}</h3><div class="mt">${"Linux server with SSH. The admin credentials are used only once and not stored."}</div>
    <div class="rw"><span>${"Name"}</span><span><input type="text" id="sNm" placeholder="node-1"></span></div>
    <div class="rw"><span>${"Address"}</span><span><input type="text" id="sHo" placeholder="192.168.1.20"></span></div>
    <div class="rw"><span>Port</span><span><input type="number" id="sPo" value="22" style="width:70px"></span></div>
    <div class="rw"><span>${"Admin user"}</span><span><input type="text" id="sUs" value="root"></span></div>
    <div class="rw"><span>${"Password"}</span><span><input type="password" id="sPw" autocomplete="off"></span></div>
    <details><summary>${"or private key"}</summary><textarea id="sKy" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea><div class="rw"><span>${"Passphrase"}</span><span><input type="password" id="sKp" autocomplete="off"></span></div></details>
    <div class="rw"><span>${"Use Docker if available"}</span><span><input type="checkbox" id="sDo" checked></span></div>
    <div class="acts"><button data-pr>${"Connect"}</button></div><div id="sMsg" class="mt"></div>`, at, "wide");
  b.onclick = async (e) => {
    const D = e.target.dataset;
    try {
      if ("pr" in D) {
        $("sMsg").textContent = "connecting …";
        const r = await A.api("/api/srvprobe", { host: $("sHo").value.trim(), port: +$("sPo").value || 22 });
        $("sMsg").innerHTML = `${"Server fingerprint"}:<pre>${esc(r.fp)}</pre>${"Does it match the server (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)?"}<div class="acts"><button data-ok="${esc(r.fp)}">${"Yes, set up"}</button></div>`;
      }
      if (D.ok) {
        const dock = $("sDo").checked;
        const lines = ["ApolloOffice logs in once as " + $("sUs").value + " and creates the user apollo with its own key.", "After that, ApolloOffice only uses apollo. Workers never get free SSH access, only allowed commands."];
        if (dock) lines.push("With Docker, apollo joins the docker group. On the server that is as powerful as root.");
        if (!(await confirmBox("Set up server", lines))) return A.addSrv(fl, at);
        A.toast("setting up …");
        await A.api("/api/srv", { ok: true, fp: D.ok, fl, nm: $("sNm") ? $("sNm").value : "", host: $("sHo") ? $("sHo").value.trim() : "", port: +($("sPo") || {}).value || 22, user: ($("sUs") || {}).value, pw: ($("sPw") || {}).value, key: ($("sKy") || {}).value, kpw: ($("sKp") || {}).value, docker: dock });
        toast("Server is in the rack"); close(); A.poll();
      }
    } catch (x) { if ($("sMsg")) $("sMsg").innerHTML = `<span class="er">✕ ${esc(x.message)}</span>`; else fail(x); }
  };
  const keep = {};
  b.oninput = (e) => { keep[e.target.id] = e.target.value; };
};

A.liftBox = (u) => {
  const F = [...A.S.fl].reverse();
  const b = box(`<h3>${"Elevator"} <small>${A.S.fl.length} ${"Floors"}</small></h3><div class="li">${F.map((f) => `<div data-g="${f.id}" class="${f.id === A.cur ? "cur" : ""}"><span>${A.lvlName(f.lvl)} · ${esc(f.nm)}</span><span class="mt">${A.S.w.filter((x) => x.fl === f.id).length || ""}</span></div>`).join("")}</div>
    <div class="acts"><button class="l" data-up>+ ${"Floor"}</button><button class="l" data-dn>− ${"Floor"}</button></div>`, u);
  b.onclick = async (e) => {
    const D = e.target.dataset, g = e.target.closest("[data-g]");
    try {
      if ("up" in D) { await A.api("/api/height", { n: A.S.fl.length + 1 }); await A.poll(); A.liftBox(u); return; }
      if ("dn" in D) { await A.api("/api/height", { n: A.S.fl.length - 1 }); await A.poll(); A.liftBox(u); return; }
    } catch (x) { return fail(x); }
    if (g) { A.goFloor(+g.dataset.g); close(); }
  };
};

A.shellBox = (f, at) => {
  const b = box(`<h3>${"Build out shell floor"}</h3><div class="mt">${"What should be built here?"}</div><div class="li">${[["office", "Office: workers work here"], ["lounge", "Lounge: workers take breaks here"], ["server", "Server room: your servers"], ["accounting", "Accounting: usage and costs"]].map(([k, d]) => `<div data-k="${k}"><span>${L(A.KN[k])}</span><span class="mt">${esc(d.split(": ")[1])}</span></div>`).join("")}</div>
    <div class="rw"><span>${"Name"}</span><span><input type="text" id="rNm" placeholder="${"optional"}"></span></div>`, at);
  b.onclick = async (e) => {
    const g = e.target.closest("[data-k]"); if (!g) return;
    try {
      await A.api(`/api/floor/${f.id}/build`, { k: g.dataset.k, nm: $("rNm").value });
      close(); toast("Finished building"); await A.poll(true);
      if (g.dataset.k === "office" && A.questOn() && A.quest.s === 1) { A.setBld(true); A.toast("Add one more desk and click Done"); }
      if (g.dataset.k === "server") A.addSrv(f.id, { sx: innerWidth / 2, sy: 120 });
    } catch (x) { fail(x); }
  };
};

A.signBox = async (f, at) => {
  let d = {};
  try { d = await A.api("/api/floor/" + f.id); } catch {}
  const hook = d.hook ? location.origin + "/hook/" + d.hook : "";
  const b = box(`<h3>${esc(f.nm)} <small>${A.lvlName(f.lvl)}</small></h3>
    ${["office", "lounge", "server", "accounting"].includes(f.k) ? `<div class="rw"><span>${"Name"}</span><span><input type="text" id="fNm" value="${esc(f.nm)}"></span></div>` : ""}
    ${f.k === "office" ? `<div class="rw"><span>${"Webhook"}</span><span><input type="text" class="wd" readonly value="${esc(hook)}"></span></div><div class="mt">${"POST with JSON {title, text, worker} creates a task. Text from outside is checked by Guard."}</div>` : ""}
    <div class="acts">${f.k === "office" ? `<button data-t>${"Task for the office"}</button><button class="l" data-tm>${"Hire team"}</button><button class="l" data-hk>${"Renew webhook"}</button>` : ""}${["office", "lounge", "server", "accounting"].includes(f.k) ? `<button class="l" data-sv>${"Rename"}</button><button class="d" data-dm>${"Tear down"}</button>` : ""}${f.k === "server" ? `<button data-as>${"Add server"}</button>` : ""}</div>`, at);
  b.onclick = async (e) => {
    const D = (e.target.closest("button") || {}).dataset || {};
    try {
      if ("t" in D) return A.taskBox({ fl: f.id, nm: f.nm }, at);
      if ("tm" in D) return A.teamBox(f.id, at);
      if ("as" in D) return A.addSrv(f.id, at);
      if ("hk" in D) { await A.api(`/api/floor/${f.id}/hook`, {}); A.signBox(f, at); toast("New webhook address, the old one no longer works"); }
      if ("sv" in D) { await A.api(`/api/floor/${f.id}/rename`, { nm: $("fNm").value }); toast("renamed"); A.poll(); close(); }
      if ("dm" in D) { if (!(await confirmBox("Tear down?", [f.nm + " " + "becomes a shell floor again. Furniture disappears."], "Yes, tear down"))) return; await A.api(`/api/floor/${f.id}/demolish`, {}); A.poll(true); }
    } catch (x) { fail(x); }
  };
};

A.fuClick = (f, u) => {
  if (u.k === "lift" || u.k === "stairs") return A.liftBox(u);
  if (u.k === "desk") {
    const own = A.S.w.find((x) => x.fl === f.id && x.desk === u.id);
    if (own && A.E[own.id]) return A.wBox(A.E[own.id]);
    if (!["office", "accounting", "server"].includes(f.k)) return toast("Workers work in the office");
    return A.hireBox(f, u);
  }
  if (u.k === "gen") return A.genBox(u);
  if (u.k === "rack") return A.rackBox(u);
  if (u.k === "tray") return A.trayBox(f, u);
  if (u.k === "plan") return A.setBld(true);
  if (u.k === "board") return A.page("types");
  if (u.k === "counter") return A.piaClick();
  if (u.k === "chart" || (u.k === "screen" && f.k === "accounting")) return A.page("usage");
  if (u.k === "screen" && f.k === "server") return A.addSrv(f.id, u);
  const fl = { couch: "Cozy. Workers take breaks here.", coffee: "Freshly brewed.", plant: "Being poured.", table: "For meetings.", screen: "Shows the status." };
  toast(fl[u.k] || L(A.FN[u.k] || u.k));
};

A.click = (e) => {
  const f = A.flo(A.cur);
  if (!f) return;
  const [mx, my] = A.toW(e), tx = Math.floor(mx / T), ty = Math.floor(my / T);
  if (A.bld) return A.bldPlace(tx, ty);
  const hit = Object.values(A.E).filter((x) => x.fl === A.cur && x.st !== "lift").sort((a, b) => b.fy - a.fy).find((x) => mx >= x.fx - 2 && mx <= x.fx + 18 && my >= x.fy - 14 && my <= x.fy + 16);
  if (hit) return A.wBox(hit);
  if (A.sign && mx >= A.sign[0] && mx <= A.sign[0] + A.sign[2] && my >= A.sign[1] && my <= A.sign[1] + A.sign[3]) return A.signBox(f, { sx: e.clientX, sy: e.clientY });
  const u = (f.lay.fu || []).filter((u) => mx >= u.x * T && mx < (u.x + FS[u.k][0]) * T && my >= u.y * T - 10 && my < (u.y + FS[u.k][1]) * T).pop();
  if (u) return A.fuClick(f, u);
  if (f.k === "shell") return A.shellBox(f, { sx: e.clientX, sy: e.clientY });
  if (f.k === "basement") return A.addAcc({ sx: e.clientX, sy: e.clientY });
  close(); A.fol = null;
};

const PAL = ["desk", "couch", "plant", "tray", "coffee", "table", "plan", "screen", "chart", "board", "wall", "floor", "erase"];
A.setBld = (on) => {
  const f = A.flo(A.cur);
  if (on && (!f || f.k === "shell")) return toast("Build out first", 1);
  if (!on && A.bld) {
    const lay = A.bld.lay, dirty = A.bld.udo.length;
    A.bld = null; $("pal").hidden = true;
    if (dirty) A.api(`/api/floor/${f.id}/lay`, { lay }).then(() => { toast("Saved"); if (A.questOn() && A.quest.s === 1) A.questSet({ built: 1 }); A.poll(true); }).catch((x) => { fail(x); A.poll(true); });
    return;
  }
  if (on && !A.bld) { close(); A.fol = null; $("dlg").hidden = true; A.bld = { lay: JSON.parse(JSON.stringify(f.lay)), tool: "desk", udo: [] }; $("pal").hidden = false; pal(); }
};
const pal = () => {
  const p = $("pal");
  p.innerHTML = PAL.map((k) => `<button data-t="${k}" class="${A.bld.tool === k ? "on" : ""}"><canvas width="32" height="32"></canvas>${k === "wall" ? "Wall" : k === "floor" ? "Floor" : k === "erase" ? "Tear down" : L(A.FN[k])}</button>`).join("") + `<span class="sep"></span><button data-u><canvas width="32" height="32"></canvas>${"Undo"}</button><button data-q><canvas width="32" height="32"></canvas>${"Done"}</button>`;
  p.querySelectorAll("button").forEach((b) => {
    const c = b.querySelector("canvas").getContext("2d"), k = b.dataset.t;
    c.imageSmoothingEnabled = false;
    if (k && FS[k]) { const z = FS[k], t2 = document.createElement("canvas"); t2.width = z[0] * T + 8; t2.height = z[1] * T + 12; A.drawFuTo(t2.getContext("2d"), k); const m = Math.min(1, 32 / Math.max(t2.width, t2.height)); c.drawImage(t2, (32 - t2.width * m) / 2, (32 - t2.height * m) / 2, t2.width * m, t2.height * m); }
    else if (k === "wall") { c.fillStyle = A.FT.office.wl[0]; c.fillRect(8, 6, 16, 16); c.fillStyle = A.FT.office.wl[1]; c.fillRect(8, 19, 16, 4); }
    else if (k === "floor") { c.fillStyle = A.FT.office.fl[0]; c.fillRect(8, 8, 8, 8); c.fillRect(16, 16, 8, 8); c.fillStyle = "#2a2d33"; c.fillRect(16, 8, 8, 8); c.fillRect(8, 16, 8, 8); }
    else if (k === "erase") { c.fillStyle = "#d9594c"; for (let i = 0; i < 14; i++) { c.fillRect(9 + i, 9 + i, 2, 2); c.fillRect(23 - i, 9 + i, 2, 2); } }
    else if ("u" in b.dataset) { c.fillStyle = "#a7a49c"; c.fillRect(10, 14, 14, 3); c.fillRect(10, 10, 3, 10); c.fillRect(13, 11, 2, 2); }
    else { c.fillStyle = "#62b86f"; for (let i = 0; i < 5; i++) c.fillRect(8 + i, 15 + i, 2, 2); for (let i = 0; i < 10; i++) c.fillRect(13 + i, 19 - i, 2, 2); }
  });
  p.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.t) { A.bld.tool = b.dataset.t; pal(); } if ("u" in b.dataset) { const f = A.bld.udo.pop(); f ? f() : toast("Nothing to undo"); } if ("q" in b.dataset) A.setBld(false); };
};
A.bldPlace = (x, y) => {
  const B = A.bld, lay = B.lay, k = B.tool;
  if (!A.canPlace(lay, k, x, y)) {
    if (k === "wall" && A.occ({ lay }, x, y)) toast("Walls don't go through furniture");
    else if (k === "erase") { const u = A.occ({ lay }, x, y); if (u && ["gen", "rack"].includes(u.k)) toast("Generators and racks are removed via their menu"); if (u && u.k === "lift") toast("The elevator stays"); }
    return;
  }
  if (k === "erase") {
    const o = A.occ({ lay }, x, y);
    if (o) {
      if (o.k === "desk" && A.S.w.some((w) => w.fl === A.cur && w.desk === o.id)) return toast("Someone is sitting here. Move or dismiss them first.", 1);
      lay.fu = lay.fu.filter((u) => u !== o); B.udo.push(() => lay.fu.push(o));
    } else { lay.t[y][x] = 1; B.udo.push(() => (lay.t[y][x] = 2)); }
    return;
  }
  if (k === "wall") { lay.t[y][x] = 2; B.udo.push(() => (lay.t[y][x] = 1)); return; }
  if (k === "floor") { lay.t[y][x] = 1; B.udo.push(() => (lay.t[y][x] = 2)); return; }
  const id = lay.nx || 100; lay.nx = id + 1;
  const u = { id, k, x, y }; lay.fu.push(u); B.udo.push(() => (lay.fu = lay.fu.filter((v) => v !== u)));
};

const cv = $("cv");
let down = null;
cv.addEventListener("pointermove", (e) => {
  if (!A.bld) { A.hov = null; return; }
  const [x, y] = A.toW(e); A.hov = [Math.floor(x / T), Math.floor(y / T)];
  if (down && ["wall", "floor", "erase"].includes(A.bld.tool) && (down[0] !== A.hov[0] || down[1] !== A.hov[1])) { down = A.hov; A.bldPlace(A.hov[0], A.hov[1]); }
});
let drag = null;
cv.addEventListener("pointerdown", (e) => {
  if (A.bld) { const [x, y] = A.toW(e); down = [Math.floor(x / T), Math.floor(y / T)]; return A.click(e); }
  drag = { x: e.clientX, y: e.clientY, px: A.pan.x, py: A.pan.y, mv: false };
});
cv.addEventListener("pointermove", (e) => {
  if (!drag || innerWidth >= 720) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 8) drag.mv = true;
  if (drag.mv) { A.pan.x = drag.px + dx; A.pan.y = drag.py + dy; A.fol = null; }
});
addEventListener("pointerup", (e) => { down = null; if (drag && !drag.mv && e.target === cv) A.click(e); drag = null; });
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) { e.target.blur(); if (!$("bx").hidden) return close(); if (!$("pg").hidden) return A.page(null); return; }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (e.key === "Escape") { if (!$("pg").hidden) return A.page(null); close(); A.fol = null; $("dd").hidden = true; if (A.bld) A.setBld(false); }
  if (e.key === "b" && $("pg").hidden && innerWidth > 720) A.setBld(!A.bld);
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && A.bld) { const f = A.bld.udo.pop(); f && f(); }
  const fl = A.S ? A.S.fl : [], i = fl.findIndex((f) => f.id === A.cur);
  if (e.key === "PageUp" && i >= 0 && i < fl.length - 1) A.goFloor(fl[i + 1].id);
  if (e.key === "PageDown" && i > 0) A.goFloor(fl[i - 1].id);
});
})();
