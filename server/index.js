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
let tokenRequest = null;
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
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
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
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    return accessToken;
  })();
  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}
