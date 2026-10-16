use crate::db::Db;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const V: &str = env!("CARGO_PKG_VERSION");
pub const AUTH: &str = "https://auth.apollonet.dev";

#[derive(Clone, Default, serde::Serialize)]
pub struct Ws {
    pub st: String,
    pub say: String,
    pub mood: String,
    pub t: i64,
    pub busy: i64,
    pub tk: Vec<i64>,
    pub to: Option<i64>,
}

#[derive(Default)]
pub struct Live {
    pub w: HashMap<i64, Ws>,
    pub fl: Vec<Value>,
    pub pids: HashMap<i64, Vec<u32>>,
    pub runs: HashMap<String, Value>,
    pub stop: HashMap<i64, bool>,
    pub drain: bool,
}

pub struct App {
    pub db: Db,
    pub dd: PathBuf,
    pub port: u16,
    pub bind: String,
    pub inst: String,
    pub key: [u8; 32],
    pub lv: Mutex<Live>,
    pub hc: reqwest::Client,
    pub me: PathBuf,
    pub authu: String,
    pub rate: Mutex<HashMap<String, (i64, u32)>>,
    pub quit: tokio::sync::Notify,
    pub restart: Mutex<bool>,
}

pub type Ax = Arc<App>;

pub fn ddir(o: Option<PathBuf>) -> PathBuf {
    if let Some(p) = o.or_else(|| std::env::var_os("APOLLO_OFFICE_DATA").map(PathBuf::from)) {
        return p;
    }
    if cfg!(windows) {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("ApolloOffice")
    } else if cfg!(target_os = "macos") {
        dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("ApolloOffice")
    } else {
        dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("apollo-office")
    }
}

impl App {
    pub fn set(&self) -> Value {
        let mut d = json!({"usd_day": 5.0, "hosts": [], "api_fallback": false, "lounge": true, "updates": "auto"});
        if let Value::Object(m) = self.db.kg("set") {
            for (k, v) in m {
                d[k] = v;
            }
        }
        d
    }

    pub fn fdir(&self, f: i64) -> PathBuf {
        let p = self.dd.join("floors").join(f.to_string()).join("out");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    pub fn adir(&self, a: i64) -> PathBuf {
        let p = self.dd.join("accounts").join(a.to_string());
        let _ = std::fs::create_dir_all(&p);
        p
    }

    pub fn say(&self, w: i64, m: &str, tk: Option<i64>) {
        let s: String = m.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(240).collect();
        if s.is_empty() {
            return;
        }
        {
            let mut l = self.lv.lock().unwrap();
            let x = l.w.entry(w).or_default();
            x.say = s.clone();
            x.t = crate::db::now();
        }
        self.db.run("insert into ev(t,w,m,tk) values(?,?,?,?)", crate::pa![crate::db::now(), w.to_string(), s, tk]);
    }

    pub fn mood(&self, w: i64, m: &str) {
        let mut l = self.lv.lock().unwrap();
        let x = l.w.entry(w).or_default();
        x.mood = m.into();
        x.t = crate::db::now();
    }

    pub fn flow(&self, a: i64, b: i64, k: &str) {
        let mut l = self.lv.lock().unwrap();
        l.fl.push(json!({"a": a, "b": b, "k": k, "t": crate::db::now()}));
        let n = l.fl.len();
        if n > 40 {
            l.fl.drain(0..n - 40);
        }
    }

    pub fn aud(&self, what: &str, det: &str) {
        let who = self.db.kg("owner")["nm"].as_str().unwrap_or("local").to_string();
        self.db.run("insert into aud(t,who,what,det) values(?,?,?,?)", crate::pa![crate::db::now(), who, what.to_string(), det.chars().take(2000).collect::<String>()]);
    }
}
