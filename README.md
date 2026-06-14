# Network Highway City

A SimCity 3000-inspired visualizer that renders your **local network traffic as
an isometric city**. Devices are buildings/districts, flows are highways and
rail lines, and every protocol drives a different vehicle:

- **ICMP / pings** → police cars (with blinking lightbars)
- **HTTP** → delivery vans · **HTTPS** → armored cars
- **DNS** → courier scooters · **SSH** → maintenance trucks
- **UDP** → city buses · **TCP** → freight trucks
- **Multicast** → utility vans · **Unknown** → taxis
- **Backbone / high-volume routes** → freight **trains** on rail tracks

Runs on simulated demo traffic out of the box. Plug in real LAN data via the
documented collector API — see **[COLLECTOR.md](./COLLECTOR.md)**.

## Run

```bash
npm install
npm run dev      # Express + Vite on http://localhost:5000
```

To visualize your **real** network with Wireshark, follow the step-by-step
**[INSTALL.md](./INSTALL.md)**.

Production build:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Features

- Live animated isometric city (HTML5 Canvas), pan (drag) + zoom (scroll/buttons)
- Pause/resume, speed slider, traffic-intensity slider
- Filter by protocol/vehicle from the legend
- Click buildings → District Inspector; click/hover vehicles → Traffic Inspector
- LED-style metric gauges: bandwidth, active nodes, ping latency, train cargo, vehicles
- City Alerts panel for high latency and highway congestion
- Demo network: gateway, router, dev server, NAS, laptop, phone, printer, smart
  TV, IoT devices, guest device, with plausible flows
- Backend ingest API + Server-Sent Events for real data

## Architecture

| Layer       | File                                  |
| ----------- | ------------------------------------- |
| Schema      | `shared/schema.ts`                    |
| Demo data   | `shared/demoData.ts`                  |
| API + SSE   | `server/routes.ts`                    |
| Storage     | `server/storage.ts` (SQLite/Drizzle)  |
| Render engine | `client/src/lib/cityEngine.ts`      |
| Vehicle config | `client/src/lib/cityConfig.ts`     |
| Live wiring | `client/src/lib/useCityData.ts`       |
| UI          | `client/src/pages/Home.tsx` + `client/src/components/*` |

No `localStorage`/cookies are used. Real network capture is **simulated** in the
cloud; connect a local collector as described in COLLECTOR.md.
