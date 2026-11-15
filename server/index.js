import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const ISDA_BASE = "https://api.isda-africa.com";
const soilCache = new Map();
const geocodeCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000;
let accessToken = null;
let tokenExpiresAt = 0;
let tokenRequest = null;
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
      .split(",").map(value => value.trim()).filter(Boolean);
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json());
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." }
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "rootwise-api" });
});

async function getIsdaToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const username = process.env.ISDA_USERNAME;
    const password = process.env.ISDA_PASSWORD;
    if (!username || !password) {
      const error = new Error("Soil data is not configured on the server yet.");
      error.status = 503;
      throw error;
    }

    const response = await fetch(`${ISDA_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ username, password }),
      signal: AbortSignal.timeout(15000)
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
    // Provider tokens expire after 60 minutes; refresh a little early.
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    return accessToken;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

function readSoilProperty(payload, propertyName) {
  const item = payload?.property?.[propertyName]?.[0];
  const rawValue = item?.value?.value;
  const value = rawValue === null || rawValue === undefined ? null : Number(rawValue);
  if (!Number.isFinite(value)) return null;

  const uncertainty = item?.uncertainty?.[1] || item?.uncertainty?.[0] || null;
  return {
    value,
    unit: item?.value?.unit || "",
    uncertainty: uncertainty ? {
      lower: uncertainty.lower_bound ?? null,
      upper: uncertainty.upper_bound ?? null
    } : null
  };
}

async function fetchSoilProperty(latitude, longitude, propertyName, token) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    property: propertyName,
    depth: "0-20"
  });
  const response = await fetch(`${ISDA_BASE}/isdasoil/v2/soilproperty?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const error = new Error(`The soil provider could not return ${propertyName} data (HTTP ${response.status}).`);
    error.status = 502;
    throw error;
  }
  return readSoilProperty(await response.json(), propertyName);
}

app.get("/api/soil", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Provide valid latitude and longitude values." });
    }

    const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    const cached = soilCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) return res.json(cached.data);

    const token = await getIsdaToken();
    const names = ["ph", "carbon_organic", "sand", "silt"];
    const results = await Promise.allSettled(
      names.map(name => fetchSoilProperty(lat, lon, name, token))
    );
    const properties = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) properties[names[index]] = result.value;
    });

    if (!Object.keys(properties).length) {
      const error = new Error("No iSDAsoil estimates were available for this coordinate. Try another nearby point.");
      error.status = 404;
      throw error;
    }

    const data = {
      source: "iSDAsoil",
      depth: "0–20 cm",
      resolution: "approximately 30 m",
      retrievedAt: new Date().toISOString(),
      properties,
      notes: "Coverage and available properties vary by location. Estimates are model predictions, not laboratory measurements."
    };
    soilCache.set(cacheKey, { data, savedAt: Date.now() });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

function queueGeocode(task) {
  const result = geocodeQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();
    return task();
  });
  // Keep the queue usable after a failed request.
  geocodeQueue = result.catch(() => {});
  return result;
}

app.get("/api/geocode", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2 || query.length > 120) {
      return res.status(400).json({ error: "Search text must be between 2 and 120 characters." });
    }

    const key = query.toLowerCase();
    const cached = geocodeCache.get(key);
    if (cached && Date.now() - cached.savedAt < GEOCODE_CACHE_TTL) return res.json(cached.data);

    const data = await queueGeocode(async () => {
      const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "5", addressdetails: "1" });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "RootWise/1.0 (agriculture decision-support MVP)"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const error = new Error("The place-search provider is temporarily unavailable.");
        error.status = 502;
        throw error;
      }
      return response.json();
    });

    geocodeCache.set(key, { data, savedAt: Date.now() });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error("[RootWise API]", error.message);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    error: status >= 500 && status !== 503
      ? "The requested data service is temporarily unavailable. Please try again."
      : error.message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RootWise API listening on port ${PORT}`);
});
