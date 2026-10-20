use crate::db::{now, Db};
use crate::pa;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const V: &str = env!("CARGO_PKG_VERSION");
pub const WS: &[&str] = &["scout", "guard", "vet", "watcher", "hunter", "repro", "fixer", "ci", "reviewer", "submit"];

#[derive(Clone, Serialize, Default)]
pub struct Wk {
    pub st: String,
    pub say: String,
    pub job: Option<i64>,
    pub md: String,
    pub hold: bool,
    pub t: i64,
    pub mood: String,
    pub cmds: Vec<(i64, String)>,
}

#[derive(Clone, Serialize, Default)]
pub struct Of {
    pub off: bool,
    pub pause: String,
    pub man: bool,
    pub rst: i64,
    pub rl: String,
    pub warn: bool,
    pub vn: usize,
    pub net: BTreeMap<String, bool>,
}

#[derive(Clone, Serialize)]
pub struct Fl {
    pub a: String,
    pub b: String,
    pub t: i64,
    pub k: String,
}

#[derive(Default)]
pub struct Lv {
    pub w: BTreeMap<String, Wk>,
    pub o: Of,
    pub fl: Vec<Fl>,
    pub ln: HashMap<i64, String>,
    pub cil: HashMap<i64, String>,
    pub hst: HashMap<String, Value>,
}

#[derive(Clone)]
pub struct Rn {
    pub h: String,
    pub dir: String,
    pub w: String,
    pub md: String,
}

pub struct App {
    pub db: Db,
    pub dd: PathBuf,
    pub port: u16,
    pub me: PathBuf,
    pub lv: Mutex<Lv>,
    pub hc: reqwest::Client,
    pub act: Mutex<HashSet<String>>,
    pub lk: Mutex<HashSet<i64>>,
    pub lanes: Mutex<HashSet<String>>,
    pub sem: Mutex<HashMap<String, usize>>,
    pub runs: Mutex<HashMap<String, Rn>>,
    pub cache: Mutex<HashMap<String, (i64, Value)>>,
    pub vtk: Mutex<HashSet<i64>>,
    pub sw: tokio::sync::Notify,
    pub vk: Mutex<Option<[u8; 32]>>,
    pub quit: tokio::sync::Notify,
    pub restart: Mutex<bool>,
    pub drain: std::sync::atomic::AtomicBool,
    pub oa: Mutex<HashMap<String, (String, String, i64)>>,
}

pub type Ax = Arc<App>;

pub static CHG: tokio::sync::Notify = tokio::sync::Notify::const_new();

pub fn chg() {
    CHG.notify_waiters();
}

#[derive(Debug)]
pub enum X {
    Drop(String),
    Back(String),
    Lim(String),
    Net(String),
    E(String),
}

impl std::fmt::Display for X {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            X::Drop(s) | X::Back(s) | X::Lim(s) | X::Net(s) | X::E(s) => write!(f, "{s}"),
        }
    }
}

pub type R<T> = Result<T, X>;

pub fn e<T>(s: impl Into<String>) -> R<T> {
    Err(X::E(s.into()))
}

pub fn drop<T>(s: impl Into<String>) -> R<T> {
    Err(X::Drop(s.into()))
}

pub fn netish(s: &str) -> bool {
    regex::Regex::new(r"(?i)could not resolve|timed out|connection (reset|refused|closed)|network is unreachable|ENOTFOUND|ECONN|EAI_AGAIN|kex_exchange|Broken pipe|ssh: connect|error connecting|Could not resolve host|TLS handshake").unwrap().is_match(s)
}

pub fn ddir(o: Option<PathBuf>) -> PathBuf {
    if let Some(p) = o.or_else(|| std::env::var_os("APOLLO_OFFICE_DATA").map(PathBuf::from)) {
        return p;
    }
    dd0()
}

pub fn dd0() -> PathBuf {
    if cfg!(windows) {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("ApolloOffice")
    } else if cfg!(target_os = "macos") {
        dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("ApolloOffice")
    } else {
        dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("apollo-office")
    }
}

pub fn dset() -> Value {
    json!({
        "md": {
            "scout": "claude-haiku-5-5", "guard": "claude-haiku-5-5", "vet": "claude-haiku-5-5", "watcher": "claude-haiku-5-5",
            "repro": "claude-haiku-5-5", "repro2": "claude-sonnet-5-5", "fixer": "claude-sonnet-5-5", "hunter": "claude-sonnet-5-5",
            "reviewer": "claude-haiku-5-5", "big": "claude-opus-5-5"
        },
        "big": true,
        "hunters": 2,
        "tokday": 0,
        "budday": 0,
        "ntfy": "",
        "discord": "",
        "updates": true,
        "prov": {}
    })
}

impl App {
    pub fn new(db: Db, dd: PathBuf, port: u16, me: PathBuf) -> App {
        let mut lv = Lv::default();
        let ho = db.kg("hold");
        for w in WS {
            lv.w.insert(w.to_string(), Wk { st: "idle".into(), hold: ho[*w].as_bool().unwrap_or(false), t: now(), ..Default::default() });
        }
        lv.o.man = db.kg("man").as_bool().unwrap_or(false);
        lv.o.rl = "allowed".into();
        App {
            db,
            dd,
            port,
            me,
            lv: Mutex::new(lv),
            hc: reqwest::Client::builder().user_agent(concat!("ApolloOffice/", env!("CARGO_PKG_VERSION"))).timeout(std::time::Duration::from_secs(30)).build().unwrap(),
            act: Mutex::new(HashSet::new()),
            lk: Mutex::new(HashSet::new()),
            lanes: Mutex::new(HashSet::new()),
            sem: Mutex::new(HashMap::new()),
            runs: Mutex::new(HashMap::new()),
            cache: Mutex::new(HashMap::new()),
            vtk: Mutex::new(HashSet::new()),
            sw: tokio::sync::Notify::new(),
            vk: Mutex::new(None),
            quit: tokio::sync::Notify::new(),
            restart: Mutex::new(false),
            drain: std::sync::atomic::AtomicBool::new(false),
            oa: Mutex::new(HashMap::new()),
        }
    }

    pub fn set(&self) -> Value {
        let mut d = dset();
        let s = self.db.kg("set");
        if let Some(o) = s.as_object() {
            for (k, v) in o {
                if k == "md" {
                    if let Some(m) = v.as_object() {
                        for (a, b) in m {
                            if b.as_str().map(|x| !x.trim().is_empty()).unwrap_or(false) {
                                d["md"][a] = b.clone();
                            }
                        }
                    }
                } else {
                    d[k] = v.clone();
                }
            }
        }
        d
    }

    pub fn md(&self, w: &str) -> String {
        if crate::routing::enabled(self) {
            if matches!(w,"fixer"|"repro") {
                if let Some(md) = self.set()["opencode_authors"].as_array().and_then(|rows| rows.iter()
                    .filter_map(|v| v.as_str()).find(|md| crate::routing::is_opencode(md))) { return md.to_string(); }
            }
            return crate::routing::FREE[0].into();
        }
        self.set()["md"][w].as_str().unwrap_or("claude-sonnet-5-5").to_string()
    }

    pub fn say(&self, w: &str, m: &str, j: Option<i64>) {
        let s: String = m.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(240).collect();
        {
            let mut l = self.lv.lock().unwrap();
            if let Some(x) = l.w.get_mut(w) {
                x.say = s.clone();
                x.t = now();
                if j.is_some() {
                    x.job = j;
                }
            }
        }
        self.db.run("insert into ev(t,w,m,j) values(?,?,?,?)", pa![now(), w.to_string(), s, j]);
    }

    pub fn st(&self, w: &str, s: &str, j: Option<i64>, mood: &str) {
        let mut l = self.lv.lock().unwrap();
        if let Some(x) = l.w.get_mut(w) {
            x.st = s.into();
            x.job = j;
            x.mood = mood.into();
            x.t = now();
        }
        chg();
    }

    pub fn cmd(&self, w: &str, s: &str) {
        if let Some(x) = self.lv.lock().unwrap().w.get_mut(w) {
            x.cmds.push((now(), s.chars().take(160).collect()));
            let n = x.cmds.len();
            if n > 5 {
                x.cmds.drain(..n - 5);
            }
        }
        chg();
    }

    pub fn stmd(&self, w: &str, md: &str) {
        if let Some(x) = self.lv.lock().unwrap().w.get_mut(w) {
            x.md = md.into();
        }
        chg();
    }

    pub fn flow(&self, a: &str, b: &str, k: &str) {
        let mut l = self.lv.lock().unwrap();
        l.fl.push(Fl { a: a.into(), b: b.into(), t: now(), k: k.into() });
        while l.fl.len() > 40 {
            l.fl.remove(0);
        }
        chg();
    }

    pub fn tok(&self, w: &str, i: i64, o: i64) {
        self.db.run("insert into tok(day,w,tin,tout) values(?,?,?,?) on conflict(day,w) do update set tin=tin+excluded.tin, tout=tout+excluded.tout", pa![crate::db::day(), w.to_string(), i, o]);
    }

    pub fn hold(&self, w: &str) -> bool {
        let l = self.lv.lock().unwrap();
        l.w.get(w).map(|x| x.hold).unwrap_or(false) || l.o.man || !l.o.pause.is_empty()
    }

    pub async fn held(&self, w: &str) {
        loop {
            self.tick();
            if !self.hold(w) {
                return;
            }
            let j = self.lv.lock().unwrap().w.get(w).and_then(|x| x.job);
            if self.lv.lock().unwrap().w.get(w).map(|x| x.st != "sleep").unwrap_or(false) {
                self.st(w, "sleep", j, "");
            }
            sl(5000).await;
        }
    }

    pub fn tick(&self) {
        let n = now();
        let td = self.set()["tokday"].as_i64().unwrap_or(0);
        let used = if td > 0 { self.db.n("select coalesce(sum(tin+tout),0) from tok where day=?", pa![crate::db::day()]) } else { 0 };
        let wh = off_hours(&self.set()["wh"]);
        let bd = self.set()["budday"].as_f64().unwrap_or(0.0);
        let bu = if bd > 0.0 { self.db.usd(None) } else { 0.0 };
        let free_first=crate::routing::enabled(self);
        let mut l = self.lv.lock().unwrap();
        if l.o.rst > 0 && l.o.rst <= n {
            l.o.rl = "allowed".into();
            l.o.rst = 0;
        }
        let lim = l.o.rl != "allowed" && l.o.rl != "allowed_warning" && l.o.rst > n;
        l.o.warn = l.o.rl == "allowed_warning";
        l.o.pause = if lim && !free_first {
            format!("Claude usage limit reached, paused until {}", chrono::DateTime::from_timestamp_millis(l.o.rst).map(|d| d.with_timezone(&chrono::Local).format("%H:%M").to_string()).unwrap_or_default())
        } else if td > 0 && used >= td {
            "daily token limit reached, paused until midnight".into()
        } else if bd > 0.0 && bu >= bd {
            format!("daily budget of ${bd:.2} reached, paused until midnight")
        } else if let Some(f) = wh {
            format!("outside working hours, resumes at {f}")
        } else {
            String::new()
        };
    }

    pub fn rl(&self, i: &Value) {
        let mut l = self.lv.lock().unwrap();
        if let Some(s) = i["status"].as_str() {
            l.o.rl = s.into();
        }
        if let Some(r) = i["resetsAt"].as_i64() {
            l.o.rst = r * 1000;
        }
        drop_(l);
        self.tick();
    }

    pub fn provider_limit(&self, model: &str) -> Option<String> {
        if !crate::routing::enabled(self) || crate::prov::parse(model).0 != "cc" { return None; }
        let l=self.lv.lock().unwrap();
        if l.o.rl!="allowed" && l.o.rl!="allowed_warning" && l.o.rst>now() {
            Some("Claude usage limit is active; try another configured provider".into())
        } else { None }
    }

    pub fn net(&self, k: &str) -> bool {
        *self.lv.lock().unwrap().o.net.get(k).unwrap_or(&true)
    }

    pub fn note(self: &Arc<Self>, ti: &str, m: &str, p: u8) {
        let a = self.clone();
        let (ti, m) = (ti.to_string(), m.to_string());
        tokio::spawn(async move { crate::ntf::send(&a, &ti, &m, p).await });
    }
}

fn drop_<T>(_: T) {}

pub fn off_hours(w: &Value) -> Option<String> {
    if w["on"].as_bool() != Some(true) {
        return None;
    }
    let m = |s: &str| -> Option<u32> {
        let (h, mi) = s.split_once(':')?;
        Some(h.parse::<u32>().ok()? * 60 + mi.parse::<u32>().ok()?)
    };
    let (f, t) = (m(w["from"].as_str()?)?, m(w["to"].as_str()?)?);
    if f == t {
        return None;
    }
    use chrono::Timelike;
    let n = chrono::Local::now();
    let x = n.hour() * 60 + n.minute();
    let inside = if f < t { x >= f && x < t } else { x >= f || x < t };
    if inside {
        None
    } else {
        w["from"].as_str().map(String::from)
    }
}

pub fn fast() -> bool {
    std::env::var("APOLLO_OFFICE_FAST").map(|v| v == "1").unwrap_or(false)
}

pub async fn sl(ms: u64) {
    let ms = if fast() { (ms / 100).max(300) } else { ms };
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

#[cfg(test)]
mod provider_limit_tests {
    use super::*;
    #[test]
    fn claude_limit_does_not_pause_other_free_first_routes_or_remove_owner_limits() {
        let db=Db::mem();db.ks("set",&json!({"free_first":true,"tokday":0}));
        let a=App::new(db,std::env::temp_dir(),1,"x".into());
        a.rl(&json!({"status":"rejected","resetsAt":now()/1000+3600}));
        assert!(a.lv.lock().unwrap().o.pause.is_empty());
        assert!(a.provider_limit("cc:sonnet").is_some());assert!(a.provider_limit("codex:").is_none());
        assert!(a.provider_limit("opencode:opencode/beam-free").is_none());
        assert!(!a.hold("fixer"));
        a.lv.lock().unwrap().o.man=true;assert!(a.hold("fixer"));a.lv.lock().unwrap().o.man=false;
        a.db.ks("set",&json!({"free_first":true,"tokday":1}));a.tok("fixture",1,0);a.tick();
        assert!(a.lv.lock().unwrap().o.pause.contains("daily token limit"));
        a.db.ks("set",&json!({"free_first":false,"tokday":0}));a.tick();
        assert!(a.lv.lock().unwrap().o.pause.contains("Claude usage limit"));
    }
}
