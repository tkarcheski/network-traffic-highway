import type { EngineStats } from "@/lib/cityEngine";
import { fmtBytes } from "@/lib/cityConfig";
import { Activity, Building2, Radio, Train } from "lucide-react";

function Gauge({
  label,
  value,
  sub,
  tone = "led",
  testid,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "led" | "led-amber" | "led-red";
  testid: string;
  icon: React.ReactNode;
}) {
  const ledClass =
    tone === "led-red" ? "sc-led sc-led-red" : tone === "led-amber" ? "sc-led sc-led-amber" : "sc-led";
  return (
    <div className="sc-bevel flex min-w-[120px] flex-1 items-center gap-2.5 rounded-md px-3 py-2" data-testid={testid}>
      <div className="text-primary/70">{icon}</div>
      <div className="flex flex-col">
        <span className="sc-label">{label}</span>
        <span className="sc-inset mt-0.5 inline-flex items-baseline gap-1 rounded px-1.5 py-0.5">
          <span className={`${ledClass} text-xl`} data-testid={`${testid}-value`}>
            {value}
          </span>
          {sub && <span className="font-readout text-xs text-muted-foreground">{sub}</span>}
        </span>
      </div>
    </div>
  );
}

export function MetricsBar({ stats }: { stats: EngineStats }) {
  const mbps = (stats.bps * 8) / 1_000_000;
  const pingTone = stats.avgPingMs > 120 ? "led-red" : stats.avgPingMs > 60 ? "led-amber" : "led";
  return (
    <div className="flex flex-wrap gap-2" data-testid="bar-metrics">
      <Gauge
        label="Bandwidth"
        value={mbps >= 1 ? mbps.toFixed(1) : (mbps * 1000).toFixed(0)}
        sub={mbps >= 1 ? "Mbps" : "Kbps"}
        testid="metric-bandwidth"
        icon={<Activity size={18} />}
      />
      <Gauge
        label="Active Nodes"
        value={String(stats.activeNodes)}
        testid="metric-nodes"
        icon={<Building2 size={18} />}
      />
      <Gauge
        label="Ping Latency"
        value={stats.avgPingMs > 0 ? stats.avgPingMs.toFixed(0) : "--"}
        sub="ms"
        tone={pingTone as any}
        testid="metric-ping"
        icon={<Radio size={18} />}
      />
      <Gauge
        label="Train Cargo"
        value={fmtBytes(stats.trainBytes).split(" ")[0]}
        sub={fmtBytes(stats.trainBytes).split(" ")[1]}
        tone="led-amber"
        testid="metric-train"
        icon={<Train size={18} />}
      />
      <Gauge
        label="Vehicles"
        value={String(stats.activeVehicles)}
        testid="metric-vehicles"
        icon={<Activity size={18} />}
      />
    </div>
  );
}
