import { existsSync, statSync } from "node:fs"
import { isAbsolute, resolve, join, relative } from "node:path"
import { ACC, BT, mdl, rank } from "./cfg.ts"

export type Wk = { id: string; name: string; model: string; prompt: string; tools: string[]; n: number; turns: number; min: number; color: string; acc: string }
export type Sg = { id: string; kind: "source" | "work" | "code"; worker?: string; task: string; to: string[]; fail: string; every: number; max: number; check?: string; run?: { sh?: string; js?: string; min?: number }; retry: number; untrusted: boolean; spawn?: string; n: number }
export type Pm = { fs: string[]; sh: boolean | string[]; net: string[]; push: boolean; gh: boolean }
export type Pl = {
  name: string; task: string; dir: string
  budget: { tok: number; par: number; max: string }
  perm: Pm; guard: boolean; audit: number; hook: string; est: string
  workers: Wk[]; stages: Sg[]
  seed: { ti: string; d?: any; st?: string; u?: boolean }[]
  layout: { rooms: { name: string; ws: string[] }[]; tiles: { kind: string; label: string; st?: string; field?: string; text?: string }[] }
}

const ID = /^[a-z][a-z0-9-]{0,23}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const RES = new Set(["done", "drop", "ceo", "guard"])
const TK = new Set(["count", "sum", "text", "list", "chart"])

export const inside = (p: string, r: string) => {
  const x = relative(r, p)
  return x === "" || (!x.startsWith("..") && !isAbsolute(x))
}

export const valid = (x: any, od: string): { ok: boolean; e: string[]; p: Pl | null } => {
  const e: string[] = []
  const f = (c: any, m: string) => { if (!c) e.push(m) }
  if (!x || typeof x !== "object") return { ok: false, e: ["plan must be a JSON object"], p: null }
  const s = (v: any, d = "") => (typeof v === "string" ? v : d)
  const n = (v: any, d: number, a: number, b: number) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, Math.round(v))) : d)
  const p: any = { name: s(x.name), task: s(x.task), dir: s(x.dir), guard: x.guard !== false, audit: n(x.audit, 60, 10, 1440), hook: s(x.hook), est: s(x.est) }
  f(p.task.trim(), "task is required")
  f(p.dir && isAbsolute(p.dir) && existsSync(p.dir) && statSync(p.dir).isDirectory(), "dir must be an absolute path to an existing directory")
  if (p.hook) f(/^https:\/\/[^\s]+$/.test(p.hook), "hook must be an https URL")
  const b = x.budget || {}
  p.budget = { tok: n(b.tok, 2_000_000, 10_000, 1_000_000_000), par: n(b.par, 3, 1, 16), max: ["haiku", "sonnet", "opus"].includes(b.max) ? b.max : "sonnet" }
  const pm = x.perm || {}
  const fsl = Array.isArray(pm.fs) ? pm.fs.filter((v: any) => typeof v === "string" && v) : []
  p.perm = {
    fs: [...new Set<string>((fsl.length ? fsl : ["."]).map((v: string) => resolve(p.dir || od, v)))],
    sh: pm.sh === true ? true : Array.isArray(pm.sh) ? pm.sh.filter((v: any) => typeof v === "string" && v.trim()).map((v: string) => v.trim()) : false,
    net: Array.isArray(pm.net) ? pm.net.filter((v: any) => typeof v === "string" && /^(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(v)).map((v: string) => v.toLowerCase()) : [],
    push: pm.push === true,
    gh: pm.gh === true,
  }
  for (const v of p.perm.fs) f(v !== "/" && v !== resolve(process.env.HOME || "/", "."), `fs path ${v} is too broad`)
  const ws = Array.isArray(x.workers) ? x.workers : []
  f(ws.length >= 1 && ws.length <= 24, "workers: 1 to 24 entries")
  const wid = new Set<string>()
  p.workers = ws.map((w: any, i: number) => {
    const id = s(w?.id)
    f(ID.test(id) && !RES.has(id), `workers[${i}].id must match ${ID} and not be done/drop/ceo/guard`)
    f(!wid.has(id), `duplicate worker id ${id}`)
    wid.add(id)
    const md = mdl(s(w?.model, "haiku"))
    f(/^claude-[a-z0-9-]+$/.test(md), `workers[${i}].model must be haiku, sonnet, opus or a claude-* model id`)
    f(rank(md) <= rank(mdl(p.budget.max)), `workers[${i}].model ${md} is above budget.max ${p.budget.max}`)
    const tl = Array.isArray(w?.tools) ? w.tools.filter((t: any) => typeof t === "string") : []
    for (const t of tl) {
      if (BT.includes(t)) continue
      if (/^tool:[a-z][a-z0-9_-]{0,31}$/.test(t)) { f(existsSync(join(od, "tools", t.slice(5) + ".js")), `workers[${i}] uses ${t} but tools/${t.slice(5)}.js does not exist`); continue }
      e.push(`workers[${i}].tools: unknown tool ${t} (built-in: ${BT.join(", ")}, custom: tool:<name>)`)
    }
    const pr = s(w?.prompt)
    f(pr.trim() && pr.length <= 20000, `workers[${i}].prompt is required, at most 20000 chars`)
    return { id, name: s(w?.name, id).slice(0, 24) || id, model: md, prompt: pr, tools: tl, n: n(w?.n, 1, 1, 8), turns: n(w?.turns, tl.length ? 30 : 1, 1, 200), min: n(w?.min, 20, 1, 180), color: HEX.test(w?.color) ? w.color : "", acc: ACC.includes(w?.acc) ? w.acc : "none" }
  })
  const ss = Array.isArray(x.stages) ? x.stages : []
  f(ss.length >= 1 && ss.length <= 32, "stages: 1 to 32 entries")
  const sid = new Set<string>(ss.map((g: any) => s(g?.id)))
  const seen = new Set<string>()
  p.stages = ss.map((g: any, i: number) => {
    const id = s(g?.id)
    f(ID.test(id) && !RES.has(id), `stages[${i}].id must match ${ID} and not be done/drop/ceo/guard`)
    f(!seen.has(id), `duplicate stage id ${id}`)
    seen.add(id)
    const k = ["source", "work", "code"].includes(g?.kind) ? g.kind : "work"
    const to = (Array.isArray(g?.to) ? g.to : typeof g?.to === "string" ? [g.to] : []).filter((t: any) => typeof t === "string")
    const ok = (t: string) => t === "done" || t === "drop" || (sid.has(t) && t !== id)
    for (const t of to) f(ok(t), `stages[${i}].to: unknown target ${t}`)
    const o: any = { id, kind: k, task: s(g?.task), to: to.length ? to : k === "source" ? [] : ["done"], fail: ok(s(g?.fail)) ? g.fail : "drop", every: n(g?.every, 600, 30, 86400), max: n(g?.max, 20, 1, 10000), retry: n(g?.retry, 1, 0, 5), untrusted: g?.untrusted === true, n: n(g?.n, 1, 1, 8) }
    if (k !== "code") {
      o.worker = s(g?.worker)
      f(wid.has(o.worker), `stages[${i}].worker ${o.worker} is not a worker id`)
      f(o.task.trim(), `stages[${i}].task is required`)
    }
    if (k === "source") {
      o.spawn = s(g?.spawn) || to[0] || ""
      f(sid.has(o.spawn) && o.spawn !== id, `stages[${i}] (source) needs spawn: the stage new items go to`)
    } else if (g?.spawn) { o.spawn = s(g.spawn); f(sid.has(o.spawn), `stages[${i}].spawn: unknown stage ${o.spawn}`) }
    if (g?.check) {
      const c = s(g.check)
      f(/^checks\/[a-z0-9_-]+\.js$/.test(c) && existsSync(join(od, c)), `stages[${i}].check must be checks/<name>.js and exist`)
      o.check = c
    }
    if (k === "code") {
      const r = g?.run || {}
      o.run = { sh: s(r.sh) || undefined, js: s(r.js) || undefined, min: n(r.min, 20, 1, 180) }
      f(!!o.run.sh !== !!o.run.js, `stages[${i}] (code) needs exactly one of run.sh or run.js`)
      if (o.run.js) f(/^checks\/[a-z0-9_-]+\.js$/.test(o.run.js) && existsSync(join(od, o.run.js)), `stages[${i}].run.js must be checks/<name>.js and exist`)
      if (o.run.sh) f(shok(p.perm, o.run.sh) === "", `stages[${i}].run.sh is not allowed by perm.sh: ${shok(p.perm, o.run.sh)}`)
    }
    return o
  })
  f(p.stages.some((g: Sg) => g.kind === "source") || (Array.isArray(x.seed) && x.seed.length), "the office needs a source stage or seed items, otherwise nothing ever happens")
  p.seed = (Array.isArray(x.seed) ? x.seed : []).slice(0, 1000).map((v: any, i: number) => {
    const st = s(v?.st) || p.stages.find((g: Sg) => g.kind !== "source")?.id || ""
    f(sid.has(st), `seed[${i}].st: unknown stage ${st}`)
    return { ti: s(v?.ti, "item " + (i + 1)), d: v?.d && typeof v.d === "object" ? v.d : {}, st, u: v?.u === true }
  })
  const ly = x.layout || {}
  p.layout = {
    rooms: (Array.isArray(ly.rooms) ? ly.rooms : []).slice(0, 8).map((r: any) => ({ name: s(r?.name, "Room").slice(0, 20), ws: (Array.isArray(r?.ws) ? r.ws : []).filter((w: any) => wid.has(w)) })),
    tiles: (Array.isArray(ly.tiles) ? ly.tiles : []).slice(0, 8).filter((t: any) => TK.has(t?.kind)).map((t: any) => ({ kind: t.kind, label: s(t.label, t.kind).slice(0, 32), st: s(t.st) || undefined, field: s(t.field) || undefined, text: s(t.text).slice(0, 400) || undefined })),
  }
  return { ok: !e.length, e, p: e.length ? null : p }
}

const BAN = /\bsudo\b|\bsecurity\s+(find|dump|export)|\.ssh\b|keychain|\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)|\bcurl\b[^|]*\|\s*(ba)?sh|\bmkfs\b|\bdd\s+if=/i
const glob = (g: string) => new RegExp("^" + g.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$")

export const shok = (pm: Pm, c: string) => {
  if (pm.sh === false) return "shell is not allowed in this office"
  if (BAN.test(c)) return "command is blocked (sudo, credentials, ssh keys, destructive rm)"
  if (!pm.push && /\bgit\b[^;&|]*\bpush\b/.test(c)) return "git push is not allowed in this office"
  if (!pm.gh && /(^|[\s;&|(])gh\s/.test(c)) return "gh is not allowed in this office"
  if (pm.sh === true) return ""
  if (/`|\$\(|\n|<\(|>\(/.test(c)) return "command substitution and multi-line commands need perm.sh = true"
  const al = pm.sh.map(glob)
  for (const seg of c.split(/&&|\|\||;|\|/)) {
    const g = seg.trim().replace(/\s*\d?>&\d\s*$/, "").replace(/\s*2>\s*\/dev\/null\s*$/, "").trim()
    if (!g) continue
    if (/^(cd|echo|true|tail|head|wc|cat|ls|pwd)(\s|$)/.test(g)) continue
    if (!al.some((r) => r.test(g))) return `"${g.slice(0, 80)}" does not match any allowed command (${pm.sh.join(", ")})`
  }
  return ""
}

export const netok = (pm: Pm, u: string) => {
  let h = ""
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return false; h = x.host.toLowerCase() } catch { return false }
  return pm.net.some((d) => (d.startsWith("*.") ? h === d.slice(2) || h.endsWith(d.slice(1)) : h === d || h.split(":")[0] === d))
}

export const more = (a: Pm | null, b: Pm) => {
  if (!a) return ["everything (not approved yet)"]
  const m: string[] = []
  for (const f of b.fs) if (!a.fs.some((r) => inside(f, r))) m.push("files: " + f)
  if (b.sh !== false && a.sh === false) m.push("shell")
  else if (b.sh === true && a.sh !== true) m.push("shell: any command")
  else if (Array.isArray(b.sh) && Array.isArray(a.sh)) for (const c of b.sh) if (!a.sh.includes(c)) m.push("shell: " + c)
  for (const d of b.net) if (!a.net.includes(d)) m.push("network: " + d)
  if (b.push && !a.push) m.push("git push")
  if (b.gh && !a.gh) m.push("GitHub CLI")
  return m
}

export const cut = (want: Pm, ok: Pm): Pm => ({
  fs: want.fs.filter((f) => ok.fs.some((r) => inside(f, r))),
  sh: want.sh === false || ok.sh === false ? false : want.sh === true ? (ok.sh === true ? true : ok.sh) : ok.sh === true ? want.sh : want.sh.filter((c) => (ok.sh as string[]).includes(c)),
  net: want.net.filter((d) => ok.net.includes(d)),
  push: want.push && ok.push,
  gh: want.gh && ok.gh,
})
