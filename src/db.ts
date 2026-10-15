import { DatabaseSync } from "node:sqlite"

export type It = { id: number; st: string; ti: string; d: any; why: string; n: number; lk: string | null; u: number; nx: number; t0: number; t1: number }

export const mkdb = (f: string) => {
  const d = new DatabaseSync(f)
  d.exec(`
pragma journal_mode=wal;
pragma busy_timeout=5000;
create table if not exists kv(k text primary key, v text);
create table if not exists it(id integer primary key, st text, ti text, d text default '{}', why text default '', n int default 0, lk text, u int default 0, nx int default 0, t0 int, t1 int);
create index if not exists it_st on it(st);
create table if not exists ev(id integer primary key, t int, w text, m text, i int);
create table if not exists tok(day text, w text, tin int default 0, tout int default 0, primary key(day, w));
create table if not exists ch(id integer primary key, t int, who text, m text);
`)
  const all = (s: string, ...a: any[]) => d.prepare(s).all(...a) as any[]
  const one = (s: string, ...a: any[]) => d.prepare(s).get(...a) as any
  const run = (s: string, ...a: any[]) => d.prepare(s).run(...a)
  const kg = (k: string, f: any = null) => {
    const r = one("select v from kv where k=?", k)
    return r ? JSON.parse(r.v) : f
  }
  const ks = (k: string, v: any) => run("insert into kv(k,v) values(?,?) on conflict(k) do update set v=excluded.v", k, JSON.stringify(v))
  const pi = (r: any): It | null => (r ? { ...r, d: JSON.parse(r.d || "{}") } : null)
  const ig = (id: number) => pi(one("select * from it where id=?", id))
  const iset = (id: number, p: Partial<It>) => {
    const k = Object.keys(p)
    if (!k.length) return
    const v = k.map((x) => (x === "d" ? JSON.stringify((p as any)[x]) : (p as any)[x]))
    run(`update it set ${k.map((x) => x + "=?").join(",")}, t1=? where id=?`, ...v, Date.now(), id)
  }
  const inew = (p: { st: string; ti: string; d?: any; u?: number; why?: string }) =>
    Number(run("insert into it(st,ti,d,u,why,t0,t1) values(?,?,?,?,?,?,?)", p.st, String(p.ti || "").slice(0, 300), JSON.stringify(p.d || {}), p.u || 0, p.why || "", Date.now(), Date.now()).lastInsertRowid)
  return { d, all, one, run, kg, ks, ig, iset, inew, pi, close: () => d.close() }
}

export type DB = ReturnType<typeof mkdb>
