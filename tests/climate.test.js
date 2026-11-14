import test from "node:test";
import assert from "node:assert/strict";
import { summarizeClimate, validateCoordinates } from "../src/lib/climate.js";

function yearDays(year) {
  const days = [];
  const date = new Date(Date.UTC(year, 0, 1));
  while (date.getUTCFullYear() === year) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

test("climate summary averages complete calendar years, not partial years", () => {
  const dates = [...yearDays(2023), ...yearDays(2024), ...yearDays(2025).slice(0, 20)];
  const payload = {
    daily: {
      time: dates,
      precipitation_sum: dates.map(day => day.startsWith("2025") ? 999 : 1),
      temperature_2m_mean: dates.map(() => 20),
      temperature_2m_max: dates.map(() => 25),
      temperature_2m_min: dates.map(() => 15)
    }
  };

  const result = summarizeClimate(payload);
  assert.equal(result.years, 2);
  assert.equal(result.start, "2023-01-01");
  assert.equal(result.end, "2024-12-31");
  assert.equal(result.annualRain, 365.5);
  assert.equal(result.meanTemp, 20);
  assert.equal(result.meanMax, 25);
  assert.equal(result.meanMin, 15);
  assert.equal(result.monthlyRain[0], 31);
});

test("climate summary rejects data without a sufficiently complete year", () => {
  assert.throws(() => summarizeClimate({
    daily: {
      time: ["2025-01-01"],
      precipitation_sum: [0],
      temperature_2m_mean: [20]
    }
  }), /not enough complete daily rainfall observations/i);
});

test("coordinate validation rejects blanks and out-of-range values", () => {
  assert.equal(validateCoordinates("-15.4", "28.3"), true);
  assert.equal(validateCoordinates("", "28.3"), false);
  assert.equal(validateCoordinates("91", "28.3"), false);
  assert.equal(validateCoordinates("-15.4", "181"), false);
  assert.equal(validateCoordinates("north", "28.3"), false);
});
