import { describe, it, expect, beforeEach } from 'vitest';
import { Lighting } from '../orchestrator';
import { initLighting } from '../index';

describe('Lighting orchestrator', () => {
  beforeEach(() => {
    initLighting('?lighting=on');
  });

  it('exposes both ambient and emitter pipelines', () => {
    const l = new Lighting(1280, 720);
    expect(l.ambient).toBeDefined();
    expect(l.emitters).toBeDefined();
  });

  it('isEnabled() reflects the lighting kill switch', () => {
    initLighting('?lighting=on');
    const l = new Lighting(1280, 720);
    expect(l.isEnabled()).toBe(true);
    initLighting('?lighting=off');
    expect(l.isEnabled()).toBe(false);
  });

  it('resize forwards to ambient pipeline', () => {
    const l = new Lighting(1280, 720);
    expect(() => l.resize(800, 600, 1.0)).not.toThrow();
  });
});
