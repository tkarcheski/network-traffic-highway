import type { CityNode, ActiveVehicle } from "@/lib/cityEngine";
import { VEHICLES, NODE_KINDS, fmtBytes } from "@/lib/cityConfig";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type Selection =
  | { type: "node"; data: CityNode }
  | { type: "vehicle"; data: ActiveVehicle }
  | null;

interface Props {
  selection: Selection;
  nodes: CityNode[];
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-card-border/60 py-1 last:border-0">
      <span className="sc-label">{label}</span>
      <span className="font-mono text-[11px] text-foreground" data-testid={`detail-${label.toLowerCase().replace(/\s/g, "-")}`}>
        {value}
      </span>
    </div>
  );
}

export function DetailPanel({ selection, nodes, onClose }: Props) {
  if (!selection) return null;

  if (selection.type === "node") {
    const n = selection.data;
    const spec = NODE_KINDS[n.kind];
    return (
      <div className="sc-bevel rounded-md" data-testid="panel-detail-node">
        <div className="sc-titlebar flex items-center justify-between rounded-t px-2 py-1">
          <span className="font-pixel text-[10px]">DISTRICT INSPECTOR</span>
          <button onClick={onClose} data-testid="button-close-detail" aria-label="Close" className="hover-elevate rounded p-0.5">
            <X size={13} />
          </button>
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-5 w-5 rounded-sm border border-black/40"
              style={{ background: spec.roof }}
            />
            <div>
              <div className="text-sm font-bold text-foreground">{n.name}</div>
              <div className="font-pixel text-[9px] uppercase text-primary">{spec.district}</div>
            </div>
          </div>
          <Row label="Device" value={spec.label} />
          <Row label="IP" value={n.ip} />
          <Row label="MAC" value={n.mac || "—"} />
          <Row label="Tile" value={`${n.gridX}, ${n.gridY}`} />
          <Row label="Node ID" value={n.id} />
        </div>
      </div>
    );
  }

  const v = selection.data;
  const spec = VEHICLES[v.protocol];
  const src = nodes.find((n) => n.id === v.srcId);
  const dst = nodes.find((n) => n.id === v.dstId);
  return (
    <div className="sc-bevel rounded-md" data-testid="panel-detail-vehicle">
      <div className="sc-titlebar flex items-center justify-between rounded-t px-2 py-1">
        <span className="font-pixel text-[10px]">TRAFFIC INSPECTOR</span>
        <button onClick={onClose} data-testid="button-close-detail" aria-label="Close" className="hover-elevate rounded p-0.5">
          <X size={13} />
        </button>
      </div>
      <div className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-5 w-5 rounded-sm border border-black/40" style={{ background: spec.color }} />
          <div>
            <div className="text-sm font-bold text-foreground">{spec.vehicle}</div>
            <div className="font-pixel text-[9px] uppercase text-primary">{v.protocol}</div>
          </div>
        </div>
        <Row label="Route" value={`${src?.name ?? v.srcId} → ${dst?.name ?? v.dstId}`} />
        <Row label="Payload" value={fmtBytes(v.bytes)} />
        {v.latencyMs != null && <Row label="Latency" value={`${v.latencyMs.toFixed(0)} ms`} />}
        {v.isTrain && <Row label="Cars" value={String(v.carCount)} />}
        <Row label="Detail" value={v.info} />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{spec.description}</p>
      </div>
    </div>
  );
}
