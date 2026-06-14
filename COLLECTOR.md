# Connecting Real Local Network Data

Network Highway City renders **simulated demo traffic by default** because the
hosted app cannot see your LAN. To visualize your *real* network, run a small
collector **on a machine inside your network** and push events to the app's HTTP
API. The city updates live via Server-Sent Events.

```
  [ your LAN ]                          [ Network Highway City ]
  packet capture / ping  --HTTP POST-->  /api/nodes      (devices -> buildings)
  flow summarizer        --HTTP POST-->  /api/traffic    (flows  -> vehicles)
                                          /api/stream     (SSE -> live animation)
```

## Quick start: the included collector (no root)

> For full Wireshark setup (install + non-root capture, step by step), see
> **[INSTALL.md](./INSTALL.md)**.

A ready-to-run collector ships in `script/collector.py`. It needs **no root and
no dependencies** — it reads active sockets from `ss` (iproute2), auto-registers
your devices, classifies each connection by port (including Ollama's **:11434 →
llamas 🦙**), and streams real per-interval byte deltas to the app:

```bash
python3 script/collector.py                      # -> http://localhost:5000
NHC_API=http://host:5000 python3 script/collector.py
NHC_POLL=1.5 python3 script/collector.py         # faster polling
```

Leave the app open while it runs — the demo simulation pauses automatically and
the city switches to your real traffic. External/internet endpoints collapse onto
the gateway building; LAN peers and this host each get their own building. To see
real llamas, make an Ollama request (e.g. `ollama run <model>`) while it runs.
Byte counts come from the kernel's per-socket tcp-info when available (modern
Linux); otherwise a small estimate is used. For raw packet capture with exact
bytes, the scapy example below is an alternative (needs root).

## API reference

Base URL = wherever the app is served (e.g. `http://localhost:5000`).

### 1. Register devices (buildings)

`POST /api/nodes` — upsert one device. Re-POST to update.

```json
{
  "id": "n-laptop",
  "name": "My Laptop",
  "ip": "192.168.1.21",
  "mac": "00:1A:2B:3C:4D:21",
  "kind": "laptop",
  "gridX": 6,
  "gridY": 1
}
```

- `kind` ∈ `gateway router server nas laptop phone printer tv iot guest`
  (controls the building's shape/color/district).
- `gridX` / `gridY` are optional isometric tile coords. Omit them and the app
  auto-lays out the device.

### 2. Send traffic events (vehicles)

`POST /api/traffic` — one event. `ts` and `bytes` default if omitted.

```json
{
  "srcId": "n-laptop",
  "dstId": "n-router",
  "protocol": "https",
  "bytes": 32000,
  "latencyMs": 12,
  "info": "GET /feed"
}
```

`POST /api/traffic/batch` — many at once:

```json
{ "events": [ { "srcId": "n-laptop", "dstId": "n-router", "protocol": "dns", "bytes": 160 } ] }
```

### Protocol → vehicle mapping

| protocol    | vehicle           | meaning                          |
| ----------- | ----------------- | -------------------------------- |
| `icmp`      | Police car        | pings / echo replies (use `latencyMs`) |
| `http`      | Delivery van      | plain web traffic                |
| `https`     | Armored car       | encrypted web traffic            |
| `dns`       | Courier scooter   | name lookups                     |
| `ssh`       | Maintenance truck | remote admin                     |
| `udp`       | City bus          | connectionless datagrams         |
| `tcp`       | Freight truck     | bulk reliable transfer           |
| `multicast` | Utility van       | mDNS / SSDP / IGMP               |
| `train`     | Freight train     | **high-volume backbone routes**  |
| `unknown`   | Taxi              | unclassified                     |

Mark backbone / bulk links (uplinks, backups, streaming, camera footage) as
`protocol: "train"` and they ride the rail network with multi-car trains whose
length scales with `bytes`.

### 3. Live stream

`GET /api/stream` is an EventSource the frontend already subscribes to. Any
event you POST is broadcast to every open dashboard immediately — no polling.

Other endpoints: `GET /api/nodes`, `GET /api/traffic?since=<ms>&limit=<n>`,
`GET /api/meta`, `POST /api/demo/seed`, `POST /api/traffic/reset`,
`GET /api/demo/topology`.

---

## Example collector (Python, scapy + ping)

Requires root for sniffing. `pip install scapy requests`.

```python
import time, requests
from scapy.all import sniff, IP, TCP, UDP, ICMP

API = "http://localhost:5000"

# Map IPs to node ids you've registered via POST /api/nodes
IP_TO_NODE = {
    "192.168.1.1":  "n-router",
    "192.168.1.21": "n-laptop",
    "192.168.1.10": "n-nas",
}

def classify(pkt):
    if pkt.haslayer(ICMP):
        return "icmp"
    if pkt.haslayer(TCP):
        dport = pkt[TCP].dport
        return {443: "https", 80: "http", 22: "ssh", 53: "dns"}.get(dport, "tcp")
    if pkt.haslayer(UDP):
        return "dns" if pkt[UDP].dport == 53 else "udp"
    return "unknown"

def on_packet(pkt):
    if not pkt.haslayer(IP):
        return
    src = IP_TO_NODE.get(pkt[IP].src)
    dst = IP_TO_NODE.get(pkt[IP].dst)
    if not src or not dst:
        return
    proto = classify(pkt)
    # promote large transfers to the rail backbone
    size = len(pkt)
    if size > 60000:
        proto = "train"
    requests.post(f"{API}/api/traffic", json={
        "srcId": src, "dstId": dst,
        "protocol": proto, "bytes": size,
    }, timeout=1)

sniff(prn=on_packet, store=False)
```

For ICMP latency, run `ping` and POST the measured RTT as `latencyMs` on an
`icmp` event — the app raises a city alert when latency is high.

## Importing a JSON capture file

You can also batch-import a previously captured file:

```bash
curl -X POST http://localhost:5000/api/traffic/batch \
  -H 'content-type: application/json' \
  --data @my-capture.json   # { "events": [ ... ] }
```

## Where this lives in the code

- Ingest + SSE routes: `server/routes.ts`
- Persistence + schema bootstrap: `server/storage.ts`, `shared/schema.ts`
- Frontend live wiring (EventSource → animation): `client/src/lib/useCityData.ts`
- Protocol→vehicle config (single source of truth): `client/src/lib/cityConfig.ts`
- Demo topology: `shared/demoData.ts`
