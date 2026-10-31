// Category colors that look different from each other, not just different hex
// codes (decision D-028). Distance is ΔE in OKLab ×100 under normal vision, as
// in the dataviz validator. Candidates are muted colors that never read as gray
// and keep 3:1 contrast as an icon on both the light and the dark background.
// Pure and deterministic: the form suggests with it, the server checks with it.

/** Two categories of the same kind must be at least this far apart (while any color still is). */
export const MIN_COLOR_DISTANCE = 10;
/** Once nothing is MIN_COLOR_DISTANCE away, a color may be this much short of the best one left. */
const FALLBACK_SLACK = 1;
/** Suggestions are random among candidates within this much of the most distinct one, to leave room for later ones. */
const SUGGESTION_BAND = 5;
/** Suggestions are alternatives (one gets used), so they need only this much between each other. */
const ALTERNATIVE_GAP = 5;

const BACKGROUNDS = ["#f6f7f4", "#111514"]; // --background, light and dark (globals.css)
const LIGHTNESS = [0.48, 0.67] as const; // OKLCH; readable on both backgrounds
const CHROMA = [0.1, 0.2] as const; // OKLCH; below 0.10 reads gray (owner chose up to 0.20 for room)

type Lab = readonly [number, number, number];
type Rgb = readonly [number, number, number];
export type ColoredCategory = { name: string; color: string };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function linearRgb(hex: string): Rgb {
  const channel = (i: number) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255);
  return [channel(1), channel(3), channel(5)];
}
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function labFromRgb([r, g, b]: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function rgbFromLab([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const labOf = (hex: string) => labFromRgb(linearRgb(hex));
const gap = (x: Lab, y: Lab) => 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
const hexOf = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(toGamma(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** How different two colors look: ΔE in OKLab ×100 (about 2 is barely visible). */
export function colorDistance(a: string, b: string): number {
  return gap(labOf(a), labOf(b));
}

const backgroundLuminance = BACKGROUNDS.map((h) => luminance(linearRgb(h)));

/** Whether a color is one categories can have: muted, not gray, readable on both backgrounds. */
export function isCategoryColor(hex: string): boolean {
  const lab = labOf(hex);
  const chroma = Math.hypot(lab[1], lab[2]);
  const y = luminance(linearRgb(hex));
  // A little give, so a candidate still counts after rounding to a hex code.
  return (
    lab[0] >= LIGHTNESS[0] - 0.005 &&
    lab[0] <= LIGHTNESS[1] + 0.005 &&
    chroma >= CHROMA[0] - 0.005 &&
    chroma <= CHROMA[1] + 0.005 &&
    backgroundLuminance.every((bg) => contrast(y, bg) >= 3)
  );
}

let cache: { hex: string; lab: Lab }[] | undefined;
/** Every color a category can get: an OKLCH grid over the allowed band, in sRGB, as hex. */
export function candidateColors(): readonly { hex: string; lab: Lab }[] {
  if (cache) return cache;
  const seen = new Set<string>();
  cache = [];
  for (let L = LIGHTNESS[0]; L <= LIGHTNESS[1] + 1e-9; L += 0.01) {
    for (let C = CHROMA[0]; C <= CHROMA[1] + 1e-9; C += 0.01) {
      for (let hue = 0; hue < 360; hue += 3) {
        const rgb = rgbFromLab([L, C * Math.cos((hue * Math.PI) / 180), C * Math.sin((hue * Math.PI) / 180)]);
        if (rgb.some((c) => c < 0 || c > 1)) continue;
        const hex = hexOf(rgb);
        if (seen.has(hex) || !isCategoryColor(hex)) continue;
        seen.add(hex);
        cache.push({ hex, lab: labOf(hex) });
      }
    }
  }
  return cache;
}

const nearestGap = (lab: Lab, others: readonly Lab[]) => Math.min(Infinity, ...others.map((o) => gap(lab, o)));

/** The least distance a new color must keep from `others`: the rule's minimum, or the best still possible. */
export function requiredDistance(others: readonly string[]): number {
  const labs = others.map(labOf);
  let best = 0;
  for (const c of candidateColors()) {
    best = Math.max(best, nearestGap(c.lab, labs));
    if (best >= MIN_COLOR_DISTANCE) return MIN_COLOR_DISTANCE;
  }
  return best - FALLBACK_SLACK;
}

/**
 * Checks a color for a category against the user's other active categories of
 * the same kind. Too close means it looks like one of them while a more
 * distinct color is still free.
 */
export function checkCategoryColor(
  color: string,
  others: readonly ColoredCategory[],
): { ok: true } | { ok: false; reason: "not_allowed" } | { ok: false; reason: "too_close"; to: ColoredCategory } {
  if (!isCategoryColor(color)) return { ok: false, reason: "not_allowed" };
  const lab = labOf(color);
  let closest: { other: ColoredCategory; distance: number } | undefined;
  for (const other of others) {
    const distance = gap(lab, labOf(other.color));
    if (!closest || distance < closest.distance) closest = { other, distance };
  }
  if (!closest || closest.distance >= requiredDistance(others.map((o) => o.color))) return { ok: true };
  return { ok: false, reason: "too_close", to: closest.other };
}

/**
 * The allowed color closest to `color`, for a category whose color has to
 * change (an existing account's, D-028): it keeps its look as far as it can.
 */
export function nearestAllowedColor(color: string, others: readonly string[]): string {
  const labs = others.map(labOf);
  const need = requiredDistance(others);
  const target = labOf(color);
  let best: { hex: string; distance: number } | undefined;
  for (const c of candidateColors()) {
    if (nearestGap(c.lab, labs) < need) continue;
    const distance = gap(c.lab, target);
    if (!best || distance < best.distance) best = { hex: c.hex, distance };
  }
  // requiredDistance() is what some candidate reaches, so there's always one.
  return best ? best.hex : color;
}

/**
 * Up to `count` colors for a new category, each passing checkCategoryColor
 * against `others`: picked one at a time, at random among the candidates
 * nearly as far as possible from the others and from the suggestions so far,
 * so later categories still find room. Suggestions stay ALTERNATIVE_GAP apart,
 * so when the space is nearly full there are fewer of them, not look-alikes.
 */
export function suggestCategoryColors(others: readonly string[], count: number, random = Math.random): string[] {
  const labs = others.map(labOf);
  const scored = candidateColors().map((c) => ({ ...c, fromOthers: nearestGap(c.lab, labs) }));
  const best = Math.max(...scored.map((c) => c.fromOthers));
  const allowed = scored.filter(
    (c) => c.fromOthers >= (best >= MIN_COLOR_DISTANCE ? MIN_COLOR_DISTANCE : best - FALLBACK_SLACK),
  );
  // Distance to the nearest of the others and the suggestions picked so far.
  const fromAll = allowed.map((c) => c.fromOthers);
  const picked: string[] = [];
  while (picked.length < count && picked.length < allowed.length) {
    const far = Math.max(...fromAll);
    if (picked.length > 0 && far < ALTERNATIVE_GAP) break;
    const pool = allowed.map((_, i) => i).filter((i) => fromAll[i] >= Math.max(far - SUGGESTION_BAND, ALTERNATIVE_GAP));
    if (pool.length === 0) pool.push(fromAll.indexOf(far)); // the first one, when even the best is that close
    const choice = allowed[pool[Math.floor(random() * pool.length)]];
    picked.push(choice.hex);
    allowed.forEach((c, i) => (fromAll[i] = Math.min(fromAll[i], gap(c.lab, choice.lab))));
  }
  return picked;
}
