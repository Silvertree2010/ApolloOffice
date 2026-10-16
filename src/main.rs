mod api;
mod auth;
mod cfg;
mod db;
mod eng;
mod js;
mod mcp;
mod perm;
mod prov;
mod run;
mod sh;
mod ssh;
mod stat;
mod sys;
mod tools;
mod upd;
mod vault;
mod web;
mod world;

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Parser)]
#[command(name = "apollo-office", version, about = "A pixel skyscraper full of AI workers, on your own machine")]
struct A {
    #[arg(long, default_value_t = 47300)]
    port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    bind: String,
    #[arg(long)]
    data: Option<PathBuf>,
    #[arg(long)]
    quiet: bool,
    #[command(subcommand)]
    c: Option<C>,
}

#[derive(Subcommand)]
enum C {
    #[command(about = "Print a one-time login link (10 minutes)")]
    LoginLink,
    #[command(about = "Release the owner; the next login binds the installation again")]
    ResetOwner,
    #[command(about = "Start ApolloOffice when you log in (on|off)")]
    Autostart { on: String },
    #[command(about = "Export everything except credentials to a file")]
    Export { file: PathBuf },
    #[command(about = "Import a file made with export")]
    Import { file: PathBuf },
    #[command(about = "Short status")]
    Status,
    #[command(hide = true)]
    Mcp { port: u16, token: String },
}

fn open(dd: &std::path::Path) -> anyhow::Result<db::Db> {
    std::fs::create_dir_all(dd)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dd, std::fs::Permissions::from_mode(0o700));
    }
    let f = dd.join("office.db");
    let d = db::Db::open(&f)?;
    for x in ["office.db", "office.db-wal", "office.db-shm"] {
        vault::tight(&dd.join(x));
    }
    Ok(d)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let a = A::parse();
    if let Some(C::Mcp { port, token }) = &a.c {
        mcp::bridge(*port, token.clone()).await;
        return Ok(());
    }
    let dd = cfg::ddir(a.data.clone());
    let me = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("apollo-office"));
    match a.c {
        Some(C::LoginLink) => {
            let d = open(&dd)?;
            let c = auth::link_new(&d);
            let p = d.kg("port").as_u64().unwrap_or(a.port as u64);
            let b = d.kg("bind").as_str().map(String::from).unwrap_or_else(|| "127.0.0.1".into());
            let h = match b.as_str() {
                "0.0.0.0" | "" => "127.0.0.1".to_string(),
                "::" => "[::1]".to_string(),
                x if x.contains(':') => format!("[{x}]"),
                x => x.to_string(),
            };
            println!("One-time login link (valid 10 minutes):\nhttp://{h}:{p}/auth/link?c={c}");
            return Ok(());
        }
        Some(C::ResetOwner) => {
            let d = open(&dd)?;
            d.kd("owner");
            d.run("delete from ses", pa![]);
            d.run("insert into aud(t,who,what,det) values(?,?,?,?)", pa![db::now(), "cli".to_string(), "Owner released".to_string(), "".to_string()]);
            println!("Owner released. The next login binds the installation again.");
            return Ok(());
        }
        Some(C::Autostart { on }) => {
            println!("{}", sys::autostart(on == "on", &me, &dd, a.port, &a.bind).map_err(anyhow::Error::msg)?);
            return Ok(());
        }
        Some(C::Export { file }) => {
            let d = open(&dd)?;
            std::fs::write(&file, serde_json::to_string_pretty(&sys::export(&d))?)?;
            println!("exported to {}", file.display());
            return Ok(());
        }
        Some(C::Import { file }) => {
            let d = open(&dd)?;
            let p = d.kg("port").as_u64().unwrap_or(a.port as u64) as u16;
            if std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], p)), std::time::Duration::from_millis(500)).is_ok() {
                anyhow::bail!("ApolloOffice is running on port {p}. Stop it first or import in the settings.");
            }
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&file)?)?;
            println!("{}", sys::import(&d, &v).map_err(anyhow::Error::msg)?);
            return Ok(());
        }
        Some(C::Status) => {
            let d = open(&dd)?;
            let o = d.kg("owner");
            println!("ApolloOffice {}  Data: {}", cfg::V, dd.display());
            println!("Owner: {}", o["nm"].as_str().map(|n| format!("{n} ({})", o["p"].as_str().unwrap_or(""))).unwrap_or("nobody yet".into()));
            println!("Floors: {}  Workers: {}  Accounts: {}  Servers: {}", d.n("select count(*) from fl", pa![]), d.n("select count(*) from wk", pa![]), d.n("select count(*) from acc", pa![]), d.n("select count(*) from srv", pa![]));
            println!("Tasks: {} waiting, {} running, {} done", d.n("select count(*) from tk where st='wait'", pa![]), d.n("select count(*) from tk where st='run'", pa![]), d.n("select count(*) from tk where st='done'", pa![]));
            return Ok(());
        }
        _ => {}
    }
    let d = open(&dd)?;
    world::init(&d);
    let inst = auth::inst(&d);
    let has = d.n("select (select count(*) from acc where sec is not null) + (select count(*) from srv where key is not null)", pa![]) > 0;
    let key = match vault::key(&dd, &inst, has) {
        Ok(k) => k,
        Err(e) => {
            eprintln!("ApolloOffice can not open its vault: {e}");
            std::process::exit(1);
        }
    };
    if has && std::env::var("APOLLO_OFFICE_VAULT_RESET").map(|v| v == "1").unwrap_or(false) {
        for (t, c) in [("acc", "sec"), ("srv", "key")] {
            for r in d.all(&format!("select id from {t} where {c} is not null"), pa![]) {
                let id = r["id"].as_i64().unwrap_or(0);
                if d.blob(&format!("select {c} from {t} where id=?"), pa![id]).and_then(|b| vault::dec(&key, &b)).is_none() {
                    d.run(&format!("update {t} set {c}=null where id=?"), pa![id]);
                }
            }
        }
    }
    d.ks("port", &serde_json::json!(a.port));
    d.ks("bind", &serde_json::json!(a.bind));
    let ax = Arc::new(cfg::App {
        db: d,
        dd: dd.clone(),
        port: a.port,
        bind: a.bind.clone(),
        inst,
        key,
        lv: Mutex::new(cfg::Live::default()),
        hc: reqwest::Client::builder().user_agent(concat!("ApolloOffice/", env!("CARGO_PKG_VERSION"))).build()?,
        me,
        authu: std::env::var("APOLLO_OFFICE_AUTH").ok().filter(|_| cfg!(debug_assertions)).unwrap_or(cfg::AUTH.to_string()),
        rate: Mutex::new(Default::default()),
        quit: tokio::sync::Notify::new(),
        restart: Mutex::new(false),
    });
    upd::cleanup(&ax.me);
    let uf = ax.db.kg("upd")["from"].as_str().map(String::from);
    if let Some(f) = uf {
        if f != cfg::V {
            ax.aud("Updated", &format!("{f} -> {}", cfg::V));
            ax.db.ks("updated", &serde_json::json!({"from": f, "to": cfg::V, "t": db::now()}));
        }
        let mut u = ax.db.kg("upd");
        if f == cfg::V {
            u["skip"] = u["ready"].clone();
        }
        u["from"] = serde_json::Value::Null;
        u["ready"] = serde_json::Value::Null;
        ax.db.ks("upd", &u);
    }
    world::sync_gens(&ax);
    world::sync_racks(&ax);
    let lo = a.bind == "127.0.0.1" || a.bind == "localhost" || a.bind == "::1";
    let mut tries = 0;
    let l = loop {
        match tokio::net::TcpListener::bind((a.bind.as_str(), a.port)).await {
            Ok(l) => break l,
            Err(e) => {
                tries += 1;
                if tries > 20 {
                    eprintln!("Port {} is taken or not usable ({e}). Is ApolloOffice already running? Otherwise pick --port.", a.port);
                    std::process::exit(1);
                }
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    };
    eng::spawn(ax.clone());
    upd::spawn(ax.clone());
    let u = format!("http://{}:{}", if lo { "127.0.0.1" } else { &a.bind }, a.port);
    if !a.quiet {
        println!("\n  ApolloOffice {}\n\n  Open {u}\n\n  Data: {}", cfg::V, dd.display());
        if !lo {
            println!("\n  WARNING: reachable at {}. Only use it behind HTTPS (reverse proxy) or in a private network.", a.bind);
        }
        println!("  Stop with Ctrl+C\n");
    }
    let app = axum::Router::new().fallback(web::h).layer(axum::extract::DefaultBodyLimit::disable()).with_state(ax.clone());
    let ax2 = ax.clone();
    let sv = axum::serve(l, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).with_graceful_shutdown(async move {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = ax2.quit.notified() => {}
        }
    });
    sv.await?;
    let ps: Vec<u32> = ax.lv.lock().unwrap().pids.values().flatten().cloned().collect();
    for p in ps {
        sh::kill(p);
    }
    let rs = *ax.restart.lock().unwrap();
    if rs {
        let _g = upd::CK.lock().await;
        let sha = ax.db.kg("upd")["sha"].as_str().unwrap_or("").to_string();
        if let Err(e) = upd::install(&ax.me, &ax.dd, &sha) {
            eprintln!("update failed: {e}");
            let mut u = ax.db.kg("upd");
            u["err"] = serde_json::json!(format!("install failed: {e}"));
            u["ready"] = serde_json::Value::Null;
            u["from"] = serde_json::Value::Null;
            ax.db.ks("upd", &u);
        }
        upd::relaunch(&ax.me);
    }
    Ok(())
}
