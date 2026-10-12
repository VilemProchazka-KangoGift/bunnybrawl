export function drawGeyser(ctx, zone, gs, time) {
    const cx = zone.x + zone.width / 2;
    if (gs.active) {
        // Active bubble column
        ctx.fillStyle = 'rgba(136, 204, 255, 0.2)';
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        // Rising bubbles -- count scales with zone width
        // Original: strokeStyle rgba(180,220,255,0.5) * globalAlpha 0.4 = 0.2 effective
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.2)';
        ctx.lineWidth = 1;
        const bubbleCount = Math.max(8, Math.round(zone.width / 8));
        for (let i = 0; i < bubbleCount; i++) {
            const by = zone.y + zone.height - ((time * 80 + i * 20) % zone.height);
            const bx = cx + Math.sin(time * 3 + i * 1.5) * (zone.width * 0.3);
            const bs = 2 + (i % 3);
            ctx.beginPath();
            ctx.arc(bx, by, bs, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    else {
        // Dormant -- small bubbles at base
        ctx.fillStyle = 'rgba(136, 187, 221, 0.15)';
        for (let i = 0; i < 3; i++) {
            const bx = cx + Math.sin(time * 2 + i) * 5;
            const by = zone.y + zone.height - 5 - Math.abs(Math.sin(time * 1.5 + i * 2)) * 8;
            ctx.beginPath();
            ctx.arc(bx, by, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
