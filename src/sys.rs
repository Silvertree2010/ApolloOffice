use crate::cfg::Ax;
use crate::db::{day, Db};
use crate::pa;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn daily(a: &Ax) {
    let d = a.dd.join("backup");
    let f = d.join(format!("office-{}.db", day()));
    if f.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&d);
    if a.db.backup(&f).is_ok() {
        crate::vault::tight(&f);
    }
    let mut v: Vec<PathBuf> = std::fs::read_dir(&d).map(|r| r.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|x| x == "db").unwrap_or(false)).collect()).unwrap_or_default();
    v.sort();
    while v.len() > 7 {
        let _ = std::fs::remove_file(v.remove(0));
    }
}

const TABS: &[&str] = &["fl", "ty", "tool", "wk", "tk", "ev", "us", "wid"];

pub fn export(db: &Db) -> Value {
    let mut o = json!({"app": "ApolloOffice", "v": crate::cfg::V, "t": crate::db::now()});
    for t in TABS {
        o[*t] = json!(db.all(&format!("select * from {t}"), pa![]));
    }
    o["srv"] = json!(db.all("select id,fl,nm,host,port,usr,dock,cfg from srv", pa![]));
    o["acc"] = json!(db.all("select id,k,fmt,nm,base,md,cfg from acc", pa![]));
    o["set"] = db.kg("set");
    o
}

pub fn import(db: &Db, v: &Value) -> Result<String, String> {
    if v["app"] != "ApolloOffice" {
        return Err("keine ApolloOffice-Datei".into());
    }
    let mut n = 0;
    db.tx(|c| {
        for t in TABS {
            c.execute(&format!("delete from {t}"), [])?;
            for r in v[*t].as_array().cloned().unwrap_or_default() {
                let Some(m) = r.as_object() else { continue };
                let ks: Vec<&String> = m.keys().filter(|k| k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')).collect();
                let q = format!("insert into {t}({}) values({})", ks.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(","), vec!["?"; ks.len()].join(","));
                let vals: Vec<rusqlite::types::Value> = ks.iter().map(|k| match &m[k.as_str()] {
                    Value::Null => rusqlite::types::Value::Null,
                    Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
                    Value::Number(x) => x.as_i64().map(rusqlite::types::Value::Integer).unwrap_or_else(|| rusqlite::types::Value::Real(x.as_f64().unwrap_or(0.0))),
                    Value::String(s) => rusqlite::types::Value::Text(s.clone()),
                    o => rusqlite::types::Value::Text(o.to_string()),
                }).collect();
                c.execute(&q, rusqlite::params_from_iter(vals))?;
                n += 1;
            }
        }
        Ok(())
    })
    .map_err(|e| e.to_string())?;
    if v["set"].is_object() {
        db.ks("set", &v["set"]);
    }
    Ok(format!("{n} Einträge übernommen. Konten und Server ohne Zugangsdaten: bitte neu verbinden."))
}

pub fn autostart(on: bool, me: &Path, dd: &Path) -> Result<String, String> {
    let exe = me.display().to_string();
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        let k = winreg::RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", winreg::enums::KEY_SET_VALUE).map_err(|e| e.to_string())?;
        if on {
            k.set_value("ApolloOffice", &format!("\"{exe}\" --data \"{}\" --quiet", dd.display())).map_err(|e| e.to_string())?;
            return Ok("Startet ab jetzt beim Anmelden.".into());
        }
        let _ = k.delete_value("ApolloOffice");
        return Ok("Autostart aus.".into());
    }
    #[cfg(target_os = "macos")]
    {
        let p = dirs::home_dir().ok_or("kein Home")?.join("Library/LaunchAgents/dev.apollonet.office.plist");
        if on {
            let x = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>Label</key><string>dev.apollonet.office</string><key>ProgramArguments</key><array><string>{exe}</string><string>--data</string><string>{}</string><string>--quiet</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>StandardErrorPath</key><string>{}</string></dict></plist>\n",
                dd.display(),
                dd.join("apollo-office.log").display()
            );
            std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::write(&p, x).map_err(|e| e.to_string())?;
            return Ok(format!("Startet ab jetzt beim Anmelden ({}).", p.display()));
        }
        let _ = std::fs::remove_file(&p);
        return Ok("Autostart aus.".into());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let d = dirs::config_dir().ok_or("kein Config-Ordner")?.join("systemd/user");
        let p = d.join("apollo-office.service");
        if on {
            std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            std::fs::write(&p, format!("[Unit]\nDescription=ApolloOffice\n\n[Service]\nExecStart={exe} --data {} --quiet\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n", dd.display())).map_err(|e| e.to_string())?;
            let _ = std::process::Command::new("systemctl").args(["--user", "daemon-reload"]).status();
            let _ = std::process::Command::new("systemctl").args(["--user", "enable", "apollo-office"]).status();
            return Ok("Startet ab jetzt beim Anmelden (systemd --user).".into());
        }
        let _ = std::process::Command::new("systemctl").args(["--user", "disable", "apollo-office"]).status();
        let _ = std::fs::remove_file(&p);
        Ok("Autostart aus.".into())
    }
}

pub fn autostart_on(me: &Path) -> bool {
    let _ = me;
    #[cfg(windows)]
    {
        return winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER).open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run").and_then(|k| k.get_value::<String, _>("ApolloOffice")).is_ok();
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir().map(|h| h.join("Library/LaunchAgents/dev.apollonet.office.plist").exists()).unwrap_or(false);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs::config_dir().map(|h| h.join("systemd/user/apollo-office.service").exists()).unwrap_or(false)
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn roundtrip() {
        let db = Db::mem();
        crate::world::init(&db);
        db.run("insert into wk(ty,nm,col,fl,desk,cfg,t0) values('fixer','Ole','#fff',3,1,'{\"par\":1}',1)", pa![]);
        let e = export(&db);
        let d2 = Db::mem();
        import(&d2, &e).unwrap();
        assert_eq!(d2.n("select count(*) from wk", pa![]), 1);
        assert_eq!(d2.one("select cfg from wk", pa![]).unwrap()["cfg"]["par"], 1);
        assert_eq!(d2.n("select count(*) from fl", pa![]), db.n("select count(*) from fl", pa![]));
    }
}
