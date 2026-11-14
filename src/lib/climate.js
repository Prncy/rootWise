const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

export async function getClimate(latitude, longitude) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const date = d => d.toISOString().slice(0, 10);
  const url = new URL(ARCHIVE);
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date(start),
    end_date: date(end),
    daily: "precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min",
    timezone: "auto"
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error("Climate service returned " + response.status);
  const payload = await response.json();
  const daily = payload.daily;
  if (!daily?.time?.length) throw new Error("No daily climate observations were returned for this location.");

  const years = new Set(daily.time.map(d => d.slice(0, 4)));
  const rainValues = (daily.precipitation_sum || []).filter(Number.isFinite);
  const tempValues = (daily.temperature_2m_mean || []).filter(Number.isFinite);
  const maxValues = (daily.temperature_2m_max || []).filter(Number.isFinite);
  const minValues = (daily.temperature_2m_min || []).filter(Number.isFinite);
  const totalRain = rainValues.reduce((a, b) => a + b, 0);
  const monthlyRain = Array(12).fill(0);
  const monthlyDays = Array(12).fill(0);
  daily.time.forEach((day, i) => {
    const month = Number(day.slice(5, 7)) - 1;
    const value = daily.precipitation_sum?.[i];
    if (Number.isFinite(value)) {
      monthlyRain[month] += value;
      monthlyDays[month] += 1;
    }
  });
  const divisor = Math.max(1, years.size);
  return {
    years: years.size,
    start: daily.time[0],
    end: daily.time[daily.time.length - 1],
    annualRain: totalRain / divisor,
    meanTemp: average(tempValues),
    meanMax: average(maxValues),
    meanMin: average(minValues),
    monthlyRain: monthlyRain.map((value, i) => monthlyDays[i] ? value / divisor : 0),
    source: "Open-Meteo Historical Weather API"
  };
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export async function searchPlace(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Place search failed. Try entering coordinates instead.");
  return response.json();
}