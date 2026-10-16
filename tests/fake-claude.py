#!/usr/bin/env python3
import json, subprocess, sys

a = sys.argv[1:]
cfg = a[a.index("--mcp-config") + 1] if "--mcp-config" in a else None
sys.stdin.read()
out = lambda o: print(json.dumps(o), flush=True)
out({"type": "rate_limit_event", "rate_limit_info": {"status": "allowed_warning", "resetsAt": 4102444800, "rateLimitType": "five_hour"}})
txt = "no tools"
if cfg:
    s = json.load(open(cfg))["mcpServers"]["office"]
    p = subprocess.Popen([s["command"]] + s["args"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    def rpc(i, m, prm):
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": i, "method": m, "params": prm}) + "\n")
        p.stdin.flush()
        return json.loads(p.stdout.readline())
    rpc(1, "initialize", {"protocolVersion": "2025-06-18"})
    names = [t["name"] for t in rpc(2, "tools/list", {})["result"]["tools"]]
    r = rpc(3, "tools/call", {"name": "deliver", "arguments": {"name": "mcp.txt", "text": "via mcp"}})
    bad = rpc(4, "tools/call", {"name": "sh", "arguments": {"cmd": "id"}})
    txt = ("deliver ok" if "tray" in r["result"]["content"][0]["text"] else "deliver failed") + " tools=" + ",".join(names) + " sh=" + str(bad["result"].get("isError"))
    p.stdin.close()
    p.wait()
out({"type": "assistant", "message": {"content": [{"type": "text", "text": "working"}]}})
out({"type": "result", "subtype": "success", "is_error": False, "result": "Done: " + txt, "usage": {"input_tokens": 10, "output_tokens": 5}})
