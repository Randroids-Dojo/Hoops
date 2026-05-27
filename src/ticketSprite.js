// Arcade-style paper ticket sprite generator. Used by the HUD to render the
// flying ticket-award notification and (optionally) by the coin-burst
// animation as its fly-to-counter glyph. Each amount is rendered once and
// cached; the canvas can then be drawn into the 2D HUD ctx repeatedly.
//
// Visual language:
//   • amount === 1 → red/coral "1 TICKET" paper ticket
//   • amount  >  1 → gold paper ticket with the amount printed across the face
//
// The ticket shape mimics fairground arcade tickets: a horizontal rectangle
// with two perforated tear-stubs on the ends (notched edges + dashed line).

const CACHE = new Map();

const TICKET_W = 160;
const TICKET_H = 56;

export function getTicketSprite(amount) {
  const key = String(amount);
  if (CACHE.has(key)) return CACHE.get(key);
  const canvas = _renderTicket(amount);
  CACHE.set(key, canvas);
  return canvas;
}

export function ticketSize() {
  return { w: TICKET_W, h: TICKET_H };
}

function _renderTicket(amount) {
  const c = document.createElement('canvas');
  // Backing-store oversampling so the ticket text reads crisply when the
  // HUD scales the sprite up during the pop-in animation.
  const scale = 3;
  c.width = TICKET_W * scale;
  c.height = TICKET_H * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);

  const isGold = amount > 1;
  const palette = isGold
    ? { base: '#ffd34d', edge: '#a07000', shadow: '#7a5300', stub: '#ffb930', stamp: '#1a0d00', accent: '#fff6c0' }
    : { base: '#d65a3a', edge: '#5a1810', shadow: '#3a0a04', stub: '#b04020', stamp: '#fff6e0', accent: '#ffd9c2' };

  // ── Soft drop shadow under the ticket so it pops off the HUD background.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;

  // Body — a rounded rect with two semicircular notches taken out of each
  // long edge ~25% in from each end. That's where the stub would perforate.
  _drawTicketPath(g, 1.5, 3, TICKET_W - 3, TICKET_H - 5);
  g.fillStyle = palette.base;
  g.fill();
  g.restore();

  // Subtle vertical gradient overlay for a tiny bit of 3D
  const grad = g.createLinearGradient(0, 3, 0, TICKET_H);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  _drawTicketPath(g, 1.5, 3, TICKET_W - 3, TICKET_H - 5);
  g.fillStyle = grad;
  g.fill();

  // Outline
  _drawTicketPath(g, 1.5, 3, TICKET_W - 3, TICKET_H - 5);
  g.strokeStyle = palette.edge;
  g.lineWidth = 1.6;
  g.stroke();

  // Perforated stub lines, dashed, ~22% from each end. Vertical from
  // top notch to bottom notch.
  g.save();
  g.strokeStyle = palette.shadow;
  g.lineWidth = 1.2;
  g.setLineDash([2, 2]);
  const stubX1 = TICKET_W * 0.22;
  const stubX2 = TICKET_W * 0.78;
  g.beginPath();
  g.moveTo(stubX1, 8);
  g.lineTo(stubX1, TICKET_H - 8);
  g.stroke();
  g.beginPath();
  g.moveTo(stubX2, 8);
  g.lineTo(stubX2, TICKET_H - 8);
  g.stroke();
  g.restore();

  // Stub corner stars (small accent flair on each end)
  _drawStar(g, TICKET_W * 0.11, TICKET_H / 2, 3.2, palette.stamp);
  _drawStar(g, TICKET_W * 0.89, TICKET_H / 2, 3.2, palette.stamp);

  // Center stamp: big number for gold tickets, "TICKET" wordmark for the
  // single-ticket variant. Either way it sits in the main body, between
  // the two stub lines.
  const cx = TICKET_W / 2;
  const cy = TICKET_H / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  if (isGold) {
    const label = String(amount);
    g.fillStyle = palette.stamp;
    // Auto-shrink for 3-digit values like the +100 daily bonus.
    const fontSize = label.length >= 3 ? 22 : label.length === 2 ? 26 : 30;
    g.font = `bold ${fontSize}px monospace`;
    g.fillText(label, cx, cy - 2);
    g.fillStyle = palette.accent;
    g.font = 'bold 7px monospace';
    g.fillText('TICKETS', cx, cy + (label.length >= 3 ? 13 : 15));
  } else {
    g.fillStyle = palette.stamp;
    g.font = 'bold 22px monospace';
    g.fillText('1', cx, cy - 4);
    g.fillStyle = palette.accent;
    g.font = 'bold 8px monospace';
    g.fillText('TICKET', cx, cy + 13);
  }

  return c;
}

// Rounded rectangle minus two semicircular notches (one on each long edge,
// roughly at x = w*0.22 and x = w*0.78). The notches are what give the
// ticket its tear-stub silhouette.
function _drawTicketPath(g, x, y, w, h) {
  const r = 6;
  const nr = 3.5; // notch radius
  const nx1 = x + w * 0.22;
  const nx2 = x + w * 0.78;

  g.beginPath();
  g.moveTo(x + r, y);
  // Top edge: line to first notch, notch (concave arc), line to second notch, notch, line to corner
  g.lineTo(nx1 - nr, y);
  g.arc(nx1, y, nr, Math.PI, 0, true); // concave downward (true = counterclockwise)
  g.lineTo(nx2 - nr, y);
  g.arc(nx2, y, nr, Math.PI, 0, true);
  g.lineTo(x + w - r, y);
  // Top-right corner
  g.arcTo(x + w, y, x + w, y + r, r);
  // Right edge
  g.lineTo(x + w, y + h - r);
  // Bottom-right corner
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  // Bottom edge: with two notches (concave upward, clockwise around the arc)
  g.lineTo(nx2 + nr, y + h);
  g.arc(nx2, y + h, nr, 0, Math.PI, true);
  g.lineTo(nx1 + nr, y + h);
  g.arc(nx1, y + h, nr, 0, Math.PI, true);
  g.lineTo(x + r, y + h);
  // Bottom-left corner
  g.arcTo(x, y + h, x, y + h - r, r);
  // Left edge
  g.lineTo(x, y + r);
  // Top-left corner
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function _drawStar(g, cx, cy, r, color) {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}
