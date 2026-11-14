import { CROPS } from "../data/crops.js";

function rangeScore(value, [low, high], tolerance) {
  if (!Number.isFinite(value)) return null;
  if (value >= low && value <= high) return 100;
  const distance = value < low ? low - value : value - high;
  return Math.max(0, 100 - (distance / tolerance) * 100);
}

export function scoreCrop(crop, farm, climate) {
  const factors = [];
  if (Number.isFinite(Number(farm.ph)) && farm.ph !== "") factors.push({ name: "Soil pH", score: rangeScore(Number(farm.ph), crop.ph, 2), weight: 0.3 });
  if (climate?.meanTemp != null) factors.push({ name: "Mean temperature", score: rangeScore(climate.meanTemp, crop.temp, 8), weight: 0.3 });
  if (climate?.annualRain != null) factors.push({ name: "Annual rainfall", score: rangeScore(climate.annualRain, crop.rain, 600), weight: 0.4 });

  const availableWeight = factors.reduce((sum, item) => sum + item.weight, 0);
  const score = availableWeight
    ? Math.round(factors.reduce((sum, item) => sum + item.score * item.weight, 0) / availableWeight)
    : null;
  return { ...crop, score, factors, dataCoverage: factors.length };
}

export function rankCrops(farm, climate) {
  return CROPS.map(crop => scoreCrop(crop, farm, climate))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export function buildRotations(ranked, history = []) {
  const top = ranked.filter(crop => crop.score != null).slice(0, 8);
  if (!top.length) return [];
  const chosen = [];
  const last = history.filter(Boolean).slice(0, 3);
  const candidates = [...top];

  while (chosen.length < 3 && candidates.length) {
    candidates.sort((a, b) => rotationValue(b, last, chosen) - rotationValue(a, last, chosen));
    const next = candidates.shift();
    chosen.push(next);
  }

  const first = chosen[0];
  const second = chosen.find(c => c.group === "legume" && c.name !== first.name) || chosen[1];
  const third = chosen.find(c => ![first.name, second?.name].includes(c.name) && c.group !== first.group) || chosen[2];
  return [first, second, third].filter(Boolean).map((crop, index) => ({
    ...crop,
    reason: index === 0
      ? "Starts with a strong climate and soil match."
      : crop.group === "legume"
        ? "Adds a legume phase, which can contribute biologically fixed nitrogen when well managed."
        : "Adds crop diversity and may help interrupt some crop-specific pest and disease cycles."
  }));
}

function rotationValue(crop, history, chosen) {
  let value = crop.score ?? 0;
  if (history[0] === crop.name) value -= 24;
  if (history.slice(0, 2).includes(crop.name)) value -= 10;
  if (chosen.some(item => item.group === crop.group)) value -= 8;
  if (crop.group === "legume" && !chosen.some(item => item.group === "legume")) value += 10;
  return value;
}

export function projectSeasons(rotation, farm, climate) {
  if (!rotation.length) return [];
  const history = farm.history || [];
  let fertility = 55 + Math.min(20, Math.max(0, Number(farm.organicMatter || 0) * 4));
  return Array.from({ length: 6 }, (_, index) => {
    const crop = rotation[index % rotation.length];
    const repeated = history[index] === crop.name;
    const change = crop.group === "legume" ? 3 : crop.group === "cereal" ? -2 : -1;
    fertility = Math.max(10, Math.min(95, fertility + change - (repeated ? 3 : 0)));
    return {
      season: index + 1,
      crop: crop.name,
      fit: crop.score,
      fertility: Math.round(fertility)
    };
  });
}

export function calculateBudget({ area, yieldPerHa, pricePerKg, costPerHa }) {
  const values = [area, yieldPerHa, pricePerKg, costPerHa].map(Number);
  if (values.some(v => !Number.isFinite(v) || v < 0) || !values[0] || !values[1] || !values[2]) return null;
  const production = values[0] * values[1];
  const revenue = production * values[2];
  const costs = values[0] * values[3];
  return { production, revenue, costs, grossMargin: revenue - costs };
}