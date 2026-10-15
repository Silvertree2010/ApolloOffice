import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdb, type DB, type It } from "./db.ts"
import { valid, more, cut, shok, type Pl, type Pm, type Sg, type Wk } from "./plan.ts"
import { ask, wrap, Lim } from "./ai.ts"
import { box } from "./tools.ts"
import { sh, tail } from "./sh.ts"
import { R, mdl, CEO_MD, now, day } from "./cfg.ts"

type WS = { st: string; say: string; t: number; mood: string; hold: boolean; busy: number }
const P = (n: string) => readFileSync(join(R, "prompts", n + ".md"), "utf8")
const hm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
const FLD = /^[a-zA-Z0-9_.]{1,64}$/

export class Of {
  n: string; od: string; db: DB; meta: any
  P: Pl | null = null; pt = 0; ok: Pm | null = null
  W: Record<string, WS> = {}
  FL: { a: string; b: string; t: number }[] = []
  bz = 0; rst = 0; rl = "allowed"; why = ""
  cb = false; cq = ""; la = now(); lw = 0
  er: number[] = []; pids = new Set<number>(); src: Record<string, number> = {}
  hq: string[] = []; dead = false

  constructor(od: string) {
    this.od = od
    this.meta = JSON.parse(readFileSync(join(od, "meta.json"), "utf8"))
    this.n = this.meta.name
    this.db = mkdb(join(od, "office.db"))
    for (const f of ["out", "tools", "checks", "runs"]) mkdirSync(join(od, f), { recursive: true })
    try { this.ok = JSON.parse(readFileSync(join(od, "ok.json"), "utf8")) } catch {}
    for (const p of this.db.kg("pids", [])) { try { process.kill(p, "SIGKILL") } catch {} }
    this.db.ks("pids", [])
    this.db.run("update it set lk=null where lk is not null")
    this.ws("ceo")
    this.load()
  }

  get st(): string { return this.db.kg("st", "new") }
  set st(v: string) { this.db.ks("st", v) }

  ws(id: string) { return (this.W[id] ||= { st: "idle", say: "", t: now(), mood: "", hold: false, busy: 0 }) }

  say(w: string, m: string, i: number | null = null) {
    const s = String(m).replace(/\s+/g, " ").trim().slice(0, 240)
    if (!s) return
    const x = this.ws(w)
    x.say = s; x.t = now()
    this.db.run("insert into ev(t,w,m,i) values(?,?,?,?)", now(), w, s, i)
  }
  mood(w: string, m: string) { const x = this.ws(w); x.mood = m; x.t = now() }
  flow(a: string, b: string) { this.FL.push({ a, b, t: now() }); while (this.FL.length > 40) this.FL.shift() }
  tok(w: string, i: number, o: number) { this.db.run("insert into tok(day,w,tin,tout) values(?,?,?,?) on conflict(day,w) do update set tin=tin+excluded.tin, tout=tout+excluded.tout", day(), w, i, o) }
  used() { return this.db.one("select coalesce(sum(tin+tout),0) n from tok where day=?", day()).n as number }
  pid(p: number, on: boolean) { on ? this.pids.add(p) : this.pids.delete(p); this.db.ks("pids", [...this.pids]) }
  rlx(i: any) {
    if (!i) return
    this.rl = i.status || "allowed"
    if (i.status === "rejected" && i.resetsAt) { this.rst = i.resetsAt * 1000; this.note(`Claude plan limit reached, paused until ${hm(this.rst)}`) }
  }
  pm(): Pm { return this.P && this.ok ? cut(this.P.perm, this.ok) : { fs: [], sh: false, net: [], push: false, gh: false } }
  cx(w: string, i: number | null) { return { od: this.od, dir: this.P!.dir, pm: this.pm(), log: (m: string) => this.say(w, m, i) } }

  load() {
    const f = join(this.od, "plan.json")
    if (!existsSync(f)) return
    const t = statSync(f).mtimeMs
    if (t === this.pt) return
    this.pt = t
    let x: any
    try { x = JSON.parse(readFileSync(f, "utf8")) } catch { return }
    const v = valid(x, this.od)
    if (!v.ok) { this.say("ceo", "plan.json is invalid: " + v.e.slice(0, 3).join("; ")); return }
    this.P = v.p
    for (const w of this.P!.workers) this.ws(w.id)
    for (const g of this.P!.stages) if (g.kind === "code") this.ws(g.id)
    if (this.P!.guard) this.ws("guard")
    for (const [k, x] of Object.entries(this.W)) if (!x.say) { const r = this.db.one("select m,t from ev where w=? order by id desc limit 1", k); if (r) { x.say = r.m; x.t = r.t } }
    const m = more(this.db.kg("seen"), this.P!.perm)
    if (this.st === "new") this.st = "draft"
    else if (this.st === "run" && m.length) { this.st = "review"; this.note("The CEO changed the office and needs your approval for: " + m.join("; ")) }
    else if (this.st === "review" && !m.length) this.st = "run"
  }

  start(g: Pm | null) {
    this.load()
    if (!this.P) throw new Error("no plan yet")
    const w = this.P.perm
    const a = g ? cut(w, g) : w
    this.ok = a
    writeFileSync(join(this.od, "ok.json"), JSON.stringify(a, null, 1))
    this.db.ks("seen", w)
    if (!this.db.kg("seeded")) {
      for (const s of this.P.seed) this.db.inew({ st: s.u && this.P.guard ? "guard:" + s.st : s.st!, ti: s.ti, d: s.d, u: s.u ? 1 : 0, why: "seed" })
      this.db.ks("seeded", 1)
    }
    this.db.ks("fin", 0)
    const no = more(a, w)
    this.db.run("insert into ch(t,who,m) values(?,?,?)", now(), "user", no.length ? "(started the office without: " + no.join("; ") + ")" : "(approved all requested permissions and started the office)")
    this.st = "run"
    this.say("ceo", "office started")
  }

  pause(on: boolean) {
    if (on && this.st === "run") { this.st = "pause"; this.say("ceo", "office paused") }
    else if (!on && this.st === "pause") { this.st = more(this.db.kg("seen"), this.P!.perm).length ? "review" : "run"; this.say("ceo", "office resumed") }
  }

  hook(t: string) {
    if (!this.P?.hook) return
    this.hq.push(t)
    while (this.hq.length > 50) this.hq.shift()
  }
  note(t: string) { this.say("ceo", t); this.hook(`[${this.n}] ${t}`) }
  async flush() {
    if (!this.P?.hook || !this.hq.length) return
    const t = this.hq[0], u = this.P.hook, nt = /ntfy/.test(u)
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": nt ? "text/plain" : "application/json" }, body: nt ? t : JSON.stringify({ content: t, text: t }), signal: AbortSignal.timeout(15000) })
      if (r.ok || r.status < 500) this.hq.shift()
    } catch {}
  }

  free(w: string, n: number) {
    const x = this.ws(w)
    return !x.hold && x.busy < n && this.bz < (this.P?.budget.par || 1)
  }
  wof(st: string) {
    if (st === "done" || st === "drop") return st
    if (st.startsWith("guard:")) return "guard"
    const g = this.P?.stages.find((s) => s.id === st)
    return g ? (g.kind === "code" ? g.id : g.worker!) : st
  }
  err(w: string, e: any, i: number | null) {
    this.er.push(now())
    this.say(w, "error: " + String(e?.message || e).slice(0, 220), i)
    this.mood(w, "err")
  }

  tick() {
    if (this.dead) return
    this.load()
    this.flush()
    if (!this.P) return
    if (this.st === "run" && !this.cb && now() - this.la > this.P.audit * 60000 && this.db.one("select count(*) n from ev where t>? and w!='ceo'", this.la).n > 0) this.ceo("audit")
    this.er = this.er.filter((t) => now() - t < 15 * 60000)
    if (this.st === "run" && this.er.length >= 3 && now() - this.lw > 20 * 60000 && !this.cb) { this.lw = now(); this.ceo("wake") }
    if (this.st !== "run") { this.why = ""; return }
    if (this.rst > now()) { this.why = `Claude plan limit, paused until ${hm(this.rst)}`; return }
    if (this.used() >= this.P.budget.tok) {
      if (!this.why.startsWith("daily")) this.note("daily token budget used up, paused until midnight (UTC)")
      this.why = "daily token budget used up"
      return
    }
    this.why = ""
    if (this.P.guard) {
      const q = this.db.all("select * from it where st like 'guard:%' and lk is null and nx<=? order by id limit 10", now()).map(this.db.pi) as It[]
      if (q.length && this.free("guard", 1)) this.guard(q)
    }
    for (const g of this.P.stages) {
      if (g.kind === "source") {
        const w = this.P.workers.find((x) => x.id === g.worker)!
        const op = this.db.one("select count(*) n from it where st=? or st=?", g.spawn, "guard:" + g.spawn).n
        if (now() - (this.src[g.id] || 0) >= g.every * 1000 && op < g.max && this.free(w.id, w.n)) { this.src[g.id] = now(); this.go(g, w, null) }
        continue
      }
      const w = g.kind === "code" ? null : this.P.workers.find((x) => x.id === g.worker)!
      const k = g.kind === "code" ? g.id : w!.id, cap = w ? w.n : g.n
      while (this.free(k, cap)) {
        const r = this.db.pi(this.db.one("select * from it where st=? and lk is null and nx<=? order by id limit 1", g.id, now()))
        if (!r) break
        this.go(g, w, r)
      }
    }
    if (!this.P.stages.some((g) => g.kind === "source") && !this.bz && !this.db.kg("fin") && !this.db.one("select count(*) n from it where st not in ('done','drop')").n && this.db.one("select count(*) n from it").n) {
      this.db.ks("fin", 1)
      this.note("all items are finished")
    }
  }

  go(g: Sg, w: Wk | null, it: It | null) {
    const k = w ? w.id : g.id
    const x = this.ws(k)
    x.busy++; this.bz++; x.st = "work"; x.t = now()
    if (it) this.db.iset(it.id, { lk: k })
    const p = it ? this.step(g, w, it) : this.source(g, w!)
    p.catch((e) => {
      if (e instanceof Lim) { if (this.rst < now()) this.rst = now() + 10 * 60000; if (it) this.db.iset(it.id, { lk: null }); return }
      this.err(k, e, it?.id ?? null)
      if (!it) return
      const n = it.n + 1
      if (n > g.retry) this.db.iset(it.id, { st: "drop", lk: null, n, why: "error: " + String(e?.message || e).slice(0, 200) })
      else this.db.iset(it.id, { lk: null, n, nx: now() + 30000 * n, why: "retry after error: " + String(e?.message || e).slice(0, 160) })
    }).finally(() => {
      x.busy--; this.bz--
      if (!x.busy) x.st = "idle"
    })
  }

  sys(w: Wk, ex: string) {
    const fs = [join(this.od, "out"), ...this.pm().fs].join(", ")
    return P("worker").replaceAll("{name}", w.name).replaceAll("{task}", this.P!.task).replaceAll("{role}", w.prompt).replaceAll("{tools}", w.tools.join(", ") || "none").replaceAll("{fs}", fs).replaceAll("{proto}", ex)
  }

  ai(w: Wk, sys: string, p: string, i: number | null) {
    return ask({
      od: this.od, md: mdl(w.model), sys, p, turns: w.turns, min: w.min, who: w.tools.length ? "w:" + w.id : undefined,
      say: (m) => this.say(w.id, m, i), tok: (a, b) => this.tok(w.id, a, b), rl: (r) => this.rlx(r), pid: (a, b) => this.pid(a, b),
    })
  }

  async source(g: Sg, w: Wk) {
    const op = this.db.one("select count(*) n from it where st=? or st=?", g.spawn, "guard:" + g.spawn).n
    const kn = this.db.all("select ti from it order by id desc limit 300").map((r) => "- " + r.ti).join("\n")
    const p = `STAGE ${g.id} (source): ${g.task}\n\nCreate at most ${g.max - op} new items. Items the office already has (never repeat them):\n${kn || "(none yet)"}`
    const { js, txt } = await this.ai(w, this.sys(w, P("proto-source")), p, null)
    if (!js) throw new Error("unreadable answer: " + txt.slice(0, 160))
    const n = this.spawn(g, js.spawn, g.max - op)
    this.say(w.id, String(js.say || `${n} new items`))
    if (n) { this.mood(w.id, "ok"); this.flow(w.id, this.wof(g.spawn!)) }
  }

  spawn(g: Sg, a: any, lim = 200) {
    if (!Array.isArray(a)) return 0
    const tg = g.kind === "source" ? g.spawn! : g.spawn || g.to.find((t) => t !== "done" && t !== "drop") || ""
    if (!tg) return 0
    let n = 0
    for (const s of a.slice(0, Math.max(0, lim))) {
      const ti = String(s?.ti || s?.title || "").trim().slice(0, 300)
      if (!ti || this.db.one("select 1 from it where ti=?", ti)) continue
      const u = g.untrusted ? 1 : 0
      this.db.inew({ st: u && this.P!.guard ? "guard:" + tg : tg, ti, d: s?.d && typeof s.d === "object" ? s.d : {}, u, why: "from " + g.id })
      n++
    }
    return n
  }

  async step(g: Sg, w: Wk | null, it: It) {
    const fb = it.d._fb
    let nx = "", d: any = {}, sy = "", sp: any = null
    if (g.kind === "code") {
      const cx = this.cx(g.id, it.id)
      if (g.run!.sh) {
        const e = shok(cx.pm, g.run!.sh)
        if (e) throw new Error(e)
        const f = join(this.od, "runs", `item-${it.id}.json`)
        writeFileSync(f, JSON.stringify(it))
        this.say(g.id, "$ " + g.run!.sh, it.id)
        const r = await sh(g.run!.sh, this.P!.dir, g.run!.min, { ITEM_ID: String(it.id), ITEM_FILE: f, OFFICE_OUT: join(this.od, "out") })
        d[g.id + "_out"] = tail(r.o, 4000); d[g.id + "_exit"] = r.c
        nx = r.c === 0 ? g.to[0] : g.fail
        sy = `exit ${r.c}`
      } else {
        const v = await box(cx, join(this.od, g.run!.js!), "check", {}, it, g.run!.min)
        nx = v.ok ? g.to[0] : g.fail
        d[g.id + "_why"] = String(v.why || "").slice(0, 2000)
        if (v.data && typeof v.data === "object") Object.assign(d, v.data)
        sy = (v.ok ? "ok" : "failed") + (v.why ? ": " + v.why : "")
      }
      if (nx === g.fail) {
        const lp = { ...(it.d._lp || {}) }
        lp[g.id] = (lp[g.id] || 0) + 1
        d._lp = lp
        if (g.fail !== "drop" && lp[g.id] > g.retry) { nx = "drop"; sy += `, failed ${lp[g.id]} times` }
        else if (g.fail !== "drop") d._fb = `${g.id} failed: ${sy}\n${String(d[g.id + "_out"] || "").slice(-1500)}`
      }
    } else {
      const al = [...new Set([...g.to, "drop"])]
      const body = JSON.stringify({ ...it.d, _fb: undefined }, null, 1)
      const p = `STAGE ${g.id}: ${g.task}\n\nAllowed values for next: ${al.join(", ")} (default ${g.to[0]}).\n\nITEM #${it.id}: ${it.u ? wrap("title", it.ti) : it.ti}\nDATA:\n${it.u ? wrap("data", body) : body}` + (fb ? `\n\nFEEDBACK from the last attempt (fix this):\n${fb}` : "")
      const { js, txt } = await this.ai(w!, this.sys(w!, P("proto-work").replaceAll("{spawn}", g.spawn || g.to.find((t) => t !== "done" && t !== "drop") || "none")), p, it.id)
      if (!js) throw new Error("unreadable answer: " + txt.slice(0, 160))
      nx = al.includes(js.next) ? js.next : g.to[0]
      if (js.data && typeof js.data === "object" && !Array.isArray(js.data)) d = js.data
      sy = String(js.say || js.why || "")
      sp = js.spawn
    }
    let m = { ...it.d, ...d }
    delete m._fb
    if (d._fb) m._fb = d._fb
    if (JSON.stringify(m).length > 400000) throw new Error("item data too large")
    if (g.check && nx !== "drop" && nx !== g.fail) {
      const v = await box(this.cx(w?.id || g.id, it.id), join(this.od, g.check), "check", {}, { ...it, d: m }, 10)
      if (!v.ok) {
        const n = it.n + 1
        if (n > g.retry) { this.db.iset(it.id, { st: g.fail, d: m, lk: null, n: 0, why: "check failed: " + String(v.why).slice(0, 200) }); this.say(w?.id || g.id, `#${it.id} check failed, moved to ${g.fail}: ${v.why}`, it.id); this.mood(w?.id || g.id, "sad"); this.flow(w?.id || g.id, this.wof(g.fail)); return }
        m._fb = "check failed: " + String(v.why).slice(0, 1500)
        this.db.iset(it.id, { d: m, lk: null, n, why: "check failed, retry " + n })
        this.say(w?.id || g.id, `#${it.id} check failed, retry: ${v.why}`, it.id)
        return
      }
      if (v.data && typeof v.data === "object") Object.assign(m, v.data)
    }
    this.db.iset(it.id, { st: nx, d: m, lk: null, n: 0, nx: 0, why: sy.slice(0, 300) })
    if (sp) this.spawn(g, sp)
    const k = w?.id || g.id
    this.say(k, `#${it.id} → ${nx}${sy ? ": " + sy : ""}`, it.id)
    this.mood(k, nx === "drop" || (g.kind === "code" && nx === g.fail) ? "sad" : "ok")
    this.flow(k, this.wof(nx))
  }

  async guard(q: It[]) {
    const x = this.ws("guard")
    x.busy++; this.bz++; x.st = "work"
    for (const i of q) this.db.iset(i.id, { lk: "guard" })
    try {
      const v = await this.gd(q.map((i) => ({ id: "i" + i.id, t: i.ti + "\n" + JSON.stringify(i.d).slice(0, 3500) })))
      for (const i of q) {
        const r = v["i" + i.id], tg = i.st.slice(6)
        if (r.inj) { this.db.iset(i.id, { st: "drop", lk: null, why: "guard: " + r.why }); this.say("guard", `#${i.id} blocked: ${r.why}`, i.id); this.mood("guard", "sad") }
        else { this.db.iset(i.id, { st: tg, lk: null }); this.flow("guard", this.wof(tg)) }
      }
      this.say("guard", `checked ${q.length} items`)
    } catch (e) {
      if (!(e instanceof Lim)) this.err("guard", e, null)
      for (const i of q) this.db.iset(i.id, { lk: null, nx: now() + 60000 })
    } finally { x.busy--; this.bz--; if (!x.busy) x.st = "idle" }
  }

  async gd(b: { id: string; t: string }[], dp = 0): Promise<Record<string, { inj: boolean; why: string }>> {
    const { js } = await ask({ od: this.od, md: mdl("haiku"), sys: P("guard"), ef: "low", p: b.map((x) => wrap(x.id, x.t)).join("\n\n") + `\n\nUse exactly these ids as JSON keys: ${b.map((x) => x.id).join(", ")}`, tok: (a, c) => this.tok("guard", a, c), rl: (r) => this.rlx(r), pid: (a, c) => this.pid(a, c) })
    if (js && b.every((x) => js[x.id] && typeof js[x.id].inj === "boolean")) return Object.fromEntries(b.map((x) => [x.id, { inj: js[x.id].inj, why: String(js[x.id].why || "") }]))
    if (b.length > 1 && dp < 3) { const h = b.length >> 1; return { ...(await this.gd(b.slice(0, h), dp + 1)), ...(await this.gd(b.slice(h), dp + 1)) } }
    throw new Error("guard gave no readable verdict")
  }

  chat(m: string) {
    this.db.run("insert into ch(t,who,m) values(?,?,?)", now(), "user", String(m).slice(0, 8000))
    this.ceo("chat")
  }

  stats() {
    const h = now() - 3600000
    return JSON.stringify({
      counts: Object.fromEntries(this.db.all("select st, count(*) n from it group by st").map((r) => [r.st, r.n])),
      drops_last_hour: this.db.all("select why, count(*) n from it where st='drop' and t1>? group by why order by n desc limit 20", h),
      errors_last_hour: this.db.all("select w, m from ev where t>? and m like 'error:%' order by id desc limit 20", h),
      tokens_today: Object.fromEntries(this.db.all("select w, tin+tout n from tok where day=?", day()).map((r) => [r.w, r.n])),
      budget: this.P?.budget,
    }, null, 1)
  }

  ceo(mode: string) {
    if (this.cb) { this.cq = this.cq || mode; return }
    this.cb = true
    const x = this.ws("ceo")
    x.st = "work"; x.t = now()
    if (mode === "audit" || mode === "wake") this.la = now()
    const ch = this.db.all("select who, m from ch order by id desc limit 40").reverse().map((r) => `${r.who.toUpperCase()}: ${r.m}`).join("\n\n")
    const ev = this.db.all("select t,w,m,i from ev order by id desc limit 80").map((e) => `${new Date(e.t).toISOString().slice(11, 19)} ${e.w}${e.i ? " #" + e.i : ""}: ${e.m}`).join("\n")
    const p = [
      `MODE: ${mode}`,
      `OFFICE: ${this.n}`,
      `TASK (from the user):\n${this.meta.task}`,
      `WORK FOLDER: ${this.meta.dir}`,
      `OFFICE FOLDER: ${this.od} (tools/, checks/, out/ for deliverables)`,
      `STATUS: ${this.st}${this.why ? " (" + this.why + ")" : ""}`,
      `PLAN: ${this.P ? "exists, read it with plan_get" : "none yet"}`,
      `APPROVED PERMISSIONS: ${this.ok ? JSON.stringify(this.ok) : "none yet"}`,
      this.ok && this.P ? `REJECTED BY THE USER (do not ask again without a good reason): ${JSON.stringify(more(this.ok, this.P.perm))}` : "",
      `CHAT (oldest first):\n${ch || "(empty)"}`,
      mode === "audit" || mode === "wake" ? `STATS:\n${this.stats()}\n\nRECENT EVENTS (newest first):\n${ev}` : "",
    ].filter(Boolean).join("\n\n")
    ask({
      od: this.od, md: mdl(CEO_MD), sys: P("ceo") + "\n\n" + P("plan"), p, turns: 80, min: 40, who: "ceo",
      say: (m) => this.say("ceo", m), tok: (a, b) => this.tok("ceo", a, b), rl: (r) => this.rlx(r), pid: (a, b) => this.pid(a, b),
    }).then(({ js, txt }) => {
      const s = String(js?.say || txt || "").trim()
      if (s && (mode === "design" || mode === "chat" || js?.tell)) {
        this.db.run("insert into ch(t,who,m) values(?,?,?)", now(), "ceo", s.slice(0, 8000))
        if (js?.ask) this.hook(`[${this.n}] CEO asks: ${s.slice(0, 300)}`)
      }
      if (s && this.ws("ceo").say !== s.replace(/\s+/g, " ").trim().slice(0, 240)) this.say("ceo", s)
      this.load()
      this.mood("ceo", "ok")
    }).catch((e) => {
      if (e instanceof Lim) { if (this.rst < now()) this.rst = now() + 10 * 60000 }
      this.err("ceo", e, null)
      if (mode === "design" || mode === "chat") this.db.run("insert into ch(t,who,m) values(?,?,?)", now(), "ceo", "(I could not finish: " + String(e?.message || e).slice(0, 300) + ")")
    }).finally(() => {
      this.cb = false
      x.st = "idle"
      if (this.cq && !this.dead) { const q = this.cq; this.cq = ""; this.ceo(q) }
    })
  }

  hold(w: string, on?: boolean) { const x = this.ws(w); x.hold = typeof on === "boolean" ? on : !x.hold; this.say(w, x.hold ? "paused by you" : "resumed") }
  drop(id: number) { const i = this.db.ig(id); if (i && !["done", "drop"].includes(i.st) && !i.lk) this.db.iset(id, { st: "drop", why: "dropped by you" }) }

  tiles() {
    return (this.P?.layout.tiles || []).map((t) => {
      const st = t.st || "done"
      let v: any = ""
      if (t.kind === "count") v = this.db.one("select count(*) n from it where st=?", st).n
      else if (t.kind === "sum" && t.field && FLD.test(t.field)) v = this.db.one(`select coalesce(sum(json_extract(d,'$.${t.field}')),0) n from it where st=?`, st).n
      else if (t.kind === "text") v = t.text || ""
      else if (t.kind === "list") v = this.db.all(t.field && FLD.test(t.field) ? `select json_extract(d,'$.${t.field}') v from it where st=? order by t1 desc limit 8` : "select ti v from it where st=? order by t1 desc limit 8", st).map((r) => String(r.v ?? ""))
      else if (t.kind === "chart") v = this.db.all("select date(t1/1000,'unixepoch') d, count(*) n from it where st=? and t1>? group by 1 order by 1", st, now() - 14 * 86400000)
      return { ...t, v }
    })
  }

  state() {
    const tk: Record<string, number> = {}
    for (const t of this.db.all("select w, tin+tout n from tok where day=?", day())) tk[t.w] = t.n
    const op = this.db.one("select count(*) n from it where st not in ('done','drop')").n
    return {
      t: now(), hm: homedir(), n: this.n, task: this.meta.task, dir: this.meta.dir, od: this.od, st: this.st, why: this.why, rl: this.rl, cb: this.cb,
      fin: !!this.db.kg("fin"), plan: this.P, ok: this.ok, need: this.P ? more(this.db.kg("seen"), this.P.perm) : [],
      w: Object.fromEntries(Object.entries(this.W).map(([k, v]) => [k, { ...v, tk: tk[k] || 0 }])),
      fl: this.FL.filter((f) => now() - f.t < 8000),
      q: this.db.all("select id,st,ti,why,n,lk,u,t1 from it where st not in ('done','drop') order by id limit 60"),
      dn: this.db.all("select id,st,ti,why,t1 from it where st in ('done','drop') order by t1 desc limit 25"),
      ev: this.db.all("select t,w,m,i from ev order by id desc limit 60"),
      cnt: Object.fromEntries(this.db.all("select st, count(*) n from it group by st").map((x) => [x.st, x.n])),
      ch: this.db.all("select t,who,m from ch order by id desc limit 60").reverse(),
      tok: { day: this.used(), max: this.P?.budget.tok || 0 }, op,
      tiles: this.tiles(),
    }
  }

  out() {
    const o = join(this.od, "out")
    return existsSync(o) ? o : ""
  }

  kill() {
    this.dead = true
    for (const p of this.pids) { try { process.kill(p, "SIGKILL") } catch {} }
  }
  rm() { this.kill(); this.db.close(); rmSync(this.od, { recursive: true, force: true }) }
}
