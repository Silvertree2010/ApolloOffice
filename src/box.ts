import { registerHooks } from "node:module"
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { pathToFileURL } from "node:url"

const BAN = new Set(["net", "http", "https", "http2", "tls", "dgram", "dns", "child_process", "worker_threads", "cluster", "inspector", "vm", "module", "repl", "v8", "wasi", "trace_events", "sqlite"])
registerHooks({
  resolve(sp, c, nx) {
    const b = sp.replace(/^node:/, "").split("/")[0]
    if (BAN.has(b) && (sp.startsWith("node:") || !sp.startsWith("."))) throw new Error(`module ${sp} is not allowed in office tools, use ctx.sh or ctx.fetch`)
    return nx(sp, c)
  },
})
const gb = process.getBuiltinModule?.bind(process)
;(process as any).getBuiltinModule = (n: string) => {
  if (BAN.has(String(n).replace(/^node:/, "").split("/")[0])) throw new Error(`module ${n} is not allowed in office tools`)
  return gb(n)
}
for (const k of ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"]) delete (globalThis as any)[k]
for (const k of ["binding", "_linkedBinding", "dlopen"]) { try { (process as any)[k] = undefined } catch {} }

const send = process.send!.bind(process)
let n = 0
const wait = new Map<number, [(v: any) => void, (e: any) => void]>()
const call = (fn: string, a: any) => new Promise<any>((ok, no) => { const id = ++n; wait.set(id, [ok, no]); send({ k: "call", id, fn, a }) })

process.on("message", async (m: any) => {
  if (m.k === "ret") {
    const w = wait.get(m.id)
    if (!w) return
    wait.delete(m.id)
    return m.e ? w[1](new Error(m.e)) : w[0](m.v)
  }
  if (m.k !== "run") return
  const dir = m.dir
  const rs = (p: string) => (/^out(\/|$)/.test(String(p)) ? resolve(m.out, String(p).slice(4)) : resolve(dir, p))
  const ctx = {
    dir, item: m.item, args: m.args,
    sh: (cmd: string, o: { min?: number } = {}) => call("sh", { cmd, min: o.min }),
    fetch: (url: string, o: any = {}) => call("fetch", { url, ...o }),
    read: (p: string) => readFileSync(rs(p), "utf8"),
    write: (p: string, t: string) => { const f = rs(p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t) },
    ls: (p = ".") => readdirSync(rs(p)),
    exists: (p: string) => existsSync(rs(p)),
    log: (s: string) => send({ k: "log", m: String(s).slice(0, 240) }),
  }
  try {
    const mod = await import(pathToFileURL(m.file).href + "?t=" + Date.now())
    const d = mod.default
    let v: any
    if (m.mode === "meta") v = { d: String(d?.d || ""), s: d?.s && typeof d.s === "object" ? d.s : { type: "object", properties: {} } }
    else if (m.mode === "tool") {
      const f = typeof d === "function" ? d : d?.f
      if (typeof f !== "function") throw new Error("tool module must export default { d, s, f } or a function")
      v = await f(m.args || {}, ctx)
      v = typeof v === "string" ? v : JSON.stringify(v)
    } else {
      if (typeof d !== "function") throw new Error("check module must export a default function (item, ctx) => ({ ok, why })")
      v = await d(m.item, ctx)
      if (!v || typeof v.ok !== "boolean") throw new Error("check must return { ok: boolean, why: string }")
    }
    send({ k: "done", v }, () => process.exit(0))
  } catch (e: any) {
    send({ k: "done", e: String(e?.stack || e?.message || e).slice(0, 2000) }, () => process.exit(0))
  }
})
send({ k: "up" })
