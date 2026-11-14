import { useMemo, useState } from "react";
import { CROPS, GROUP_LABELS } from "./data/crops.js";
import { getClimate, searchPlace } from "./lib/climate.js";
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
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState("Choose a farm location to begin.");
  const [theme, setTheme] = useState("light");

  const ranked = useMemo(() => rankCrops(farm, climate), [farm, climate]);
  const rotations = useMemo(() => buildRotations(ranked, farm.history), [ranked, farm.history]);
  const projection = useMemo(() => projectSeasons(rotations, farm, climate), [rotations, farm, climate]);
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
    setBusy(true); setError(""); setNotice("Loading recent climate observations…");
    update("latitude", String(latitude)); update("longitude", String(longitude));
    if (label) update("place", label);
    setClimate(null);
    try {
      const result = await getClimate(Number(latitude), Number(longitude));
      setClimate(result);
      setNotice("Climate history loaded. Add soil-test values for a more complete comparison.");
      setActiveTab("overview");
    } catch (err) {
      setError(err.message || "Could not load climate data.");
      setNotice("Location saved, but climate data is currently unavailable.");
    } finally { setBusy(false); }
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

  function resetFarm() {
    setFarm(initialFarm); setClimate(null); setPlaces([]); setError("");
    try { localStorage.removeItem("rootwise-farm"); } catch {}
    setNotice("Farm details cleared from this device.");
  }

  const tabs = [
    ["overview", "Overview"], ["crops", "Crop explorer"], ["rotation", "Rotation planner"],
    ["projection", "Season planner"], ["farm", "My farm"]
  ];

  return <div className={theme === "dark" ? "app dark" : "app"}>
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
          {climate && <div className="panel chart-panel"><div className="section-heading"><div><h3>Rainfall pattern</h3><p className="muted">Average monthly rainfall · millimetres</p></div><span className="data-chip">Historical</span></div><div className="rain-chart">{climate.monthlyRain.map((value, index) =>
            <div className="rain-column" key={index}><span>{Math.round(value)}</span><i style={{ height: Math.max(3, value / Math.max(...climate.monthlyRain, 1) * 100) + "%" }} /><small>{new Date(2000, index, 1).toLocaleString("en", { month: "short" })}</small></div>)}</div></div>}
          <div className="panel"><div className="section-heading"><div><p className="eyebrow">03 / CROP MATCH</p><h2>Top crop matches</h2></div><button className="text-button" onClick={() => setActiveTab("crops")}>Explore all crops ↗</button></div>
            {ranked.slice(0, 3).map(crop => <CropRow key={crop.name} crop={crop} />)}
            {!climate && <p className="muted small">Add a location and climate data to calculate a location-specific screening score.</p>}
          </div>
        </div>
        <aside className="side-column">
          <div className="panel dark-panel"><p className="eyebrow">YOUR FARM SNAPSHOT</p><h3>{farm.place || "No location selected"}</h3><p>{climate ? "Recent climate history is available for this location." : "Select a location to begin building your farm profile."}</p><div className="snapshot-line"><span>Soil pH</span><b>{farm.ph || "Not entered"}</b></div><div className="snapshot-line"><span>Soil texture</span><b>{farm.texture}</b></div><div className="snapshot-line"><span>Farm area</span><b>{farm.area || "—"} {farm.areaUnit}</b></div><button className="button light-button" onClick={() => setActiveTab("farm")}>Update farm profile</button></div>
          <div className="panel insight-panel"><span className="insight-icon">✳</span><h3>One important distinction</h3><p>Climate data describes the wider area around your location. It does not replace a field-level soil test or advice from a local agronomist.</p></div>
          <div className="source-note"><b>Climate source</b><br />{climate ? climate.source + " · " + climate.start + " to " + climate.end : "No climate source loaded yet."}<br /><a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noreferrer">Data documentation ↗</a></div>
        </aside>
      </section>}

      {activeTab === "crops" && <section className="panel page-panel"><div className="section-heading"><div><p className="eyebrow">CROP KNOWLEDGE</p><h2>Explore crop suitability</h2><p className="muted">Compare broad crop requirements with your location and soil information.</p></div></div>
        <div className="notice"><b>How to read these scores:</b> they are screening indicators, not probability of success or yield forecasts. Scores are based only on available inputs; missing factors are not treated as ideal conditions.</div>
        <div className="crop-grid">{ranked.map(crop => <article className="crop-card" key={crop.name}><div className="crop-card-top"><span className="crop-icon">{crop.group === "legume" ? "◉" : crop.group === "cereal" ? "✳" : "❋"}</span><span className="group-pill">{GROUP_LABELS[crop.group]}</span></div><h3>{crop.name}</h3><p>{crop.note}</p><div className="crop-ranges"><span>pH <b>{crop.ph[0]}–{crop.ph[1]}</b></span><span>Temp <b>{crop.temp[0]}–{crop.temp[1]}°C</b></span><span>Rain <b>{crop.rain[0]}–{crop.rain[1]}mm</b></span></div><Score score={crop.score} /><p className="muted tiny">{crop.dataCoverage} of 3 screening factors available</p></article>)}</div>
      </section>}

      {activeTab === "rotation" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">PLAN FOR THE SOIL</p><h2>Rotation planner</h2><p className="muted">Use recent crop history to avoid repeating the same crop and include a legume phase where suitable.</p></div></div>
        <div className="panel history-panel"><h3>What have you grown recently?</h3><div className="history-grid">{farm.history.map((value, index) => <label key={index}>{["Last season", "Two seasons ago", "Three seasons ago"][index]}<select value={value} onChange={e => updateHistory(index, e.target.value)}><option value="">Not recorded</option>{CROPS.map(crop => <option key={crop.name}>{crop.name}</option>)}</select></label>)}</div></div>
        {rotations.length ? <div className="rotation-grid">{rotations.map((crop, index) => <article className="panel rotation-card" key={crop.name}><span className="eyebrow">PHASE 0{index + 1}</span><span className="rotation-number">0{index + 1}</span><h3>{crop.name}</h3><Score score={crop.score} /><p>{crop.reason}</p><span className="group-pill">{GROUP_LABELS[crop.group]}</span></article>)}</div> : <div className="empty-state"><h3>Location data needed</h3><p>Analyse a location and enter any available soil information to compare rotation options.</p></div>}
        <div className="notice"><b>Rotation reminder:</b> a legume can contribute nitrogen, but the amount depends on species, inoculation, biomass, residue management and soil conditions. Rotation alone does not guarantee improved fertility or disease control.</div>
      </section>}

      {activeTab === "projection" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">LOOK AHEAD</p><h2>Six-season plan</h2><p className="muted">A planning sequence to help you think beyond the next harvest.</p></div></div>
        {projection.length ? <><div className="panel season-panel"><div className="season-list">{projection.map(item => <div className="season-item" key={item.season}><span className="season-index">0{item.season}</span><div className="season-details"><b>{item.crop}</b><span>Crop-fit screening: {item.fit ?? "Not available"}/100</span></div><div className="fertility-meter"><i style={{ width: item.fertility + "%" }} /></div><b className="fertility-value">{item.fertility}</b></div>)}</div></div><div className="notice warning"><b>Important:</b> the soil indicator is a simplified illustrative index based on crop groups. It is not a measured soil nutrient balance, fertility forecast or predicted yield. Use soil tests and local agronomic guidance for input decisions.</div></> : <div className="empty-state"><h3>Build your farm profile first</h3><p>Choose a location and add soil information to create a crop sequence.</p></div>}
        <div className="panel budget-panel"><p className="eyebrow">OPTIONAL FARM ECONOMICS</p><h3>Estimate a simple gross margin</h3><p className="muted">Enter your own expected yield, selling price and production costs. This does not use assumed global prices.</p><div className="budget-fields"><label>Currency<select value={farm.currency} onChange={e => update("currency", e.target.value)}>{["USD","ZMW","INR","BRL","KES","GHS","NGN","EUR","GBP","AUD","CAD"].map(c => <option key={c}>{c}</option>)}</select></label><label>Expected yield (kg/ha)<input type="number" min="0" value={farm.yieldPerHa} onChange={e => update("yieldPerHa", e.target.value)} placeholder="e.g. 2500" /></label><label>Selling price per kg<input type="number" min="0" step="0.01" value={farm.pricePerKg} onChange={e => update("pricePerKg", e.target.value)} placeholder="Your local price" /></label><label>Production cost per ha<input type="number" min="0" value={farm.costPerHa} onChange={e => update("costPerHa", e.target.value)} placeholder="Seeds, labour, inputs…" /></label></div>
          {budget ? <div className="budget-result"><div><span>Estimated gross revenue</span><b>{money(budget.revenue, farm.currency)}</b></div><div><span>Estimated costs</span><b>{money(budget.costs, farm.currency)}</b></div><div className="margin-result"><span>Gross margin</span><b>{money(budget.grossMargin, farm.currency)}</b></div><small>For {farm.areaUnit === "acres" ? number(Number(farm.area) * 0.404686) + " ha" : farm.area + " ha"} · before overheads, finance, taxes and post-harvest losses.</small></div> : <p className="muted small">Complete all four fields to calculate a gross margin.</p>}
        </div>
      </section>}

      {activeTab === "farm" && <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">YOUR FARM PROFILE</p><h2>Farm information</h2><p className="muted">Your entries are saved in this browser on this device.</p></div></div>
        <div className="panel form-panel"><div className="form-grid"><label>Farm name or location<input value={farm.place} onChange={e => update("place", e.target.value)} placeholder="My farm" /></label><label>Farm area<input type="number" min="0" value={farm.area} onChange={e => update("area", e.target.value)} /></label><label>Area unit<select value={farm.areaUnit} onChange={e => update("areaUnit", e.target.value)}><option>ha</option><option>acres</option></select></label><label>Soil pH<input type="number" min="3" max="10" step="0.1" value={farm.ph} onChange={e => update("ph", e.target.value)} placeholder="From a soil test" /></label><label>Soil texture<select value={farm.texture} onChange={e => update("texture", e.target.value)}><option>Unknown</option><option>Sandy</option><option>Loamy</option><option>Clay</option><option>Silty</option></select></label><label>Organic matter (%)<input type="number" min="0" max="100" step="0.1" value={farm.organicMatter} onChange={e => update("organicMatter", e.target.value)} placeholder="From a soil test" /></label></div>
          <div className="notice"><b>Soil data source:</b> enter values from a laboratory soil test if available. Texture and pH have not been automatically measured by RootWise.</div><button className="button danger-outline" onClick={resetFarm}>Clear farm data on this device</button>
        </div>
      </section>}

      <footer className="footer"><div className="footer-brand">rootwise<span>🌱</span></div><p>Practical agricultural insight, grounded in data and honest about uncertainty.</p><div><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><a href="https://www.fao.org/" target="_blank" rel="noreferrer">FAO</a></div><small>RootWise is a decision-support prototype, not a substitute for local agronomic advice.</small></footer>
    </main>
  </div>;
}

function Metric({ label, value, unit, note }) {
  return <article className="metric-card"><span>{label}</span><b>{value}<small>{unit}</small></b><p>{note}</p></article>;
}
function Score({ score }) {
  if (score == null) return <div className="score-wrap"><span className="muted">Insufficient data for score</span></div>;
  return <div className="score-wrap"><div className="score-label"><span>Screening score</span><b>{score}/100</b></div><div className="score-track"><i style={{ width: score + "%" }} /></div></div>;
}
function CropRow({ crop }) {
  return <article className="crop-row"><div className="crop-row-icon">{crop.group === "legume" ? "◉" : "✳"}</div><div className="crop-row-main"><div><b>{crop.name}</b><span className="group-pill">{GROUP_LABELS[crop.group]}</span></div><p>{crop.note}</p></div><div className="crop-row-score">{crop.score == null ? "—" : crop.score + "/100"}</div></article>;
}