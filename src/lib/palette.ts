export function paletteSVG(hex: string[], label = "palette"): { svg: string; mime: string } {
  const W = 420, H = 90, m = 12, sw = Math.floor((W - 2 * m) / Math.max(1, hex.length));
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  hex.forEach((c, i) => {
    const x = m + i * sw;
    parts.push(`<rect x="${x}" y="${m}" width="${sw - 6}" height="${H - 2 * m}" fill="${c}" stroke="black" stroke-width="1"/>`);
  });
  parts.push(`<text x="${m}" y="${H - 6}" font-size="12" fill="black">${label}</text>`);
  parts.push(`</svg>`);
  return { svg: parts.join(""), mime: "image/svg+xml" };
}


