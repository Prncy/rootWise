import test from "node:test";
import assert from "node:assert/strict";
import { calculateBudget, projectSeasons, scoreCrop } from "../src/lib/agronomy.js";

test("budget calculates production, revenue, costs and gross margin", () => {
  const result = calculateBudget({
    area: 2,
    yieldPerHa: 2500,
    pricePerKg: 4,
    costPerHa: 3000
  });
  assert.deepEqual(result, {
    production: 5000,
    revenue: 20000,
    costs: 6000,
    grossMargin: 14000
  });
});

test("budget rejects zero or negative required inputs", () => {
  assert.equal(calculateBudget({ area: 0, yieldPerHa: 1, pricePerKg: 1, costPerHa: 0 }), null);
  assert.equal(calculateBudget({ area: 1, yieldPerHa: -1, pricePerKg: 1, costPerHa: 0 }), null);
  assert.equal(calculateBudget({ area: 1, yieldPerHa: 1, pricePerKg: 1, costPerHa: -1 }), null);
});

test("crop scoring ignores invalid pH rather than treating it as a real soil test", () => {
  const crop = { name: "Test crop", ph: [5, 7], temp: [18, 30], rain: [500, 1000] };
  const result = scoreCrop(crop, { ph: "12" }, { meanTemp: 24, annualRain: 700 });
  assert.equal(result.dataCoverage, 2);
  assert.equal(result.score, 100);
});

test("season planner safely ignores invalid organic matter values", () => {
  const rotation = [{ name: "Maize", group: "cereal", score: 80 }];
  const result = projectSeasons(rotation, { organicMatter: "not-a-number", history: [] });
  assert.equal(result.length, 6);
  assert.equal(result[0].fertility, 53);
});
