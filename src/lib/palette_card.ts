import type { Finishes } from "./scene_model";

export function paletteSVG(fin: Finishes){
  const sw = 120, sh = 120, pad = 16, gap = 8;
  const colors = [
    { name:"Walls", hex: fin.wallHex },
    { name:"Floor", hex: fin.floor.kind==="carpet_tiles" ? (fin.floor as any).baseHex : (fin.floor as any).tintHex },
    { name:"Accent", hex: fin.accentHex || "#FF6D00" },
    { name:"Mullion", hex: fin.mullionHex || "#1C1F22" },
    { name:"Glass", hex: fin.glassTintHex || "#EAF2F6" },
    { name:"Trim", hex: fin.trimHex || "#E7E4DE" },
  ];
  const W = pad*2 + sw*colors.length + gap*(colors.length-1);
  const H = pad*2 + sh + 28;
  const rects = colors.map((c, i) => {
    const x = pad + i*(sw+gap);
    const y = pad;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="12" ry="12" fill="${c.hex}"/>
        <text x="${x+sw/2}" y="${y+sh+18}" text-anchor="middle" font-size="14" fill="#222" font-family="Inter,system-ui,Arial">${c.name}</text>
      </g>
    `;
  }).join("\n");
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="100%" height="100%" fill="#FFFFFF"/>
    ${rects}
  </svg>`;
}

export function svgToDataUrl(svg: string){
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}


