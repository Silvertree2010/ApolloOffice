use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rand::RngCore;
use std::path::Path;

const B: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub fn key(dd: &Path, inst: &str) -> [u8; 32] {
    let f = dd.join("vault.key");
    let nofile = std::env::var("APOLLO_OFFICE_VAULT").map(|v| v == "file").unwrap_or(false);
    if !nofile && !f.exists() {
        if let Ok(e) = keyring::Entry::new("ApolloOffice", inst) {
            if let Ok(s) = e.get_password() {
                if let Ok(b) = B.decode(s.trim()) {
                    if b.len() == 32 {
                        return b.try_into().unwrap();
                    }
                }
            }
            let mut k = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut k);
            if e.set_password(&B.encode(k)).is_ok() {
                if let Ok(s) = e.get_password() {
                    if B.decode(s.trim()).ok().as_deref() == Some(&k[..]) {
                        return k;
                    }
                }
            }
        }
    }
    if let Ok(s) = std::fs::read_to_string(&f) {
        if let Ok(b) = B.decode(s.trim()) {
            if b.len() == 32 {
                return b.try_into().unwrap();
            }
        }
    }
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    let _ = std::fs::write(&f, B.encode(k));
    tight(&f);
    k
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
        let e = super::enc(&k, "sk-geheim");
        assert_eq!(super::dec(&k, &e).unwrap(), "sk-geheim");
        assert!(super::dec(&[8u8; 32], &e).is_none());
        assert_eq!(super::tail("sk-abcdef1234"), "…1234");
    }
}
