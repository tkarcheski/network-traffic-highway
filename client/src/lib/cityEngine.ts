import { VEHICLES, NODE_KINDS, type Protocol, type NodeKind } from "./cityConfig";

export interface CityNode {
  id: string;
  name: string;
  ip: string;
  mac?: string | null;
  kind: NodeKind;
  gridX: number;
  gridY: number;
}

export interface FlowSpec {
  src: string;
  dst: string;
  protocols: { protocol: Protocol; weight: number; avgBytes: number }[];
}

export interface ActiveVehicle {
  id: number;
  protocol: Protocol;
  srcId: string;
  dstId: string;
  bytes: number;
  latencyMs?: number;
  info: string;
  // animation
  t: number; // 0..1 progress
  speed: number; // per second
  isTrain: boolean;
  carCount: number;
  ts: number;
}

export interface EngineCallbacks {
  onVehicleClick?: (v: ActiveVehicle) => void;
  onNodeClick?: (n: CityNode) => void;
  onHover?: (info: { kind: "node" | "vehicle"; data: any } | null, x: number, y: number) => void;
  onStats?: (s: EngineStats) => void;
  onAlert?: (a: Alert) => void;
}

export interface EngineStats {
  bps: number; // bytes/sec moving average
  activeVehicles: number;
  activeNodes: number;
  avgPingMs: number;
  trainBytes: number; // cumulative backbone bytes this run
  perProtocol: Record<string, number>; // counts
}

export interface Alert {
  id: number;
  ts: number;
  severity: "warn" | "crit";
  nodeId?: string;
  title: string;
  detail: string;
}

const TILE_W = 64;
const TILE_H = 32;

export interface EngineConfig {
  paused: boolean;
  speed: number; // 0.2 .. 3
  intensity: number; // spawn multiplier 0.2 .. 3
  enabled: Record<Protocol, boolean>;
}

export class CityEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  nodes: CityNode[] = [];
  flows: FlowSpec[] = [];
  vehicles: ActiveVehicle[] = [];
  cb: EngineCallbacks;
  cfg: EngineConfig = {
    paused: false,
    speed: 1,
    intensity: 1,
    enabled: Object.fromEntries(
      Object.keys(VEHICLES).map((p) => [p, true])
    ) as Record<Protocol, boolean>,
  };

  // camera
  camX = 0;
  camY = 0;
  zoom = 1;
  selectedNodeId: string | null = null;

  private raf = 0;
  private last = 0;
  private spawnAcc = 0;
  private vid = 1;
  private aid = 1;
  private dpr = 1;
  private mouse = { x: -1, y: -1, down: false, dragX: 0, dragY: 0, dragging: false };
  private bytesWindow: { ts: number; bytes: number }[] = [];
  private pingWindow: number[] = [];
  protoCounts: Record<string, number> = {};
  trainBytesTotal = 0;
  private gridW = 10;
  private gridH = 8;
  private timeOfDay = 0; // 0..1 for subtle day/night

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.cb = cb;
    this.attach();
  }

  setData(nodes: CityNode[], flows: FlowSpec[]) {
    this.nodes = nodes;
    this.flows = flows;
    this.gridW = Math.max(10, ...nodes.map((n) => n.gridX + 2));
    this.gridH = Math.max(8, ...nodes.map((n) => n.gridY + 2));
    this.centerCamera();
  }

  private node(id: string) {
    return this.nodes.find((n) => n.id === id);
  }

  centerCamera() {
    // center the iso grid in the viewport
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    // fit the iso grid to the viewport
    const spanX = (this.gridW + this.gridH) * (TILE_W / 2);
    const spanY = (this.gridW + this.gridH) * (TILE_H / 2);
    const fit = Math.min((w * 0.82) / spanX, (h * 0.78) / spanY);
    this.zoom = Math.max(0.5, Math.min(1.6, fit));
    const midX = (this.gridW - this.gridH) * (TILE_W / 2) * 0.5 * this.zoom;
    this.camX = w / 2 - midX;
    // raise the city so tall buildings + labels have headroom
    this.camY = h / 2 - (this.gridW + this.gridH) * (TILE_H / 2) * this.zoom * 0.5 + Math.min(40, h * 0.04);
  }

  // ---- coordinate transforms ----
  iso(gx: number, gy: number) {
    return {
      x: (gx - gy) * (TILE_W / 2) * this.zoom + this.camX,
      y: (gx + gy) * (TILE_H / 2) * this.zoom + this.camY,
    };
  }

  // ---- lifecycle ----
  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
    this.detach();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---- external event ingest (real data path) ----
  injectEvent(e: {
    srcId: string;
    dstId: string;
    protocol: Protocol;
    bytes: number;
    latencyMs?: number;
    info?: string;
    ts?: number;
  }) {
    if (!this.node(e.srcId) || !this.node(e.dstId)) return;
    this.spawnVehicle(e.srcId, e.dstId, e.protocol, e.bytes, e.latencyMs, e.info, e.ts);
  }

  private spawnVehicle(
    srcId: string,
    dstId: string,
    protocol: Protocol,
    bytes: number,
    latencyMs?: number,
    info?: string,
    ts?: number
  ) {
    const isTrain = protocol === "train";
    const v: ActiveVehicle = {
      id: this.vid++,
      protocol,
      srcId,
      dstId,
      bytes,
      latencyMs,
      info: info || this.autoInfo(protocol),
      t: 0,
      speed: isTrain ? 0.32 : 0.55 + Math.random() * 0.35,
      isTrain,
      carCount: isTrain ? 3 + Math.round(Math.min(5, bytes / 400000)) : 1,
      ts: ts || Date.now(),
    };
    this.vehicles.push(v);
    this.protoCounts[protocol] = (this.protoCounts[protocol] || 0) + 1;
    this.bytesWindow.push({ ts: performance.now(), bytes });
    if (isTrain) this.trainBytesTotal += bytes;
    if (protocol === "icmp" && latencyMs != null) {
      this.pingWindow.push(latencyMs);
      if (this.pingWindow.length > 30) this.pingWindow.shift();
      if (latencyMs > 120) {
        this.cb.onAlert?.({
          id: this.aid++,
          ts: Date.now(),
          severity: latencyMs > 250 ? "crit" : "warn",
          nodeId: dstId,
          title: "High ping latency",
          detail: `${this.node(dstId)?.name ?? dstId} responded in ${latencyMs.toFixed(
            0
          )} ms`,
        });
      }
    }
    // congestion alert
    const onEdge = this.vehicles.filter(
      (x) => x.srcId === srcId && x.dstId === dstId
    ).length;
    if (onEdge > 16 && Math.random() < 0.04) {
      this.cb.onAlert?.({
        id: this.aid++,
        ts: Date.now(),
        severity: "warn",
        nodeId: dstId,
        title: "Highway congestion",
        detail: `Heavy traffic on the ${this.node(srcId)?.name} → ${
          this.node(dstId)?.name
        } highway`,
      });
    }
  }

  private autoInfo(p: Protocol): string {
    const map: Record<Protocol, string[]> = {
      http: ["GET /index.html", "POST /api/update", "GET /assets/logo.png"],
      https: ["TLS 1.3 handshake", "GET /v2/feed", "stream chunk"],
      dns: ["A example.com", "AAAA cdn.net", "PTR lookup"],
      ssh: ["session keepalive", "scp upload", "shell command"],
      icmp: ["echo request", "echo reply"],
      udp: ["QUIC datagram", "VoIP frame", "game tick"],
      tcp: ["bulk transfer", "ACK window", "retransmit"],
      multicast: ["mDNS announce", "SSDP discover", "IGMP report"],
      train: ["backbone transfer", "bulk sync convoy", "streaming trunk"],
      unknown: ["unclassified flow", "port 0 chatter", "unknown payload"],
    };
    const arr = map[p];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---- demo simulation spawn ----
  private simSpawn(dt: number) {
    if (this.flows.length === 0) return;
    const rate = 6 * this.cfg.intensity; // base events/sec
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const flow = this.flows[Math.floor(Math.random() * this.flows.length)];
      const total = flow.protocols.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total;
      let chosen = flow.protocols[0];
      for (const p of flow.protocols) {
        r -= p.weight;
        if (r <= 0) {
          chosen = p;
          break;
        }
      }
      if (!this.cfg.enabled[chosen.protocol]) continue;
      const bytes = Math.round(
        chosen.avgBytes * (0.5 + Math.random())
      );
      let latency: number | undefined;
      if (chosen.protocol === "icmp") {
        // mostly low, occasional spike
        latency = Math.random() < 0.12 ? 90 + Math.random() * 220 : 4 + Math.random() * 40;
      }
      // randomize direction sometimes for return traffic
      const flip = Math.random() < 0.4;
      this.spawnVehicle(
        flip ? flow.dst : flow.src,
        flip ? flow.src : flow.dst,
        chosen.protocol,
        bytes,
        latency
      );
    }
  }

  private frame(t: number) {
    const dtRaw = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const dt = this.cfg.paused ? 0 : dtRaw * this.cfg.speed;
    this.timeOfDay = (this.timeOfDay + dtRaw * 0.01) % 1;

    if (!this.cfg.paused) this.simSpawn(dt);

    // update vehicles
    for (const v of this.vehicles) {
      v.t += v.speed * dt;
    }
    this.vehicles = this.vehicles.filter((v) => v.t < 1);

    // prune byte window (2s)
    const now = performance.now();
    this.bytesWindow = this.bytesWindow.filter((b) => now - b.ts < 2000);

    this.draw();
    this.emitStats();
  }

  private emitStats() {
    const winBytes = this.bytesWindow.reduce((s, b) => s + b.bytes, 0);
    const bps = winBytes / 2; // bytes per sec over 2s window
    const activeNodes = new Set<string>();
    for (const v of this.vehicles) {
      activeNodes.add(v.srcId);
      activeNodes.add(v.dstId);
    }
    const avgPing =
      this.pingWindow.length > 0
        ? this.pingWindow.reduce((s, x) => s + x, 0) / this.pingWindow.length
        : 0;
    this.cb.onStats?.({
      bps,
      activeVehicles: this.vehicles.filter((v) => this.cfg.enabled[v.protocol]).length,
      activeNodes: activeNodes.size,
      avgPingMs: avgPing,
      trainBytes: this.trainBytesTotal,
      perProtocol: { ...this.protoCounts },
    });
  }

  // ---- drawing ----
  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // sky/ground gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0c2027");
    g.addColorStop(1, "#0a1a20");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    this.drawGround();
    this.drawHighways();
    this.drawRails();

    // draw buildings + vehicles sorted by depth (painter's algorithm)
    const drawables: { depth: number; fn: () => void }[] = [];
    for (const n of this.nodes) {
      drawables.push({
        depth: n.gridX + n.gridY,
        fn: () => this.drawBuilding(n),
      });
    }
    for (const v of this.vehicles) {
      if (!this.cfg.enabled[v.protocol]) continue;
      const s = this.node(v.srcId)!;
      const d = this.node(v.dstId)!;
      const gx = s.gridX + (d.gridX - s.gridX) * v.t;
      const gy = s.gridY + (d.gridY - s.gridY) * v.t;
      drawables.push({ depth: gx + gy + 0.5, fn: () => this.drawVehicle(v, gx, gy) });
    }
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.fn();

    this.drawHoverHit();
  }

  private drawGround() {
    const ctx = this.ctx;
    for (let gx = 0; gx < this.gridW; gx++) {
      for (let gy = 0; gy < this.gridH; gy++) {
        const { x, y } = this.iso(gx, gy);
        const checker = (gx + gy) % 2 === 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (TILE_W / 2) * this.zoom, y + (TILE_H / 2) * this.zoom);
        ctx.lineTo(x, y + TILE_H * this.zoom);
        ctx.lineTo(x - (TILE_W / 2) * this.zoom, y + (TILE_H / 2) * this.zoom);
        ctx.closePath();
        ctx.fillStyle = checker ? "#15323b" : "#123039";
        ctx.fill();
        ctx.strokeStyle = "rgba(60,130,140,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private edgeKey(a: string, b: string) {
    return [a, b].sort().join("|");
  }

  private uniqueEdges() {
    const seen = new Set<string>();
    const edges: { a: CityNode; b: CityNode; isRail: boolean }[] = [];
    for (const f of this.flows) {
      const k = this.edgeKey(f.src, f.dst);
      if (seen.has(k)) continue;
      seen.add(k);
      const a = this.node(f.src);
      const b = this.node(f.dst);
      if (!a || !b) continue;
      const isRail = f.protocols.some((p) => p.protocol === "train");
      edges.push({ a, b, isRail });
    }
    return edges;
  }

  private drawHighways() {
    const ctx = this.ctx;
    for (const e of this.uniqueEdges()) {
      const p1 = this.iso(e.a.gridX + 0.5, e.a.gridY + 0.5);
      const p2 = this.iso(e.b.gridX + 0.5, e.b.gridY + 0.5);
      // road base
      ctx.strokeStyle = "#243b42";
      ctx.lineWidth = 14 * this.zoom;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      // asphalt
      ctx.strokeStyle = "#2f4a52";
      ctx.lineWidth = 10 * this.zoom;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      // center dashes
      ctx.strokeStyle = "rgba(245,220,120,0.5)";
      ctx.lineWidth = 1.5 * this.zoom;
      ctx.setLineDash([6 * this.zoom, 8 * this.zoom]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawRails() {
    const ctx = this.ctx;
    for (const e of this.uniqueEdges()) {
      if (!e.isRail) continue;
      const p1 = this.iso(e.a.gridX + 0.5, e.a.gridY + 0.5);
      const p2 = this.iso(e.b.gridX + 0.5, e.b.gridY + 0.5);
      // offset rail bed slightly above road
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const off = 6 * this.zoom;
      const a = { x: p1.x + nx * off, y: p1.y + ny * off };
      const b = { x: p2.x + nx * off, y: p2.y + ny * off };
      // ties
      ctx.strokeStyle = "#5a4327";
      ctx.lineWidth = 5 * this.zoom;
      const steps = Math.max(4, Math.floor(len / (12 * this.zoom)));
      for (let i = 0; i <= steps; i++) {
        const tt = i / steps;
        const cx = a.x + (b.x - a.x) * tt;
        const cy = a.y + (b.y - a.y) * tt;
        ctx.beginPath();
        ctx.moveTo(cx - nx * 4 * this.zoom, cy - ny * 4 * this.zoom);
        ctx.lineTo(cx + nx * 4 * this.zoom, cy + ny * 4 * this.zoom);
        ctx.stroke();
      }
      // rails
      ctx.strokeStyle = "#aeb6bd";
      ctx.lineWidth = 1.6 * this.zoom;
      for (const r of [-2.5, 2.5]) {
        ctx.beginPath();
        ctx.moveTo(a.x + nx * r * this.zoom, a.y + ny * r * this.zoom);
        ctx.lineTo(b.x + nx * r * this.zoom, b.y + ny * r * this.zoom);
        ctx.stroke();
      }
    }
  }

  private drawBuilding(n: CityNode) {
    const ctx = this.ctx;
    const spec = NODE_KINDS[n.kind];
    const base = this.iso(n.gridX + 0.5, n.gridY + 0.5);
    const bw = 22 * this.zoom; // half width
    const bh = spec.height * 26 * this.zoom; // pixel height
    const top = { x: base.x, y: base.y - bh };
    const selected = this.selectedNodeId === n.id;

    // footprint diamond
    const fy = base.y;
    const left = { x: base.x - bw, y: fy - bw * 0.5 };
    const right = { x: base.x + bw, y: fy - bw * 0.5 };
    const front = { x: base.x, y: fy };
    const back = { x: base.x, y: fy - bw };

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(base.x + 6 * this.zoom, base.y - 2, bw * 1.1, bw * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // left wall
    ctx.fillStyle = this.shade(spec.wall, -0.18);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(front.x, front.y);
    ctx.lineTo(front.x, front.y - bh);
    ctx.lineTo(left.x, left.y - bh);
    ctx.closePath();
    ctx.fill();

    // right wall
    ctx.fillStyle = this.shade(spec.wall, 0.08);
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(front.x, front.y);
    ctx.lineTo(front.x, front.y - bh);
    ctx.lineTo(right.x, right.y - bh);
    ctx.closePath();
    ctx.fill();

    // windows (tiny pixel grid) on right wall
    ctx.fillStyle = "rgba(255,235,160,0.55)";
    const rows = Math.max(1, Math.floor(spec.height * 2));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        if ((r + c + n.gridX) % 3 === 0) continue;
        const wx = front.x + (right.x - front.x) * (0.3 + c * 0.35);
        const wy = front.y - 8 * this.zoom - r * (bh / (rows + 0.5)) - bw * 0.12;
        ctx.fillRect(wx, wy, 3 * this.zoom, 4 * this.zoom);
      }
    }

    // roof
    ctx.fillStyle = selected ? "#ffe08a" : spec.roof;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - bh);
    ctx.lineTo(front.x, front.y - bh);
    ctx.lineTo(right.x, right.y - bh);
    ctx.lineTo(back.x, back.y - bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (selected) {
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // label tag
    const labelY = top.y - 8 * this.zoom;
    ctx.font = `${Math.max(9, 9 * this.zoom)}px Silkscreen, monospace`;
    ctx.textAlign = "center";
    const text = n.name;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(8,22,28,0.85)";
    ctx.fillRect(base.x - tw / 2 - 4, labelY - 9 * this.zoom, tw + 8, 13 * this.zoom);
    ctx.strokeStyle = "rgba(80,200,200,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(base.x - tw / 2 - 4, labelY - 9 * this.zoom, tw + 8, 13 * this.zoom);
    ctx.fillStyle = "#bfeef0";
    ctx.fillText(text, base.x, labelY + 1);

    // store hit box
    (n as any)._hit = { x: base.x, y: base.y - bh, w: bw, h: bh + bw };
  }

  private drawVehicle(v: ActiveVehicle, gx: number, gy: number) {
    const ctx = this.ctx;
    const spec = VEHICLES[v.protocol];
    const p = this.iso(gx + 0.5, gy + 0.5);
    const size = 6 * spec.scale * this.zoom;

    if (v.isTrain) {
      // draw a small train of cars trailing behind progress
      const s = this.node(v.srcId)!;
      const d = this.node(v.dstId)!;
      for (let i = 0; i < v.carCount; i++) {
        const tt = Math.max(0, v.t - i * 0.04);
        const cgx = s.gridX + (d.gridX - s.gridX) * tt + 0.5;
        const cgy = s.gridY + (d.gridY - s.gridY) * tt + 0.5;
        const cp = this.iso(cgx, cgy);
        ctx.fillStyle = i === 0 ? "#c0392b" : spec.color;
        this.roundRect(ctx, cp.x - 5 * this.zoom, cp.y - 9 * this.zoom, 10 * this.zoom, 7 * this.zoom, 1.5);
        ctx.fill();
        ctx.fillStyle = "rgba(20,30,30,0.6)";
        ctx.fillRect(cp.x - 3 * this.zoom, cp.y - 7 * this.zoom, 6 * this.zoom, 2 * this.zoom);
      }
      (v as any)._hit = { x: p.x, y: p.y - 6 * this.zoom, r: 12 * this.zoom };
      return;
    }

    // body
    ctx.save();
    ctx.translate(p.x, p.y - size);
    // drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, size * 0.9, size * 1.1, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = spec.color;
    this.roundRect(ctx, -size, -size * 0.7, size * 2, size * 1.3, 2);
    ctx.fill();
    // cabin / window
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(-size * 0.5, -size * 0.5, size, size * 0.5);

    // police lightbar
    if (v.protocol === "icmp") {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      ctx.fillStyle = blink ? "#ff3b3b" : "#3b6fff";
      ctx.fillRect(-size * 0.5, -size * 0.95, size * 0.45, size * 0.35);
      ctx.fillStyle = blink ? "#3b6fff" : "#ff3b3b";
      ctx.fillRect(size * 0.05, -size * 0.95, size * 0.45, size * 0.35);
    }
    ctx.restore();
    (v as any)._hit = { x: p.x, y: p.y - size, r: size * 1.6 };
  }

  private drawHoverHit() {
    if (this.mouse.x < 0) return;
    // handled in pointer events; nothing persistent here
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private shade(hex: string, amt: number): string {
    const c = hex.replace("#", "");
    let r = parseInt(c.substring(0, 2), 16);
    let g = parseInt(c.substring(2, 4), 16);
    let b = parseInt(c.substring(4, 6), 16);
    r = Math.max(0, Math.min(255, Math.round(r + r * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + g * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + b * amt)));
    return `rgb(${r},${g},${b})`;
  }

  // ---- pointer interaction ----
  private attach() {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  private detach() {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private localPos(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    const { x, y } = this.localPos(e);
    this.mouse.down = true;
    this.mouse.dragging = false;
    this.mouse.dragX = x;
    this.mouse.dragY = y;
  };
  private onMove = (e: PointerEvent) => {
    const { x, y } = this.localPos(e);
    this.mouse.x = x;
    this.mouse.y = y;
    if (this.mouse.down) {
      const dx = x - this.mouse.dragX;
      const dy = y - this.mouse.dragY;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.mouse.dragging = true;
      this.camX += dx;
      this.camY += dy;
      this.mouse.dragX = x;
      this.mouse.dragY = y;
      return;
    }
    // hover detection
    const hit = this.hitTest(x, y);
    if (hit) {
      this.cb.onHover?.(hit, e.clientX, e.clientY);
      this.canvas.style.cursor = "pointer";
    } else {
      this.cb.onHover?.(null, e.clientX, e.clientY);
      this.canvas.style.cursor = "grab";
    }
  };
  private onUp = (e: PointerEvent) => {
    const wasDragging = this.mouse.dragging;
    this.mouse.down = false;
    if (wasDragging) return;
    const { x, y } = this.localPos(e);
    const hit = this.hitTest(x, y);
    if (hit?.kind === "node") {
      this.selectedNodeId = hit.data.id;
      this.cb.onNodeClick?.(hit.data);
    } else if (hit?.kind === "vehicle") {
      this.cb.onVehicleClick?.(hit.data);
    } else {
      this.selectedNodeId = null;
    }
  };
  private onLeave = () => {
    this.mouse.down = false;
    this.mouse.x = -1;
    this.cb.onHover?.(null, 0, 0);
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x, y } = this.localPos(e);
    const before = this.zoom;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.zoom = Math.max(0.4, Math.min(2.4, this.zoom * factor));
    // zoom toward cursor
    const ratio = this.zoom / before;
    this.camX = x - (x - this.camX) * ratio;
    this.camY = y - (y - this.camY) * ratio;
  };

  setZoom(z: number, cx?: number, cy?: number) {
    const before = this.zoom;
    this.zoom = Math.max(0.4, Math.min(2.4, z));
    const w = this.canvas.clientWidth / 2;
    const h = this.canvas.clientHeight / 2;
    const px = cx ?? w;
    const py = cy ?? h;
    const ratio = this.zoom / before;
    this.camX = px - (px - this.camX) * ratio;
    this.camY = py - (py - this.camY) * ratio;
  }

  private hitTest(x: number, y: number): { kind: "node" | "vehicle"; data: any } | null {
    // vehicles first (drawn on top), nearest by depth (reverse)
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (!this.cfg.enabled[v.protocol]) continue;
      const hb = (v as any)._hit;
      if (hb && Math.hypot(x - hb.x, y - hb.y) <= hb.r) {
        return { kind: "vehicle", data: v };
      }
    }
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const hb = (n as any)._hit;
      if (
        hb &&
        x >= hb.x - hb.w &&
        x <= hb.x + hb.w &&
        y >= hb.y &&
        y <= hb.y + hb.h
      ) {
        return { kind: "node", data: n };
      }
    }
    return null;
  }
}
