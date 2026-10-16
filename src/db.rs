use rusqlite::{params_from_iter, types::ValueRef, Connection, ToSql};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Db(pub Arc<Mutex<Connection>>);

const SCH: &str = "
pragma journal_mode=wal;
pragma busy_timeout=5000;
pragma foreign_keys=on;
create table if not exists kv(k text primary key, v text);
create table if not exists ses(id text primary key, t0 int, t1 int, exp int, ua text, ip text);
create table if not exists nonce(n text primary key, ck text, exp int);
create table if not exists lnk(c text primary key, exp int);
create table if not exists aud(id integer primary key, t int, who text, what text, det text);
create table if not exists acc(id integer primary key, k text, fmt text, nm text, base text, md text, sec blob, dir text, cfg text default '{}', st text default '{}', t0 int);
create table if not exists fl(id integer primary key, lvl int unique, k text, nm text, lay text default '{}', hook text, lv int default 1);
create table if not exists ty(id text primary key, nm text, role text, tools text default '[]', md text, ef text, prov text, acc text, col text, dsc text, outf text, chk text, own int default 0);
create table if not exists tool(id text primary key, dsc text, sch text, src text);
create table if not exists wk(id integer primary key, ty text, nm text, col text, fl int, desk int, cfg text default '{}', hold int default 0, t0 int);
create table if not exists tk(id integer primary key, ti text, tx text, src text, wk int, fl int, st text, res text default '', files text default '[]', mk int default 0, n int default 0, fb text default '', lk int default 0, nx int default 0, par int, kind text default 'task', prio int default 3, t0 int, t1 int);
create index if not exists tk_st on tk(st);
create table if not exists ev(id integer primary key, t int, w text, m text, tk int);
create table if not exists us(day text, acc int, wk int, fl int, tin int default 0, tout int default 0, usd real default 0, primary key(day, acc, wk, fl));
create table if not exists srv(id integer primary key, fl int, nm text, host text, port int, usr text, key blob, hk text, dock int default 0, cfg text default '{}', st text default '{}', t0 int);
create table if not exists job(id integer primary key, srv int, wk int, tk int, cmd text, st text, out text default '', ex int, lane int, t0 int, t1 int);
create table if not exists wid(id integer primary key, k text, nm text, src text default '{}', x int, y int, w int, h int, val text default 'null', t int default 0);
";

pub type P = Vec<Box<dyn ToSql + Send>>;

#[macro_export]
macro_rules! pa {
    ($($x:expr),* $(,)?) => { { let v: $crate::db::P = vec![$(Box::new($x)),*]; v } };
}

fn cv(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into()),
        ValueRef::Blob(_) => Value::Null,
    }
}

impl Db {
    pub fn open(f: &Path) -> anyhow::Result<Db> {
        let c = Connection::open(f)?;
        c.execute_batch(SCH)?;
        Ok(Db(Arc::new(Mutex::new(c))))
    }

    #[cfg(test)]
    pub fn mem() -> Db {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCH).unwrap();
        Db(Arc::new(Mutex::new(c)))
    }

    pub fn all(&self, s: &str, p: P) -> Vec<Value> {
        let c = self.0.lock().unwrap();
        let mut st = match c.prepare_cached(s) {
            Ok(x) => x,
            Err(e) => {
                eprintln!("sql {s}: {e}");
                return vec![];
            }
        };
        let n: Vec<String> = st.column_names().iter().map(|x| x.to_string()).collect();
        let r = st.query_map(params_from_iter(p.iter().map(|x| x.as_ref())), |r| {
            let mut m = Map::new();
            for (i, k) in n.iter().enumerate() {
                let mut v = cv(r.get_ref(i)?);
                if let Value::String(s) = &v {
                    if (k == "cfg" || k == "st" && s.starts_with('{') || k == "lay" || k == "tools" || k == "files" || k == "src" && s.starts_with('{') || k == "val" || k == "sch") && !s.is_empty() {
                        if let Ok(j) = serde_json::from_str::<Value>(s) {
                            v = j;
                        }
                    }
                }
                m.insert(k.clone(), v);
            }
            Ok(Value::Object(m))
        });
        match r {
            Ok(it) => it.filter_map(|x| x.ok()).collect(),
            Err(e) => {
                eprintln!("sql {s}: {e}");
                vec![]
            }
        }
    }

    pub fn one(&self, s: &str, p: P) -> Option<Value> {
        self.all(s, p).into_iter().next()
    }

    pub fn n(&self, s: &str, p: P) -> i64 {
        self.one(s, p).and_then(|v| v.as_object().and_then(|o| o.values().next().cloned())).and_then(|v| v.as_i64()).unwrap_or(0)
    }

    pub fn f(&self, s: &str, p: P) -> f64 {
        self.one(s, p).and_then(|v| v.as_object().and_then(|o| o.values().next().cloned())).and_then(|v| v.as_f64()).unwrap_or(0.0)
    }

    pub fn run(&self, s: &str, p: P) -> i64 {
        let c = self.0.lock().unwrap();
        match c.execute(s, params_from_iter(p.iter().map(|x| x.as_ref()))) {
            Ok(_) => c.last_insert_rowid(),
            Err(e) => {
                eprintln!("sql {s}: {e}");
                -1
            }
        }
    }

    pub fn ch(&self, s: &str, p: P) -> usize {
        let c = self.0.lock().unwrap();
        c.execute(s, params_from_iter(p.iter().map(|x| x.as_ref()))).unwrap_or(0)
    }

    pub fn blob(&self, s: &str, p: P) -> Option<Vec<u8>> {
        let c = self.0.lock().unwrap();
        c.query_row(s, params_from_iter(p.iter().map(|x| x.as_ref())), |r| r.get::<_, Option<Vec<u8>>>(0)).ok().flatten()
    }

    pub fn kg(&self, k: &str) -> Value {
        self.one("select v from kv where k=?", crate::pa![k.to_string()])
            .and_then(|r| r["v"].as_str().and_then(|s| serde_json::from_str(s).ok()))
            .unwrap_or(Value::Null)
    }

    pub fn ks(&self, k: &str, v: &Value) {
        self.run("insert into kv(k,v) values(?,?) on conflict(k) do update set v=excluded.v", crate::pa![k.to_string(), v.to_string()]);
    }

    pub fn kd(&self, k: &str) {
        self.run("delete from kv where k=?", crate::pa![k.to_string()]);
    }

    pub fn tx<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> rusqlite::Result<T> {
        let mut c = self.0.lock().unwrap();
        let t = c.transaction()?;
        let r = f(&t)?;
        t.commit()?;
        Ok(r)
    }

    pub fn backup(&self, to: &Path) -> anyhow::Result<()> {
        let c = self.0.lock().unwrap();
        let _ = std::fs::remove_file(to);
        c.execute("vacuum into ?", [to.to_string_lossy().to_string()])?;
        Ok(())
    }
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn day() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
