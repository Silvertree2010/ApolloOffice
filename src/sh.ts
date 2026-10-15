import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

export type Out = { c: number; o: string }

const SEC = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_PID", "CLAUDE_CODE_EXECPATH", "CLAUDE_CODE_SESSION_ATTENDED", "CLAUDE_PLUGIN_ROOT", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY"]
export const cenv = (x: Record<string, string> = {}) => {
  const e: any = { ...process.env, ...x }
  for (const k of SEC) delete e[k]
  return e
}

const BSH = existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh"

export const sh = (cmd: string, cwd: string, min = 20, x: Record<string, string> = {}) =>
  new Promise<Out>((res) => {
    const p = spawn(BSH, ["-c", cmd], { cwd, env: cenv(x), detached: true, stdio: ["ignore", "pipe", "pipe"] })
    let o = ""
    const add = (b: Buffer) => { o += b; if (o.length > 200000) o = o.slice(-100000) }
    const tm = setTimeout(() => { try { process.kill(-p.pid!, "SIGKILL") } catch {} o += "\n[timeout after " + min + " min]" }, min * 60000)
    p.stdout.on("data", add)
    p.stderr.on("data", add)
    p.on("error", (e) => { clearTimeout(tm); res({ c: -1, o: o + String(e) }) })
    p.on("close", (c) => { clearTimeout(tm); res({ c: c ?? -1, o }) })
  })

export const tail = (s: string, n = 30000) => (s.length > n ? "…" + s.slice(-n) : s)
