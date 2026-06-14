import { useEffect, useRef } from "react";
import {
  CityEngine,
  type CityNode,
  type FlowSpec,
  type ActiveVehicle,
  type EngineStats,
  type Alert,
} from "@/lib/cityEngine";
import type { Protocol } from "@/lib/cityConfig";

interface Props {
  nodes: CityNode[];
  flows: FlowSpec[];
  paused: boolean;
  speed: number;
  intensity: number;
  enabled: Record<Protocol, boolean>;
  selectedNodeId: string | null;
  onReady: (engine: CityEngine) => void;
  onNodeClick: (n: CityNode) => void;
  onVehicleClick: (v: ActiveVehicle) => void;
  onHover: (
    info: { kind: "node" | "vehicle"; data: any } | null,
    x: number,
    y: number
  ) => void;
  onStats: (s: EngineStats) => void;
  onAlert: (a: Alert) => void;
}

export function CityCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CityEngine | null>(null);

  // stable callback refs so the engine always calls latest handlers
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new CityEngine(canvas, {
      onNodeClick: (n) => handlers.current.onNodeClick(n),
      onVehicleClick: (v) => handlers.current.onVehicleClick(v),
      onHover: (i, x, y) => handlers.current.onHover(i, x, y),
      onStats: (s) => handlers.current.onStats(s),
      onAlert: (a) => handlers.current.onAlert(a),
    });
    engineRef.current = engine;
    engine.resize();
    engine.setData(props.nodes, props.flows);
    engine.start();
    handlers.current.onReady(engine);

    const ro = new ResizeObserver(() => {
      engine.resize();
    });
    ro.observe(canvas.parentElement!);

    return () => {
      ro.disconnect();
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push config updates
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.cfg.paused = props.paused;
    e.cfg.speed = props.speed;
    e.cfg.intensity = props.intensity;
    e.cfg.enabled = props.enabled;
    e.selectedNodeId = props.selectedNodeId;
  }, [props.paused, props.speed, props.intensity, props.enabled, props.selectedNodeId]);

  // push data updates
  useEffect(() => {
    engineRef.current?.setData(props.nodes, props.flows);
  }, [props.nodes, props.flows]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-city"
      className="absolute inset-0 h-full w-full touch-none"
      style={{ cursor: "grab" }}
    />
  );
}
