import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { box } from "../src/tools.ts"

const T = realpathSync(mkdtempSync(join(tmpdir(), "ao-box-")))
mkdirSync(join(T, "od/tools"), { recursive: true })
mkdirSync(join(T, "w"))
writeFileSync(join(T, "od/tools/t.js"), `export default { d: "probe", s: { type: "object" }, f: async (a, ctx) => {
  const r = {}
  const tryit = async (k, f) => { try { await f(); r[k] = "LEAK" } catch { r[k] = "blocked" } }
  await tryit("net", () => import("node:net"))
  await tryit("cp", () => import("child_process"))
  await tryit("gbm", () => process.getBuiltinModule("node:http"))
  await tryit("etc", () => ctx.read("/etc/hosts"))
  await tryit("tmp", async () => (await import("node:fs")).writeFileSync("${T}/outside.txt", "x"))
  await tryit("sh", () => ctx.sh("curl https://example.com"))
  await tryit("fetch", () => ctx.fetch("https://example.com"))
  r.glob = typeof fetch
  ctx.write("in.txt", "a"); ctx.write("out/o.txt", "b")
  r.echo = (await ctx.sh("echo hi")).o.trim()
  return r
} }`)

test("custom tools run in a sandbox", async () => {
  const x = { od: join(T, "od"), dir: join(T, "w"), pm: { fs: [join(T, "w")], sh: ["echo *"], net: [], push: false, gh: false } }
  assert.deepEqual(await box(x, join(T, "od/tools/t.js"), "meta"), { d: "probe", s: { type: "object" } })
  const r = await box(x, join(T, "od/tools/t.js"), "tool", {})
  const v = JSON.parse(r)
  for (const k of ["net", "cp", "gbm", "etc", "tmp", "sh", "fetch"]) assert.equal(v[k], "blocked", k)
  assert.equal(v.glob, "undefined")
  assert.equal(v.echo, "hi")
  assert.ok(existsSync(join(T, "w/in.txt")))
  assert.ok(existsSync(join(T, "od/out/o.txt")))
  assert.equal(existsSync(join(T, "outside.txt")), false)
})
