use rusqlite::{params_from_iter, types::ValueRef, Connection, ToSql};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Db(pub Arc<Mutex<Connection>>);

const SCH: &str = "
pragma journal_mode=wal;
pragma busy_timeout=5000;
create table if not exists kv(k text primary key, v text);
create table if not exists ses(id text primary key, exp int);
create table if not exists lnk(c text primary key, exp int);
create table if not exists rp(id integer primary key, full text unique, iss int default 1, hunt int default 0, ci text default '', setup text default '', rules text default '', mode text default 'ask', maxo int default 3, maxd int default 5, ai int default 1, on_ int default 1, t0 int);
create table if not exists hs(id text primary key, ssh text default '', dk int default 0, ln int default 1, ci int default 1, gb int default 50, raw int default 0, on_ int default 1, t0 int);
create table if not exists jobs(id integer primary key, repo text, num int, kind text default 'fix', title text, url text, st text, why text default '', d text default '{}', pr int, prio real default 0, t0 int, t1 int);
create index if not exists jobs_st on jobs(st);
create table if not exists ev(id integer primary key, t int, w text, m text, j int);
create table if not exists prs(repo text, num int, st text, title text, url text, upd text, merged text, d text default '{}', t0 int, primary key(repo, num));
create table if not exists tok(day text, w text, tin int default 0, tout int default 0, primary key(day, w));
create table if not exists seen(repo text, num int, upd text, primary key(repo, num));
create table if not exists cm(id text primary key, t int);
create table if not exists cost(id integer primary key, t int, day text, job int, repo text default '', w text, md text, sub int default 0, tin int default 0, tcw int default 0, tcr int default 0, tout int default 0, usd real);
create index if not exists cost_day on cost(day);
create index if not exists cost_job on cost(job);
";

fn mig(c: &Connection) {
    let _ = c.execute("alter table rp add column nm int default 1", []);
    let _ = c.execute("alter table hs add column no text default ''", []);
    let _ = c.execute("alter table hs add column cpu int default 0", []);
    let _ = c.execute("alter table rp add column bud real default 0", []);
    let _ = c.execute("alter table rp add column feat int default 0", []);
}

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
        mig(&c);
        Ok(Db(Arc::new(Mutex::new(c))))
    }

    #[cfg(test)]
    pub fn mem() -> Db {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCH).unwrap();
        mig(&c);
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
                if k == "d" {
                    if let Value::String(s) = &v {
                        v = serde_json::from_str(s).unwrap_or(json!({}));
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

    pub fn run(&self, s: &str, p: P) -> i64 {
        let c = self.0.lock().unwrap();
        crate::app::chg();
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
        crate::app::chg();
        c.execute(s, params_from_iter(p.iter().map(|x| x.as_ref()))).unwrap_or(0)
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

    pub fn usd(&self, r: Option<&str>) -> f64 {
        let v = match r {
            Some(r) => self.one("select coalesce(sum(usd),0) s from cost where day=? and sub=0 and repo=?", crate::pa![day(), r.to_string()]),
            None => self.one("select coalesce(sum(usd),0) s from cost where day=? and sub=0", crate::pa![day()]),
        };
        v.and_then(|x| x["s"].as_f64()).unwrap_or(0.0)
    }

    pub fn jg(&self, id: i64) -> Option<Job> {
        self.one("select * from jobs where id=?", crate::pa![id]).map(Job::of)
    }

    pub fn jset(&self, id: i64, f: &[(&str, Value)]) {
        if f.is_empty() {
            return;
        }
        let mut p: P = vec![];
        let mut s = vec![];
        for (k, v) in f {
            s.push(format!("{k}=?"));
            match v {
                Value::Null => p.push(Box::new(rusqlite::types::Null)),
                Value::Number(n) if n.is_i64() => p.push(Box::new(n.as_i64().unwrap())),
                Value::Number(n) => p.push(Box::new(n.as_f64().unwrap_or(0.0))),
                Value::String(x) => p.push(Box::new(x.clone())),
                o => p.push(Box::new(o.to_string())),
            }
        }
        p.push(Box::new(now()));
        p.push(Box::new(id));
        self.run(&format!("update jobs set {}, t1=? where id=?", s.join(",")), p);
    }

    pub fn jd(&self, j: &Job) {
        self.jset(j.id, &[("d", j.d.clone())]);
    }

    pub fn jnew(&self, repo: &str, num: i64, kind: &str, title: &str, url: &str, st: &str, why: &str, d: Value, pr: Option<i64>, prio: f64) -> i64 {
        let t = now();
        self.run("insert into jobs(repo,num,kind,title,url,st,why,d,pr,prio,t0,t1) values(?,?,?,?,?,?,?,?,?,?,?,?)", crate::pa![repo.to_string(), num, kind.to_string(), title.to_string(), url.to_string(), st.to_string(), why.to_string(), d.to_string(), pr, prio, t, t])
    }
}

#[derive(Clone, Debug)]
pub struct Job {
    pub id: i64,
    pub repo: String,
    pub num: i64,
    pub kind: String,
    pub title: String,
    #[allow(dead_code)]
    pub url: String,
    pub st: String,
    pub why: String,
    pub d: Value,
    pub pr: Option<i64>,
    pub t0: i64,
}

impl Job {
    pub fn of(v: Value) -> Job {
        Job {
            id: v["id"].as_i64().unwrap_or(0),
            repo: v["repo"].as_str().unwrap_or("").into(),
            num: v["num"].as_i64().unwrap_or(0),
            kind: v["kind"].as_str().unwrap_or("fix").into(),
            title: v["title"].as_str().unwrap_or("").into(),
            url: v["url"].as_str().unwrap_or("").into(),
            st: v["st"].as_str().unwrap_or("").into(),
            why: v["why"].as_str().unwrap_or("").into(),
            d: if v["d"].is_object() { v["d"].clone() } else { json!({}) },
            pr: v["pr"].as_i64(),
            t0: v["t0"].as_i64().unwrap_or(0),
        }
    }
    pub fn s(&self, k: &str) -> String {
        self.d[k].as_str().unwrap_or("").to_string()
    }
    pub fn h(&self) -> String {
        self.s("h")
    }
    pub fn hunt(&self) -> bool {
        self.d["hunt"].is_object()
    }
    pub fn ext(&self) -> bool {
        self.d["ext"].is_object()
    }
    pub fn feat(&self) -> bool {
        self.d["feat"].as_bool().unwrap_or(false)
    }
    pub fn own(&self) -> bool {
        self.hunt() || self.ext()
    }
    pub fn wh(&self) -> String {
        self.d["hunt"]["where"].as_str().or(self.d["ext"]["where"].as_str()).unwrap_or("").to_string()
    }
    pub fn orig(&self) -> String {
        if self.hunt() {
            "Bug found by our own testing (there is no GitHub issue; do not reference one)".into()
        } else if self.ext() {
            format!("Bug report sent to us directly from {} (there is no GitHub issue; do not reference one)", self.d["ext"]["src"].as_str().unwrap_or("an external tool"))
        } else if self.feat() {
            format!("Feature request, issue #{}", self.num)
        } else {
            format!("Issue #{}", self.num)
        }
    }
    pub fn tag(&self) -> String {
        if self.ext() {
            format!("{} report {}", self.repo, self.id)
        } else if self.hunt() || self.num == 0 {
            format!("{} find {}", self.repo, self.id)
        } else {
            format!("{}#{}", self.repo, self.num)
        }
    }
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn day() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn day0() -> i64 {
    let n = chrono::Local::now();
    n.date_naive().and_hms_opt(0, 0, 0).and_then(|d| d.and_local_timezone(chrono::Local).single()).map(|d| d.timestamp_millis()).unwrap_or(0)
}
