/** Nearest-rank P95; failed finite observations remain in every statistic. */
export function summarizeArrival(samples) {
  const values = samples
    .map((s) => s.elapsedMs)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const n = values.length;
  return {
    samples: samples.length,
    measured: n,
    passed: samples.filter((s) => s.passed === true).length,
    failed: samples.filter((s) => s.passed !== true).length,
    meanMs: n ? values.reduce((a, b) => a + b, 0) / n : null,
    medianMs: n
      ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2
      : null,
    p95Ms: n ? values[Math.ceil(n * 0.95) - 1] : null,
    maxMs: n ? values[n - 1] : null,
  };
}

export function arrivalRepeatCount(value) {
  if (!/^\d+$/.test(String(value)))
    throw new Error('--arrival-repeats must be an integer between 1 and 100');
  const count = Number(value);
  if (count < 1 || count > 100)
    throw new Error('--arrival-repeats must be an integer between 1 and 100');
  return count;
}
