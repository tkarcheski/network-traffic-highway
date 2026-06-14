import { useRef, useState, useCallback } from "react";
import { CityCanvas } from "@/components/CityCanvas";
import { Legend } from "@/components/Legend";
import { MetricsBar } from "@/components/MetricsBar";
import { Controls } from "@/components/Controls";
import { AlertPanel } from "@/components/AlertPanel";
import { DetailPanel, type Selection } from "@/components/DetailPanel";
import { Logo } from "@/components/Logo";
import { useCityData } from "@/lib/useCityData";
import { PROTO_ORDER, VEHICLES, type Protocol } from "@/lib/cityConfig";
import type {
  CityEngine,
  CityNode,
  ActiveVehicle,
  EngineStats,
  Alert,
} from "@/lib/cityEngine";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plug, Radio, Menu } from "lucide-react";

const ALL_ON = Object.fromEntries(PROTO_ORDER.map((p) => [p, true])) as Record<Protocol, boolean>;

export default function Home() {
  const engineRef = useRef<CityEngine | null>(null);
  const { nodes, flows, liveConnected, usingRealData } = useCityData(engineRef);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [enabled, setEnabled] = useState<Record<Protocol, boolean>>(ALL_ON);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [stats, setStats] = useState<EngineStats>({
    bps: 0,
    activeVehicles: 0,
    activeNodes: 0,
    avgPingMs: 0,
    trainBytes: 0,
    perProtocol: {},
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);

  const onStats = useCallback((s: EngineStats) => setStats(s), []);
  const onAlert = useCallback((a: Alert) => {
    setAlerts((prev) => [a, ...prev].slice(0, 30));
  }, []);
  const onReady = useCallback((e: CityEngine) => {
    engineRef.current = e;
  }, []);

  const onNodeClick = useCallback((n: CityNode) => {
    setSelection({ type: "node", data: n });
    setSelectedNodeId(n.id);
  }, []);
  const onVehicleClick = useCallback((v: ActiveVehicle) => {
    setSelection({ type: "vehicle", data: v });
  }, []);

  const onHover = useCallback(
    (info: { kind: "node" | "vehicle"; data: any } | null, x: number, y: number) => {
      if (!info) return setHover(null);
      if (info.kind === "node") {
        setHover({ text: `${info.data.name} · ${info.data.ip}`, x, y });
      } else {
        const v: ActiveVehicle = info.data;
        setHover({ text: `${VEHICLES[v.protocol].vehicle} · ${v.protocol.toUpperCase()}`, x, y });
      }
    },
    []
  );

  const toggleProto = (p: Protocol) =>
    setEnabled((e) => ({ ...e, [p]: !e[p] }));

  const closeDetail = () => {
    setSelection(null);
    setSelectedNodeId(null);
  };

  return (
    <div className="dark flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <header className="sc-titlebar flex items-center gap-3 px-3 py-2" data-testid="header-app">
        <div className="flex items-center gap-2 text-primary-foreground">
          <Logo size={26} />
          <div className="leading-tight">
            <h1 className="font-pixel text-[11px] tracking-tight">NETWORK HIGHWAY CITY</h1>
            <p className="font-readout text-sm leading-none opacity-80">
              Local Network Traffic Planner — Build 3.0
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="hidden items-center gap-1.5 rounded border border-black/20 bg-black/20 px-2 py-1 sm:flex"
            data-testid="status-live"
            title={liveConnected ? "Live stream connected" : "Simulated traffic"}
          >
            <Radio size={13} className={liveConnected ? "text-emerald-300" : "text-amber-300"} />
            <span className="font-pixel text-[8px] uppercase">
              {usingRealData ? "Live data" : liveConnected ? "Sim · stream up" : "Simulated"}
            </span>
          </span>
          <ConnectDialog />
          <Button
            size="icon"
            variant="secondary"
            className="lg:hidden"
            onClick={() => setMobilePanel((v) => !v)}
            data-testid="button-mobile-panel"
            aria-label="Toggle panels"
          >
            <Menu size={16} />
          </Button>
        </div>
      </header>

      {/* Metrics strip */}
      <div className="border-b border-card-border bg-sidebar/60 px-3 py-2">
        <MetricsBar stats={stats} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Map viewport */}
        <main className="relative min-h-0 flex-1">
          <div className="sc-scanlines absolute inset-0">
            <CityCanvas
              nodes={nodes}
              flows={flows}
              paused={paused}
              speed={speed}
              intensity={intensity}
              enabled={enabled}
              selectedNodeId={selectedNodeId}
              onReady={onReady}
              onNodeClick={onNodeClick}
              onVehicleClick={onVehicleClick}
              onHover={onHover}
              onStats={onStats}
              onAlert={onAlert}
            />
          </div>

          {/* hover tooltip */}
          {hover && (
            <div
              className="pointer-events-none fixed z-50 rounded border border-primary/50 bg-popover/95 px-2 py-1 font-mono text-[11px] text-foreground shadow-lg"
              style={{ left: hover.x + 14, top: hover.y + 14 }}
              data-testid="tooltip-hover"
            >
              {hover.text}
            </div>
          )}

          {/* floating detail panel */}
          {selection && (
            <div className="absolute left-3 top-3 z-20 w-64 max-w-[80vw]">
              <DetailPanel selection={selection} nodes={nodes} onClose={closeDetail} />
            </div>
          )}

          {/* hint */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-black/40 px-2 py-1 font-pixel text-[8px] uppercase tracking-wide text-primary-foreground/70">
            Drag to pan · scroll to zoom · click buildings & vehicles
          </div>
        </main>

        {/* Right control deck */}
        <aside
          className={`${
            mobilePanel ? "flex" : "hidden"
          } absolute inset-y-0 right-0 z-30 w-72 flex-col gap-2 overflow-y-auto border-l border-card-border bg-sidebar p-2 lg:static lg:flex lg:w-80`}
          data-testid="aside-deck"
        >
          <Controls
            paused={paused}
            speed={speed}
            intensity={intensity}
            onPauseToggle={() => setPaused((p) => !p)}
            onSpeed={setSpeed}
            onIntensity={setIntensity}
            onZoomIn={() => engineRef.current?.setZoom((engineRef.current?.zoom ?? 1) * 1.2)}
            onZoomOut={() => engineRef.current?.setZoom((engineRef.current?.zoom ?? 1) * 0.83)}
            onRecenter={() => engineRef.current?.centerCamera()}
          />
          <Legend enabled={enabled} counts={stats.perProtocol} onToggle={toggleProto} />
          <AlertPanel alerts={alerts} />
        </aside>
      </div>
    </div>
  );
}

function ConnectDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1.5" data-testid="button-connect">
          <Plug size={14} />
          <span className="hidden sm:inline">Connect data</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="dialog-connect">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm">Plug in real network data</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            The city runs on simulated demo traffic by default. To visualize your
            real local network, run a small collector on your LAN and POST events to
            this app's API. The map updates live over Server-Sent Events.
          </p>
          <div className="sc-inset rounded p-3">
            <div className="sc-label mb-1">Register a device (node)</div>
            <pre className="overflow-x-auto font-mono text-[11px] text-foreground">
{`POST /api/nodes
{ "id":"n-laptop","name":"My Laptop",
  "ip":"192.168.1.21","kind":"laptop",
  "gridX":6,"gridY":1 }`}
            </pre>
          </div>
          <div className="sc-inset rounded p-3">
            <div className="sc-label mb-1">Send a traffic event (vehicle)</div>
            <pre className="overflow-x-auto font-mono text-[11px] text-foreground">
{`POST /api/traffic
{ "srcId":"n-laptop","dstId":"n-router",
  "protocol":"https","bytes":32000,
  "latencyMs":12,"info":"GET /feed" }`}
            </pre>
          </div>
          <p className="text-[12px]">
            Protocols map to vehicles: <strong>icmp</strong>=police car,{" "}
            <strong>http</strong>=van, <strong>https</strong>=armored car,{" "}
            <strong>dns</strong>=scooter, <strong>ssh</strong>=maintenance truck,{" "}
            <strong>udp</strong>=bus, <strong>tcp</strong>=freight truck,{" "}
            <strong>multicast</strong>=utility van, <strong>train</strong>=backbone
            train, <strong>unknown</strong>=taxi. See{" "}
            <code className="font-mono text-primary">COLLECTOR.md</code> for a ready-made
            Python collector using scapy/ping.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
