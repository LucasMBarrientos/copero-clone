// Procedural club crest generator. Confecon's spreadsheets don't include
// crest images, so we derive a deterministic shield badge per club from its
// name (same idea as Copero's real crests, just no source image to show).

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function hslColor(h, s, l) {
  return `hsl(${h % 360}, ${s}%, ${l}%)`;
}

function clubAbbreviation(name) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !["de", "del", "la", "los", "las", "el", "y"].includes(w.toLowerCase()));
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] || name).slice(0, 3).toUpperCase();
}

// Deterministic club palette, shared by the crest, the timeline row tint and
// the end-of-career club cards (Confecon publishes no club colours).
function clubColors(club) {
  const h = hashString(club.nombre || club.slug || "club");
  const hueA = h % 360;
  const hueB = (hueA + 40 + ((h >> 8) % 80)) % 360;
  return {
    primary: hslColor(hueA, 55, 38),
    secondary: hslColor(hueB, 55, 55),
    deep: hslColor(hueA, 60, 18),
    hue: hueA,
  };
}

// Returns an <svg> markup string for a club crest, sized to fill its box.
function crestSvg(club, size = 40) {
  const h = hashString(club.nombre || club.slug || "club");
  const { primary, secondary } = clubColors(club);
  const abbr = clubAbbreviation(club.nombre || "");
  const shapeVariant = h % 3; // 0 = shield, 1 = round, 2 = hexagon

  const shapes = [
    // shield
    `M50 4 L92 18 V54 C92 80 74 96 50 106 C26 96 8 80 8 54 V18 Z`,
    // round crest
    `M50 6 A44 44 0 1 1 49.9 6 Z`,
    // hexagon
    `M50 4 L92 28 V78 L50 106 L8 78 V28 Z`,
  ];

  return `
  <svg viewBox="0 0 100 110" width="${size}" height="${size * 1.1}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g${h}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${secondary}" />
        <stop offset="100%" stop-color="${primary}" />
      </linearGradient>
    </defs>
    <path d="${shapes[shapeVariant]}" fill="url(#g${h})" stroke="rgba(255,255,255,0.25)" stroke-width="2" />
    <text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800"
      font-size="34" fill="#fff" style="paint-order: stroke; stroke: rgba(0,0,0,0.35); stroke-width: 1px;">${abbr}</text>
  </svg>`;
}
