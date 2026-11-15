import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRainfallHistory } from "./rainfallHistory.js";

test("summarizes annual rainfall and the longest consecutive dry spell", () => {
  const dates = [];
  const rain = [];
  for (let day = new Date("2024-01-01T00:00:00Z"); day <= new Date("2024-12-31T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    dates.push(date);
    const dayNumber = dates.length;
    rain.push(dayNumber >= 10 && dayNumber <= 14 ? 0 : 2);
  }

  const result = summarizeRainfallHistory({ daily: { time: dates, precipitation_sum: rain } });
  assert.equal(result.years.length, 1);
  assert.equal(result.years[0].year, "2024");
  assert.equal(result.years[0].rainfallMm, 722);
  assert.equal(result.years[0].longestDrySpellDays, 5);
  assert.equal(result.years[0].status, "Near baseline");
});

test("ignores years with insufficient rainfall coverage", () => {
  const dates = [];
  const rain = [];
  for (let day = new Date("2023-01-01T00:00:00Z"); day <= new Date("2023-12-31T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
    rain.push(1);
  }
  for (let day = new Date("2024-01-01T00:00:00Z"); day <= new Date("2024-12-31T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
    rain.push(dates.length % 2 ? null : 1);
  }

  const result = summarizeRainfallHistory({ daily: { time: dates, precipitation_sum: rain } });
  assert.deepEqual(result.years.map(year => year.year), ["2023"]);
});

test("rejects missing daily rainfall data", () => {
  assert.throws(() => summarizeRainfallHistory({ daily: { time: [] } }), /No daily rainfall history/);
});
