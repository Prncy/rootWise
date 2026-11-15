const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function getSoil(latitude, longitude) {
  const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
  const response = await fetch(`${API_BASE}/api/soil?${params}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Soil data is currently unavailable.");
  return payload;
}

export async function searchPlace(query) {
  const response = await fetch(`${API_BASE}/api/geocode?${new URLSearchParams({ q: query })}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Place search failed. Try the map or coordinates.");
  return payload;
}
