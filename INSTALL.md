# Install Guide — Real Traffic with Wireshark

This guide takes you from a fresh machine to **your real LAN traffic driving
through the city**, using the high-fidelity **Wireshark (tshark)** capture
backend. Wireshark gives exact per-packet byte counts and Wireshark's own
protocol dissection; if you'd rather not install anything, the zero-setup `ss`
fallback is covered too.

> Full API reference and the scapy alternative live in
> **[COLLECTOR.md](./COLLECTOR.md)**.

## Prerequisites

- **Node 18+** (`node`, `npm`) — to run the app.
- **Python 3** — to run the collector. Standard library only; **no `pip install`
  needed**.
- A machine **inside the network you want to visualize** — the collector reads
  that host's traffic and pushes it to the app.

**Platform:** Linux is the primary target — the collector uses `ss`, `ip route`,
and `hostname -I`. macOS works for the **tshark** backend (install via
`brew install wireshark`) but **not** the `ss` backend.

---

## Step 1 — Run the app

```bash
npm install
npm run dev      # Express + Vite on http://localhost:5000
```

Leave it running and open <http://localhost:5000>. You'll see simulated demo
traffic — that pauses automatically once real events arrive.

---

## Step 2 — Install Wireshark / tshark

### Debian / Ubuntu

```bash
sudo apt-get install -y tshark
sudo dpkg-reconfigure wireshark-common      # answer "Yes" to non-root capture
sudo usermod -aG wireshark "$USER"          # then log out and back in
```

If you can't (or don't want to) use the `wireshark` group, grant the capability
to the capture helper directly:

```bash
sudo setcap cap_net_raw,cap_net_admin+eip "$(which dumpcap)"
```

### Fedora / RHEL

```bash
sudo dnf install -y wireshark-cli
sudo usermod -aG wireshark "$USER"          # then log out and back in
```

### Arch

```bash
sudo pacman -S --noconfirm wireshark-cli
sudo usermod -aG wireshark "$USER"          # then log out and back in
```

### macOS

```bash
brew install wireshark                       # provides tshark
```

### Verify non-root capture works

After logging back in:

```bash
tshark -D        # lists interfaces, e.g. "1. eth0", with NO sudo
```

If this prints interfaces without a permission error, you're ready. If it
fails, re-check the group membership / `setcap` step above and confirm you've
started a fresh login session.

---

## Step 3 — Run the collector

The collector **auto-selects tshark** when it's installed, otherwise falls back
to `ss`:

```bash
python3 script/collector.py                  # auto: tshark if available, else ss
NHC_CAPTURE=tshark python3 script/collector.py
NHC_API=http://host:5000 NHC_POLL=2 NHC_IFACE=eth0 python3 script/collector.py
```

On start it prints the active backend, e.g.:

```
[collector] backend=tshark  iface=eth0  myhost -> http://localhost:5000  2s windows (exact packet bytes + Wireshark dissection)
[collector] sent 14 real events
```

### Environment variables

| Var           | Default          | Meaning                                          |
| ------------- | ---------------- | ------------------------------------------------ |
| `NHC_API`     | `http://localhost:5000` | Where the app is served.                  |
| `NHC_CAPTURE` | `auto`           | Force a backend: `tshark` or `ss`.               |
| `NHC_POLL`    | `2.0`            | Capture window / poll interval in seconds (min 1). |
| `NHC_IFACE`   | auto (default route) | Interface to capture on (tshark backend).    |

---

## Step 4 — See real traffic (and llamas 🦙)

Keep the app open while the collector runs. The demo simulation pauses and the
city switches to your real traffic:

- **This host** and each **LAN peer** get their own building.
- **External / internet** endpoints collapse onto the **gateway** building.
- High-volume transfers ride the **rail backbone** as freight trains.

To see real **llamas**, make an Ollama request while the collector runs —
traffic to **port `:11434`** is rendered as llamas:

```bash
ollama run <model>
```

---

## Backend comparison

| | **tshark** (Wireshark) | **ss** (iproute2) |
| --- | --- | --- |
| Setup | install + capture privileges | none (no root, no deps) |
| Byte counts | exact per-packet | per-interval kernel deltas (estimated if unavailable) |
| Protocol detection | Wireshark dissection | port-based |
| Visibility | all traffic on the link (incl. mirrored/promiscuous) | this host's sockets only |
| Use when | you want accuracy and full visibility | you want zero setup |

---

## Troubleshooting

- **`tshark requested but not installed; falling back to ss`** — install tshark
  (Step 2), or run with `NHC_CAPTURE=ss` to silence it intentionally.
- **Permission denied on capture** — redo the `wireshark` group or `setcap`
  step, then **log out and back in** (group changes need a fresh session).
  Verify with `tshark -D`.
- **No interface / wrong interface** — set `NHC_IFACE=<iface>` (find it with
  `tshark -D` or `ip route`).
- **No llamas appear** — make an actual Ollama request (`ollama run <model>`)
  while the collector is running; only live `:11434` traffic shows as llamas.
- **`POST ... failed`** — the app isn't running or `NHC_API` points at the wrong
  host/port. Confirm <http://localhost:5000> loads and matches `NHC_API`.

---

## Next steps

- **[COLLECTOR.md](./COLLECTOR.md)** — full ingest API (`/api/nodes`,
  `/api/traffic`, `/api/stream`), the protocol→vehicle mapping, the scapy
  capture alternative, and how to batch-import a JSON capture file.
