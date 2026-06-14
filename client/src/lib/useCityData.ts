import { useEffect, useRef, useState } from "react";
import type { CityNode, FlowSpec, CityEngine } from "@/lib/cityEngine";
import { DEMO_NODES, DEMO_FLOWS } from "@shared/demoData";
import type { Protocol } from "@/lib/cityConfig";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function normalizeNodes(raw: any[]): CityNode[] {
  // auto-layout any node missing grid coords
  let i = 0;
  return raw.map((n) => {
    const gx = n.gridX ?? n.grid_x ?? (2 + (i % 4) * 2);
    const gy = n.gridY ?? n.grid_y ?? (1 + Math.floor(i / 4) * 2);
    i++;
    return {
      id: n.id,
      name: n.name,
      ip: n.ip,
      mac: n.mac,
      kind: n.kind,
      gridX: gx,
      gridY: gy,
    } as CityNode;
  });
}

/**
 * Loads the city topology. Tries the backend (real or seeded), falls back to
 * the bundled demo dataset so the app always renders. Also opens an SSE
 * connection so a real local collector POSTing to /api/traffic shows up live.
 */
export function useCityData(engineRef: React.MutableRefObject<CityEngine | null>) {
  const [nodes, setNodes] = useState<CityNode[]>(() => normalizeNodes(DEMO_NODES as any));
  const [flows] = useState<FlowSpec[]>(() => DEMO_FLOWS as unknown as FlowSpec[]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [usingRealData, setUsingRealData] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/nodes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || data.length === 0) return;
        setNodes(normalizeNodes(data));
      })
      .catch(() => {});

    // open SSE for real events
    try {
      const es = new EventSource(`${API_BASE}/api/stream`);
      esRef.current = es;
      es.onopen = () => setLiveConnected(true);
      es.onerror = () => setLiveConnected(false);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "traffic" && msg.event) {
            setUsingRealData(true);
            engineRef.current?.injectEvent({
              srcId: msg.event.srcId ?? msg.event.src_id,
              dstId: msg.event.dstId ?? msg.event.dst_id,
              protocol: msg.event.protocol as Protocol,
              bytes: msg.event.bytes ?? 0,
              latencyMs: msg.event.latencyMs ?? msg.event.latency_ms,
              info: msg.event.info,
            });
          } else if (msg.type === "traffic-batch" && Array.isArray(msg.events)) {
            setUsingRealData(true);
            for (const e of msg.events) {
              engineRef.current?.injectEvent({
                srcId: e.srcId ?? e.src_id,
                dstId: e.dstId ?? e.dst_id,
                protocol: e.protocol as Protocol,
                bytes: e.bytes ?? 0,
                latencyMs: e.latencyMs ?? e.latency_ms,
                info: e.info,
              });
            }
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* SSE unsupported */
    }

    return () => {
      cancelled = true;
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { nodes, flows, liveConnected, usingRealData };
}
