import type { Ctx2D } from '../../types';
const gradients = new WeakMap<Ctx2D, WeakMap<object, CanvasGradient[]>>();
const ink = '#39778E', water = '#7DCEDA', light = '#D3F3ED';
function lobe(c: Ctx2D, x: number, y: number, rx: number, ry: number, phase: number, fill: string, alpha = 1) {
    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha;
    c.beginPath();
    for (let k = 0; k <= 24; k++) {
        const a = k * Math.PI / 12, r = 1 + .13 * Math.sin(a * 3 + phase) + .06 * Math.cos(a * 5 - phase);
        c.lineTo(Math.cos(a) * rx * r, Math.sin(a) * ry * r);
    }
    c.closePath();
    c.fillStyle = fill;
    c.strokeStyle = ink;
    c.lineWidth = 1.4;
    c.fill();
    c.stroke();
    c.restore();
}
export function drawFineGeyser(c: Ctx2D, z: {
    x: number;
    y: number;
    width: number;
    height: number;
}, active: boolean, t: number): void {
    const bottom = z.y + z.height, cx = z.x + z.width / 2;
    if (!active) {
        for (let i = 0; i < 3; i++)
            lobe(c, cx + (i - 1) * 14, bottom - 6 - Math.abs(Math.sin(t * 1.5 + i * 2)) * 8, 3 + i % 2, 4, t + i, light, .45);
        return;
    }
    c.save();
    for (let j = 0; j < 7; j++) {
        const x = z.x + 35 + j * (z.width - 70) / 6, w = (18 + (j % 2) * 8) * .55;
        c.beginPath();
        c.moveTo(x - w, bottom);
        for (let y = bottom; y >= z.y; y -= 22)
            c.lineTo(x - w + Math.sin(y * .04 + t * 4 + j) * 9 * .65, y);
        for (let y = z.y; y <= bottom; y += 22)
            c.lineTo(x + w + Math.sin(y * .033 + t * 3 + j) * 11 * .65, y);
        c.closePath();
        c.save();
        c.clip();
        let byZone = gradients.get(c);
        if (!byZone) {
            byZone = new WeakMap();
            gradients.set(c, byZone);
        }
        let shades = byZone.get(z);
        if (!shades) {
            shades = [];
            byZone.set(z, shades);
        }
        let shade = shades[j];
        if (!shade) {
            shade = c.createLinearGradient(x - w, 0, x + w, 0);
            shade.addColorStop(0, 'rgba(27,101,139,.24)');
            shade.addColorStop(.35, 'rgba(98,195,212,.22)');
            shade.addColorStop(.62, 'rgba(195,240,233,.28)');
            shade.addColorStop(1, 'rgba(39,117,151,.18)');
            shades[j] = shade;
        }
        c.fillStyle = shade;
        c.fillRect(x - w - 25, z.y, w * 2 + 50, z.height);
        c.restore();
    }
    for (let i = 0; i < 30; i++) {
        const f = ((t * 155 + i * 43) % z.height) / z.height, y = bottom - f * z.height;
        const x = cx + Math.sin(i * 2.3) * z.width * .4 + Math.sin(t * 2 + i) * 9, r = (6 + i % 4 * 3) * .7;
        lobe(c, x, y, r, r * 1.17, i + t, water, .48);
        c.beginPath();
        c.ellipse(x - r * .18, y - r * .18, r * .52, r * .6, -.5, Math.PI, Math.PI * 1.75);
        c.strokeStyle = light;
        c.lineWidth = 2;
        c.stroke();
        if (i % 3 === 0) {
            c.beginPath();
            c.moveTo(x, y + r + 5);
            c.lineTo(x - 2, y + r + 14);
            c.strokeStyle = 'rgba(125,206,218,.35)';
            c.lineWidth = 2;
            c.stroke();
        }
    }
    c.restore();
}
