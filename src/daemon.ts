import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs"
import { join, extname, resolve } from "node:path"
import { Of } from "./office.ts"
import { H, PORT, R, V, now, sl } from "./cfg.ts"

const O = new Map<string, Of>()
for (const d of readdirSync(H)) {
  const od = join(H, d)
  if (!existsSync(join(od, "meta.json"))) continue
  try { O.set(d, new Of(od)) } catch (e: any) { console.error("could not load office", d, e?.message) }
}

const NM = /^[a-z0-9][a-z0-9-]{0,31}$/
const mk = (b: any) => {
  const n = String(b.name || "").toLowerCase()
  if (!NM.test(n)) throw new Error("name: lowercase letters, digits and dashes, at most 32")
  if (O.has(n)) throw new Error("an office named " + n + " already exists")
  const t = String(b.task || "").trim()
  if (!t) throw new Error("task is required")
  const dir = resolve(String(b.dir || process.cwd()))
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error("work folder does not exist: " + dir)
  const od = join(H, n)
  mkdirSync(od, { recursive: true })
  writeFileSync(join(od, "meta.json"), JSON.stringify({ name: n, task: t, dir, t: now() }, null, 1))
  const o = new Of(od)
  O.set(n, o)
  o.db.run("insert into ch(t,who,m) values(?,?,?)", now(), "user", t)
  o.ceo("design")
  return o
}

const MT: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" }
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])
const body = (q: any) => new Promise<any>((r) => { let b = ""; q.on("data", (c: any) => { b += c; if (b.length > 1e6) q.destroy() }); q.on("end", () => { try { r(JSON.parse(b || "{}")) } catch { r({}) } }) })
const list = () => [...O.values()].map((o) => ({ name: o.n, task: o.meta.task, dir: o.meta.dir, st: o.st, why: o.why, ceo: o.cb, open: o.db.one("select count(*) n from it where st not in ('done','drop')").n, done: o.db.one("select count(*) n from it where st='done'").n, tok: o.used(), url: `http://127.0.0.1:${PORT}/o/${o.n}/` }))

const act = (o: Of, b: any) => {
  switch (b.a) {
    case "start": o.start(b.perm || null); break
    case "pause": o.pause(true); break
    case "resume": o.pause(false); break
    case "hold": o.hold(String(b.w), b.on); break
    case "drop": o.drop(Number(b.id)); break
    case "chat": if (String(b.m || "").trim()) o.chat(String(b.m)); break
    case "rm": o.rm(); O.delete(o.n); return { ok: true }
    default: throw new Error("unknown action " + b.a)
  }
  return o.state()
}

const srv = createServer(async (q, s) => {
  const u = new URL(q.url || "/", "http://x")
  const js = (v: any, c = 200) => { s.writeHead(c, { "content-type": "application/json", "cache-control": "no-store" }); s.end(JSON.stringify(v)) }
  try {
    if (!HOSTS.has(String(q.headers.host))) return js({ error: "bad host" }, 403)
    if (q.method === "POST") {
      const og = q.headers.origin
      if (q.headers["x-office"] !== "1" || (og && !HOSTS.has(og.replace(/^https?:\/\//, "")))) return js({ error: "forbidden" }, 403)
    }
    const p = u.pathname
    if (p === "/api/ping") return js({ ok: true, v: V, pid: process.pid })
    if (p === "/api/offices") return js(list())
    if (p === "/api/wait") { await sl(Math.min(Number(u.searchParams.get("ms")) || 0, 15000)); s.writeHead(200, { "content-type": "image/gif" }); return s.end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64")) }
    if (p === "/api/new" && q.method === "POST") { const o = mk(await body(q)); return js({ ok: true, name: o.n, url: `http://127.0.0.1:${PORT}/o/${o.n}/` }) }
    if (p === "/api/quit" && q.method === "POST") { js({ ok: true }); setTimeout(() => quit(), 100); return }
    let m = p.match(/^\/api\/o\/([a-z0-9-]+)\/(state|act|item)$/)
    if (m) {
      const o = O.get(m[1])
      if (!o) return js({ error: "no office " + m[1] }, 404)
      if (m[2] === "state") return js(o.state())
      if (m[2] === "item") { const i = o.db.ig(Number(u.searchParams.get("id"))); return i ? js({ ...i, ev: o.db.all("select t,w,m from ev where i=? order by id desc limit 40", i.id) }) : js({ error: "no such item" }, 404) }
      if (q.method !== "POST") return js({ error: "POST only" }, 405)
      return js(act(o, await body(q)))
    }
    m = p.match(/^\/o\/([a-z0-9-]+)\/?$/)
    let f = ""
    if (p === "/" || p === "/index.html") f = "home.html"
    else if (m) { if (!p.endsWith("/")) { s.writeHead(302, { location: p + "/" }); return s.end() } f = "index.html" }
    else if ((m = p.match(/^\/(?:o\/[a-z0-9-]+\/)?([a-z0-9._-]+\.(?:js|css|svg|png))$/i))) f = m[1]
    if (f) {
      const b = await readFile(join(R, "ui", f))
      s.writeHead(200, { "content-type": MT[extname(f)] || "application/octet-stream", "cache-control": "no-store", "x-frame-options": "DENY" })
      return s.end(b)
    }
    js({ error: "not found" }, 404)
  } catch (e: any) { js({ error: String(e?.message || e) }, 400) }
})

const quit = () => {
  for (const o of O.values()) o.kill()
  srv.close()
  process.exit(0)
}
process.on("SIGTERM", quit)
process.on("SIGINT", quit)

srv.on("error", (e: any) => { console.error(e?.code === "EADDRINUSE" ? `port ${PORT} is in use (another ApolloOffice daemon?)` : e); process.exit(1) })
srv.listen(PORT, "127.0.0.1", () => console.log(`ApolloOffice ${V} on http://127.0.0.1:${PORT} (home ${H})`))

;(async () => {
  for (;;) {
    for (const o of O.values()) { try { o.tick() } catch (e: any) { o.err("ceo", e, null) } }
    await sl(1000)
  }
})()
