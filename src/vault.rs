use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rand::RngCore;
use std::path::Path;

const B: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub fn key(dd: &Path, inst: &str, has: bool) -> Result<[u8; 32], String> {
    let f = dd.join("vault.key");
    let _ = inst;
    let nofile = std::env::var("APOLLO_OFFICE_VAULT").map(|v| v == "file").unwrap_or(false);
    let reset = std::env::var("APOLLO_OFFICE_VAULT_RESET").map(|v| v == "1").unwrap_or(false);
    let lost = "Stored keys can not be decrypted. Start once with APOLLO_OFFICE_VAULT_RESET=1 to begin with a new vault (accounts and servers must be connected again).";
    if let Ok(s) = std::fs::read_to_string(&f) {
        return B.decode(s.trim()).ok().filter(|b| b.len() == 32).map(|b| b.try_into().unwrap()).ok_or_else(|| format!("{} is broken. {lost}", f.display()));
    }
    #[cfg(any(windows, target_os = "macos"))]
    if !nofile {
        let e = keyring::Entry::new("ApolloOffice", inst).map_err(|e| format!("keychain: {e}"))?;
        match e.get_password() {
            Ok(s) => {
                if let Some(b) = B.decode(s.trim()).ok().filter(|b| b.len() == 32) {
                    return Ok(b.try_into().unwrap());
                }
                if !reset {
                    return Err(format!("the vault key in the keychain is broken. {lost}"));
                }
            }
            Err(keyring::Error::NoEntry) => {
                if has && !reset {
                    return Err(format!("the vault key is missing from the keychain. {lost}"));
                }
            }
            Err(x) => return Err(format!("the keychain could not be read ({x}). Unlock it or allow ApolloOffice access, then start again.")),
        }
        let mut k = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut k);
        if e.set_password(&B.encode(k)).is_ok() && e.get_password().ok().and_then(|s| B.decode(s.trim()).ok()).as_deref() == Some(&k[..]) {
            return Ok(k);
        }
    }
    if has && !reset {
        return Err(format!("{} is missing. {lost}", f.display()));
    }
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    std::fs::write(&f, B.encode(k)).map_err(|e| e.to_string())?;
    tight(&f);
    Ok(k)
}

pub fn tight(f: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(f, std::fs::Permissions::from_mode(0o600));
    }
    #[cfg(windows)]
    {
        let u = std::env::var("USERNAME").unwrap_or_default();
        if !u.is_empty() {
            let _ = std::process::Command::new("icacls").arg(f).args(["/inheritance:r", "/grant:r"]).arg(format!("{u}:F")).output();
        }
    }
}

pub fn enc(k: &[u8; 32], p: &str) -> Vec<u8> {
    let c = Aes256Gcm::new_from_slice(k).unwrap();
    let mut n = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut n);
    let mut o = n.to_vec();
    o.extend(c.encrypt(Nonce::from_slice(&n), p.as_bytes()).unwrap());
    o
}

pub fn dec(k: &[u8; 32], b: &[u8]) -> Option<String> {
    if b.len() < 13 {
        return None;
    }
    let c = Aes256Gcm::new_from_slice(k).ok()?;
    let p = c.decrypt(Nonce::from_slice(&b[..12]), &b[12..]).ok()?;
    String::from_utf8(p).ok()
}

pub fn tail(s: &str) -> String {
    let t: String = s.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{t}")
}

#[cfg(test)]
mod t {
    #[test]
    fn rt() {
        let k = [7u8; 32];
        let e = super::enc(&k, "sk-secret");
        assert_eq!(super::dec(&k, &e).unwrap(), "sk-secret");
        assert!(super::dec(&[8u8; 32], &e).is_none());
        assert_eq!(super::tail("sk-abcdef1234"), "…1234");
    }
}
