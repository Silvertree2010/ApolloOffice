import { spawn } from "node:child_process"
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { CB, R } from "./cfg.ts"
import { cenv } from "./sh.ts"

export class Lim extends Error {}

export type AO = {
  od: string; md: string; sys: string; p: string; turns?: number; min?: number; who?: string; ef?: string
  say?: (m: string) => void; tok?: (i: number, o: number) => void; rl?: (x: any) => void; pid?: (p: number, on: boolean) => void
}

export const wrap = (id: string, t: string) => {
  const n = randomBytes(4).toString("hex")
  return `<untrusted-${n} id="${id}">\n${String(t).replaceAll(`untrusted-${n}`, "untrusted")}\n</untrusted-${n}>`
}

export const pj = (t: string) => {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/g)
  const c = m ? m.map((x) => x.replace(/^```(?:json)?\s*|```$/g, "")).reverse() : []
  for (const s of [...c, t]) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}")
    if (a < 0 || b < a) continue
    try { return JSON.parse(s.slice(a, b + 1)) } catch {}
  }
  return null
}

export const ask = (o: AO) =>
  new Promise<{ txt: string; js: any }>((ok, no) => {
    const e0 = join(o.od, "empty"), rd = join(o.od, "runs")
    mkdirSync(e0, { recursive: true })
    mkdirSync(rd, { recursive: true })
    const a = ["-p", "--model", o.md, "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", o.sys, "--output-format", "stream-json", "--verbose", "--max-turns", String(o.turns || 1)]
    if (o.ef) a.push("--effort", o.ef)
    let mf = ""
    if (o.who) {
      mf = join(rd, `mcp-${o.who.replace(/[^a-z0-9-]/gi, "_")}-${Date.now()}-${randomBytes(3).toString("hex")}.json`)
      writeFileSync(mf, JSON.stringify({ mcpServers: { office: { type: "stdio", command: process.execPath, args: [join(R, "src/mcp.ts"), o.od, o.who] } } }))
      a.push("--mcp-config", mf, "--tools", "", "--allowedTools", "mcp__office")
    } else a.push("--tools", "")
    const p = spawn(CB, a, { cwd: e0, env: cenv({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", MCP_TOOL_TIMEOUT: "10800000", DISABLE_AUTOUPDATER: "1" }), stdio: ["pipe", "pipe", "pipe"] })
    o.pid?.(p.pid!, true)
    let buf = "", txt = "", err = "", done = false, fin = false
    const end = () => {
      if (fin) return
      fin = true
      clearTimeout(tm)
      o.pid?.(p.pid!, false)
      if (mf) { try { unlinkSync(mf) } catch {} }
      if (/usage limit|rate.?limit|limit reached|\b429\b/i.test(err) && !txt) return no(new Lim(err.slice(0, 200)))
      if (!done && !txt) return no(new Error("claude failed: " + (err.trim().slice(-400) || "no result")))
      ok({ txt, js: pj(txt) })
    }
    const tm = setTimeout(() => { err += " timeout"; try { p.kill("SIGKILL") } catch {} }, (o.min || 20) * 60000)
    p.stdout.on("data", (b) => {
      buf += b
      let i
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let d: any
        try { d = JSON.parse(l) } catch { continue }
        if (d.type === "rate_limit_event") o.rl?.(d.rate_limit_info)
        else if (d.type === "assistant") {
          for (const c of d.message?.content || []) {
            if (c.type === "text" && c.text.trim() && !/^\s*(```|\{)/.test(c.text)) o.say?.(c.text)
            else if (c.type === "tool_use") o.say?.("→ " + String(c.name).replace("mcp__office__", "") + " " + JSON.stringify(c.input).slice(0, 160))
          }
        } else if (d.type === "result") {
          txt = d.result || ""
          const u = d.usage || {}
          o.tok?.((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + Math.round((u.cache_read_input_tokens || 0) / 10), u.output_tokens || 0)
          if (d.is_error || d.subtype !== "success") err += " " + d.subtype + " " + (d.result || "")
          done = true
        }
      }
    })
    p.stderr.on("data", (b) => { err = (err + b).slice(-4000) })
    p.on("error", (e) => { err += String(e); end() })
    p.on("close", end)
    p.stdin.end(o.p)
  })
