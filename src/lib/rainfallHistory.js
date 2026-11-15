export function summarizeRainfallHistory(payload) {
  const daily = payload?.daily;
  if (!Array.isArray(daily?.time) || !daily.time.length ||
      !Array.isArray(daily.precipitation_sum)) {
    throw new Error("No daily rainfall history was returned for this location.");
  }

  const byYear = new Map();
  daily.time.forEach((date, index) => {
    const year = date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, { total: 0, validDays: 0, dryRun: 0, longestDryRun: 0 });
    const stats = byYear.get(year);
    const rain = daily.precipitation_sum[index];
    if (!Number.isFinite(rain)) {
      stats.dryRun = 0;
      return;
    }
    stats.total += rain;
    stats.validDays += 1;
    if (rain <= 1) {
      stats.dryRun += 1;
      stats.longestDryRun = Math.max(stats.longestDryRun, stats.dryRun);
    } else {
      stats.dryRun = 0;
    }
  });

  const valid = [...byYear.entries()]
    .filter(([, stats]) => stats.validDays >= 350)
    .map(([year, stats]) => ({
      year,
      rainfallMm: stats.total,
      longestDrySpellDays: stats.longestDryRun
    }));

  if (!valid.length) {
    throw new Error("There are not enough complete rainfall records to compare years for this location.");
  }

  const baselineMm = valid.reduce((sum, year) => sum + year.rainfallMm, 0) / valid.length;
  const years = valid.map(year => {
    const anomaly = baselineMm > 0 ? ((year.rainfallMm - baselineMm) / baselineMm) * 100 : 0;
    return {
      ...year,
      anomalyPercent: Math.round(anomaly),
      status: anomaly <= -20 ? "Below baseline" : anomaly >= 20 ? "Above baseline" : "Near baseline"
    };
  });

  return {
    years,
    baselineMm,
    source: "Open-Meteo Historical Weather API",
    note: "Historical reanalysis estimates; not a formal drought index or field-level rain-gauge record."
  };
}
