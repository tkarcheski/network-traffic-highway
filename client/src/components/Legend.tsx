import { VEHICLES, PROTO_ORDER, NODE_KINDS, type Protocol } from "@/lib/cityConfig";

interface Props {
  enabled: Record<Protocol, boolean>;
  counts: Record<string, number>;
  onToggle: (p: Protocol) => void;
}

function VehicleGlyph({
  color,
  isTrain,
  isLlama,
}: {
  color: string;
  isTrain?: boolean;
  isLlama?: boolean;
}) {
  if (isLlama) {
    return (
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
        {/* legs */}
        <rect x="8" y="10" width="1.5" height="3" fill={color} />
        <rect x="11" y="10" width="1.5" height="3" fill={color} />
        <rect x="13.5" y="10" width="1.5" height="3" fill={color} />
        <rect x="16" y="10" width="1.5" height="3" fill={color} />
        {/* body */}
        <ellipse cx="13" cy="8.5" rx="6" ry="3" fill={color} />
        {/* neck + head */}
        <rect x="5" y="3" width="2.2" height="6" rx="1.1" fill={color} />
        <ellipse cx="5.2" cy="3" rx="2" ry="1.6" fill={color} />
        {/* ears */}
        <path d="M4 1.8 L3.6 0.4 L5 1.8 Z" fill={color} />
        <path d="M6 1.7 L6.4 0.3 L6.9 1.7 Z" fill={color} />
        {/* eye */}
        <circle cx="4.5" cy="3" r="0.5" fill="#1a1208" />
      </svg>
    );
  }
  if (isTrain) {
    return (
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
        <rect x="1" y="4" width="6" height="6" rx="1" fill="#c0392b" />
        <rect x="8" y="4" width="6" height="6" rx="1" fill={color} />
        <rect x="15" y="4" width="6" height="6" rx="1" fill={color} />
        <circle cx="3" cy="11" r="1.4" fill="#222" />
        <circle cx="11" cy="11" r="1.4" fill="#222" />
        <circle cx="18" cy="11" r="1.4" fill="#222" />
      </svg>
    );
  }
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
      <rect x="3" y="4" width="16" height="7" rx="2" fill={color} />
      <rect x="7" y="5" width="8" height="3" rx="1" fill="rgba(255,255,255,0.5)" />
      <circle cx="7" cy="12" r="1.6" fill="#222" />
      <circle cx="15" cy="12" r="1.6" fill="#222" />
    </svg>
  );
}

export function Legend({ enabled, counts, onToggle }: Props) {
  return (
    <div className="sc-bevel rounded-md p-3" data-testid="panel-legend">
      <div className="sc-label mb-2 flex items-center gap-2 text-primary">
        <span className="font-pixel text-[10px]">TRAFFIC LEGEND</span>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Each protocol drives a different vehicle. Click to filter.
      </p>
      <ul className="space-y-1">
        {PROTO_ORDER.map((p) => {
          const v = VEHICLES[p];
          const on = enabled[p];
          return (
            <li key={p}>
              <button
                data-testid={`toggle-proto-${p}`}
                onClick={() => onToggle(p)}
                className={`hover-elevate active-elevate-2 flex w-full items-center gap-2 rounded border px-2 py-1 text-left transition-opacity ${
                  on ? "border-card-border opacity-100" : "border-transparent opacity-40"
                }`}
              >
                <span className="flex h-4 w-6 items-center justify-center">
                  <VehicleGlyph
                    color={v.color}
                    isTrain={p === "train"}
                    isLlama={p === "ollama"}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {v.vehicle}
                  </span>
                  <span className="font-pixel text-[8px] uppercase tracking-wide text-muted-foreground">
                    {p}
                  </span>
                </span>
                <span className="font-readout text-base text-primary tabular-nums">
                  {counts[p] || 0}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sc-label mb-1 mt-3 font-pixel text-[10px] text-primary">
        DISTRICTS
      </div>
      <ul className="grid grid-cols-2 gap-1">
        {Object.values(NODE_KINDS).map((k) => (
          <li key={k.kind} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-black/30"
              style={{ background: k.roof }}
            />
            <span className="truncate text-[10px] text-muted-foreground">
              {k.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
