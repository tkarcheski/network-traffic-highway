import type { Alert } from "@/lib/cityEngine";
import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

export function AlertPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="sc-bevel flex min-h-0 flex-1 flex-col rounded-md p-3" data-testid="panel-alerts">
      <div className="sc-label mb-2 flex items-center justify-between font-pixel text-[10px] text-primary">
        <span>CITY ALERTS</span>
        {alerts.length > 0 && (
          <span className="sc-led-amber font-readout text-sm sc-blink">{alerts.length}</span>
        )}
      </div>

      <div className="-mr-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="text-primary/60" size={22} />
            <p className="text-[11px] text-muted-foreground">
              All districts nominal.
              <br />
              No congestion or latency spikes.
            </p>
          </div>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            data-testid={`alert-${a.id}`}
            className={`sc-inset flex items-start gap-2 rounded px-2 py-1.5 ${
              a.severity === "crit" ? "ring-1 ring-destructive/60" : ""
            }`}
          >
            <span className={a.severity === "crit" ? "text-destructive" : "text-accent"}>
              {a.severity === "crit" ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-foreground">
                  {a.title}
                </span>
                <span className="font-readout text-xs text-muted-foreground">{timeAgo(a.ts)}</span>
              </div>
              <p className="truncate text-[10px] text-muted-foreground">{a.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
