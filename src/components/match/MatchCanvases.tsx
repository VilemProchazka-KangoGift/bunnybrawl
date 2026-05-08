import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../engine/constants';

/** Pure canvas mount: bg + bg-night + fg + fg-night-tint + hud. Refs are
 *  forwarded to the parent, which subscribes to them in the lifecycle hooks
 *  (useLocalMatch / useOnlineMatch) at first effect. */
export interface MatchCanvasesProps {
  bgRef: React.Ref<HTMLCanvasElement>;
  bgNightRef: React.Ref<HTMLCanvasElement>;
  fgRef: React.Ref<HTMLCanvasElement>;
  fgNightTintRef: React.Ref<HTMLDivElement>;
  hudRef: React.Ref<HTMLCanvasElement>;
}

export function MatchCanvases(p: MatchCanvasesProps) {
  return (
    <>
      <canvas
        ref={p.bgRef}
        className="game-canvas bg-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
      />
      <canvas
        ref={p.bgNightRef}
        className="game-canvas bg-night-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
      />
      <canvas
        ref={p.fgRef}
        className="game-canvas fg-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        data-testid="game-canvas"
      />
      <div
        ref={p.fgNightTintRef}
        className="fg-night-tint"
        aria-hidden="true"
      />
      <canvas
        ref={p.hudRef}
        className="game-canvas hud-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
      />
    </>
  );
}
