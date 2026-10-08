// Frozen actual runtime pickup emitter, updates and drawing; seeded study randomness.
const CARROT_SIZE = 30;
const BLOOD_COLOR = '#CC2222';
const GIB_GRAVITY = 600;
const GIB_ROTATION_MAX = 12;
const GIB_MAX_FLIGHT = 5;
const GIB_BOUNCE_FACTOR = 0.3;
const GIB_GEYSER_STRENGTH_MULT = 0.7;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const MAX_LIVE_PARTICLES = 600, GIB_FREELIST_CAP = 600;
const CARROT_PICKUP_COLORS = ['#FF8C00', '#FF6600', '#FFA500', '#FF7700', '#FFD700', '#FF8C00'];
function swapRemove(a, i) { a[i] = a[a.length - 1]; a.pop(); }
function emitParticle(particles, freeList, x, y, vx, vy, life, size, color, shape) {
    if (particles.length >= MAX_LIVE_PARTICLES)
        return;
    const recycled = freeList.pop();
    if (recycled) {
        recycled.x = x;
        recycled.y = y;
        recycled.vx = vx;
        recycled.vy = vy;
        recycled.life = life;
        recycled.maxLife = life;
        recycled.size = size;
        recycled.color = color;
        recycled.shape = shape;
        particles.push(recycled);
    }
    else {
        particles.push({ x, y, vx, vy, life, maxLife: life, size, color, shape });
    }
}
function updateParticles(particles, freeList, platforms, gore, newBloodDrips, dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
            swapRemove(particles, i);
            if (freeList.length < 300)
                freeList.push(p);
            continue;
        }
        const prevY = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.shape !== 'jumpCloud' && p.shape !== 'landingCloud' && p.shape !== 'impactCrown')
            p.vy += 80 * dt;
        if (gore && p.color === BLOOD_COLOR && p.vy > 0) {
            for (let pi = 0; pi < platforms.length; pi++) {
                const plat = platforms[pi];
                if (prevY < plat.y && p.y >= plat.y && p.x >= plat.x && p.x <= plat.x + plat.width) {
                    newBloodDrips.push({ x: p.x, y: plat.y, radius: 2 + baselineRandom() * 3, color: BLOOD_COLOR });
                    p.life = 0;
                    break;
                }
            }
        }
    }
}
function launchGib(gibs, freeList, cx, cy, spread, angleMin, angleMax, speedMin, speedMax, w, h, color, darkColor, lightColor, characterName, gibType) {
    const angle = -Math.PI * (angleMin + baselineRandom() * (angleMax - angleMin));
    const speed = speedMin + baselineRandom() * (speedMax - speedMin);
    const x = cx + (baselineRandom() - 0.5) * spread;
    const y = cy + (baselineRandom() - 0.5) * spread * 0.7;
    const vx = Math.cos(angle) * speed * (baselineRandom() < 0.5 ? 1 : -1);
    const vy = Math.sin(angle) * speed;
    const rotation = baselineRandom() * Math.PI * 2;
    const rotationSpeed = (baselineRandom() - 0.5) * 2 * GIB_ROTATION_MAX;
    const recycled = freeList.pop();
    if (recycled) {
        recycled.x = x;
        recycled.y = y;
        recycled.vx = vx;
        recycled.vy = vy;
        recycled.rotation = rotation;
        recycled.rotationSpeed = rotationSpeed;
        recycled.width = w;
        recycled.height = h;
        recycled.color = color;
        recycled.darkColor = darkColor;
        recycled.lightColor = lightColor;
        recycled.characterName = characterName;
        recycled.gibType = gibType;
        recycled.bounced = false;
        recycled.life = GIB_MAX_FLIGHT;
        gibs.push(recycled);
    }
    else {
        gibs.push({
            x, y, vx, vy, rotation, rotationSpeed,
            width: w, height: h,
            color, darkColor, lightColor,
            characterName, gibType,
            bounced: false,
            life: GIB_MAX_FLIGHT,
        });
    }
}
function updateGibs(gibs, freeList, platforms, effectZones, geyserIndexMap, geyserStates, groundedGibs, dt) {
    for (let i = gibs.length - 1; i >= 0; i--) {
        const g = gibs[i];
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vy += GIB_GRAVITY * dt;
        g.rotation += g.rotationSpeed * dt;
        g.life -= dt;
        // Effect zone interactions
        if (effectZones) {
            for (let zi = 0; zi < effectZones.length; zi++) {
                const zone = effectZones[zi];
                if (g.x < zone.x || g.x > zone.x + zone.width || g.y < zone.y || g.y > zone.y + zone.height)
                    continue;
                if (zone.type === 'zero_g') {
                    if (g.vy > 0)
                        g.vy *= 0.92;
                    else if (g.vy < 0)
                        g.vy *= 1.03;
                }
                else if (zone.type === 'current') {
                    g.vx += (zone.vx || 0) * dt;
                    g.vy += (zone.vy || 0) * dt;
                }
                else if (zone.type === 'geyser') {
                    const geyserIdx = geyserIndexMap.get(zone) ?? -1;
                    if (geyserIdx >= 0 && geyserStates[geyserIdx]?.active) {
                        g.vy = Math.min(g.vy, (zone.strength || -550) * GIB_GEYSER_STRENGTH_MULT);
                    }
                }
            }
        }
        // Platform collision
        let settled = false;
        const gibBottom = g.y + g.height / 2;
        const prevBottom = gibBottom - g.vy * dt;
        for (let pi = 0; pi < platforms.length; pi++) {
            const plat = platforms[pi];
            if (prevBottom < plat.y && gibBottom >= plat.y &&
                g.x + g.width / 2 > plat.x && g.x - g.width / 2 < plat.x + plat.width) {
                if (!g.bounced) {
                    g.vy = -Math.abs(g.vy) * GIB_BOUNCE_FACTOR;
                    g.vx *= 0.6;
                    g.rotationSpeed *= 0.5;
                    g.bounced = true;
                    g.y = plat.y - g.height / 2;
                }
                else {
                    g.y = plat.y - g.height / 2;
                    g.vx = 0;
                    g.vy = 0;
                    g.rotationSpeed = 0;
                    groundedGibs.push(g);
                    swapRemove(gibs, i);
                    settled = true;
                }
                break;
            }
        }
        if (settled)
            continue;
        if (g.life <= 0) {
            // Expired in flight — recycle. (Settled gibs go to groundedGibs first;
            // they're recycled in ParticleSystem.bakeToRenderer after the renderer
            // copies their data into the bg canvas.)
            if (freeList.length < GIB_FREELIST_CAP)
                freeList.push(g);
            swapRemove(gibs, i);
        }
    }
}
function pickupCarrotVFX(x, y) {
    const cy = y + CARROT_SIZE / 2;
    // Orange carrot chunks
    for (let i = 0; i < 4; i++) {
        const s = 4 + baselineRandom() * 3;
        launchGib(this.state.gibs, this.gibFreeList, x, cy, 10, 0.15, 0.85, 80, 200, s, s, '#FF8C00', '#CC6600', '#FFB040', '', 'body');
    }
    // Green leaf pieces
    for (let i = 0; i < 2; i++) {
        launchGib(this.state.gibs, this.gibFreeList, x, cy, 8, 0.2, 0.8, 60, 160, 5, 3, '#4CAF50', '#2E7D32', '#81C784', '', 'body');
    }
    // Orange/gold particle burst
    for (let i = 0; i < 16; i++) {
        const angle = baselineRandom() * Math.PI * 2;
        const speed = 80 + baselineRandom() * 140;
        const life = 0.3 + baselineRandom() * 0.4;
        this.emitParticle(x, cy, Math.cos(angle) * speed, Math.sin(angle) * speed - 50, life, 2 + baselineRandom() * 5, CARROT_PICKUP_COLORS[i % CARROT_PICKUP_COLORS.length]);
    }
    // Upward gold sparkle ring
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const speed = 30 + baselineRandom() * 30;
        this.emitParticle(x, cy, Math.cos(angle) * speed, -50 - baselineRandom() * 40, 0.4 + baselineRandom() * 0.2, 1.5 + baselineRandom() * 2, '#FFD700');
    }
}
function drawParticles(ctx, particles, lead = 0) {
    let lastColor = '';
    for (const p of particles) {
        const dx = p.x + p.vx * lead;
        const dy = p.y + p.vy * lead;
        if (dx < -20 || dx > CANVAS_WIDTH + 20 || dy < -20 || dy > CANVAS_HEIGHT + 20)
            continue;
        if (p.shape === 'impactCrown') {
            drawImpactCrown(ctx, p, lead);
            lastColor = '';
            continue;
        }
        if (p.shape === 'jumpCloud' || p.shape === 'landingCloud') {
            drawMovementPuff(ctx, p, lead);
            lastColor = ''; // Cloud fill changes the context color.
            continue;
        }
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha * 0.7;
        if (p.color !== lastColor) {
            ctx.fillStyle = p.color;
            lastColor = p.color;
        }
        if (p.shape === 'spike') {
            // Oriented narrow triangle pointing along velocity. Length 3.5x size, base 0.7x size.
            const ang = Math.atan2(p.vy, p.vx);
            const r = p.size * alpha;
            const len = r * 3.5;
            const halfBase = r * 0.7;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(len, 0);
            ctx.lineTo(-len * 0.4, -halfBase);
            ctx.lineTo(-len * 0.4, halfBase);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        else {
            ctx.beginPath();
            ctx.arc(dx, dy, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}
function drawGibs(ctx, gibs, lead = 0) {
    for (const gib of gibs) {
        const dx = gib.x + gib.vx * lead;
        const dy = gib.y + gib.vy * lead;
        // Off-screen culling
        if (dx < -40 || dx > CANVAS_WIDTH + 40 || dy < -40 || dy > CANVAS_HEIGHT + 40)
            continue;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(gib.rotation + gib.rotationSpeed * lead);
        drawGibShape(ctx, gib);
        ctx.restore();
    }
}
function drawGibShape(ctx, gib) {
    const { characterName, gibType, color, darkColor, lightColor } = gib;
    // Body gib is generic for all characters -- colored oval
    if (gibType === 'body') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, gib.width / 2, gib.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    // Dispatch to character-specific gib renderer from pack registry
    const gibRenderer = getGibRenderer(characterName);
    gibRenderer(ctx, gibType, gib.width, gib.height, { color, darkColor, lightColor });
}
let baselineSeed = 19371;
function baselineRandom() { baselineSeed = (Math.imul(baselineSeed, 1664525) + 1013904223) >>> 0; return baselineSeed / 4294967296; }
const baselineFrames = (() => { const system = { state: { gibs: [] }, gibFreeList: [], particles: [], emitParticle(...args) { emitParticle(this.particles, [], ...args); } }; pickupCarrotVFX.call(system, 640, 625); const frames = [], grounded = [], floor = [{ x: 0, y: 660, width: 1280, height: 60 }]; for (let i = 0; i < 75; i++) {
    frames.push({ particles: system.particles.map(p => ({ ...p })), gibs: [...grounded, ...system.state.gibs].map(g => ({ ...g })) });
    updateParticles(system.particles, [], false, floor, [], 1 / 60);
    updateGibs(system.state.gibs, [], floor, undefined, new Map(), [], grounded, 1 / 60);
} return frames; })();
function drawCurrentPickup(ctx, age) { if (age < 0)
    return; const frame = baselineFrames[Math.min(baselineFrames.length - 1, Math.floor(age * 60))]; ctx.save(); ctx.translate(-640, -660); drawGibs(ctx, frame.gibs); drawParticles(ctx, frame.particles); ctx.restore(); }
