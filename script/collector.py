#!/usr/bin/env python3
"""
Real LAN traffic collector for Network Highway City.

No root required: it reads active TCP/UDP sockets from `ss` (iproute2), maps the
peers to "buildings", classifies each connection by port (including Ollama's
:11434), and POSTs real flow events to the app's HTTP API. The city animates
them live over SSE.

    python3 script/collector.py                 # talk to http://localhost:5000
    NHC_API=http://host:5000 python3 collector.py
    NHC_POLL=1.5 python3 collector.py           # poll interval seconds

What's "real": the peers, ports, protocols and connection churn are your actual
network. Byte counts come from the kernel's per-socket tcp-info (bytes_acked /
bytes_received) when available (modern Linux) and are emitted as per-interval
deltas; otherwise a small heuristic estimate is used (logged once).
"""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request

API = os.environ.get("NHC_API", "http://localhost:5000").rstrip("/")
POLL = float(os.environ.get("NHC_POLL", "2.0"))

# Well-known port -> protocol (the app's vehicle taxonomy). :11434 -> ollama 🦙
PORT_PROTO = {
    11434: "ollama",   # Ollama local LLM API -> llamas
    443: "https", 8443: "https",
    80: "http", 8080: "http", 3000: "http", 5000: "http", 8000: "http",
    22: "ssh",
    53: "dns",
    5353: "multicast", 1900: "multicast", 5355: "multicast",
}
TRAIN_BYTES = 250_000      # a single interval delta above this rides the rail backbone
EST_BYTES = {"ollama": 24000, "https": 8000, "http": 6000, "dns": 160,
             "ssh": 1200, "tcp": 4000, "udp": 1200, "multicast": 240, "unknown": 800}


def post(path: str, obj: dict):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(
        API + path, data=data, headers={"content-type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status
    except Exception as e:  # noqa: BLE001 - collector should never crash the loop
        print(f"[collector] POST {path} failed: {e}", file=sys.stderr)
        return None


def local_ips() -> set[str]:
    ips = {"127.0.0.1", "::1"}
    try:
        ips.update(subprocess.check_output(["hostname", "-I"], text=True).split())
    except Exception:  # noqa: BLE001
        pass
    return ips


def gateway_ip():
    try:
        out = subprocess.check_output(["ip", "route"], text=True)
        m = re.search(r"default via (\S+)", out)
        if m:
            return m.group(1)
    except Exception:  # noqa: BLE001
        pass
    return None


def is_lan(ip: str) -> bool:
    return ip.startswith(("10.", "192.168.")) or bool(re.match(r"172\.(1[6-9]|2\d|3[01])\.", ip))


def node_id(ip: str) -> str:
    return "n-" + ip.replace(".", "-").replace(":", "-")


def classify(sport: int, dport: int, udp: bool) -> tuple[str, int]:
    """Return (protocol, service_port). Prefer the well-known (non-ephemeral) side."""
    for port in (dport, sport):
        if port in PORT_PROTO:
            return PORT_PROTO[port], port
    svc = min(p for p in (sport, dport) if p) if (sport or dport) else 0
    return ("udp" if udp else "tcp"), svc


_PORT_RE = re.compile(r"^(.*):(\d+)$")


def split_hostport(token: str):
    # ss prints [::ffff:1.2.3.4]:443 or 1.2.3.4:443 or [2001:db8::1]:443
    token = token.strip()
    if token.startswith("["):
        host, _, rest = token[1:].partition("]")
        port = rest.lstrip(":")
    else:
        host, _, port = token.rpartition(":")
    host = host.replace("::ffff:", "")
    try:
        return host, int(port)
    except ValueError:
        return host, 0


def parse_ss():
    """Yield dicts: {local, lport, peer, pport, udp, sent, recv} for established conns."""
    conns = []
    # TCP with tcp-info (bytes), then UDP without.
    try:
        tcp = subprocess.check_output(["ss", "-tin"], text=True)
    except Exception as e:  # noqa: BLE001
        print(f"[collector] `ss` unavailable: {e}", file=sys.stderr)
        return conns
    cur = None
    for line in tcp.splitlines():
        if line.startswith(("State", "Recv-Q")):
            continue
        if not line.startswith((" ", "\t")):
            # connection header line: State Recv-Q Send-Q Local Peer ...
            parts = line.split()
            if len(parts) < 5 or parts[0] != "ESTAB":
                cur = None
                continue
            lh, lp = split_hostport(parts[3])
            ph, pp = split_hostport(parts[4])
            cur = {"local": lh, "lport": lp, "peer": ph, "pport": pp,
                   "udp": False, "sent": 0, "recv": 0}
            conns.append(cur)
        elif cur is not None:
            ms = re.search(r"bytes_acked:(\d+)", line)
            mr = re.search(r"bytes_received:(\d+)", line)
            if ms:
                cur["sent"] = int(ms.group(1))
            if mr:
                cur["recv"] = int(mr.group(1))
    try:
        udp = subprocess.check_output(["ss", "-uan"], text=True)
        for line in udp.splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0] not in ("ESTAB", "UNCONN"):
                continue
            lh, lp = split_hostport(parts[3])
            ph, pp = split_hostport(parts[4])
            if ph in ("*", "0.0.0.0", "::") or pp == 0:
                continue  # unconnected listener, no peer
            conns.append({"local": lh, "lport": lp, "peer": ph, "pport": pp,
                          "udp": True, "sent": 0, "recv": 0})
    except Exception:  # noqa: BLE001
        pass
    return conns


def main():
    locals_ = local_ips()
    gw = gateway_ip()
    host = socket.gethostname()
    self_id = "n-self"
    registered: set[str] = set()
    prev_bytes: dict[tuple, int] = {}
    est_warned = False

    # Register this host (the city's "home" district) + the gateway up front.
    post("/api/nodes", {"id": self_id, "name": f"{host} (this host)",
                        "ip": sorted(locals_ - {'127.0.0.1', '::1'})[:1] and
                        sorted(locals_ - {'127.0.0.1', '::1'})[0] or "127.0.0.1",
                        "kind": "server"})
    registered.add(self_id)
    if gw:
        post("/api/nodes", {"id": node_id(gw), "name": "Internet Gateway", "ip": gw, "kind": "gateway"})
        registered.add(node_id(gw))

    print(f"[collector] {host} -> {API}  (gateway {gw}, {len(locals_)} local IPs); polling every {POLL}s")
    print("[collector] open the app and watch real traffic — Ollama :11434 shows up as llamas 🦙")

    while True:
        events = []
        for c in parse_ss():
            local_is_self = c["local"] in locals_
            peer_is_self = c["peer"] in locals_
            # We want flows between this host and a peer; skip pure loopback dupes.
            if not (local_is_self or peer_is_self):
                continue
            peer_ip = c["peer"] if local_is_self else c["local"]
            if peer_ip in ("127.0.0.1", "::1"):
                # localhost service (e.g. Ollama on this box) -> show as a self->self district loop
                peer_node = self_id
                peer_name = f"{host} (localhost)"
                peer_kind = "server"
            elif gw and peer_ip == gw:
                peer_node, peer_name, peer_kind = node_id(peer_ip), "Internet Gateway", "gateway"
            elif is_lan(peer_ip):
                peer_node, peer_name, peer_kind = node_id(peer_ip), f"LAN {peer_ip}", "laptop"
            else:
                # external/internet endpoint -> collapse onto the gateway building
                peer_node = node_id(gw) if gw else self_id
                peer_name, peer_kind = "Internet Gateway", "gateway"

            # register the peer building once
            if peer_node not in registered:
                post("/api/nodes", {"id": peer_node, "name": peer_name, "ip": peer_ip, "kind": peer_kind})
                registered.add(peer_node)

            proto, svc = classify(c["lport"], c["pport"], c["udp"])

            # real per-interval byte delta from kernel tcp-info when available
            key = (c["local"], c["lport"], c["peer"], c["pport"])
            total = c["sent"] + c["recv"]
            if total > 0:
                delta = max(0, total - prev_bytes.get(key, total))
                prev_bytes[key] = total
                if delta == 0:
                    continue  # idle connection this interval
                nbytes = delta
            else:
                if not est_warned:
                    print("[collector] kernel byte counters unavailable; using estimates", file=sys.stderr)
                    est_warned = True
                nbytes = EST_BYTES.get(proto, 800)

            if nbytes > TRAIN_BYTES:
                proto = "train"  # bulk transfer rides the rail backbone

            src, dst = (self_id, peer_node) if (local_is_self and peer_node != self_id) else (peer_node, self_id)
            if src == dst and peer_node != self_id:
                src = self_id
            events.append({"srcId": src, "dstId": dst, "protocol": proto,
                           "bytes": int(nbytes), "info": f":{svc} {proto}"})

        if events:
            post("/api/traffic/batch", {"events": events})
            print(f"[collector] sent {len(events)} real events "
                  f"({sum(1 for e in events if e['protocol']=='ollama')} ollama 🦙)")
        time.sleep(POLL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[collector] stopped")
