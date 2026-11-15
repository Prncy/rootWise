const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
import { summarizeRainfallHistory } from "./rainfallHistory.js";

export function validateCoordinates(latitude, longitude) {
  if (String(latitude).trim() === "" || String(longitude).trim() === "") return false;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export async function getClimate(latitude, longitude) {
  if (!validateCoordinates(latitude, longitude)) {
    throw new Error("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
  }

  // Use five complete calendar years. This avoids dividing partial-year rainfall
  // totals by a full-year count and makes the displayed period reproducible.
  const currentYear = new Date().getUTCFullYear();
  const endYear = currentYear - 1;
  const startYear = endYear - 4;
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;

  const url = new URL(ARCHIVE);
  url.search = new URLSearchParams({
    latitude: String(Number(latitude)),
    longitude: String(Number(longitude)),
    start_date: startDate,
    end_date: endDate,
    daily: "precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min",
    timezone: "auto"
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error("Climate service returned " + response.status);
  return summarizeClimate(await response.json());
}

export async function getClimateBundle(latitude, longitude) {
  if (!validateCoordinates(latitude, longitude)) {
    throw new Error("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
  }

  // One 10-year request supplies both the recent five-year climate summary
  // and the longer rainfall/dry-spell comparison.
  const endYear = new Date().getUTCFullYear() - 1;
  const startYear = endYear - 9;
  const url = new URL(ARCHIVE);
  url.search = new URLSearchParams({
    latitude: String(Number(latitude)),
    longitude: String(Number(longitude)),
    start_date: startYear + "-01-01",
    end_date: endYear + "-12-31",
    daily: "precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min",
    timezone: "auto"
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error("Climate service returned " + response.status);
  const payload = await response.json();
  return {
    climate: summarizeClimate(payload),
    rainfallHistory: summarizeRainfallHistory(payload)
  };
}

export function summarizeClimate(payload) {
  const daily = payload?.daily;
  if (!daily?.time?.length) {
    throw new Error("No daily climate observations were returned for this location.");
  }

  const yearStats = new Map();
  daily.time.forEach((day, index) => {
    const year = day.slice(0, 4);
    if (!yearStats.has(year)) {
      yearStats.set(year, { rain: 0, rainDays: 0, indices: [] });
    }
    const stats = yearStats.get(year);
    stats.indices.push(index);
    const rain = daily.precipitation_sum?.[index];
    if (Number.isFinite(rain)) {
      stats.rain += rain;
      stats.rainDays += 1;
    }
  });

  // Exclude years with too little rainfall coverage instead of treating missing
  // observations as zero. A threshold of 350 days allows a small number of gaps.
  const validYears = [...yearStats.entries()]
    .filter(([, stats]) => stats.rainDays >= 350);

  if (!validYears.length) {
    throw new Error("There are not enough complete daily rainfall observations to calculate an annual average.");
  }

  const climateYears = validYears.slice(-5);
  const validIndices = new Set(climateYears.flatMap(([, stats]) => stats.indices));
  const average = values => {
    const usable = values.filter(Number.isFinite);
    return usable.length
      ? usable.reduce((sum, value) => sum + value, 0) / usable.length
      : null;
  };

  const annualRain = average(climateYears.map(([, stats]) => stats.rain));
  const monthlyByYear = climateYears.map(([, stats]) => {
    const months = Array(12).fill(0);
    daily.time.forEach((day, index) => {
      if (!stats.indices.includes(index)) return;
      const month = Number(day.slice(5, 7)) - 1;
      const rain = daily.precipitation_sum?.[index];
      if (Number.isFinite(rain)) months[month] += rain;
    });
    return months;
  });
  const monthlyRain = Array.from({ length: 12 }, (_, month) =>
    average(monthlyByYear.map(year => year[month]))
  );

  const meanFor = key => average(daily[key]?.filter((_, index) => validIndices.has(index)) || []);

  return {
    years: climateYears.length,
    start: climateYears[0][0] + "-01-01",
    end: climateYears[climateYears.length - 1][0] + "-12-31",
    annualRain,
    meanTemp: meanFor("temperature_2m_mean"),
    meanMax: meanFor("temperature_2m_max"),
    meanMin: meanFor("temperature_2m_min"),
    monthlyRain,
    source: "Open-Meteo Historical Weather API"
  };
}

export { searchPlace } from "./api.js";
