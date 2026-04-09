/**
 * Generates static AI navigation data for all arenas.
 * Run with: npx vite-node scripts/generateNavData.ts
 *
 * This precomputes platform-to-platform reachability graphs and
 * all-pairs shortest paths (nextHop + safeHop tables) using Floyd-Warshall.
 * Output is injected into each arena pack file between NAV-DATA markers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerBuiltinArenas } from '../src/engine/arenas/builtin';
import { getArena, listArenaPacks } from '../src/engine/arenas';
import { canJumpTo, canDropTo, canWalkTo, canGeyserTo, canZeroGTo, computeEdgeDanger } from '../src/engine/ai/reachability';
import type { Platform, Arena } from '../src/engine/types';

registerBuiltinArenas();

interface NavEdge {
  targetIdx: number;
  type: 'jump' | 'drop' | 'walk' | 'geyser' | 'zero_g';
  approachX: number;
  danger: number; // 0-1
}

interface ArenaNav {
  edges: NavEdge[][];
  nextHop: number[][];
  safeHop: number[][];
}

function buildGraph(arena: Arena): ArenaNav {
  const platforms = arena.platforms;
  const n = platforms.length;
  const edges: NavEdge[][] = Array.from({ length: n }, () => []);
  const hazardZones = arena.hazardZones ?? [];

  // Compute all pairwise edges
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const from = platforms[i];
      const to = platforms[j];

      // Walk edges (same height, adjacent)
      if (canWalkTo(from, to)) {
        const danger = computeEdgeDanger(from, to, 'walk', hazardZones);
        edges[i].push({ targetIdx: j, type: 'walk', approachX: Math.round(from.x + from.width / 2), danger });
        continue;
      }

      // Jump edges (to is above or at similar height)
      const jumpResult = canJumpTo(from, to);
      if (jumpResult.reachable) {
        const danger = computeEdgeDanger(from, to, 'jump', hazardZones);
        edges[i].push({ targetIdx: j, type: 'jump', approachX: Math.round(jumpResult.approachX), danger });
      }

      // Drop edges (to is below)
      const dropResult = canDropTo(from, to);
      if (dropResult.reachable && !jumpResult.reachable) {
        const danger = computeEdgeDanger(from, to, 'drop', hazardZones);
        edges[i].push({ targetIdx: j, type: 'drop', approachX: Math.round(dropResult.approachX), danger });
      }
    }
  }

  // Geyser edges: from platforms overlapping a geyser zone to platforms reachable via geyser launch
  for (const zone of arena.effectZones ?? []) {
    if (zone.type !== 'geyser') continue;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (platforms[j].y >= platforms[i].y) continue; // geyser only goes up
        // Skip if already reachable by jump (prefer normal jump)
        if (edges[i].some(e => e.targetIdx === j && e.type === 'jump')) continue;
        const result = canGeyserTo(platforms[i], zone, platforms[j]);
        if (result.reachable) {
          const danger = computeEdgeDanger(platforms[i], platforms[j], 'geyser', hazardZones);
          edges[i].push({ targetIdx: j, type: 'geyser', approachX: result.approachX, danger });
        }
      }
    }
  }

  // Zero-G drift edges: jump into zero-G zone and float across to distant platforms
  for (const zone of arena.effectZones ?? []) {
    if (zone.type !== 'zero_g') continue;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        // Skip if already reachable by jump or walk
        if (edges[i].some(e => e.targetIdx === j && (e.type === 'jump' || e.type === 'walk'))) continue;
        const result = canZeroGTo(platforms[i], zone, platforms[j]);
        if (result.reachable) {
          const danger = computeEdgeDanger(platforms[i], platforms[j], 'jump', hazardZones);
          edges[i].push({ targetIdx: j, type: 'zero_g', approachX: result.approachX, danger });
        }
      }
    }
  }

  // Floyd-Warshall — run twice: once for fastest (nextHop), once for safest (safeHop)
  const INF = 999;

  function floydWarshall(costFn: (edge: NavEdge) => number): number[][] {
    const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(INF));
    const hop: number[][] = Array.from({ length: n }, () => new Array(n).fill(-2));

    for (let i = 0; i < n; i++) {
      dist[i][i] = 0;
      hop[i][i] = -1;
    }
    for (let i = 0; i < n; i++) {
      for (const edge of edges[i]) {
        const j = edge.targetIdx;
        const cost = costFn(edge);
        if (cost < dist[i][j]) {
          dist[i][j] = cost;
          hop[i][j] = j;
        }
      }
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (dist[i][k] + dist[k][j] < dist[i][j]) {
            dist[i][j] = dist[i][k] + dist[k][j];
            hop[i][j] = hop[i][k];
          }
        }
      }
    }
    return hop;
  }

  // Fastest path: walk=1, drop=2, jump=3, geyser/zero_g=4
  const nextHop = floydWarshall(e => {
    if (e.type === 'walk') return 1;
    if (e.type === 'drop') return 2;
    if (e.type === 'jump') return 3;
    return 4; // geyser, zero_g
  });

  // Safest path: base cost + heavy danger penalty
  const safeHop = floydWarshall(e => {
    const baseCost = e.type === 'walk' ? 1 : e.type === 'drop' ? 2 : e.type === 'jump' ? 3 : 4;
    return baseCost + e.danger * 10; // danger 1.0 adds 10 to cost — strongly avoids hazards
  });

  return { edges, nextHop, safeHop };
}

/** Convert arena ID (snake_case) to pack filename (camelCase) */
function idToFilename(id: string): string {
  return id.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + '.ts';
}

const MARKER_START = '  // NAV-DATA-START';
const MARKER_END = '  // NAV-DATA-END';
const packsDir = resolve(import.meta.dirname!, '../src/engine/arenas/packs');

// Generate nav data for all arenas
const allArenas = listArenaPacks();
console.log('Generating nav data for', allArenas.length, 'arenas...\n');

for (const { id } of allArenas) {
  const arena = getArena(id);
  const nav = buildGraph(arena);
  const n = arena.platforms.length;

  // Count reachable/unreachable pairs
  let reachable = 0;
  let unreachable = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (nav.nextHop[i][j] >= 0) reachable++;
      else if (nav.nextHop[i][j] === -2) unreachable++;
    }
  }

  const totalEdges = nav.edges.reduce((sum, e) => sum + e.length, 0);
  const dangerousEdges = nav.edges.reduce((sum, es) => sum + es.filter(e => e.danger > 0.1).length, 0);
  const geyserEdges = nav.edges.reduce((sum, es) => sum + es.filter(e => e.type === 'geyser').length, 0);
  const zeroGEdges = nav.edges.reduce((sum, es) => sum + es.filter(e => e.type === 'zero_g').length, 0);
  const diffPairs = nav.nextHop.reduce((sum, row, i) =>
    sum + row.reduce((s, v, j) => s + (v !== nav.safeHop[i][j] ? 1 : 0), 0), 0);

  console.log(`  ${id}: ${n} plats, ${totalEdges} edges (${dangerousEdges} dangerous, ${geyserEdges} geyser, ${zeroGEdges} zero-g), ${reachable} reachable, ${unreachable} unreachable, ${diffPairs} safe≠fast`);

  // Serialize edges — compact format: t=target, y=type, x=approachX, d=danger (only if >0)
  const typeChar = (t: string) => t === 'geyser' ? 'g' : t === 'zero_g' ? 'z' : t[0];
  const edgesStr = nav.edges.map(edgeList => {
    if (edgeList.length === 0) return '[]';
    const items = edgeList.map(e => {
      const d = Math.round(e.danger * 100);
      return d > 0
        ? `{t:${e.targetIdx},y:'${typeChar(e.type)}',x:${e.approachX},d:${d}}`
        : `{t:${e.targetIdx},y:'${typeChar(e.type)}',x:${e.approachX}}`;
    }).join(',');
    return `[${items}]`;
  }).join(',\n      ');

  const nextHopStr = nav.nextHop.map(row => `[${row.join(',')}]`).join(',');
  const safeHopStr = nav.safeHop.map(row => `[${row.join(',')}]`).join(',');

  // Build the nav data block
  const navBlock = [
    MARKER_START + ' — auto-generated, do not hand-edit',
    `  navData: {`,
    `    edges: [`,
    `      ${edgesStr},`,
    `    ],`,
    `    nextHop: [${nextHopStr}],`,
    `    safeHop: [${safeHopStr}],`,
    `  },`,
    MARKER_END,
  ].join('\n');

  // Read the pack file and inject nav data
  const filename = idToFilename(id);
  const packPath = resolve(packsDir, filename);
  let content = readFileSync(packPath, 'utf-8');

  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx >= 0 && endIdx >= 0) {
    // Replace existing nav data between markers
    content = content.substring(0, startIdx) + navBlock + content.substring(endIdx + MARKER_END.length);
  } else {
    // Insert before the closing `};` of the pack export
    const lastBrace = content.lastIndexOf('};');
    if (lastBrace < 0) throw new Error(`Cannot find closing }; in ${packPath}`);
    content = content.substring(0, lastBrace) + navBlock + '\n' + content.substring(lastBrace);
  }

  writeFileSync(packPath, content, 'utf-8');
}

console.log(`\nWrote nav data into ${allArenas.length} pack files in ${packsDir}`);
