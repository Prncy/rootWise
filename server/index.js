import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const ISDA_BASE = "https://api.isda-africa.com";
const soilCache = new Map();
const geocodeCache = new Map();
let accessToken = null;
let tokenExpiresAt = 0;
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();

app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map(value => value.trim());
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "rootwise-api" }));

async function getIsdaToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  const username = process.env.ISDA_USERNAME;
  const password = process.env.ISDA_PASSWORD;
  if (!username || !password) {
    const error = new Error("Soil data is not configured on the server yet.");
    error.status = 503;
    throw error;
  }
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${ISDA_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body
  });
  if (!response.ok) {
    const error = new Error("The soil data provider could not authenticate this service.");
    error.status = 502;
    throw error;
  }
  const payload = await response.json();
  if (!payload.access_token) {
    const error = new Error("The soil data provider returned no access token.");
    error.status = 502;
    throw error;
  }
  accessToken = payload.access_token;
  // iSDAsoil documents a 60-minute token lifetime; refresh a little early.
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return accessToken;
}

async function fetchProperty(latitude, longitude, property) {
  const token = await getIsdaToken();
  const url = new URL(`${ISDA_BASE}/isdasoil/v2/soilproperty`);
  url.search = new URLSearchParams({
    lat: String(latitude), lon: String(longitude), property, depth: "0-20"
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) {
    const error = new Error(response.status === 404
      ? "No soil prediction is available at these coordinates."
      : "The soil data provider could not return this property.");
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  const payload = await response.json();
  const entry = payload?.property?.[property]?.[0];
  const raw = entry?.value?.value;
  if (!Number.isFinite(Number(raw))) return null;
  const uncertainty = entry?.uncertainty?.[1];
  return {
    value: Number(raw),
    lowerBound: Number.isFinite(Number(uncertainty?.lower_bound)) ? Number(uncertainty.lower_bound) : null,
    upperBound: Number.isFinite(Number(uncertainty?.upper_bound)) ? Number(uncertainty.upper_bound) : null
  };
}

app.get("/api/soil", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }

  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = soilCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.data, cached: true });

  try {
    // Keep the first version focused on the most useful topsoil indicators.
    const properties = ["ph", "carbon_organic", "sand", "silt", "clay"];
    const results = await Promise.allSettled(
      properties.map(property => fetchProperty(latitude, longitude, property))
    );
    const soil = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) soil[properties[index]] = result.value;
    });
    if (!Object.keys(soil).length) {
      return res.status(404).json({ error: "No soil predictions were returned for this location." });
    }
    const data = {
      source: "iSDAsoil",
      depth: "0–20 cm",
      resolution: "Approximately 30 m",
      retrievedAt: new Date().toISOString(),
      properties: soil,
      notes: "Modelled soil estimates, not a laboratory test. Values include uncertainty where supplied by the provider."
    };
    soilCache.set(cacheKey, { data, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return res.json(data);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || "Soil lookup failed." });
  }
});

// Nominatim asks public clients to identify themselves and stay at or below
// one request per second. Cache repeated searches and serialize upstream calls.
app.get("/api/geocode", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2 || query.length > 120) {
    return res.status(400).json({ error: "Enter a place name between 2 and 120 characters." });
  }
  const key = query.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

  geocodeQueue = geocodeQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RootWise/1.0 (agriculture decision-support prototype)" }
    });
    if (!response.ok) throw new Error("Place search is temporarily unavailable. Try the map or coordinates.");
    const data = await response.json();
    geocodeCache.set(key, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return data;
  });
  try {
    return res.json(await geocodeQueue);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`RootWise API listening on port ${PORT}`));
