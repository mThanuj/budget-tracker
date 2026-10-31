import { describe, expect, it } from "vitest";
import {
  candidateColors,
  checkCategoryColor,
  colorDistance,
  isCategoryColor,
  MIN_COLOR_DISTANCE,
  requiredDistance,
  suggestCategoryColors,
} from "@/lib/category-colors";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

/** A repeatable random source, so a failure can be replayed. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
const minPairDistance = (colors: readonly string[]) => {
  let min = Infinity;
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++) min = Math.min(min, colorDistance(colors[i], colors[j]));
  return min;
};
const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("how different two colors look", () => {
  it("is ΔE in OKLab ×100, as the dataviz validator measures it", () => {
    // The validator's worst pair among the old swatches: violet and indigo, ΔE 5.6.
    expect(colorDistance("#8a64b8", "#6b6fc9")).toBeCloseTo(5.6, 1);
    expect(colorDistance("#3f9b74", "#3f9b74")).toBe(0);
    // One step of one channel is a different hex code but looks the same.
    expect(colorDistance("#3f9b74", "#3f9b75")).toBeLessThan(1);
  });
});

describe("the colors a category can have", () => {
  it("are muted, never gray, and keep 3:1 as an icon on both backgrounds", () => {
    const all = candidateColors();
    expect(all.length).toBeGreaterThan(5_000);
    for (const { hex } of all) {
      expect(isCategoryColor(hex), hex).toBe(true);
      expect(contrast(hex, "#f6f7f4"), hex).toBeGreaterThanOrEqual(3);
      expect(contrast(hex, "#111514"), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it("leave out grays, and colors too light or too dark for one of the backgrounds", () => {
    for (const hex of ["#808080", "#64748b", "#ffffff", "#000000", "#f6f7f4", "#111514", "#ffd400", "#1a1a6e"]) {
      expect(isCategoryColor(hex), hex).toBe(false);
    }
  });
});

describe("the default categories", () => {
  for (const kind of ["expense", "income"] as const) {
    it(`look different from each other (${kind})`, () => {
      const colors = DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.color);
      for (const c of colors) expect(isCategoryColor(c), c).toBe(true);
      expect(minPairDistance(colors)).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
    });
  }
});

describe("checking a category's color", () => {
  const others = [
    { name: "Groceries", color: "#399e78" },
    { name: "Health", color: "#a24b39" },
  ];

  it("accepts a color that looks different from every other one", () => {
    expect(checkCategoryColor("#0e6ee6", others)).toEqual({ ok: true });
    expect(checkCategoryColor("#399e78", [])).toEqual({ ok: true }); // nothing to look like
  });

  it("refuses one that looks like another, even with a different hex code, and says which", () => {
    expect(checkCategoryColor("#3a9f79", others)).toEqual({ ok: false, reason: "too_close", to: others[0] });
    expect(checkCategoryColor("#399e78", others)).toMatchObject({ ok: false, to: { name: "Groceries" } });
  });

  it("refuses colors categories can't have", () => {
    expect(checkCategoryColor("#ffffff", others)).toEqual({ ok: false, reason: "not_allowed" });
    expect(checkCategoryColor("#64748b", [])).toEqual({ ok: false, reason: "not_allowed" }); // reads gray
  });
});

describe("suggested colors", () => {
  it("are random, look different from the others, and aren't look-alikes of each other", () => {
    const others = DEFAULT_CATEGORIES.filter((c) => c.kind === "income").map((c) => c.color);
    const a = suggestCategoryColors(others, 10, seeded(1));
    const b = suggestCategoryColors(others, 10, seeded(2));
    expect(a).toHaveLength(10);
    expect(a).not.toEqual(b);
    // Alternatives (one gets used): ΔE 5 apart, the gap the module keeps between them.
    expect(minPairDistance(a)).toBeGreaterThanOrEqual(5);
    for (const c of a) {
      expect(isCategoryColor(c)).toBe(true);
      expect(Math.min(...others.map((o) => colorDistance(c, o))), c).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
    }
  });

  it("are fewer, never look-alikes, when the defaults leave little room", () => {
    const expense = DEFAULT_CATEGORIES.filter((c) => c.kind === "expense");
    const suggestions = suggestCategoryColors(
      expense.map((c) => c.color),
      10,
      seeded(3),
    );
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    if (suggestions.length > 1) expect(minPairDistance(suggestions)).toBeGreaterThanOrEqual(5);
    for (const c of suggestions) expect(checkCategoryColor(c, expense), c).toEqual({ ok: true });
  });

  it("always pass the check, also once no color is fully distinct any more", () => {
    // Keep adding the first suggestion, as a user adding category after category would.
    const taken: string[] = [];
    const rng = seeded(7);
    for (let n = 0; n < 40; n++) {
      const [next] = suggestCategoryColors(taken, 3, rng);
      const others = taken.map((color, i) => ({ name: `Category ${i}`, color }));
      expect(checkCategoryColor(next, others), `category ${n + 1}`).toEqual({ ok: true });
      taken.push(next);
    }
    // By then the rule has relaxed to the best still possible, but it's never zero.
    expect(requiredDistance(taken)).toBeLessThan(MIN_COLOR_DISTANCE);
    expect(requiredDistance(taken)).toBeGreaterThan(2);
  });
});
