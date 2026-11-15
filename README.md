# RootWise

A global agriculture decision-support MVP. RootWise combines a farm's location, recent climate history and available soil information to provide transparent crop-fit comparisons and rotation ideas.

## Stack
- React + Vite frontend with plain CSS
- Node.js + Express API service
- Open-Meteo Historical Weather API for recent climate observations
- iSDAsoil for modelled African soil-property estimates
- OpenStreetMap Nominatim for place search
- Node's built-in test runner for calculation tests

## Run locally

Terminal 1 — frontend:
```bash
npm install
npm run dev
```

Terminal 2 — API:
```bash
cd server
npm install
cp .env.example .env
# Add your iSDAsoil API username and password to server/.env
npm start
```

The Vite development server proxies `/api` requests to `http://localhost:3001`. The frontend does not need an iSDAsoil username or password.

## Test and build
```bash
npm test
npm run build
npm run preview
```

## Deploy on Render

Keep the existing frontend as a **Static Site**:
- Build command: `npm install --no-audit --no-fund && npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-API-SERVICE.onrender.com`

Create a separate **Web Service** for the API:
- Repository: this RootWise repository
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `ISDA_USERNAME`: your iSDAsoil API account email
  - `ISDA_PASSWORD`: your iSDAsoil API password
  - `CLIENT_ORIGIN`: the exact URL of the deployed RootWise frontend (for example, `https://rootwise-global-test.onrender.com`)
  - `NODE_ENV`: `production`

After creating the API service, copy its public URL into the frontend's `VITE_API_BASE_URL` setting and trigger a new frontend deploy. Do not put iSDAsoil credentials in Vite variables or frontend code. The credentials belong only in the API service's private environment variables.

The API exposes:
- `GET /health` — service health check
- `GET /api/soil?lat=...&lon=...` — topsoil estimates at 0–20 cm
- `GET /api/geocode?q=...` — place search through the API

The API caches soil lookups for seven days and geocoding results for one day in memory. The iSDAsoil bearer token is kept server-side and refreshed before its documented 60-minute expiry.

## Data and limitations
- iSDAsoil provides modelled soil-property predictions for African locations. The first integration requests pH, organic carbon and sand/silt/clay fractions at 0–20 cm. Coverage is not guaranteed at every coordinate.
- Modelled soil values are estimates with uncertainty, not laboratory measurements. RootWise currently uses the returned soil pH in crop screening when the farmer has not entered their own pH result. Texture and organic carbon are displayed but are not yet part of the crop-fit score.
- iSDAsoil API credentials are required by the provider, but farmers do not need accounts or login screens. Credentials are stored only in the backend environment.
- Climate summaries use five complete calendar years of daily Open-Meteo historical data. Years with fewer than 350 valid rainfall observations are excluded. Availability varies by location.
- Crop-fit scores are screening indicators based on broad crop ranges, not calibrated local agronomic recommendations or yield forecasts.
- Rotation and six-season soil indicators are planning aids, not validated yield, fertility or erosion forecasts.
- Market calculations use only prices and costs entered by the farmer. No global price is silently substituted.
- Place search uses the public Nominatim service through the backend, with caching and serialized requests to respect its usage policy.
- Confirm varieties, planting dates, input rates and crop protection with local agricultural extension services.

## Project structure
```
server/
  index.js            Express API, iSDAsoil token handling and geocoding proxy
  .env.example        Local environment variable template
src/
  components/         React components, including the map picker
  data/crops.js       Crop reference ranges and crop groups
  lib/api.js          RootWise API client
  lib/climate.js      Climate data retrieval and summary
  lib/agronomy.js     Crop fit, rotation and planning calculations
  App.jsx             Application screens and state
  styles.css          Responsive interface
tests/
  climate.test.js
  agronomy.test.js
```
