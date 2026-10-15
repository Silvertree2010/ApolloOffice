use crate::cfg::Ax;
use crate::db::now;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const PUB: &str = "8805f9e4f9667145fafb91f0c685480f0fb7cfc9444dd38cdf7cdb1770a74e16";
const BASE: &str = "https://github.com/Silvertree2010/ApolloOffice/releases/latest/download";

pub fn asset() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "aarch64") => "apollo-office-windows-arm64.exe",
        ("windows", _) => "apollo-office-windows-x64.exe",
        ("macos", "aarch64") => "apollo-office-macos-arm64",
        ("macos", _) => "apollo-office-macos-x64",
        ("linux", "aarch64") => "apollo-office-linux-arm64",
        _ => "apollo-office-linux-x64",
    }
}

pub fn newer(a: &str, b: &str) -> bool {
    let p = |s: &str| -> Vec<u64> { s.trim_start_matches('v').split(|c| c == '.' || c == '-').take(3).map(|x| x.parse().unwrap_or(0)).collect() };
    p(a) > p(b)
}

pub fn check_sig(pk: &str, body: &[u8], sig: &str) -> Result<Value, String> {
    let k: [u8; 32] = hex::decode(pk).map_err(|_| "key")?.try_into().map_err(|_| "key")?;
    let vk = VerifyingKey::from_bytes(&k).map_err(|_| "key")?;
    let sb = base64::engine::general_purpose::STANDARD.decode(sig.trim()).map_err(|_| "broken signature")?;
    let s = Signature::from_slice(&sb).map_err(|_| "broken signature")?;
    vk.verify(body, &s).map_err(|_| "invalid signature on update manifest")?;
    serde_json::from_slice(body).map_err(|_| "unreadable update manifest".into())
}

fn st(a: &Ax, f: impl FnOnce(&mut Value)) {
    let mut v = a.db.kg("upd");
    if !v.is_object() {
        v = json!({});
    }
    f(&mut v);
    a.db.ks("upd", &v);
}

pub fn on(a: &Ax) -> bool {
    a.set()["updates"].as_str() != Some("off")
}

async fn get(a: &Ax, u: &str) -> Result<Vec<u8>, String> {
    let r = a.hc.get(u).timeout(Duration::from_secs(300)).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("HTTP {} for {u}", r.status().as_u16()));
    }
    Ok(r.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

pub async fn check(a: &Ax) -> Result<Value, String> {
    let base = std::env::var("APOLLO_OFFICE_UPDATE_URL").ok().filter(|_| cfg!(debug_assertions)).unwrap_or(BASE.to_string());
    let body = get(a, &format!("{base}/latest.json")).await?;
    let sig = String::from_utf8_lossy(&get(a, &format!("{base}/latest.json.sig")).await?).to_string();
    let m = check_sig(PUB, &body, &sig)?;
    let v = m["v"].as_str().unwrap_or("").to_string();
    st(a, |x| {
        x["t"] = json!(now());
        x["latest"] = json!(v);
        x["err"] = json!("");
    });
    if !newer(&v, crate::cfg::V) {
        return Ok(json!({"latest": v, "new": false}));
    }
    let want = m["files"][asset()].as_str().ok_or("no build for this system in the release")?.to_string();
    let bin = get(a, &format!("{base}/{}", asset())).await?;
    if hex::encode(Sha256::digest(&bin)) != want {
        return Err("downloaded update does not match the signed checksum".into());
    }
    let f = staged(a);
    std::fs::write(&f, &bin).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o755));
    }
    st(a, |x| {
        x["ready"] = json!(v);
        x["sha"] = json!(want);
    });
    Ok(json!({"latest": v, "new": true}))
}

pub fn staged(a: &Ax) -> PathBuf {
    a.dd.join(if cfg!(windows) { "update.exe" } else { "update.bin" })
}

pub fn spawn(a: Ax) {
    if cfg!(debug_assertions) && std::env::var("APOLLO_OFFICE_UPDATE_URL").is_err() {
        return;
    }
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            if on(&a) {
                if let Err(e) = check(&a).await {
                    st(&a, |x| {
                        x["t"] = json!(now());
                        x["err"] = json!(e);
                    });
                }
            }
            for _ in 0..(6 * 60) {
                tokio::time::sleep(Duration::from_secs(60)).await;
                if on(&a) && ready(&a) && a.db.n("select count(*) from tk where st='run'", crate::pa![]) == 0 {
                    apply_soon(&a);
                    return;
                }
            }
        }
    });
}

pub fn ready(a: &Ax) -> bool {
    a.db.kg("upd")["ready"].as_str().map(|v| newer(v, crate::cfg::V)).unwrap_or(false) && staged(a).exists()
}

pub fn apply_soon(a: &Ax) {
    let v = a.db.kg("upd")["ready"].as_str().unwrap_or("").to_string();
    a.aud("Update", &format!("{} -> {v}", crate::cfg::V));
    st(a, |x| x["from"] = json!(crate::cfg::V));
    *a.restart.lock().unwrap() = true;
    a.quit.notify_waiters();
}

pub fn install(me: &Path, dd: &Path, sha: &str) -> std::io::Result<()> {
    let f0 = dd.join(if cfg!(windows) { "update.exe" } else { "update.bin" });
    let bin = std::fs::read(&f0)?;
    let _ = std::fs::remove_file(&f0);
    if sha.len() != 64 || hex::encode(Sha256::digest(&bin)) != sha {
        return Err(std::io::Error::other("staged update does not match the signed checksum"));
    }
    let f = me.with_extension(if cfg!(windows) { "upd.exe" } else { "upd" });
    std::fs::write(&f, &bin)?;
    if cfg!(windows) {
        let old = me.with_extension("old.exe");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(me, &old)?;
        if let Err(e) = std::fs::rename(&f, me).or_else(|_| std::fs::copy(&f, me).map(|_| ())) {
            let _ = std::fs::rename(&old, me);
            return Err(e);
        }
        let _ = std::fs::remove_file(&f);
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o755))?;
        }
        std::fs::rename(&f, me)?;
    }
    Ok(())
}

pub fn relaunch(me: &Path) -> ! {
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let e = std::process::Command::new(me).args(&args).exec();
        eprintln!("restart failed: {e}");
        std::process::exit(1);
    }
    #[cfg(not(unix))]
    {
        let _ = std::process::Command::new(me).args(&args).spawn();
        std::process::exit(0);
    }
}

pub fn cleanup(me: &Path) {
    if cfg!(windows) {
        let _ = std::fs::remove_file(me.with_extension("old.exe"));
    }
}

#[cfg(test)]
mod t {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn versions() {
        assert!(newer("0.2.1", "0.2.0"));
        assert!(newer("v0.10.0", "0.9.9"));
        assert!(!newer("0.2.0", "0.2.0"));
        assert!(!newer("0.1.9", "0.2.0"));
    }

    #[test]
    fn manifest() {
        let sk = SigningKey::from_bytes(&[5u8; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        let body = br#"{"v":"0.3.0","files":{}}"#;
        let sig = base64::engine::general_purpose::STANDARD.encode(sk.sign(body).to_bytes());
        assert_eq!(check_sig(&pk, body, &sig).unwrap()["v"], "0.3.0");
        assert!(check_sig(&pk, br#"{"v":"9.9.9","files":{}}"#, &sig).is_err());
        assert!(check_sig(PUB, body, &sig).is_err());
    }
}
