function drawSpringTrail(ctx, player, frameTime) {
    // Anchored at the spring (where the player launched from), not the moving player.
    // Two layers: a yellow energy column rising out of the spring + animated coil
    // rings racing up the column, both fading with springTrailTimer.
    const t = player.springTrailTimer / SPRING_TRAIL_DURATION;
    if (t <= 0 || !Number.isFinite(player.springLaunchX))
        return;
    const launchX = player.springLaunchX;
    const launchY = player.springLaunchY;
    const COL_H = 70;
    const COL_HALF_W = 7;
    // Per-frame linear gradient over a small ellipse (~770 px). Below the
    // ~10k-pixel threshold for the bake-strip swap (see docs/perf-patterns.md);
    // direct gradient fill is cheaper here.
    const grad = ctx.createLinearGradient(launchX, launchY, launchX, launchY - COL_H);
    grad.addColorStop(0, `rgba(255,212,90,${0.4 * t})`);
    grad.addColorStop(0.55, `rgba(255,180,40,${0.16 * t})`);
    grad.addColorStop(1, 'rgba(255,180,40,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(launchX, launchY - COL_H / 2, COL_HALF_W, COL_H / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coil rings racing upward — phase advances with timer + frameTime so rings
    // appear to rise out of the spring, evoking spring coils releasing.
    const RING_COUNT = 2;
    const animPhase = (1 - t) * 1.6 + frameTime * 0.002;
    ctx.strokeStyle = `rgba(255,235,120,${0.55 * t})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < RING_COUNT; i++) {
        const phase = (animPhase + i / RING_COUNT) % 1;
        const ry = launchY - phase * COL_H;
        const rw = 5 + phase * 7;
        // moveTo before each ellipse so sub-paths don't connect with a stroke line.
        ctx.moveTo(launchX + rw, ry);
        ctx.ellipse(launchX, ry, rw, 2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
}
