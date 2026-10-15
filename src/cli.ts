import { spawn } from "node:child_process"
import { openSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { H, PORT, R, sl } from "./cfg.ts"

const B = `http://127.0.0.1:${PORT}`
const a = process.argv.slice(2)
const fl = (k: string) => { const i = a.indexOf(k); if (i < 0) return undefined; const v = a[i + 1]; a.splice(i, 2); return v }
const has = (k: string) => { const i = a.indexOf(k); if (i < 0) return false; a.splice(i, 1); return true }

const ping = async () => { try { return (await fetch(B + "/api/ping", { signal: AbortSignal.timeout(1500) })).ok } catch { return false } }
const up = async () => {
  if (await ping()) return
  mkdirSync(H, { recursive: true })
  const lg = openSync(join(H, "daemon.log"), "a")
  const p = spawn(process.execPath, [join(R, "src/daemon.ts")], { detached: true, stdio: ["ignore", lg, lg], env: process.env })
  p.unref()
  for (let i = 0; i < 40; i++) { await sl(250); if (await ping()) return }
  throw new Error("daemon did not start, see " + join(H, "daemon.log"))
}
const get = async (p: string) => { const r = await fetch(B + p); const j = await r.json(); if (j?.error) throw new Error(j.error); return j }
const post = async (p: string, b: any) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", "x-office": "1" }, body: JSON.stringify(b) }); const j = await r.json(); if (j?.error) throw new Error(j.error); return j }
const open = (u: string) => {
  if (process.env.APOLLO_OFFICE_NO_OPEN || has("--no-open")) return
  const c = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
  try { spawn(c, [u], { detached: true, stdio: "ignore" }).unref() } catch {}
}
const ln = (o: any) => `${o.name.padEnd(18)} ${o.st.padEnd(7)} ${String(o.open).padStart(4)} open ${String(o.done).padStart(5)} done ${(o.ceo ? "CEO busy " : "") + (o.why || "")}\n${"".padEnd(19)}${o.url}`

const HELP = `ApolloOffice

office new <name> "<task>" [--dir <folder>] [--no-open]   create an office, the CEO designs it
office list                                                all offices
office status [<name>]                                     state of one or all offices
office open <name>                                         open the dashboard
office url <name>                                          print the dashboard URL
office chat <name> "<message>"                             write to the CEO
office start <name>                                        approve all requested permissions and start
office pause <name> | resume <name>
office rm <name>                                           delete an office and its data
office daemon                                              run the daemon in the foreground
office quit                                                stop the daemon (all offices pause)`

const main = async () => {
  const c = a.shift()
  if (!c || c === "help" || c === "-h" || c === "--help") return console.log(HELP)
  if (c === "daemon") { await import("./daemon.ts"); return }
  if (c === "quit") { if (await ping()) await post("/api/quit", {}); return console.log("daemon stopped") }
  await up()
  if (c === "new") {
    const dir = resolve(fl("--dir") || process.cwd())
    const [n, ...t] = a
    if (!n || !t.length) throw new Error('usage: office new <name> "<task>" [--dir <folder>]')
    const r = await post("/api/new", { name: n, task: t.join(" "), dir })
    console.log(`office ${r.name} created, the CEO is designing it.\ndashboard: ${r.url}`)
    return open(r.url)
  }
  if (c === "list" || (c === "status" && !a[0])) { const l = await get("/api/offices"); return console.log(l.length ? l.map(ln).join("\n") : "no offices yet") }
  const n = a.shift()
  if (!n) throw new Error("office name missing")
  if (c === "status") {
    const s = await get(`/api/o/${n}/state`)
    const w = Object.entries(s.w).filter(([, v]: any) => v.busy || v.st === "work").map(([k]) => k)
    console.log([`${s.n}: ${s.st}${s.why ? " (" + s.why + ")" : ""}${s.fin ? ", finished" : ""}`, `task: ${s.task}`, `items: ${JSON.stringify(s.cnt)}`, `working: ${w.join(", ") || "nobody"}`, `tokens today: ${s.tok.day}${s.tok.max ? " / " + s.tok.max : ""}`, s.need.length ? `waiting for approval: ${s.need.join("; ")}` : "", s.ch.length ? `last from CEO: ${(s.ch.filter((x: any) => x.who === "ceo").pop()?.m || "").slice(0, 600)}` : "", `out: ${s.od}/out`, `dashboard: ${B}/o/${n}/`].filter(Boolean).join("\n"))
    return
  }
  if (c === "url") return console.log(`${B}/o/${n}/`)
  if (c === "open") return open(`${B}/o/${n}/`)
  if (c === "chat") { await post(`/api/o/${n}/act`, { a: "chat", m: a.join(" ") }); return console.log("sent, the CEO answers in the dashboard (office status " + n + ")") }
  if (["start", "pause", "resume", "rm"].includes(c)) { await post(`/api/o/${n}/act`, { a: c }); return console.log(c === "rm" ? "deleted " + n : n + ": " + c) }
  throw new Error("unknown command " + c + "\n\n" + HELP)
}

main().catch((e) => { console.error("error: " + (e?.message || e)); process.exit(1) })
