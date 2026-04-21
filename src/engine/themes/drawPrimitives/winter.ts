// Winter primitives — snow, ice, and festive props used by winterLake and similar themes.

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

export function drawChristmasTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
  const trunkW = size * 0.15;
  const trunkH = size * 0.3;

  // Trunk
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(x - trunkW / 2, groundY - trunkH, trunkW, trunkH);

  // Triangle tiers (same as pine tree)
  const tiers = [
    { yBase: groundY - trunkH, width: size * 0.7, height: size * 0.4 },
    { yBase: groundY - trunkH - size * 0.25, width: size * 0.55, height: size * 0.35 },
    { yBase: groundY - trunkH - size * 0.45, width: size * 0.38, height: size * 0.32 },
  ];

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    ctx.fillStyle = t === 0 ? '#1B5E2A' : t === 1 ? '#237A38' : '#2D9044';
    ctx.beginPath();
    ctx.moveTo(x, tier.yBase - tier.height);
    ctx.lineTo(x - tier.width / 2, tier.yBase);
    ctx.lineTo(x + tier.width / 2, tier.yBase);
    ctx.closePath();
    ctx.fill();

    // Snow on edges
    ctx.fillStyle = 'rgba(230, 240, 250, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x, tier.yBase - tier.height);
    ctx.lineTo(x - tier.width * 0.3, tier.yBase - tier.height * 0.35);
    ctx.lineTo(x + tier.width * 0.3, tier.yBase - tier.height * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  // Ornaments — colorful baubles on each tier
  const ornamentColors = ['#FF3030', '#FFD700', '#3080FF', '#FF60A0', '#40E040'];
  let oi = 0;
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    const midY = tier.yBase - tier.height * 0.5;
    const ornCount = 3 - t; // more on bottom tiers
    for (let i = 0; i < ornCount; i++) {
      const ox = x + (i - (ornCount - 1) / 2) * (tier.width * 0.25);
      const oy = midY + (i % 2) * tier.height * 0.15;
      ctx.fillStyle = ornamentColors[oi % ornamentColors.length];
      ctx.beginPath();
      ctx.arc(ox, oy, 3 + (t === 0 ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
      // Shine dot
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(ox - 1, oy - 1, 1, 0, Math.PI * 2);
      ctx.fill();
      oi++;
    }
  }

  // Star on top
  const starY = tiers[2].yBase - tiers[2].height - 4;
  ctx.fillStyle = '#FFD700';
  // Simple 4-point star
  ctx.beginPath();
  ctx.moveTo(x, starY - 6);
  ctx.lineTo(x + 2, starY - 2);
  ctx.lineTo(x + 6, starY);
  ctx.lineTo(x + 2, starY + 2);
  ctx.lineTo(x, starY + 6);
  ctx.lineTo(x - 2, starY + 2);
  ctx.lineTo(x - 6, starY);
  ctx.lineTo(x - 2, starY - 2);
  ctx.closePath();
  ctx.fill();
  // Star glow
  ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(x, starY, 10, 0, Math.PI * 2);
  ctx.fill();

  // Tinsel garland — simple zigzag line
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.lineWidth = 1;
  for (let t = 0; t < 2; t++) {
    const tier = tiers[t];
    const ty = tier.yBase - tier.height * 0.4;
    const tw = tier.width * 0.3;
    ctx.beginPath();
    ctx.moveTo(x - tw, ty);
    for (let s = 0; s < 4; s++) {
      const sx = x - tw + (tw * 2 / 4) * (s + 1);
      const sy = ty + (s % 2 === 0 ? 4 : -2);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

export function drawSnowball(ctx: CanvasRenderingContext2D, x: number, groundY: number, radius: number): void {
  ctx.fillStyle = '#E4ECF4';
  ctx.beginPath();
  ctx.arc(x, groundY - radius, radius, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = '#F4F8FC';
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, groundY - radius * 1.3, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Shadow underneath
  ctx.fillStyle = 'rgba(100, 130, 160, 0.15)';
  ctx.beginPath();
  ctx.ellipse(x, groundY, radius * 0.8, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSnowballPyramid(ctx: CanvasRenderingContext2D, x: number, groundY: number, ballRadius: number): void {
  const r = ballRadius;
  const gap = r * 0.15;
  // Bottom row — 3 balls
  for (let i = 0; i < 3; i++) {
    const bx = x + (i - 1) * (r * 2 + gap);
    ctx.fillStyle = '#E4ECF4';
    ctx.beginPath();
    ctx.arc(bx, groundY - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F2F6FB';
    ctx.beginPath();
    ctx.arc(bx - r * 0.2, groundY - r * 1.25, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Top row — 2 balls nestled on top
  for (let i = 0; i < 2; i++) {
    const bx = x + (i - 0.5) * (r * 2 + gap);
    const by = groundY - r * 2 - r * 0.6;
    ctx.fillStyle = '#E8F0F6';
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F4F8FC';
    ctx.beginPath();
    ctx.arc(bx - r * 0.15, by - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cap — 1 ball on very top
  const capY = groundY - r * 2 - r * 0.6 - r * 1.5;
  ctx.fillStyle = '#ECF2F8';
  ctx.beginPath();
  ctx.arc(x, capY, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F6FAFC';
  ctx.beginPath();
  ctx.arc(x - r * 0.1, capY - r * 0.25, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Large pyramid: 4-3-2-1 rows (10 balls) with depth shading. */
export function drawLargeSnowballPyramid(ctx: CanvasRenderingContext2D, x: number, groundY: number, ballRadius: number): void {
  const r = ballRadius;
  const gap = r * 0.12;
  const rowSpacing = r * 1.7;
  const rows = [4, 3, 2, 1];
  const shades = ['#DDE6EE', '#E4ECF4', '#EAF0F6', '#F0F5FA'];

  for (let row = 0; row < rows.length; row++) {
    const count = rows[row];
    const rowY = groundY - r - row * rowSpacing;
    const rowR = r * (1 - row * 0.06); // slightly smaller toward top
    const rowWidth = (count - 1) * (rowR * 2 + gap);

    for (let i = 0; i < count; i++) {
      const bx = x - rowWidth / 2 + i * (rowR * 2 + gap);

      // Shadow behind ball
      ctx.fillStyle = 'rgba(100, 130, 160, 0.08)';
      ctx.beginPath();
      ctx.arc(bx + 1, rowY + 1, rowR, 0, Math.PI * 2);
      ctx.fill();

      // Ball body
      ctx.fillStyle = shades[row];
      ctx.beginPath();
      ctx.arc(bx, rowY, rowR, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = '#F6FAFC';
      ctx.beginPath();
      ctx.arc(bx - rowR * 0.25, rowY - rowR * 0.3, rowR * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Subtle snow texture dot
      if (row < 2 && i % 2 === 0) {
        ctx.fillStyle = 'rgba(200, 215, 230, 0.3)';
        ctx.beginPath();
        ctx.arc(bx + rowR * 0.2, rowY + rowR * 0.15, rowR * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(100, 130, 160, 0.1)';
  ctx.beginPath();
  ctx.ellipse(x, groundY, r * 4.5, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Ice cube — translucent 3D block. Draws behind the platform at (x, topY).
 *  width/height are the visual cube dimensions (platform sits on top edge). */
export function drawIceCube(ctx: CanvasRenderingContext2D, x: number, topY: number, width: number, height: number): void {
  const depth = width * 0.3; // 3D depth offset

  // Back face (darker, offset)
  ctx.fillStyle = 'rgba(140, 180, 210, 0.3)';
  ctx.beginPath();
  ctx.moveTo(x + depth, topY - depth);
  ctx.lineTo(x + width + depth, topY - depth);
  ctx.lineTo(x + width + depth, topY + height - depth);
  ctx.lineTo(x + depth, topY + height - depth);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = 'rgba(200, 225, 245, 0.45)';
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x + depth, topY - depth);
  ctx.lineTo(x + width + depth, topY - depth);
  ctx.lineTo(x + width, topY);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = 'rgba(150, 190, 220, 0.35)';
  ctx.beginPath();
  ctx.moveTo(x + width, topY);
  ctx.lineTo(x + width + depth, topY - depth);
  ctx.lineTo(x + width + depth, topY + height - depth);
  ctx.lineTo(x + width, topY + height);
  ctx.closePath();
  ctx.fill();

  // Front face (main, most visible)
  ctx.fillStyle = 'rgba(180, 215, 240, 0.5)';
  ctx.fillRect(x, topY, width, height);

  // Front face border
  ctx.strokeStyle = 'rgba(160, 200, 230, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, topY, width, height);

  // Internal cracks
  ctx.strokeStyle = 'rgba(220, 240, 255, 0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + width * 0.2, topY + height * 0.3);
  ctx.lineTo(x + width * 0.45, topY + height * 0.5);
  ctx.lineTo(x + width * 0.35, topY + height * 0.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + width * 0.6, topY + height * 0.2);
  ctx.lineTo(x + width * 0.75, topY + height * 0.55);
  ctx.stroke();

  // Frozen bubbles
  ctx.fillStyle = 'rgba(230, 245, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(x + width * 0.3, topY + height * 0.4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + width * 0.65, topY + height * 0.6, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + width * 0.5, topY + height * 0.25, 2, 0, Math.PI * 2);
  ctx.fill();

  // Shine highlight on top-left
  ctx.fillStyle = 'rgba(240, 250, 255, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x + 3, topY + 3);
  ctx.lineTo(x + width * 0.4, topY + 3);
  ctx.lineTo(x + width * 0.3, topY + height * 0.2);
  ctx.lineTo(x + 3, topY + height * 0.25);
  ctx.closePath();
  ctx.fill();
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
