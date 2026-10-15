import { spawn } from "node:child_process"
import { join } from "node:path"
import { mkdirSync, realpathSync, existsSync } from "node:fs"
import { R } from "./cfg.ts"
import { shok, netok, type Pm } from "./plan.ts"
import { sh, tail } from "./sh.ts"

export type Cx = { od: string; dir: string; pm: Pm; log?: (m: string) => void }

const strip = (h: string) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim()

export const web = async (pm: Pm, a: { url: string; method?: string; body?: string; headers?: Record<string, string>; raw?: boolean }) => {
  if (!netok(pm, a.url)) throw new Error(`network access to ${a.url} is not allowed in this office (allowed: ${pm.net.join(", ") || "none"})`)
  const m = (a.method || "GET").toUpperCase()
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(m)) throw new Error("bad method")
  const r = await fetch(a.url, { method: m, body: m === "GET" || m === "HEAD" ? undefined : a.body, headers: a.headers, redirect: "manual", signal: AbortSignal.timeout(60000) })
  if (r.status >= 300 && r.status < 400) {
    const l = r.headers.get("location") || ""
    return { status: r.status, text: "redirect to " + l + (netok(pm, new URL(l, a.url).href) ? "" : " (not in the allowed network list)") }
  }
  let t = await r.text()
  if (!a.raw && /html/.test(r.headers.get("content-type") || "")) t = strip(t)
  return { status: r.status, text: t.length > 200000 ? t.slice(0, 200000) + "\n…(cut)" : t }
}

export const run = async (x: Cx, fn: string, a: any) => {
  if (fn === "sh") {
    const e = shok(x.pm, String(a.cmd || ""))
    if (e) throw new Error(e)
    const r = await sh(a.cmd, x.dir, Math.min(Number(a.min) || 20, 180))
    return { c: r.c, o: tail(r.o) }
  }
  if (fn === "fetch") return web(x.pm, a)
  throw new Error("unknown call " + fn)
}

export const box = (x: Cx, file: string, mode: "tool" | "check" | "meta", args: any = {}, item: any = null, min = 20) =>
  new Promise<any>((ok, no) => {
    mkdirSync(join(x.od, "out"), { recursive: true })
    const rp = (v: string) => (existsSync(v) ? realpathSync(v) : v)
    const rd = [x.od, R, ...x.pm.fs].map(rp), wr = [join(x.od, "out"), ...x.pm.fs].map(rp)
    const a = ["--permission", ...rd.map((p) => "--allow-fs-read=" + p), ...wr.map((p) => "--allow-fs-write=" + p), join(rp(R), "src/box.ts")]
    const p = spawn(process.execPath, a, { cwd: x.dir, env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: x.od, LANG: "C.UTF-8" }, stdio: ["ignore", "pipe", "pipe", "ipc"] })
    let er = "", fin = false
    const end = (f: () => void) => { if (fin) return; fin = true; clearTimeout(tm); try { p.kill("SIGKILL") } catch {} f() }
    const tm = setTimeout(() => end(() => no(new Error("timeout after " + min + " min"))), min * 60000)
    p.stderr!.on("data", (b) => { er = (er + b).slice(-4000) })
    p.stdout!.on("data", (b) => x.log?.(String(b).trim().slice(0, 240)))
    p.on("message", async (m: any) => {
      if (m.k === "up") return p.send({ k: "run", mode, file: rp(file), args, item, dir: rp(x.dir), out: rp(join(x.od, "out")) })
      if (m.k === "log") return x.log?.(m.m)
      if (m.k === "call") {
        try { p.send({ k: "ret", id: m.id, v: await run(x, m.fn, m.a || {}) }) } catch (e: any) { try { p.send({ k: "ret", id: m.id, e: String(e?.message || e) }) } catch {} }
        return
      }
      if (m.k === "done") end(() => (m.e ? no(new Error(m.e)) : ok(m.v)))
    })
    p.on("error", (e) => end(() => no(e)))
    p.on("exit", (c) => end(() => no(new Error("tool process exited " + c + (er ? ": " + er.trim().split("\n").slice(-3).join(" ") : "")))))
  })
