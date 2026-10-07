import type { Arena } from '../types';
import type { ArenaNav, NavEdge } from '../arenas/types';
import { getArenaNav } from '../arenas/registry';
import { normalizeCharacterScale } from '../characterScale';
import {
  canDropTo,
  canGeyserTo,
  canJumpTo,
  canWalkTo,
  canZeroGTo,
  computeEdgeDanger,
} from './reachability';

interface BuildEdge {
  t: number;
  y: NavEdge['y'];
  x: number;
  danger: number;
}

const scaledNavCache = new WeakMap<Arena, Map<number, ArenaNav>>();

/**
 * Scale 1 deliberately uses the shipped graph, preserving existing bot routes.
 * Larger characters need different jump arcs and landing widths, so their graph
 * is derived from arena geometry once per arena/scale and then reused.
 */
export function getArenaNavForScale(arena: Arena, characterScale = 1): ArenaNav | undefined {
  const scale = normalizeCharacterScale(characterScale);
  if (scale === 1) return getArenaNav(arena.id);
  if (!getArenaNav(arena.id)) return undefined;

  let byScale = scaledNavCache.get(arena);
  if (!byScale) {
    byScale = new Map<number, ArenaNav>();
    scaledNavCache.set(arena, byScale);
  }
  let nav = byScale.get(scale);
  if (!nav) {
    nav = buildScaledArenaNav(arena, scale);
    byScale.set(scale, nav);
  }
  return nav;
}

/** Build the same edge and all-pairs tables as generateNavData, for one body scale. */
export function buildScaledArenaNav(arena: Arena, characterScale: number): ArenaNav {
  const scale = normalizeCharacterScale(characterScale);
  const platforms = arena.platforms;
  const count = platforms.length;
  const edges: BuildEdge[][] = Array.from({ length: count }, () => []);
  const hazards = arena.hazardZones ?? [];

  const addEdge = (fromIdx: number, toIdx: number, type: NavEdge['y'], x: number, dangerType: 'jump' | 'drop' | 'walk' | 'geyser') => {
    edges[fromIdx].push({
      t: toIdx,
      y: type,
      x: Math.round(x),
      danger: computeEdgeDanger(platforms[fromIdx], platforms[toIdx], dangerType, hazards),
    });
  };

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const from = platforms[i];
      const to = platforms[j];
      if (canWalkTo(from, to, scale)) {
        addEdge(i, j, 'w', Math.round(from.x + from.width / 2), 'walk');
        continue;
      }
      const jump = canJumpTo(from, to, scale);
      if (jump.reachable) addEdge(i, j, 'j', jump.approachX, 'jump');
      const drop = canDropTo(from, to, scale);
      if (drop.reachable && !jump.reachable) addEdge(i, j, 'd', drop.approachX, 'drop');
    }
  }

  for (const zone of arena.effectZones ?? []) {
    if (zone.type === 'geyser') {
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) {
          if (i === j || platforms[j].y >= platforms[i].y) continue;
          if (edges[i].some(edge => edge.t === j && edge.y === 'j')) continue;
          const result = canGeyserTo(platforms[i], zone, platforms[j], scale);
          if (result.reachable) addEdge(i, j, 'g', result.approachX, 'geyser');
        }
      }
    } else if (zone.type === 'zero_g') {
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) {
          if (i === j) continue;
          if (edges[i].some(edge => edge.t === j && (edge.y === 'j' || edge.y === 'w'))) continue;
          const result = canZeroGTo(platforms[i], zone, platforms[j], scale);
          if (result.reachable) addEdge(i, j, 'z', result.approachX, 'jump');
        }
      }
    }
  }

  return {
    edges,
    nextHop: allPairsNextHop(edges, false),
    safeHop: allPairsNextHop(edges, true),
  };
}

function allPairsNextHop(edges: BuildEdge[][], preferSafe: boolean): number[][] {
  const count = edges.length;
  const distance = Array.from({ length: count }, () => new Array<number>(count).fill(Infinity));
  const nextHop = Array.from({ length: count }, () => new Array<number>(count).fill(-2));
  for (let i = 0; i < count; i++) {
    distance[i][i] = 0;
    nextHop[i][i] = -1;
    for (const edge of edges[i]) {
      const base = edge.y === 'w' ? 1 : edge.y === 'd' ? 2 : edge.y === 'j' ? 3 : 4;
      const cost = base + (preferSafe ? edge.danger * 10 : 0);
      if (cost < distance[i][edge.t]) {
        distance[i][edge.t] = cost;
        nextHop[i][edge.t] = edge.t;
      }
    }
  }
  for (let k = 0; k < count; k++) {
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(distance[i][k])) continue;
      for (let j = 0; j < count; j++) {
        const through = distance[i][k] + distance[k][j];
        if (through < distance[i][j]) {
          distance[i][j] = through;
          nextHop[i][j] = nextHop[i][k];
        }
      }
    }
  }
  return nextHop;
}
