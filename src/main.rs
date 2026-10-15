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
    let f = dd.join("office.db");
    let d = db::Db::open(&f)?;
    vault::tight(&f);
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
            println!("One-time login link (valid 10 minutes):\nhttp://127.0.0.1:{p}/auth/link?c={c}");
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
            println!("{}", sys::autostart(on == "on", &me, &dd).map_err(anyhow::Error::msg)?);
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
    let key = vault::key(&dd, &inst);
    d.ks("port", &serde_json::json!(a.port));
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
    let app = axum::Router::new().fallback(web::h).with_state(ax.clone());
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
    if *ax.restart.lock().unwrap() {
        match upd::install(&ax.me, &ax.dd) {
            Ok(()) => upd::relaunch(&ax.me),
            Err(e) => eprintln!("update failed: {e}"),
        }
    }
    Ok(())
}
