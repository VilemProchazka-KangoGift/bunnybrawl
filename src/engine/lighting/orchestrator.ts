// src/engine/lighting/orchestrator.ts
//
// Lighting — thin orchestrator holding the L1 ambient pipeline + L2 emitter
// pipeline. Renderer holds one `Lighting` and reaches into `.ambient` /
// `.emitters` for the actual surface. The orchestrator exists to keep
// per-frame timing in one place and to give L4+ pillars a single subscription
// point without renaming the renderer's lighting field.

import { AmbientPipeline } from './pipeline';
import { EmitterPipeline } from './emitter';

export class Lighting {
  readonly ambient: AmbientPipeline;
  readonly emitters: EmitterPipeline;

  constructor(width: number, height: number) {
    this.ambient = new AmbientPipeline(width, height);
    this.emitters = new EmitterPipeline();
  }

  resize(width: number, height: number, scale: number): void {
    this.ambient.resize(width, height, scale);
  }

  isEnabled(): boolean {
    return this.ambient.isEnabled();
  }
}
