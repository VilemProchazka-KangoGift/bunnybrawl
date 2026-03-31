// Shared drawing primitives extracted from renderer.ts
// These are pure functions that take a canvas context and draw decorations.
// Used by theme configs (meadow, winterLake, etc.) in their draw functions.

// ---- Background primitives ----

export interface TreeColors {
  trunk: string;
  bark: string;
  foliage: Array<{ color: string; yOff: number; rx: number; ry: number }>;
}

const DEFAULT_TREE_COLORS: TreeColors = {
  trunk: '#6B4226',
  bark: '#553318',
  foliage: [
    { color: '#2D8B2D', yOff: 0.4, rx: 0.55, ry: 0.3 },
    { color: '#3AA03A', yOff: 0.6, rx: 0.45, ry: 0.28 },
    { color: '#4AB84A', yOff: 0.8, rx: 0.32, ry: 0.22 },
  ],
};

export function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  size: number,
  colors: TreeColors = DEFAULT_TREE_COLORS,
): void {
  const trunkW = size * 0.2;
  const trunkH = size * 0.8;

  // Trunk
  ctx.fillStyle = colors.trunk;
  ctx.fillRect(x - trunkW / 2, groundY - trunkH, trunkW, trunkH);
  // Bark lines
  ctx.strokeStyle = colors.bark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, groundY - trunkH * 0.3);
  ctx.lineTo(x - 1, groundY - trunkH * 0.6);
  ctx.stroke();

  // Foliage layers (bottom to top)
  for (const l of colors.foliage) {
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.ellipse(x, groundY - trunkH * l.yOff - size * 0.2, size * l.rx, size * l.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface BushColors {
  base: string;
  highlight: string;
  dark: string;
}

const DEFAULT_BUSH_COLORS: BushColors = {
  base: '#3A8C3A',
  highlight: '#4CA64C',
  dark: '#2D6B2D',
};

export function drawBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  size: number,
  colors: BushColors = DEFAULT_BUSH_COLORS,
): void {
  ctx.fillStyle = colors.base;
  ctx.beginPath();
  ctx.ellipse(x, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.highlight;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.15, groundY - size * 0.55, size * 0.35, size * 0.25, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.1, groundY - size * 0.2, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFlower(ctx: CanvasRenderingContext2D, x: number, groundY: number, color: string): void {
  ctx.strokeStyle = '#3A7A3A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, groundY - 12);
  ctx.stroke();

  ctx.fillStyle = color;
  const petalR = 3;
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 3, groundY - 14 + Math.sin(angle) * 3, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE04A';
  ctx.beginPath();
  ctx.arc(x, groundY - 14, 2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMushroom(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
  ctx.fillStyle = '#F5F0E0';
  ctx.fillRect(x - 3, groundY - 10, 6, 10);
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 10, 8, 6, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x - 3, groundY - 13, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 3, groundY - 12, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGrassTuft(ctx: CanvasRenderingContext2D, x: number, groundY: number, color = '#5DAF4A'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 3, groundY);
    ctx.lineTo(x + i * 5, groundY - 6 - Math.random() * 3);
    ctx.stroke();
  }
}

export function drawHill(ctx: CanvasRenderingContext2D, x: number, baseY: number, width: number, height: number): void {
  ctx.beginPath();
  ctx.moveTo(x, baseY + 60);
  ctx.quadraticCurveTo(x + width / 2, baseY - height, x + width, baseY + 60);
  ctx.fill();
}

export function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color = 'rgba(255, 255, 255, 0.7)'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
  ctx.arc(x + size * 0.35, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlatformMoss(ctx: CanvasRenderingContext2D, edgeX: number, platY: number, platH: number): void {
  ctx.fillStyle = '#3A7A3A';
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 4;
    const hang = 5 + i * 2;
    ctx.beginPath();
    ctx.ellipse(edgeX + ox, platY + platH + hang * 0.5, 3, hang * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2D6B2D';
  ctx.beginPath();
  ctx.ellipse(edgeX, platY + platH + 2, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Foreground primitives ----

export interface FgBushColors {
  backLayer: string;
  mainBody: string;
  leftLobe: string;
  rightLobe: string;
  highlight: string;
  highlight2: string;
  berries: string[];
}

const DEFAULT_FG_BUSH_COLORS: FgBushColors = {
  backLayer: '#1E5C1E',
  mainBody: '#2B7A2B',
  leftLobe: '#338A33',
  rightLobe: '#2E8030',
  highlight: '#3DA63D',
  highlight2: '#3DA63D',
  berries: ['#CC3333', '#DD4444', '#BB2222'],
};

export function drawFgBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  size: number,
  colors: FgBushColors = DEFAULT_FG_BUSH_COLORS,
): void {
  ctx.fillStyle = colors.backLayer;
  ctx.beginPath();
  ctx.ellipse(x, groundY - size * 0.35, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.mainBody;
  ctx.beginPath();
  ctx.ellipse(x + 2, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.leftLobe;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.3, groundY - size * 0.3, size * 0.35, size * 0.32, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.rightLobe;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, groundY - size * 0.35, size * 0.33, size * 0.3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.highlight;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.1, groundY - size * 0.55, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.highlight2;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.2, groundY - size * 0.5, size * 0.12, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors.berries[i % colors.berries.length];
    ctx.beginPath();
    ctx.arc(
      x + (i - 1) * size * 0.2 + (i * 3 % 5),
      groundY - size * 0.25 - (i * 7 % 6),
      2.5, 0, Math.PI * 2,
    );
    ctx.fill();
  }
}

export function drawTallGrass(ctx: CanvasRenderingContext2D, x: number, groundY: number, bladeCount: number, darkColor = '#2D7A2D', lightColor = '#3A8A3A'): void {
  for (let i = 0; i < bladeCount; i++) {
    const bx = x + (i - bladeCount / 2) * 6;
    const height = 14 + (i * 7 % 10);
    const lean = (i % 3 - 1) * 4;

    ctx.strokeStyle = i % 2 === 0 ? darkColor : lightColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx, groundY);
    ctx.quadraticCurveTo(bx + lean * 0.5, groundY - height * 0.6, bx + lean, groundY - height);
    ctx.stroke();

    if (i % 3 === 0) {
      ctx.strokeStyle = '#4CA64C';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 1, groundY);
      ctx.quadraticCurveTo(bx + lean * 0.5 + 1, groundY - height * 0.6, bx + lean + 1, groundY - height);
      ctx.stroke();
    }
  }
}

export function drawFern(ctx: CanvasRenderingContext2D, x: number, groundY: number, color = '#2D6B2D'): void {
  const height = 22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.quadraticCurveTo(x + 2, groundY - height * 0.5, x + 4, groundY - height);
  ctx.stroke();

  const frondCount = 4;
  for (let i = 0; i < frondCount; i++) {
    const fy = groundY - 5 - i * 4;
    const fLen = 10 - i * 1.5;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = i < 2 ? '#2B7A2B' : '#3A9A3A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 1, fy);
      ctx.quadraticCurveTo(x + side * fLen * 0.7, fy - 3, x + side * fLen, fy - 1);
      ctx.stroke();
    }
  }
}

export function drawHangingVine(ctx: CanvasRenderingContext2D, x: number, topY: number, length: number): void {
  ctx.strokeStyle = '#3A7A3A';
  ctx.lineWidth = 1.5;
  const sway = Math.sin(x * 0.1) * 4;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.quadraticCurveTo(x + sway, topY + length * 0.6, x + sway * 0.5, topY + length);
  ctx.stroke();

  ctx.fillStyle = '#3D8B3D';
  for (let i = 0; i < 3; i++) {
    const ly = topY + (i + 1) * length * 0.25;
    const lx = x + sway * (i + 1) / 4;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.ellipse(lx + side * 4, ly, 4, 2.5, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFgLeafCluster(ctx: CanvasRenderingContext2D, x: number, platY: number, colors = ['#2E7A2E', '#3A8C3A', '#4A9C4A']): void {
  ctx.fillStyle = colors[0];
  ctx.beginPath();
  ctx.ellipse(x - 6, platY - 4, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[1];
  ctx.beginPath();
  ctx.ellipse(x + 6, platY - 5, 7, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[2];
  ctx.beginPath();
  ctx.ellipse(x, platY - 7, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFgWildflower(ctx: CanvasRenderingContext2D, x: number, groundY: number, color: string, height: number): void {
  ctx.strokeStyle = '#2D6B2D';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x + 1, groundY - height);
  ctx.stroke();

  ctx.fillStyle = '#3A8A3A';
  ctx.beginPath();
  ctx.ellipse(x + 5, groundY - height * 0.5, 5, 2.5, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  const petalR = 4;
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + 1 + Math.cos(angle) * 4, groundY - height - 1 + Math.sin(angle) * 4, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE04A';
  ctx.beginPath();
  ctx.arc(x + 1, groundY - height - 1, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Winter primitives ----

export function drawPineTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number, snowCover = false): void {
  const trunkW = size * 0.15;
  const trunkH = size * 0.3;

  // Trunk
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(x - trunkW / 2, groundY - trunkH, trunkW, trunkH);

  // Triangle layers (3 tiers, bottom to top)
  const tiers = [
    { yBase: groundY - trunkH, width: size * 0.7, height: size * 0.4 },
    { yBase: groundY - trunkH - size * 0.25, width: size * 0.55, height: size * 0.35 },
    { yBase: groundY - trunkH - size * 0.45, width: size * 0.38, height: size * 0.32 },
  ];

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    // Dark green triangle
    ctx.fillStyle = t === 0 ? '#1B5E2A' : t === 1 ? '#237A38' : '#2D9044';
    ctx.beginPath();
    ctx.moveTo(x, tier.yBase - tier.height);
    ctx.lineTo(x - tier.width / 2, tier.yBase);
    ctx.lineTo(x + tier.width / 2, tier.yBase);
    ctx.closePath();
    ctx.fill();

    // Snow on top edge
    if (snowCover) {
      ctx.fillStyle = 'rgba(230, 240, 250, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x, tier.yBase - tier.height);
      ctx.lineTo(x - tier.width * 0.35, tier.yBase - tier.height * 0.4);
      ctx.lineTo(x + tier.width * 0.35, tier.yBase - tier.height * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawSnowDrift(ctx: CanvasRenderingContext2D, x: number, groundY: number, width: number, height: number): void {
  ctx.fillStyle = 'rgba(230, 240, 250, 0.7)';
  ctx.beginPath();
  ctx.ellipse(x, groundY - height * 0.3, width / 2, height * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bright highlight
  ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x + width * 0.1, groundY - height * 0.45, width * 0.3, height * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawIcePatch(ctx: CanvasRenderingContext2D, x: number, groundY: number, width: number): void {
  // Semi-transparent ice surface
  ctx.fillStyle = 'rgba(180, 210, 240, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, groundY - 1, width / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shine
  ctx.fillStyle = 'rgba(220, 240, 255, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x + width * 0.35, groundY - 2, width * 0.2, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawIcicle(ctx: CanvasRenderingContext2D, x: number, topY: number, length: number): void {
  // Main icicle triangle
  ctx.fillStyle = 'rgba(180, 215, 240, 0.7)';
  ctx.beginPath();
  ctx.moveTo(x - 2, topY);
  ctx.lineTo(x + 2, topY);
  ctx.lineTo(x, topY + length);
  ctx.closePath();
  ctx.fill();
  // Shine line
  ctx.fillStyle = 'rgba(220, 240, 255, 0.6)';
  ctx.beginPath();
  ctx.moveTo(x - 0.5, topY);
  ctx.lineTo(x + 0.5, topY);
  ctx.lineTo(x, topY + length * 0.7);
  ctx.closePath();
  ctx.fill();
}

/** Big snowman — purely decorative (drawn behind platforms). For the large
 *  jumpable snowman, a platform is placed at the head and this draws the body. */
export function drawBigSnowman(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
  const bottomR = size * 0.42;
  const midR = size * 0.32;
  const headR = size * 0.22;
  const midY = groundY - bottomR * 1.7;
  const headY = midY - midR * 1.5;

  // Bottom ball
  ctx.fillStyle = '#E8EEF4';
  ctx.beginPath();
  ctx.arc(x, groundY - bottomR, bottomR, 0, Math.PI * 2);
  ctx.fill();
  // Bottom highlight
  ctx.fillStyle = '#F4F8FC';
  ctx.beginPath();
  ctx.arc(x - bottomR * 0.2, groundY - bottomR * 1.1, bottomR * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Middle ball
  ctx.fillStyle = '#ECF0F6';
  ctx.beginPath();
  ctx.arc(x, midY, midR, 0, Math.PI * 2);
  ctx.fill();
  // Mid highlight
  ctx.fillStyle = '#F6F9FC';
  ctx.beginPath();
  ctx.arc(x - midR * 0.25, midY - midR * 0.2, midR * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#F0F5FA';
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(x - headR * 0.35, headY - headR * 0.15, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + headR * 0.35, headY - headR * 0.15, 3, 0, Math.PI * 2);
  ctx.fill();

  // Carrot nose
  ctx.fillStyle = '#E88030';
  ctx.beginPath();
  ctx.moveTo(x, headY + headR * 0.05);
  ctx.lineTo(x + headR * 0.8, headY + headR * 0.15);
  ctx.lineTo(x, headY + headR * 0.3);
  ctx.closePath();
  ctx.fill();

  // Stick arms
  ctx.strokeStyle = '#6B4226';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - midR, midY);
  ctx.lineTo(x - midR - size * 0.3, midY - size * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + midR, midY);
  ctx.lineTo(x + midR + size * 0.3, midY - size * 0.1);
  ctx.stroke();

  // Buttons
  ctx.fillStyle = '#222';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x, midY + midR * 0.3 - i * midR * 0.35, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top hat
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(x - headR * 0.6, headY - headR * 1.3, headR * 1.2, headR * 0.8);
  ctx.fillRect(x - headR * 0.85, headY - headR * 0.55, headR * 1.7, headR * 0.15);
}

/** Igloo — decorative dome drawn behind platforms. A platform at the top
 *  makes it jumpable. */
export function drawIgloo(ctx: CanvasRenderingContext2D, x: number, groundY: number, width: number, height: number): void {
  // Snow dome
  ctx.fillStyle = '#E0E8F0';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, groundY, width / 2, height, 0, Math.PI, 0);
  ctx.fill();

  // Ice block lines (horizontal)
  ctx.strokeStyle = 'rgba(180, 200, 220, 0.5)';
  ctx.lineWidth = 1;
  for (let row = 1; row <= 3; row++) {
    const rowY = groundY - height * (row / 4);
    const rowWidth = width * Math.sqrt(1 - (row / 4) ** 2);
    ctx.beginPath();
    ctx.moveTo(x + width / 2 - rowWidth / 2, rowY);
    ctx.lineTo(x + width / 2 + rowWidth / 2, rowY);
    ctx.stroke();
  }

  // Ice block lines (vertical-ish, staggered)
  for (let row = 0; row < 4; row++) {
    const rowY = groundY - height * (row / 4);
    const nextY = groundY - height * ((row + 1) / 4);
    const rowWidth = width * Math.sqrt(1 - (row / 4) ** 2);
    const blocks = 3 + row;
    for (let b = 1; b < blocks; b++) {
      const bx = x + width / 2 - rowWidth / 2 + (rowWidth / blocks) * b;
      ctx.beginPath();
      ctx.moveTo(bx, rowY);
      ctx.lineTo(bx, nextY);
      ctx.stroke();
    }
  }

  // Entrance (dark arch)
  const doorW = width * 0.25;
  const doorH = height * 0.45;
  ctx.fillStyle = '#3A5060';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, groundY, doorW / 2, doorH, 0, Math.PI, 0);
  ctx.fill();

  // Snow highlight on top
  ctx.fillStyle = 'rgba(245, 250, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, groundY - height * 0.85, width * 0.2, height * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSnowman(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
  const bodyR = size * 0.35;
  const headR = size * 0.22;

  // Body
  ctx.fillStyle = '#F0F5FA';
  ctx.beginPath();
  ctx.arc(x, groundY - bodyR, bodyR, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(x, groundY - bodyR * 2 - headR * 0.5, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(x - headR * 0.3, groundY - bodyR * 2 - headR * 0.6, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + headR * 0.3, groundY - bodyR * 2 - headR * 0.6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Carrot nose
  ctx.fillStyle = '#E88030';
  ctx.beginPath();
  ctx.moveTo(x, groundY - bodyR * 2 - headR * 0.4);
  ctx.lineTo(x + headR * 0.6, groundY - bodyR * 2 - headR * 0.3);
  ctx.lineTo(x, groundY - bodyR * 2 - headR * 0.2);
  ctx.closePath();
  ctx.fill();

  // Buttons
  ctx.fillStyle = '#333';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x, groundY - bodyR * 0.4 - i * bodyR * 0.35, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
