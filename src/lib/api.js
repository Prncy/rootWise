const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function readResponse(response, fallback) {
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(fallback); }
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

export async function getSoil(latitude, longitude) {
  const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
  const response = await fetch(`${API_BASE}/api/soil?${params}`);
  return readResponse(response, "Soil estimates are currently unavailable. Check the API service.");
}

export async function searchPlace(query) {
  const response = await fetch(`${API_BASE}/api/geocode?${new URLSearchParams({ q: query })}`);
  return readResponse(response, "Place search is currently unavailable. Try the map or coordinates.");
}
