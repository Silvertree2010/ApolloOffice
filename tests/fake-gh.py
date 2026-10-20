import json, os, sys

D = os.environ["FAKE_GH_DIR"]
a = sys.argv[1:]


def ld(n, d):
    p = os.path.join(D, n)
    return json.load(open(p)) if os.path.exists(p) else d


def sv(n, v):
    json.dump(v, open(os.path.join(D, n), "w"))


def out(v):
    print(json.dumps(v))
    sys.exit(0)


def opt(k):
    return a[a.index(k) + 1] if k in a else None


open(os.path.join(D, "calls.log"), "a").write(json.dumps(a) + "\n")
R = os.environ.get("FAKE_GH_REPO", "o/r")
if a[:2] == ["auth", "token"]:
    print("fake-token")
    sys.exit(0)
if a[0] == "api":
    p = [x for x in a[1:] if not x.startswith("-") and x not in ("Accept: application/vnd.github+json", "default_branch_only=true", ".rate.remaining", ".login", "{s: .sha}")]
    p = p[0] if p else ""
    if p == "user":
        if "--jq" in a:
            print("tester")
            sys.exit(0)
        out({"login": "tester", "id": 1, "name": "Tester"})
    if p == "rate_limit":
        print(5000)
        sys.exit(0)
    if p == f"repos/{R}":
        out({"full_name": R, "default_branch": "main", "private": os.environ.get("FAKE_GH_PRIVATE") == "1", "fork": False, "archived": False, "permissions": {"push": True}})
    if "/timeline" in p or "/comments" in p or "/reviews" in p:
        out([[]] if "--slurp" in a else [])
    if "/contents/" in p:
        sys.stderr.write("HTTP 404: Not Found")
        sys.exit(1)
    sys.stderr.write("fake gh: unknown api " + p)
    sys.exit(1)
if a[:2] == ["issue", "list"]:
    out(ld("issues.json", []))
if a[:2] == ["issue", "view"]:
    n = int(a[2])
    for i in ld("issues.json", []):
        if i["number"] == n:
            out({**i, "state": "OPEN", "comments": [], "assignees": []})
    sys.exit(1)
if a[:2] == ["pr", "list"]:
    if opt("--head"):
        out([p for p in ld("prs.json", []) if p["head"] == opt("--head")])
    out([])
if a[:2] == ["pr", "create"]:
    ps = ld("prs.json", [])
    n = 100 + len(ps)
    ps.append({"number": n, "url": f"https://github.com/{R}/pull/{n}", "head": opt("--head"), "base": opt("--base"), "title": opt("--title"), "body": opt("--body"), "headRepositoryOwner": {"login": "tester"}})
    sv("prs.json", ps)
    print(f"https://github.com/{R}/pull/{n}")
    sys.exit(0)
if a[:2] == ["pr", "view"]:
    out({"state": "OPEN", "mergedAt": None, "updatedAt": "2026-01-01T00:00:00Z", "title": "x", "url": "u", "mergeable": "MERGEABLE", "headRefName": "b", "headRepositoryOwner": {"login": "tester"}, "headRepository": {"name": "r"}, "baseRefName": "main"})
sys.stderr.write("fake gh: unknown " + " ".join(a))
sys.exit(1)
