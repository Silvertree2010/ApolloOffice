import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { mkdirSync } from "node:fs"

export const R = join(dirname(fileURLToPath(import.meta.url)), "..")
export const H = process.env.APOLLO_OFFICE_HOME || join(homedir(), ".apollo-office")
mkdirSync(H, { recursive: true })
export const PORT = Number(process.env.APOLLO_OFFICE_PORT || 47300)
export const CB = process.env.CLAUDE_BIN || "claude"
export const V = "0.1.0"

export const MD: Record<string, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" }
export const mdl = (m: string) => MD[m] || m
export const rank = (m: string) => (/opus/.test(m) ? 2 : /sonnet/.test(m) ? 1 : 0)
export const CEO_MD = process.env.APOLLO_OFFICE_CEO_MODEL || "opus"

export const ACC = ["none", "tie", "cap", "antenna", "shield", "glasses", "magnifier", "pen", "headset", "hat", "beanie", "scarf", "badge", "apron", "shades", "headband", "tophat"]
export const BT = ["read", "write", "edit", "grep", "ls", "sh", "fetch"]

export const now = () => Date.now()
export const sl = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const day = () => new Date().toISOString().slice(0, 10)
