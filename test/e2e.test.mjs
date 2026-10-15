import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, existsSync, readFileSync, realpathSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const R = join(dirname(fileURLToPath(import.meta.url)), "..")
const T = realpathSync(mkdtempSync(join(tmpdir(), "ao-e2e-")))
const H = join(T, "home"), W = join(T, "work")
const PORT = 47399
const B = `http://127.0.0.1:${PORT}`
const env = { ...process.env, APOLLO_OFFICE_HOME: H, APOLLO_OFFICE_PORT: String(PORT), CLAUDE_BIN: join(R, "test/fake-claude.mjs"), FAKE_RULES: join(R, "test/rules.mjs"), APOLLO_OFFICE_NO_OPEN: "1" }
const sl = (ms) => new Promise((r) => setTimeout(r, ms))
let d = null
const up = async () => {
  d = spawn(process.execPath, [join(R, "src/daemon.ts")], { env, stdio: ["ignore", "inherit", "inherit"] })
  for (let i = 0; i < 40; i++) { await sl(150); try { if ((await fetch(B + "/api/ping")).ok) return } catch {} }
  throw new Error("daemon not up")
}
const down = async () => { d.kill("SIGTERM"); await new Promise((r) => d.on("exit", r)) }
const st = async () => (await fetch(B + "/api/o/t1/state")).json()
const act = async (b) => (await fetch(B + "/api/o/t1/act", { method: "POST", headers: { "x-office": "1" }, body: JSON.stringify(b) })).json()
const until = async (f, ms = 20000) => { const t0 = Date.now(); for (;;) { const s = await st(); if (f(s)) return s; if (Date.now() - t0 > ms) throw new Error("timeout, state: " + JSON.stringify({ st: s.st, cnt: s.cnt, ev: s.ev.slice(0, 12) }, null, 1)); await sl(200) } }

import { mkdirSync } from "node:fs"
mkdirSync(W, { recursive: true })

test("office end to end with a fake claude", async () => {
  await up()
  try {
    const no = await fetch(B + "/api/new", { method: "POST", body: JSON.stringify({ name: "t1", task: "x", dir: W }) })
    assert.equal(no.status, 403, "POST without x-office header must be refused")
    const evil = await fetch(B + "/api/new", { method: "POST", headers: { "x-office": "1", origin: "https://evil.example" }, body: "{}" })
    assert.equal(evil.status, 403, "foreign origin must be refused")
    const r = await (await fetch(B + "/api/new", { method: "POST", headers: { "x-office": "1" }, body: JSON.stringify({ name: "t1", task: "write one file per topic", dir: W }) })).json()
    assert.equal(r.ok, true)
    let s = await until((s) => s.st === "draft" && s.ch.some((c) => c.who === "ceo"))
    assert.ok(s.ch.find((c) => c.who === "ceo").m.includes("built the office"))
    assert.ok(s.need.length > 0, "a fresh plan needs approval")
    assert.equal(s.plan.workers[1].model, "claude-sonnet-5-5")
    s = await act({ a: "start", perm: s.plan.perm })
    assert.equal(s.st, "run")
    s = await until((s) => s.cnt.done === 2 && s.cnt.drop === 1 && !s.q.length)
    assert.equal(s.cnt.done, 2, JSON.stringify(s.cnt))
    assert.equal(s.cnt.drop, 1)
    assert.ok(s.dn.some((x) => x.st === "drop" && /guard/.test(x.why)), "guard must drop the injection")
    for (const x of s.dn.filter((x) => x.st === "done")) assert.ok(existsSync(join(H, "t1/out", x.id + ".txt")))
    assert.ok(s.ev.some((e) => /check failed, retry/.test(e.m)), "the check must catch the missing file once")
    assert.equal(s.tiles[0].v, 2)
    assert.equal(s.tiles[1].v, 2)
    assert.ok(s.w.writer.tk > 0)
    s = await act({ a: "chat", m: "please ask for more permissions" })
    s = await until((s) => s.st === "review")
    assert.deepEqual(s.need, ["network: example.com"])
    s = await act({ a: "start", perm: { ...s.plan.perm, net: [] } })
    assert.equal(s.st, "run", "an office runs without the rejected permission")
    assert.deepEqual(s.ok.net, [])
    assert.deepEqual(s.need, [])
    await down()
    await up()
    s = await st()
    assert.equal(s.st, "run")
    assert.equal(s.cnt.done, 2)
    s = await act({ a: "rm" })
    assert.equal(existsSync(join(H, "t1")), false)
  } finally { if (d.exitCode == null) await down() }
})
