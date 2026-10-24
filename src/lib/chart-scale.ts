/** Round axis ticks (0, 10K, 20K, …) that cover `max`, using 1/2/2.5/5 × 10ⁿ steps. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // The nice step closest to the ideal (on a log scale) keeps headroom small.
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .reduce((best, s) => (Math.abs(Math.log(s / rough)) < Math.abs(Math.log(best / rough)) ? s : best));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step / 2; i++) ticks.push(Math.round(i * step));
  return ticks;
}
