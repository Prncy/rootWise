import { useMemo, useState } from "react";
import MapPicker from "./components/MapPicker.jsx";
import { CROPS, GROUP_LABELS } from "./data/crops.js";
import { getClimate, searchPlace, validateCoordinates } from "./lib/climate.js";
import { getRainfallHistory } from "./lib/rainfallHistory.js";
import { getSoil } from "./lib/api.js";
import { buildRotations, calculateBudget, projectSeasons, rankCrops } from "./lib/agronomy.js";

const initialFarm = {
  place: "", latitude: "", longitude: "", area: "1", areaUnit: "ha",
  ph: "", texture: "Unknown", organicMatter: "", history: ["", "", ""],
  currency: "USD", pricePerKg: "", yieldPerHa: "", costPerHa: ""
};
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export default function App() {
  const [farm, setFarm] = useState(() => {
    try { return { ...initialFarm, ...JSON.parse(localStorage.getItem("rootwise-farm") || "{}") }; }
    catch { return initialFarm; }
  });
  const [climate, setClimate] = useState(null);
  const [soil, setSoil] = useState(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState("Choose a farm location to begin.");
  const [theme, setTheme] = useState("light");
  const [showIntro, setShowIntro] = useState(true);
  const [scenario, setScenario] = useState("Average");
  const [rainfallHistory, setRainfallHistory] = useState(null);
  const [rainfallHistoryLoading, setRainfallHistoryLoading] = useState(false);
  const [rainfallHistoryError, setRainfallHistoryError] = useState("");
  const [activityLog, setActivityLog] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("rootwise-activity-log") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  });
  const [activityDraft, setActivityDraft] = useState({
    date: new Date().toISOString().slice(0, 10), type: "Planting", crop: "", notes: ""
  });

  const analysisFarm = useMemo(() => ({ ...farm, ph: farm.ph || (soil?.properties?.ph?.value != null ? String(soil.properties.ph.value) : "") }), [farm, soil]);
  const ranked = useMemo(() => rankCrops(analysisFarm, climate), [analysisFarm, climate]);
  const rotations = useMemo(() => buildRotations(ranked, farm.history), [ranked, farm.history]);
  const scenarioClimate = useMemo(() => {
    if (!climate) return null;
    const factor = scenario === "Wetter" ? 1.2 : scenario === "Drier" ? 0.8 : 1;
    return { ...climate, annualRain: climate.annualRain * factor };
  }, [climate, scenario]);
  const scenarioRanked = useMemo(() => rankCrops(analysisFarm, scenarioClimate), [analysisFarm, scenarioClimate]);
  const scenarioRotations = useMemo(() => buildRotations(scenarioRanked, farm.history), [scenarioRanked, farm.history]);
  const projection = useMemo(() => projectSeasons(scenarioRotations, analysisFarm), [scenarioRotations, analysisFarm]);
  const budget = useMemo(() => calculateBudget({
    area: farm.areaUnit === "acres" ? Number(farm.area) * 0.404686 : farm.area,
    yieldPerHa: farm.yieldPerHa, pricePerKg: farm.pricePerKg, costPerHa: farm.costPerHa
  }), [farm]);

  function update(key, value) {
    setFarm(current => {
      const next = { ...current, [key]: value };
      try { localStorage.setItem("rootwise-farm", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function updateHistory(index, value) {
    const history = [...farm.history];
    history[index] = value;
    update("history", history);
  }

  async function chooseLocation(latitude, longitude, label) {
    if (!validateCoordinates(latitude, longitude)) {
      setError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      setNotice("Location was not analysed. Check the coordinates and try again.");
      return;
    }
    latitude = Number(latitude);
    longitude = Number(longitude);
    setBusy(true); setError(""); setNotice("Loading recent climate observations…");
    update("latitude", String(latitude)); update("longitude", String(longitude));
    if (label) update("place", label);
    setClimate(null); setSoil(null); setSoilError(""); setSoilLoading(true);
    setRainfallHistory(null); setRainfallHistoryError(""); setRainfallHistoryLoading(true);
    const rainfallRequest = getRainfallHistory(latitude, longitude)
      .then(result => setRainfallHistory(result))
      .catch(err => setRainfallHistoryError(err.message || "Historical rainfall data is unavailable."))
      .finally(() => setRainfallHistoryLoading(false));
    const soilRequest = getSoil(latitude, longitude)
      .then(result => setSoil(result))
      .catch(err => setSoilError(err.message || "Estimated soil data is unavailable for this location."))
      .finally(() => setSoilLoading(false));
    try {
      const result = await getClimate(Number(latitude), Number(longitude));
      setClimate(result);
      setNotice("Climate history loaded. Available soil estimates are shown below.");
      setActiveTab("overview");
    } catch (err) {
      setError(err.message || "Could not load climate data.");
      setNotice("Location saved, but climate data is currently unavailable.");
    } finally {
      setBusy(false);
      void soilRequest;
      void rainfallRequest;
    }
  }

  async function findPlaces(event) {
    event.preventDefault();
    if (!placeQuery.trim()) return;
    setBusy(true); setError("");
    try {
      const results = await searchPlace(placeQuery.trim());
      setPlaces(results);
      if (!results.length) setError("No matching place found. Try a nearby town or coordinates.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function useGPS() {
    if (!navigator.geolocation) { setError("Location services are not supported by this browser."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      position => chooseLocation(position.coords.latitude, position.coords.longitude, "Current location"),
      () => { setBusy(false); setError("Could not access your location. Search for a place instead."); },
      { enableHighAccuracy: false, timeout: 12000 }
    );
  }

  function addActivity(event) {
    event.preventDefault();
    if (!activityDraft.date || !activityDraft.type) return;
    const entry = { ...activityDraft, id: Date.now() };
    setActivityLog(current => {
      const next = [entry, ...current].slice(0, 100);
      try { localStorage.setItem("rootwise-activity-log", JSON.stringify(next)); } catch {}
      return next;
    });
    setActivityDraft({ date: new Date().toISOString().slice(0, 10), type: "Planting", crop: "", notes: "" });
  }

  function removeActivity(id) {
    setActivityLog(current => {
      const next = current.filter(item => item.id !== id);
      try { localStorage.setItem("rootwise-activity-log", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function resetFarm() {
    setFarm(initialFarm); setClimate(null); setSoil(null); setSoilError(""); setPlaces([]); setError("");
    try { localStorage.removeItem("rootwise-farm"); } catch {}
    setNotice("Farm details cleared from this device.");
  }

  const tabs = [
    ["overview", "Overview"], ["crops", "Crop explorer"], ["rotation", "Rotation planner"],
    ["projection", "Season planner"], ["farm", "My farm"], ["log", "Field log"]
  ];

  return <div className={theme === "dark" ? "app dark" : "app"}>
    {showIntro && <IntroScreen onContinue={() => setShowIntro(false)} />}
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setActiveTab("overview"); }}>
        <span className="brand-mark">r</span><span>rootwise<small>GROW WITH BETTER INFORMATION</small></span>
      </a>
      <div className="top-actions">
        <span className="global-label"><span className="live-dot" /> Global agriculture</span>
        <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </header>

    <main className="shell">
      <section className="welcome">
        <div><p className="eyebrow">FIELD INTELLIGENCE · YOUR FARM, YOUR DECISIONS</p>
          <h1>Better decisions<br /><em>start beneath the surface.</em></h1>
          <p className="welcome-copy">Understand local growing conditions, compare crop options and plan a more resilient rotation.</p>
        </div>
        <div className="welcome-art" aria-hidden="true"><span>✳</span><i>🌱</i><b>SOIL · CLIMATE · CROPS</b></div>
      </section>

      <section className="location-panel panel">
        <div className="section-heading"><div><p className="eyebrow">01 / YOUR LOCATION</p><h2>Where are you farming?</h2></div><span className="data-chip">Location-based analysis</span></div>
        <form className="search-row" onSubmit={findPlaces}>
          <input value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="Search a town, region or country…" aria-label="Search a place" />
          <button className="button primary" disabled={busy}>Search places</button>
          <button type="button" className="button secondary" onClick={useGPS} disabled={busy}>◎ Use GPS</button>
        </form>
        {places.length > 0 && <div className="place-results">{places.map((place, index) =>
          <button key={place.place_id || index} onClick={() => { setPlaces([]); chooseLocation(place.lat, place.lon, place.display_name); }}>
            <b>{place.name || place.display_name.split(",")[0]}</b><span>{place.display_name}</span>
          </button>)}</div>}
        <div className="map-heading"><div><b>Pinpoint your field</b><span>Search above or click the map to choose a location.</span></div><span className="map-hint">OpenStreetMap</span></div>
        <MapPicker latitude={farm.latitude} longitude={farm.longitude} onLocationPick={(lat, lon) => { update("latitude", String(lat)); update("longitude", String(lon)); setNotice("Map location selected. Analyse the coordinates to load climate data."); setError(""); }} />
        <div className="coordinate-row">
          <label>Latitude<input value={farm.latitude} onChange={e => update("latitude", e.target.value)} placeholder="e.g. -15.39" inputMode="decimal" /></label>
          <label>Longitude<input value={farm.longitude} onChange={e => update("longitude", e.target.value)} placeholder="e.g. 28.32" inputMode="decimal" /></label>
          <button className="button secondary coordinate-button" disabled={busy || farm.latitude === "" || farm.longitude === ""} onClick={() => chooseLocation(farm.latitude, farm.longitude, farm.place || "Selected coordinates")}>Analyse coordinates</button>
        </div>
        {farm.place && <p className="selected-place">⌖ Selected: {farm.place}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {busy && <p className="status-message"><span className="spinner" /> {notice}</p>}
        {!busy && <p className="status-message">{notice}</p>}
      </section>

      <nav className="tabs" aria-label="Main navigation">{tabs.map(([id, label]) =>
        <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>

      {activeTab === "overview" && <section className="content-grid">
        <div className="main-column">
          <div className="section-heading"><div><p className="eyebrow">02 / FIELD CONDITIONS</p><h2>Your growing conditions</h2></div></div>
          {climate ? <div className="metrics-grid">
            <Metric label="Average annual rainfall" value={number(climate.annualRain)} unit="mm" note={"Average across " + climate.years + " years"} />
            <Metric label="Mean temperature" value={number(climate.meanTemp)} unit="°C" note="Daily mean, period average" />
            <Metric label="Mean daily high" value={number(climate.meanMax)} unit="°C" note="Daily maximum average" />
            <Metric label="Mean daily low" value={number(climate.meanMin)} unit="°C" note="Daily minimum average" />
          </div> : <div className="empty-state"><span>☼</span><h3>Climate information appears here</h3><p>Choose a location above to retrieve recent historical climate observations.</p></div>}
          <SoilSummary soil={soil} loading={soilLoading} error={soilError} />
          {climate && <div className="panel chart-panel"><div className="section-heading"><div><h3>Rainfall pattern</h3><p className="muted">Average monthly rainfall · millimetres</p></div><span className="data-chip">Historical</span></div><div className="rain-chart">{climate.monthlyRain.map((value, index) =>
            <div className="rain-column" key={index}><span>{Math.round(value)}</span><i style={{ height: Math.max(3, value / Math.max(...climate.monthlyRain, 1) * 100) + "%" }} /><small>{new Date(2000, index, 1).toLocaleString("en", { month: "short" })}</small></div>)}</div></div>}
          <RainfallHistoryCard data={rainfallHistory} loading={rainfallHistoryLoading} error={rainfallHistoryError} />
          <div className="panel"><div className="section-heading"><div><p className="eyebrow">03 / CROP MATCH</p><h2>Top crop matches</h2></div><button className="text-button" onClick={() => setActiveTab("crops")}>Explore all crops ↗</button></div>
            {ranked.slice(0, 3).map(crop => <CropRow key={crop.name} crop={crop} />)}
            {!climate && <p className="muted small">Add a location and climate data to calculate a location-specific screening score.</p>}
          </div>
        </div>
        <aside className="side-column">
          <div className="panel dark-panel"><p className="eyebrow">YOUR FARM SNAPSHOT</p><h3>{farm.place || "No location selected"}</h3><p>{climate ? "Recent climate history is available for this location." : "Select a location to begin building your farm profile."}</p><div className="snapshot-line"><span>Soil pH</span><b>{farm.ph || (soil?.properties?.ph?.value != null ? `${number(soil.properties.ph.value)} (estimated)` : "Not entered")}</b></div><div className="snapshot-line"><span>Soil texture</span><b>{farm.texture}</b></div><div className="snapshot-line"><span>Farm area</span><b>{farm.area || "—"} {farm.areaUnit}</b></div><button className="button light-button" onClick={() => setActiveTab("farm")}>Update farm profile</button></div>
          <div className="panel insight-panel"><span className="insight-icon">✳</span><h3>One important distinction</h3><p>Climate data describes the wider area around your location. It does not replace a field-level soil test or advice from a local agronomist.</p></div>
          <div className="source-note"><b>Climate source</b><br />{climate ? climate.source + " · " + climate.start + " to " + climate.end : "No climate source loaded yet."}<br /><a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noreferrer">Data documentation ↗</a></div>
        </aside>
      </section>}

      {activeTab === "crops" && <section className="panel page-panel"><div className="section-heading"><div><p className="eyebrow">CROP KNOWLEDGE</p><h2>Explore crop suitability</h2><p className="muted">Compare broad crop requirements with your location and soil information.</p></div></div>
        <div className="notice"><b>How to read these scores:</b> they are screening indicators, not probability of success or yield forecasts. Scores are based only on available inputs; missing factors are not treated as ideal conditions. Soil texture is saved in your profile but is not yet part of this score.</div>
        <div className="crop-grid">{ranked.map(crop => <article className="crop-card" key={crop.name}><div className="crop-card-top"><span className="crop-icon">{crop.group === "legume" ? "◉" : crop.group === "cereal" ? "✳" : "❋"}</span><span className="group-pill">{GROUP_LABELS[crop.group]}</span></div><h3>{crop.name}</h3><p>{crop.note}</p><RecommendationDetails crop={crop} /><div className="crop-ranges"><span>pH <b>{crop.ph[0]}–{crop.ph[1]}</b></span><span>Temp <b>{crop.temp[0]}–{crop.temp[1]}°C</b></span><span>Rain <b>{crop.rain[0]}–{crop.rain[1]}mm</b></span></div><Score score={crop.score} /><p className="muted tiny">{crop.dataCoverage} of 3 screening factors available</p></article>)}</div>
      </section>}

      {activeTab === "rotation" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">PLAN FOR THE SOIL</p><h2>Rotation planner</h2><p className="muted">Use recent crop history to avoid repeating the same crop and include a legume phase where suitable.</p></div></div>
        <div className="panel history-panel"><h3>What have you grown recently?</h3><div className="history-grid">{farm.history.map((value, index) => <label key={index}>{["Last season", "Two seasons ago", "Three seasons ago"][index]}<select value={value} onChange={e => updateHistory(index, e.target.value)}><option value="">Not recorded</option>{CROPS.map(crop => <option key={crop.name}>{crop.name}</option>)}</select></label>)}</div></div>
        {rotations.length ? <div className="rotation-grid">{rotations.map((crop, index) => <article className="panel rotation-card" key={crop.name}><span className="eyebrow">PHASE 0{index + 1}</span><span className="rotation-number">0{index + 1}</span><h3>{crop.name}</h3><Score score={crop.score} /><p>{crop.reason}</p><span className="group-pill">{GROUP_LABELS[crop.group]}</span></article>)}</div> : <div className="empty-state"><h3>Location data needed</h3><p>Analyse a location and enter any available soil information to compare rotation options.</p></div>}
        <div className="notice"><b>Rotation reminder:</b> a legume can contribute nitrogen, but the amount depends on species, inoculation, biomass, residue management and soil conditions. Rotation alone does not guarantee improved fertility or disease control.</div>
      </section>}

      {activeTab === "projection" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">LOOK AHEAD</p><h2>Six-season outlook</h2><p className="muted">Explore how a different rainfall pattern could change your crop choices.</p></div></div>
        <div className="panel scenario-panel"><div className="scenario-heading"><div><b>Test a rainfall scenario</b><p className="muted">These are illustrative stress tests, not weather forecasts.</p></div><span className="data-chip">Rainfall sensitivity</span></div>
          <div className="scenario-options" role="group" aria-label="Rainfall scenario">
            {["Average", "Wetter", "Drier"].map(option => <button key={option} className={scenario === option ? "selected" : ""} onClick={() => setScenario(option)} disabled={!climate}>{option === "Average" ? "Average conditions" : option === "Wetter" ? "Wetter (+20%)" : "Drier (−20%)"}</button>)}
          </div>
          {!climate && <p className="muted small">Analyse a farm location first to activate the scenario comparison.</p>}
        </div>
        {projection.length ? <><div className="panel season-panel"><div className="scenario-summary"><div><span>Scenario</span><b>{scenario}</b></div><div><span>Rainfall input</span><b>{scenario === "Wetter" ? "+20%" : scenario === "Drier" ? "−20%" : "Baseline"}</b></div><div><span>Selected rotation</span><b>{scenarioRotations.length ? scenarioRotations.map(item => item.name).join(" → ") : "Not available"}</b></div></div><div className="season-list">{projection.map(item => <div className="season-item" key={item.season}><span className="season-index">0{item.season}</span><div className="season-details"><b>{item.crop}</b><span>Crop-fit screening: {item.fit ?? "Not available"}/100 · Illustrative soil indicator: {item.fertility}/100</span></div><div className="fertility-meter" role="img" aria-label={"Illustrative soil indicator " + item.fertility + " out of 100"}><i style={{ width: item.fertility + "%" }} /></div><b className="fertility-value">{item.fertility}</b></div>)}</div></div><div className="notice warning"><b>Read this carefully:</b> the crop-fit score is a screening comparison based on broad reference ranges. The soil indicator is a simplified planning aid based on crop groups and farm entries. Neither is a measured soil nutrient balance, yield prediction or guaranteed outcome. The wetter/drier options simply adjust the historical rainfall input by 20%; they do not represent a climate forecast.</div></> : <div className="empty-state"><h3>Build your farm profile first</h3><p>Choose a location and add soil information to create a crop sequence.</p></div>}
        <div className="panel budget-panel"><p className="eyebrow">OPTIONAL FARM ECONOMICS</p><h3>Estimate a simple gross margin</h3><p className="muted">Enter your own expected yield, selling price and production costs. This does not use assumed global prices.</p><div className="budget-fields"><label>Currency<select value={farm.currency} onChange={e => update("currency", e.target.value)}>{["USD","ZMW","INR","BRL","KES","GHS","NGN","EUR","GBP","AUD","CAD"].map(c => <option key={c}>{c}</option>)}</select></label><label>Expected yield (kg/ha)<input type="number" min="0" value={farm.yieldPerHa} onChange={e => update("yieldPerHa", e.target.value)} placeholder="e.g. 2500" /></label><label>Selling price per kg<input type="number" min="0" step="0.01" value={farm.pricePerKg} onChange={e => update("pricePerKg", e.target.value)} placeholder="Your local price" /></label><label>Production cost per ha<input type="number" min="0" value={farm.costPerHa} onChange={e => update("costPerHa", e.target.value)} placeholder="Seeds, labour, inputs…" /></label></div>
          {budget ? <div className="budget-result"><div><span>Estimated gross revenue</span><b>{money(budget.revenue, farm.currency)}</b></div><div><span>Estimated costs</span><b>{money(budget.costs, farm.currency)}</b></div><div className="margin-result"><span>Gross margin</span><b>{money(budget.grossMargin, farm.currency)}</b></div><small>For {farm.areaUnit === "acres" ? number(Number(farm.area) * 0.404686) + " ha" : farm.area + " ha"} · before overheads, finance, taxes and post-harvest losses.</small></div> : <p className="muted small">Complete all four fields to calculate a gross margin.</p>}
        </div>
      </section>}

      {activeTab === "farm" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">YOUR FARM PROFILE</p><h2>Farm information</h2><p className="muted">Your entries are saved in this browser on this device.</p></div></div>
        <div className="panel form-panel"><div className="form-grid"><label>Farm name or location<input value={farm.place} onChange={e => update("place", e.target.value)} placeholder="My farm" /></label><label>Farm area<input type="number" min="0.01" step="any" value={farm.area} onChange={e => update("area", e.target.value)} /></label><label>Area unit<select value={farm.areaUnit} onChange={e => update("areaUnit", e.target.value)}><option>ha</option><option>acres</option></select></label><label>Soil pH<input type="number" min="3" max="10" step="0.1" value={farm.ph} onChange={e => update("ph", e.target.value)} placeholder="From a soil test" /></label><label>Soil texture<select value={farm.texture} onChange={e => update("texture", e.target.value)}><option>Unknown</option><option>Sandy</option><option>Loamy</option><option>Clay</option><option>Silty</option></select></label><label>Organic matter (%)<input type="number" min="0" max="100" step="0.1" value={farm.organicMatter} onChange={e => update("organicMatter", e.target.value)} placeholder="From a soil test" /></label></div>
          <div className="notice"><b>Soil data source:</b> values entered here are your own measurements. Automatic iSDAsoil estimates appear on the Overview when available. Modelled estimates are not a substitute for a laboratory soil test.</div><button className="button danger-outline" onClick={resetFarm}>Clear farm data on this device</button>
        </div>
      </section>}

      {activeTab === "log" && <section className="page-panel">
        <div className="section-heading"><div><p className="eyebrow">FIELD RECORDS</p><h2>Farm activity log</h2>
          <p className="muted">Keep a simple record of work carried out on this farm.</p></div></div>
        <div className="panel activity-panel">
          <form className="activity-form" onSubmit={addActivity}>
            <label>Date<input type="date" value={activityDraft.date} onChange={e => setActivityDraft(current => ({ ...current, date: e.target.value }))} required /></label>
            <label>Activity<select value={activityDraft.type} onChange={e => setActivityDraft(current => ({ ...current, type: e.target.value }))}>
              {["Land preparation", "Planting", "Irrigation", "Fertilising", "Weeding", "Pest or disease monitoring", "Spraying", "Harvesting", "Other"].map(type => <option key={type}>{type}</option>)}
            </select></label>
            <label>Crop (optional)<select value={activityDraft.crop} onChange={e => setActivityDraft(current => ({ ...current, crop: e.target.value }))}>
              <option value="">Not specified</option>{CROPS.map(crop => <option key={crop.name}>{crop.name}</option>)}
            </select></label>
            <label className="activity-notes">Notes (optional)<textarea value={activityDraft.notes} onChange={e => setActivityDraft(current => ({ ...current, notes: e.target.value }))} rows="2" maxLength="500" placeholder="What was done? Add quantities or observations…" /></label>
            <button className="button primary" type="submit">Save activity</button>
          </form>
        </div>
        <div className="panel activity-list-panel">
          <div className="section-heading"><div><h3>Recent activities</h3><p className="muted">{activityLog.length} of up to 100 saved records</p></div></div>
          {activityLog.length ? <div className="activity-list">{activityLog.map(item => <article className="activity-entry" key={item.id}>
            <div className="activity-date">{item.date}</div>
            <div className="activity-entry-main"><b>{item.type}{item.crop ? " · " + item.crop : ""}</b>{item.notes && <p>{item.notes}</p>}</div>
            <button className="text-button activity-remove" onClick={() => removeActivity(item.id)} aria-label={"Delete " + item.type + " activity"}>Remove</button>
          </article>)}</div> : <div className="empty-state"><span>✎</span><h3>No activities recorded yet</h3><p>Add the first field activity above. Your records will appear here.</p></div>}
          <p className="notice">Records are saved only in this browser on this device. They are not synced to a server or shared with other team members. Clearing browser data may remove them.</p>
        </div>
      </section>}

      <footer className="footer"><div className="footer-brand">rootwise<span>🌱</span></div><p>Practical agricultural insight, grounded in data and honest about uncertainty.</p><div><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><a href="https://www.isda-africa.com/isdasoil/" target="_blank" rel="noreferrer">iSDAsoil</a><a href="https://www.fao.org/" target="_blank" rel="noreferrer">FAO</a></div><small>RootWise is a decision-support prototype, not a substitute for local agronomic advice.</small></footer>
    </main>
  </div>;
}

function IntroScreen({ onContinue }) {
  return <section className="intro-screen" aria-label="RootWise welcome animation">
    <div className="intro-art">
      <div className="intro-orbit"><div className="intro-globe"><span className="globe-land land-one" /><span className="globe-land land-two" /><span className="globe-land land-three" /></div></div>
      <svg className="intro-plant" viewBox="0 0 100 110" aria-hidden="true">
        <path className="intro-stem" d="M50 105 C50 78 49 52 50 28" />
        <path className="intro-leaf leaf-left" d="M50 68 C28 67 13 53 12 37 C32 37 47 49 50 68Z" />
        <path className="intro-leaf leaf-right" d="M50 53 C72 52 87 38 88 22 C68 23 53 35 50 53Z" />
        <path className="intro-leaf leaf-top" d="M50 30 C39 18 43 7 50 2 C57 9 61 20 50 30Z" />
      </svg>
    </div>
    <p className="intro-kicker">SOIL · CLIMATE · CROPS</p>
    <h1>RootWise</h1>
    <p className="intro-tagline">Know your soil. Make more informed crop decisions.</p>
    <button className="intro-continue" onClick={onContinue}>Choose your farm location <span>→</span></button>
    <span className="intro-footnote">Practical agricultural insight, grounded in data.</span>
  </section>;
}


function RainfallHistoryCard({ data, loading, error }) {
  return <section className="panel rainfall-history-panel">
    <div className="section-heading"><div><p className="eyebrow">CLIMATE RESILIENCE</p><h3>Rainfall history & dry spells</h3>
      <p className="muted">Year-by-year comparison using historical reanalysis data.</p></div>
      <span className="data-chip">{data ? data.years.length + " years" : loading ? "Loading…" : "Historical"}</span>
    </div>
    {loading && <p className="status-message">Loading up to 10 complete years of daily rainfall data…</p>}
    {!loading && error && <p className="muted small">{error}</p>}
    {!loading && data && <>
      <div className="rainfall-baseline"><span>Average annual rainfall across available years</span><b>{Math.round(data.baselineMm).toLocaleString()} mm</b></div>
      <div className="rainfall-history-head"><span>Year</span><span>Rainfall vs baseline</span><span>Longest dry spell</span></div>
      <div className="rainfall-history-list">{data.years.map(year => <div className="rainfall-history-row" key={year.year}>
        <div className="rainfall-year"><b>{year.year}</b><small>{year.status}</small></div>
        <div className="rainfall-bar-cell"><div className="rainfall-bar"><i style={{ width: Math.max(2, Math.min(150, year.rainfallMm / Math.max(data.baselineMm, 1) * 100)) + "%" }} /></div>
          <b>{Math.round(year.rainfallMm).toLocaleString()} mm</b></div>
        <span className="dry-spell-value">{year.longestDrySpellDays} days</span>
      </div>)}</div>
      <p className="muted tiny">A dry day is defined here as 1 mm of precipitation or less. Dry-spell length is the longest consecutive run within each calendar year. Rainfall totals are compared with this location's average for the displayed years.</p>
      <p className="muted tiny">{data.source}. Reanalysis estimates are not direct rain-gauge measurements; local conditions can differ.</p>
    </>}
    {!loading && !data && !error && <p className="muted small">Choose a location to load historical rainfall and dry-spell information.</p>}
  </section>;
}

function Metric({ label, value, unit, note }) {
  return <article className="metric-card"><span>{label}</span><b>{value}<small>{unit}</small></b><p>{note}</p></article>;
}
function Score({ score }) {
  if (score == null) return <div className="score-wrap"><span className="muted">Insufficient data for score</span></div>;
  return <div className="score-wrap"><div className="score-label"><span>Screening score</span><b>{score}/100</b></div><div className="score-track"><i style={{ width: score + "%" }} /></div></div>;
}
function CropRow({ crop }) {
  return <article className="crop-row"><div className="crop-row-icon">{crop.group === "legume" ? "◉" : "✳"}</div><div className="crop-row-main"><div><b>{crop.name}</b><span className="group-pill">{GROUP_LABELS[crop.group]}</span></div><p>{crop.note}</p><RecommendationDetails crop={crop} compact /></div><div className="crop-row-score">{crop.score == null ? "—" : crop.score + "/100"}</div></article>;
}
function RecommendationDetails({ crop, compact = false }) {
  if (crop.score == null) return <p className="recommendation-muted">Choose a location to compare this crop with local climate conditions.</p>;
  return <div className={compact ? "recommendation-details compact" : "recommendation-details"}>
    {crop.reasons?.length > 0 && <ul>{crop.reasons.slice(0, compact ? 2 : 3).map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {crop.cautions?.length > 0 && <p className="recommendation-caution">Consider: {crop.cautions[0]}</p>}
    {crop.missingFactors?.length > 0 && <p className="recommendation-muted">Not checked: {crop.missingFactors.join(", ")}.</p>}
  </div>;
}
function SoilSummary({ soil, loading, error }) {
  const properties = soil?.properties || {};
  const hasSoil = Object.keys(properties).length > 0;
  const value = key => properties[key]?.value;
  return <section className="panel soil-panel">
    <div className="section-heading">
      <div><p className="eyebrow">SOIL INTELLIGENCE</p><h3>Estimated soil properties</h3>
        <p className="muted">Topsoil estimates for the selected map location</p></div>
      <span className="data-chip">{loading ? "Retrieving…" : hasSoil ? "Estimated data" : "Awaiting data"}</span>
    </div>
    {loading && <p className="status-message">Retrieving soil information for this location…</p>}
    {!loading && hasSoil && <>
      <div className="soil-metrics">
        {properties.ph && <div><span>Soil pH</span><b>{number(value("ph"))}</b></div>}
        {properties.carbon_organic && <div><span>Organic carbon</span><b>{number(value("carbon_organic"))}</b><small>Provider units</small></div>}
        {properties.sand && <div><span>Sand</span><b>{number(value("sand"))}</b><small>Provider units</small></div>}
        {properties.silt && <div><span>Silt</span><b>{number(value("silt"))}</b><small>Provider units</small></div>}
        {properties.clay && <div><span>Clay</span><b>{number(value("clay"))}</b><small>Provider units</small></div>}
      </div>
      <p className="muted tiny">{soil.source} · {soil.depth} · {soil.resolution}. {soil.notes}</p>
      <p className="muted tiny">These are model predictions with uncertainty, not direct measurements from your field. iSDAsoil data is provided under CC BY 4.0.</p>
    </>}
    {!loading && !hasSoil && <p className="muted small">{error || "Soil estimates will appear here when the soil-data service is configured and the location is covered."} You can still enter laboratory soil-test results in My farm.</p>}
    <p className="source-note"><a href="https://www.isda-africa.com/isdasoil/" target="_blank" rel="noreferrer">About iSDAsoil data ↗</a></p>
  </section>;
}
