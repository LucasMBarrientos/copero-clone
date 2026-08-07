// Faithful reimplementation of Copero's jersey SVG (viewBox 0 0 1440 1440,
// silhouette path, curved last-name text, big centered number, and
// vertical-stripes / checkerboard / diagonal-sash pattern fills) --
// reverse-engineered shape geometry, redrawn here with our own fictional
// per-country kit colors (data/kits.json) instead of Copero's real clubs.

function contrastColor(hex) {
  const h = (hex || "#808080").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5 ? "#FFFFFF" : "#000000";
}

const JERSEY_SILHOUETTE =
  "M1200 390c-20-65-45-115-130-150s-190.86-80-310-80h-80c-119.14 0-225 45-310 80s-110 85-130 150-120 260-120 260 91.73 151.42 230 130c0 0 20-80 40-120 0 0 17.57 90.67 15 240-2.91 169.51-20 236.73-20 375 0 0 65 45 335 45s335-45 335-45c0-138.27-17.08-205.49-20-375-2.57-149.33 15-240 15-240 20 40 40 120 40 120 138.27 21.42 230-130 230-130s-100-195-120-260";

const JERSEY_SHADING =
  "M720 1265c-170 0-280-40-280-40 60 50 160 70 280 70s220-20 280-70c0 0-110 40-280 40M720 200c-68.75 0-144.14 10.21-200 40 0 0 105.17-15 200-15s200 15 200 15c-55.86-29.79-131.25-40-200-40M1170 700c-5.79-36.48 6.16-101.7 20-150-27.77 22.52-54.25 76.29-70 110-16.91-65.57-14.47-183.63-20-240-22.11 72.06-40.28 150.85-50 240 20 40 40 120 40 120 71.26 11.04 130.16-23.83 170.51-60.22-67.27-1.1-88.41-6.54-90.51-19.78M860 1200c59.65-10.27 142.73-38.17 188.12-76.4-5.1-62.69-11.44-126.29-13.12-223.6-.77-44.6.26-83.96 2.08-117.24-14.92 48.88-36.92 113.16-57.08 142.24-34.02 49.05-69.02 93.62-150 135 132.17-5.14 169.28-92.43 180-50 10.45 41.37-36.52 109.44-150 190M391.88 1123.6c45.39 38.23 128.47 66.13 188.12 76.4-113.48-80.56-160.45-148.63-150-190 10.72-42.43 47.83 44.86 180 50-80.98-41.38-115.98-85.95-150-135-20.16-29.08-42.16-93.36-57.08-142.24 1.82 33.28 2.85 72.64 2.08 117.24-1.67 97.31-8.02 160.91-13.12 223.6M320 660c-15.75-33.71-42.23-87.48-70-110 13.84 48.3 25.79 113.52 20 150-2.1 13.24-23.24 18.68-90.51 19.78C219.84 756.17 278.74 791.04 350 780c0 0 20-80 40-120-9.72-89.15-27.89-167.94-50-240-5.53 56.37-3.09 174.43-20 240";

const JERSEY_TRIM =
  "M680 160h80c44.14 0 86.45 6.18 126.55 15.73-8.01-15.06-16.99-30.72-26.55-35.73-21.64-11.34-61.25-20-140-20s-118.36 8.66-140 20c-9.57 5.01-18.54 20.68-26.55 35.73C593.55 166.18 635.87 160 680 160M139.43 611.54C127.78 634.83 120 650 120 650s91.73 151.42 230 130c0 0 4.42-17.69 11.19-40.59-82.3-6.5-148.23-39.82-221.75-127.87ZM1300.57 611.54c-73.52 88.05-139.46 121.37-221.75 127.87 6.77 22.9 11.19 40.59 11.19 40.59 138.27 21.42 230-130 230-130s-7.78-15.17-19.43-38.46Z";

let jerseyIdCounter = 0;

// Returns SVG markup (string) for the jersey, given a kit {primary, secondary, tertiary, pattern}.
function jerseySvg({ lastName, number, kit, className = "" }) {
  jerseyIdCounter += 1;
  const uid = `kit${jerseyIdCounter}`;
  const primary = kit?.primary || "#808080";
  const secondary = kit?.secondary || primary;
  const tertiary = kit?.tertiary || contrastColor(primary);
  const pattern = kit?.pattern || "solid";
  const hasPattern = pattern !== "solid";
  const fabricFill = hasPattern ? `url(#${uid})` : primary;
  const inkColor = hasPattern ? secondary : tertiary;

  let defsPattern = "";
  if (pattern === "vertical_stripes") {
    defsPattern = `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="1440" height="1440">
      <rect width="1440" height="1440" fill="${primary}" />
      <rect x="380" width="140" height="1440" fill="${secondary}" />
      <rect x="650" width="140" height="1440" fill="${secondary}" />
      <rect x="920" width="140" height="1440" fill="${secondary}" />
    </pattern>`;
  } else if (pattern === "checkerboard") {
    defsPattern = `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="360" height="360">
      <rect width="360" height="360" fill="${primary}" />
      <path fill="${secondary}" d="M0 0h180v180H0zM180 180h180v180H180z" />
    </pattern>`;
  } else if (pattern === "diagonal_sash") {
    defsPattern = `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="1440" height="1440">
      <rect width="1440" height="1440" fill="${primary}" />
      <path fill="${secondary}" d="M150 -240L310 -360L1290 1320L1130 1440Z" />
    </pattern>`;
  }

  return `
  <svg viewBox="0 0 1440 1440" class="kit-preview ${className}" xmlns="http://www.w3.org/2000/svg">
    <path fill="${fabricFill}" d="${JERSEY_SILHOUETTE}" />
    <g fill="#000" opacity=".15"><path d="${JERSEY_SHADING}" /></g>
    <path fill="${inkColor}" d="${JERSEY_TRIM}" />
    <defs>
      ${defsPattern}
      <path id="${uid}-name" d="M 350 480 Q 720 380 1090 480" fill="transparent" />
    </defs>
    <text fill="${inkColor}" font-family="inherit" font-size="85" font-weight="900" letter-spacing="4">
      <textPath href="#${uid}-name" startOffset="50%" text-anchor="middle">${(lastName || "APELLIDO").toUpperCase()}</textPath>
    </text>
    <text x="720" y="820" fill="${inkColor}" font-family="inherit" font-size="400" font-weight="900" text-anchor="middle">${number || 10}</text>
  </svg>`;
}
