#!/usr/bin/env python3
"""
Real LAN traffic collector for Network Highway City.

Two capture backends, auto-selected (override with NHC_CAPTURE=tshark|ss):

  * tshark  (Wireshark CLI) — real packet capture: EXACT per-packet bytes and
    Wireshark's own protocol dissection. Sees traffic that doesn't involve this
    host too (mirrored/promiscuous links). Needs capture privileges (see below).
  * ss      (iproute2)      — no root, no deps: reads active sockets and emits
    per-interval kernel byte deltas. Good default fallback.

Either way it maps peers to "buildings", classifies by port (incl Ollama's
:11434 -> llamas 🦙), and POSTs flow events to the app, which animates them live.

    python3 script/collector.py                  # auto: tshark if available, else ss
    NHC_CAPTURE=tshark python3 script/collector.py
    NHC_API=http://host:5000  NHC_POLL=2  NHC_IFACE=eth0  python3 script/collector.py

Enabling tshark capture without sudo (Debian/Ubuntu):
    sudo apt-get install -y tshark
    sudo dpkg-reconfigure wireshark-common      # answer "Yes" (non-root capture)
    sudo usermod -aG wireshark "$USER"          # then log out/in
    # or one-off: sudo setcap cap_net_raw,cap_net_admin+eip "$(which dumpcap)"
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

API = os.environ.get("NHC_API", "http://localhost:5000").rstrip("/")
POLL = max(1.0, float(os.environ.get("NHC_POLL", "2.0")))
CAPTURE = os.environ.get("NHC_CAPTURE", "auto").lower()

# Well-known port -> protocol (the app's vehicle taxonomy). :11434 -> ollama 🦙
PORT_PROTO = {
    11434: "ollama",
    443: "https", 8443: "https",
    80: "http", 8080: "http", 3000: "http", 5000: "http", 8000: "http",
    22: "ssh",
    53: "dns",
    5353: "multicast", 1900: "multicast", 5355: "multicast",
}
# Wireshark column protocol -> our taxonomy (fallback when port is unknown)
COL_PROTO = [
    ("TLS", "https"), ("SSL", "https"), ("QUIC", "udp"), ("HTTP", "http"),
    ("DNS", "dns"), ("MDNS", "multicast"), ("SSDP", "multicast"), ("IGMP", "multicast"),
    ("ICMP", "icmp"), ("SSH", "ssh"), ("NTP", "udp"), ("DHCP", "udp"),
]
TRAIN_BYTES = 250_000
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
    except Exception as e:  # noqa: BLE001
        print(f"[collector] POST {path} failed: {e}", file=sys.stderr)
        return None


def local_ips() -> set:
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


def default_iface():
    if os.environ.get("NHC_IFACE"):
        return os.environ["NHC_IFACE"]
    try:
        out = subprocess.check_output(["ip", "route"], text=True)
        m = re.search(r"default via \S+ dev (\S+)", out)
        if m:
            return m.group(1)
    except Exception:  # noqa: BLE001
        pass
    return "any"


def is_lan(ip: str) -> bool:
    return ip.startswith(("10.", "192.168.")) or bool(re.match(r"172\.(1[6-9]|2\d|3[01])\.", ip))


def node_id(ip: str) -> str:
    return "n-" + ip.replace(".", "-").replace(":", "-")


def proto_from_ports(sport: int, dport: int):
    for port in (dport, sport):
        if port in PORT_PROTO:
            return PORT_PROTO[port], port
    return None, (dport or sport or 0)


def proto_from_col(col: str):
    up = (col or "").upper()
    for key, val in COL_PROTO:
        if up.startswith(key) or f" {key}" in up:
            return val
    return None


class CityMapper:
    """Resolves an IP to a building (node) and registers it once. Shared by both backends."""

    def __init__(self):
        self.locals = local_ips()
        self.gw = gateway_ip()
        self.host = socket.gethostname()
        self.self_id = "n-self"
        self.gw_id = node_id(self.gw) if self.gw else self.self_id
        self.registered: set = set()
        self._register(self.self_id, f"{self.host} (this host)",
                       next(iter(sorted(self.locals - {'127.0.0.1', '::1'})), "127.0.0.1"), "server")
        if self.gw:
            self._register(self.gw_id, "Internet Gateway", self.gw, "gateway")

    def _register(self, nid, name, ip, kind):
        if nid in self.registered:
            return
        post("/api/nodes", {"id": nid, "name": name, "ip": ip, "kind": kind})
        self.registered.add(nid)

    def resolve(self, ip: str):
        if ip in self.locals or ip in ("127.0.0.1", "::1"):
            return self.self_id
        if self.gw and ip == self.gw:
            return self.gw_id
        if is_lan(ip):
            nid = node_id(ip)
            self._register(nid, f"LAN {ip}", ip, "laptop")
            return nid
        # external / internet endpoint -> collapse onto the gateway building
        return self.gw_id


# ---------------------------------------------------------------- ss backend
_HOSTPORT = re.compile(r"^(.*):(\d+)$")


def split_hostport(token: str):
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


def run_ss(mapper: CityMapper):
    print(f"[collector] backend=ss  {mapper.host} -> {API}  polling {POLL}s (kernel byte deltas)")
    prev: dict = {}
    est_warned = False
    while True:
        events = []
        for c in _ss_conns():
            local_is_self = c["local"] in mapper.locals
            if not (local_is_self or c["peer"] in mapper.locals):
                continue
            peer_ip = c["peer"] if local_is_self else c["local"]
            dst = mapper.resolve(peer_ip)
            proto, svc = proto_from_ports(c["lport"], c["pport"])
            if proto is None:
                proto = "udp" if c["udp"] else "tcp"
            key = (c["local"], c["lport"], c["peer"], c["pport"])
            total = c["sent"] + c["recv"]
            if total > 0:
                delta = max(0, total - prev.get(key, total))
                prev[key] = total
                if delta == 0:
                    continue
                nbytes = delta
            else:
                if not est_warned:
                    print("[collector] kernel byte counters unavailable; using estimates", file=sys.stderr)
                    est_warned = True
                nbytes = EST_BYTES.get(proto, 800)
            if nbytes > TRAIN_BYTES:
                proto = "train"
            src = mapper.self_id
            if src == dst:
                continue
            events.append({"srcId": src, "dstId": dst, "protocol": proto,
                           "bytes": int(nbytes), "info": f":{svc} {proto}"})
        _flush(events)
        time.sleep(POLL)


def _ss_conns():
    conns = []
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
            parts = line.split()
            if len(parts) < 5 or parts[0] != "ESTAB":
                cur = None
                continue
            lh, lp = split_hostport(parts[3])
            ph, pp = split_hostport(parts[4])
            cur = {"local": lh, "lport": lp, "peer": ph, "pport": pp, "udp": False, "sent": 0, "recv": 0}
            conns.append(cur)
        elif cur is not None:
            ms = re.search(r"bytes_acked:(\d+)", line)
            mr = re.search(r"bytes_received:(\d+)", line)
            if ms:
                cur["sent"] = int(ms.group(1))
            if mr:
                cur["recv"] = int(mr.group(1))
    try:
        for line in subprocess.check_output(["ss", "-uan"], text=True).splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0] not in ("ESTAB", "UNCONN"):
                continue
            lh, lp = split_hostport(parts[3])
            ph, pp = split_hostport(parts[4])
            if ph in ("*", "0.0.0.0", "::") or pp == 0:
                continue
            conns.append({"local": lh, "lport": lp, "peer": ph, "pport": pp, "udp": True, "sent": 0, "recv": 0})
    except Exception:  # noqa: BLE001
        pass
    return conns


# ------------------------------------------------------------ tshark backend
def run_tshark(mapper: CityMapper):
    iface = default_iface()
    print(f"[collector] backend=tshark  iface={iface}  {mapper.host} -> {API}  "
          f"{POLL}s windows (exact packet bytes + Wireshark dissection)")
    print("[collector] make an Ollama request (ollama run <model>) to see real llamas 🦙")
    fields = ["ip.src", "ip.dst", "tcp.srcport", "tcp.dstport",
              "udp.srcport", "udp.dstport", "ip.proto", "frame.len", "_ws.col.Protocol"]
    base = ["tshark", "-i", iface, "-n", "-q", "-l", "-a", f"duration:{int(POLL)}",
            "-T", "fields", "-E", "separator=\t"]
    for f in fields:
        base += ["-e", f]
    while True:
        # aggregate one capture window: {(srcNode,dstNode,proto): [bytes, service_port]}
        agg: dict = {}
        try:
            out = subprocess.run(base, capture_output=True, text=True, timeout=POLL + 8).stdout
        except Exception as e:  # noqa: BLE001
            print(f"[collector] tshark capture failed: {e}", file=sys.stderr)
            time.sleep(POLL)
            continue
        for line in out.splitlines():
            cols = line.split("\t")
            if len(cols) < 9:
                continue
            src, dst, tsp, tdp, usp, udp_dp, ipproto, flen, colproto = cols[:9]
            if not src or not dst:
                continue
            sport = int(tsp or usp or 0)
            dport = int(tdp or udp_dp or 0)
            try:
                nbytes = int(flen or 0)
            except ValueError:
                nbytes = 0
            proto, svc = proto_from_ports(sport, dport)
            if proto is None:
                if ipproto == "1":
                    proto, svc = "icmp", 0
                else:
                    proto = proto_from_col(colproto) or ("udp" if ipproto == "17" else "tcp")
                    svc = dport or sport
            s_node, d_node = mapper.resolve(src), mapper.resolve(dst)
            if s_node == d_node and proto != "ollama":
                continue  # skip self-loops except localhost ollama
            key = (s_node, d_node, proto)
            slot = agg.setdefault(key, [0, svc])
            slot[0] += nbytes
        events = []
        for (s_node, d_node, proto), (nbytes, svc) in agg.items():
            p = "train" if nbytes > TRAIN_BYTES else proto
            events.append({"srcId": s_node, "dstId": d_node, "protocol": p,
                           "bytes": int(nbytes), "info": f":{svc} {proto}"})
        _flush(events)


def _flush(events):
    if not events:
        return
    post("/api/traffic/batch", {"events": events})
    llamas = sum(1 for e in events if e["protocol"] == "ollama")
    print(f"[collector] sent {len(events)} real events" + (f" ({llamas} ollama 🦙)" if llamas else ""))


def main():
    mapper = CityMapper()
    have_tshark = shutil.which("tshark") is not None
    backend = CAPTURE
    if backend == "auto":
        backend = "tshark" if have_tshark else "ss"
    if backend == "tshark" and not have_tshark:
        print("[collector] tshark requested but not installed; falling back to ss", file=sys.stderr)
        backend = "ss"
    (run_tshark if backend == "tshark" else run_ss)(mapper)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[collector] stopped")
