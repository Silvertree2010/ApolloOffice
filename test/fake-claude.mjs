#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

const a = process.argv.slice(2)
const ar = (k) => { const i = a.indexOf(k); return i < 0 ? "" : a[i + 1] }
const sys = ar("--system-prompt")
const md = ar("--model")
const mc = ar("--mcp-config")
let p = ""
process.stdin.on("data", (b) => (p += b))
process.stdin.on("end", async () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n")
  let srv = null, n = 0
  const wait = new Map()
  const mcp = async () => {
    if (srv || !mc) return
    const c = JSON.parse(readFileSync(mc, "utf8")).mcpServers.office
    srv = spawn(c.command, c.args, { stdio: ["pipe", "pipe", "inherit"] })
    let buf = ""
    srv.stdout.on("data", (b) => {
      buf += b
      let i
      while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const m = JSON.parse(l); wait.get(m.id)?.(m); wait.delete(m.id) }
    })
    await rq("initialize", {})
  }
  const rq = (method, params) => new Promise((r) => { const id = ++n; wait.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n") })
  const tool = async (name, args) => {
    await mcp()
    out({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__office__" + name, input: args }] } })
    const r = await rq("tools/call", { name, arguments: args })
    return r.result?.content?.[0]?.text || JSON.stringify(r)
  }
  const list = async () => { await mcp(); return (await rq("tools/list", {})).result.tools.map((t) => t.name) }
  try {
    const rules = await import(pathToFileURL(process.env.FAKE_RULES).href)
    const r = await rules.default({ sys, p, md, tool, list, args: a })
    if (process.env.FAKE_SLOW) await new Promise((ok) => setTimeout(ok, Number(process.env.FAKE_SLOW) * (0.5 + Math.random())))
    if (r && r.err) { process.stderr.write(r.err); process.exit(1) }
    if (r && r.limit) out({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: Math.floor(Date.now() / 1000) + 3600 } })
    out({ type: "result", subtype: "success", is_error: false, result: typeof r === "string" ? r : JSON.stringify(r), usage: { input_tokens: 100, output_tokens: 20 } })
  } catch (e) {
    process.stderr.write(String(e?.stack || e))
    process.exit(1)
  } finally { srv?.kill() }
})
