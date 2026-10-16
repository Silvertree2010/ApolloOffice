use crate::db::{now, Db};
use crate::pa;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const PUB: &str = "29a04d0965e61a19edae83c6bf067a01437dbc8cc00661fa0052688a71e736b3";
const U: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;
pub const DAY7: i64 = 7 * 86400 * 1000;

pub fn h(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}

pub fn rnd() -> String {
    U.encode(rand::random::<[u8; 32]>())
}

pub fn inst(db: &Db) -> String {
    if let Some(s) = db.kg("inst").as_str() {
        return s.to_string();
    }
    let i = hex::encode(rand::random::<[u8; 12]>());
    db.ks("inst", &json!(i));
    i
}

pub fn nonce(db: &Db, pre: &str) -> String {
    let n = rnd();
    db.run("delete from nonce where exp<?", pa![now()]);
    db.run("insert into nonce(n,ck,exp) values(?,?,?)", pa![n.clone(), h(pre), now() + 600_000]);
    n
}

pub fn verify(pk: &str, db: &Db, inst: &str, tok: &str, pre: &str, origin: &str) -> Result<Value, String> {
    let (a, b) = tok.split_once('.').ok_or("broken token")?;
    let body = U.decode(a).map_err(|_| "broken token")?;
    let sig = U.decode(b).map_err(|_| "broken signature")?;
    let k: [u8; 32] = hex::decode(pk).map_err(|_| "key")?.try_into().map_err(|_| "key")?;
    let vk = VerifyingKey::from_bytes(&k).map_err(|_| "key")?;
    let s = Signature::from_slice(&sig).map_err(|_| "broken signature")?;
    vk.verify(&body, &s).map_err(|_| "invalid signature")?;
    let p: Value = serde_json::from_slice(&body).map_err(|_| "broken token")?;
    if p["i"].as_str() != Some(inst) {
        return Err("token belongs to another installation".into());
    }
    if p["aud"].as_str() != Some(origin) {
        return Err("token was issued for another address".into());
    }
    if p["exp"].as_i64().unwrap_or(0) * 1000 + 60_000 < now() {
        return Err("token expired, please log in again".into());
    }
    let n = p["n"].as_str().unwrap_or("").to_string();
    let r = db.one("select ck, exp from nonce where n=?", pa![n.clone()]).ok_or("login unknown or already used")?;
    if db.ch("delete from nonce where n=?", pa![n]) == 0 {
        return Err("login unknown or already used".into());
    }
    if r["ck"].as_str() != Some(&h(pre)) || r["exp"].as_i64().unwrap_or(0) < now() {
        return Err("the login was started in another browser".into());
    }
    let (pv, sub) = (p["p"].as_str().unwrap_or(""), p["sub"].as_str().unwrap_or(""));
    if pv.is_empty() || sub.is_empty() {
        return Err("token without account".into());
    }
    Ok(p)
}

pub fn bind(db: &Db, p: &Value) -> Result<(), String> {
    let o = db.kg("owner");
    let id = format!("{}:{}", p["p"].as_str().unwrap_or(""), p["sub"].as_str().unwrap_or(""));
    if o.is_null() {
        let v = json!({"id": id, "p": p["p"], "nm": p["nm"], "em": p["em"], "av": p["av"], "t": now()});
        if db.ch("insert into kv(k,v) values('owner',?) on conflict(k) do nothing", pa![v.to_string()]) == 1 {
            return Ok(());
        }
        return if db.kg("owner")["id"].as_str() == Some(&id) { Ok(()) } else { Err("This installation belongs to another account.".into()) };
    }
    if o["id"].as_str() == Some(&id) {
        let mut o = o.clone();
        o["nm"] = p["nm"].clone();
        o["av"] = p["av"].clone();
        db.ks("owner", &o);
        return Ok(());
    }
    Err("This installation belongs to another account.".into())
}

pub fn ses_new(db: &Db, ua: &str, ip: &str) -> String {
    let t = rnd();
    db.run("insert into ses(id,t0,t1,exp,ua,ip) values(?,?,?,?,?,?)", pa![h(&t), now(), now(), now() + DAY7, ua.chars().take(200).collect::<String>(), ip.to_string()]);
    t
}

pub fn ses_ok(db: &Db, t: &str) -> Option<String> {
    let id = h(t);
    let r = db.one("select exp, t1 from ses where id=?", pa![id.clone()])?;
    if r["exp"].as_i64().unwrap_or(0) < now() {
        db.run("delete from ses where id=?", pa![id]);
        return None;
    }
    if now() - r["t1"].as_i64().unwrap_or(0) > 60_000 {
        db.run("update ses set t1=? where id=?", pa![now(), id.clone()]);
    }
    Some(id)
}

pub fn link_new(db: &Db) -> String {
    let c = rnd();
    db.run("delete from lnk where exp<?", pa![now()]);
    db.run("insert into lnk(c,exp) values(?,?)", pa![h(&c), now() + 600_000]);
    c
}

pub fn link_use(db: &Db, c: &str) -> bool {
    let id = h(c);
    let ok = db.ch("delete from lnk where c=? and exp>?", pa![id.clone(), now()]) > 0;
    db.run("delete from lnk where c=?", pa![id]);
    ok
}

#[cfg(test)]
mod t {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const O: &str = "http://127.0.0.1:47300";

    #[test]
    fn flow() {
        let db = Db::mem();
        let sk = SigningKey::from_bytes(&[3u8; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        let i = inst(&db);
        let n = nonce(&db, "pre1");
        let mk = |i: &str, n: &str, sub: &str, exp: i64| {
            let b = serde_json::to_vec(&json!({"p": "github", "sub": sub, "nm": "netter", "i": i, "n": n, "aud": "http://127.0.0.1:47300", "exp": exp})).unwrap();
            format!("{}.{}", U.encode(&b), U.encode(sk.sign(&b).to_bytes()))
        };
        let e = now() / 1000 + 60;
        assert!(verify(&pk, &db, &i, &mk("other", &n, "1", e), "pre1", O).is_err());
        let n = nonce(&db, "pre1");
        assert!(verify(&pk, &db, &i, &mk(&i, &n, "1", e), "pre2", O).is_err());
        let n = nonce(&db, "pre1");
        let t = mk(&i, &n, "1", e);
        let n2 = nonce(&db, "pre1");
        assert!(verify(&pk, &db, &i, &mk(&i, &n2, "1", e), "pre1", "https://evil.example").is_err());
        let p = verify(&pk, &db, &i, &t, "pre1", O).unwrap();
        assert!(verify(&pk, &db, &i, &t, "pre1", O).is_err());
        bind(&db, &p).unwrap();
        let n = nonce(&db, "pre1");
        let p2 = verify(&pk, &db, &i, &mk(&i, &n, "2", e), "pre1", O).unwrap();
        assert!(bind(&db, &p2).is_err());
        let n = nonce(&db, "pre1");
        assert!(verify(&pk, &db, &i, &mk(&i, &n, "1", e - 120), "pre1", O).is_err());
        let mut bad = mk(&i, &nonce(&db, "pre1"), "1", e);
        bad.replace_range(3..4, if &bad[3..4] == "A" { "B" } else { "A" });
        assert!(verify(&pk, &db, &i, &bad, "pre1", O).is_err());
        let s = ses_new(&db, "ua", "127.0.0.1");
        assert!(ses_ok(&db, &s).is_some());
        assert!(ses_ok(&db, "x").is_none());
        let c = link_new(&db);
        assert!(link_use(&db, &c));
        assert!(!link_use(&db, &c));
    }
}
