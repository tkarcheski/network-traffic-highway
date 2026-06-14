import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Play, Pause, ZoomIn, ZoomOut, Crosshair, RotateCcw } from "lucide-react";

interface Props {
  paused: boolean;
  speed: number;
  intensity: number;
  onPauseToggle: () => void;
  onSpeed: (v: number) => void;
  onIntensity: (v: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

export function Controls(p: Props) {
  return (
    <div className="sc-bevel rounded-md p-3" data-testid="panel-controls">
      <div className="sc-label mb-2 font-pixel text-[10px] text-primary">
        SIMULATION CONTROL
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          variant={p.paused ? "default" : "secondary"}
          onClick={p.onPauseToggle}
          data-testid="button-pause"
          className="flex-1 gap-1.5"
        >
          {p.paused ? <Play size={15} /> : <Pause size={15} />}
          {p.paused ? "Resume" : "Pause"}
        </Button>
        <Button size="icon" variant="secondary" onClick={p.onZoomIn} data-testid="button-zoom-in" aria-label="Zoom in">
          <ZoomIn size={15} />
        </Button>
        <Button size="icon" variant="secondary" onClick={p.onZoomOut} data-testid="button-zoom-out" aria-label="Zoom out">
          <ZoomOut size={15} />
        </Button>
        <Button size="icon" variant="secondary" onClick={p.onRecenter} data-testid="button-recenter" aria-label="Recenter">
          <Crosshair size={15} />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="sc-label">Speed</span>
            <span className="font-readout text-sm text-primary tabular-nums">
              {p.speed.toFixed(1)}x
            </span>
          </div>
          <Slider
            value={[p.speed]}
            min={0.2}
            max={3}
            step={0.1}
            onValueChange={(v) => p.onSpeed(v[0])}
            data-testid="slider-speed"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="sc-label">Traffic Intensity</span>
            <span className="font-readout text-sm text-primary tabular-nums">
              {Math.round(p.intensity * 100)}%
            </span>
          </div>
          <Slider
            value={[p.intensity]}
            min={0.2}
            max={3}
            step={0.1}
            onValueChange={(v) => p.onIntensity(v[0])}
            data-testid="slider-intensity"
          />
        </div>
      </div>
    </div>
  );
}
