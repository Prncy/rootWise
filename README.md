# RootWise

A global agriculture decision-support MVP. RootWise combines a farm's location, recent climate history and farmer-entered soil information to provide transparent crop-fit comparisons and rotation ideas.

## Stack
- React + Vite
- Plain CSS (no UI framework)
- Open-Meteo Historical Weather API for recent climate observations
- OpenStreetMap Nominatim for place search
- Node's built-in test runner for calculation tests

## Run locally
```bash
npm install
npm run dev
```

## Test and build
```bash
npm test
npm run build
npm run preview
```

## Deploy on Render
Create a **Static Site** connected to this repository:
- Build command: `npm install --no-audit --no-fund && npm run build`
- Publish directory: `dist`

No environment variables are required for the current MVP.

## Data and limitations
- Climate summaries use five complete calendar years of daily Open-Meteo historical data. Years with fewer than 350 valid rainfall observations are excluded. Availability varies by location.
- Soil pH, texture and organic matter are farmer-entered values unless the user has a laboratory result. RootWise does not pretend to have measured soil at a pin.
- Soil texture is recorded in the profile but is not yet included in the crop-fit score.
- Crop-fit scores are screening indicators based on broad crop ranges, not calibrated local agronomic recommendations.
- Rotation and six-season soil indicators are planning aids, not validated yield, fertility or erosion forecasts.
- Market calculations use only prices and costs entered by the farmer. No global price is silently substituted.
- Confirm varieties, planting dates, input rates and crop protection with local agricultural extension services.

## Project structure
```
src/
  data/crops.js       Crop reference ranges and crop groups
  lib/climate.js      Climate data retrieval and summary
  lib/agronomy.js     Crop fit, rotation and planning calculations
  App.jsx             Application screens and state
  main.jsx            React entry point
  styles.css          Responsive interface
tests/
  climate.test.js     Historical climate summary tests
  agronomy.test.js    Crop fit and budget calculation tests
```
