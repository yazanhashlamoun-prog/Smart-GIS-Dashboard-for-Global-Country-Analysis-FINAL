/************************************************************
     * Smart Travel & Global Country Classifier Dashboard
     * Single-file HTML project:
     * Leaflet + REST Countries + World Bank + Nominatim
     * + Overpass API + Open-Meteo + OpenSky fallback demo
     * + Turf.js + D3 Orthographic 3D Earth.
     ************************************************************/

    const API = {
      REST_COUNTRIES: "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,capital,latlng,population,region,subregion,area,flags,currencies,languages,borders,landlocked,maps,timezones,continents,startOfWeek,status,independent",
      REST_COUNTRIES_ALL: "https://restcountries.com/v3.1/all",
      REST_COUNTRIES_ALPHA: "https://restcountries.com/v3.1/alpha/",
      WORLD_GEOJSON: "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json",
      WORLD_BANK_COUNTRIES: "https://api.worldbank.org/v2/country?format=json&per_page=400",
      WORLD_BANK_GDP: "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&per_page=20000&date=",
      WORLD_BANK_POPULATION: "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&date=",
      WORLD_BANK_AREA: "https://api.worldbank.org/v2/country/all/indicator/AG.SRF.TOTL.K2?format=json&per_page=20000&MRV=1",
      NOMINATIM: "https://nominatim.openstreetmap.org/search",
      OVERPASS: "https://overpass-api.de/api/interpreter",
      OPEN_METEO: "https://api.open-meteo.com/v1/forecast",
      OPENSKY: "https://opensky-network.org/api/states/all"
    };

    const FIXED_RADIUS_KM = 60;

    const CLASS_COLORS = {
      first: "#22c55e",
      second: "#f59e0b",
      third: "#ef4444",
      unknown: "#64748b"
    };

    const METRIC_COLORS = ["#dcfce7", "#86efac", "#22c55e", "#f59e0b", "#ef4444"];
    const THEMATIC_WATER_COLOR = "#0ea5e9";

    let restCountries = [];
    let countryGeoJSON = null;
    let worldBankCountries = [];
    let gdpByIso3 = {};
    let populationByIso3 = {};
    let areaByIso3 = {};
    let restByIso3 = {};
    let restByIso2 = {};
    let wbByIso3 = {};
    let wbByIso2 = {};
    let featureByIso3 = {};
    let countryLayerByIso3 = {};
    let selectedCountryIso3 = null;
    let selectedCountryLayer = null;
    let selectedAnalysisFeature = null;
    let selectedAnalysisName = "";
    let currentFocus = { lat: 31.9, lon: 35.2, name: "Palestine", type: "country" };
    let currentBaseLayer = null;
    let currentBaseType = "osm";
    let thematicWaterLayer = null;
    let globeScaleBoost = 1;
    let globeWasDragged = false;
    let userLocation = null;
    let turfPointMode = false;
    let turfPointCoords = [];
    let turfPointMarkers = [];
    let turfMeasureLayer = null;
    let demoFlightTimer = null;
    let demoFlights = [];
    let globeProjection = null;
    let globePath = null;
    let globeSvg = null;
    let globeCountryPaths = null;
    let globeRotation = [0, -15];

    const el = (id) => document.getElementById(id);
    const loadingBox = el("loadingBox");

    const map = L.map("leafletMap", {
      zoomControl: false,
      preferCanvas: true,
      worldCopyJump: true
    }).setView([20, 0], 2);

    map.createPane("thematicWaterPane");
    map.getPane("thematicWaterPane").style.zIndex = 355;
    map.getPane("thematicWaterPane").style.pointerEvents = "none";
    map.createPane("countryThemePane");
    map.getPane("countryThemePane").style.zIndex = 360;

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const baseLayers = {
      osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }),
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and contributors"
      }),
      dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      })
    };

    currentBaseLayer = baseLayers.osm.addTo(map);
    thematicWaterLayer = L.rectangle([[-90, -180], [90, 180]], {
      pane: "thematicWaterPane",
      stroke: false,
      fillColor: THEMATIC_WATER_COLOR,
      fillOpacity: .88,
      interactive: false
    }).addTo(map);

    const layers = {
      worldClassification: L.layerGroup().addTo(map),
      roads: L.layerGroup().addTo(map),
      cityNames: L.layerGroup().addTo(map),
      tourism: L.layerGroup().addTo(map),
      flights: L.layerGroup().addTo(map),
      searchResult: L.layerGroup().addTo(map),
      user: L.layerGroup().addTo(map),
      turf: L.layerGroup().addTo(map)
    };

    function escapeHTML(value) {
      if (value === null || value === undefined) return "";
      return String(value).replace(/[&<>'"]/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
      }[ch]));
    }

    function setLoading(message, isShown = true) {
      loadingBox.textContent = message || "Loading live data...";
      loadingBox.classList.toggle("show", isShown);
    }

    function formatNumber(num, digits = 0) {
      if (num === null || num === undefined || Number.isNaN(Number(num))) return "No data";
      return Number(num).toLocaleString("en-US", { maximumFractionDigits: digits });
    }

    function formatMoney(num) {
      if (num === null || num === undefined || Number.isNaN(Number(num))) return "No data";
      const n = Number(num);
      if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
      return `$${formatNumber(n, 0)}`;
    }

    function valuesList(obj) {
      if (!obj) return "No data";
      if (Array.isArray(obj)) return obj.join(", ");
      return Object.values(obj).map(v => typeof v === "string" ? v : (v.name || JSON.stringify(v))).join(", ");
    }

    function currencyList(obj) {
      if (!obj) return "No data";
      return Object.values(obj).map(c => `${c.name || ""}${c.symbol ? " (" + c.symbol + ")" : ""}`).join(", ");
    }

    async function fetchJSON(url, options = {}, timeoutMs = 30000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    }

    function setDetails(title, html) {
      el("detailsCard").innerHTML = `<h3>${escapeHTML(title)}</h3>${html}`;
    }

    function countryIso3(feature) {
      return feature?.id || feature?.properties?.ISO_A3 || feature?.properties?.ADM0_A3 || feature?.properties?.iso_a3 || "";
    }

    function countryName(iso3, feature = null) {
      return restByIso3[iso3]?.name?.common || wbByIso3[iso3]?.name || feature?.properties?.name || iso3 || "Unknown country";
    }

    function getClassInfo(iso3) {
      const incomeCode = wbByIso3[iso3]?.incomeLevel?.id;
      const incomeText = wbByIso3[iso3]?.incomeLevel?.value || "No data";
      if (incomeCode === "HIC") return { key: "first", label: "First World", detail: "High income", incomeText };
      if (incomeCode === "UMC") return { key: "second", label: "Second World", detail: "Upper-middle income", incomeText };
      if (incomeCode === "LMC" || incomeCode === "LIC") return { key: "third", label: "Third World", detail: "Lower-middle / Low income", incomeText };
      return { key: "unknown", label: "No data", detail: "Unclassified", incomeText };
    }

    function getPopulation(iso3) {
      const restPop = restByIso3[iso3]?.population;
      const wbPop = populationByIso3[iso3];
      const value = Number(restPop ?? wbPop);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    function getArea(iso3) {
      const restArea = restByIso3[iso3]?.area;
      const wbArea = areaByIso3[iso3];
      const value = Number(restArea ?? wbArea);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    function getDensity(iso3) {
      const pop = getPopulation(iso3);
      const area = getArea(iso3);
      if (!pop || !area) return null;
      return pop / area;
    }

    function getGdp(iso3) {
      const value = Number(gdpByIso3[iso3]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    function getGdpPerCapita(iso3) {
      const pop = getPopulation(iso3);
      const gdp = getGdp(iso3);
      if (!pop || !gdp) return null;
      return gdp / pop;
    }

    function getMetricValue(iso3) {
      const theme = el("themeSelect").value;
      if (theme === "populationDensity") return getDensity(iso3);
      if (theme === "population") return getPopulation(iso3);
      if (theme === "gdp") return getGdp(iso3);
      if (theme === "gdpPerCapita") return getGdpPerCapita(iso3);
      return getClassInfo(iso3).label;
    }

    function metricBins(theme) {
      if (theme === "populationDensity") return [0, 25, 75, 150, 300, 800];
      if (theme === "population") return [0, 1000000, 10000000, 30000000, 100000000, 300000000];
      if (theme === "gdp") return [0, 10000000000, 50000000000, 200000000000, 1000000000000, 3000000000000];
      if (theme === "gdpPerCapita") return [0, 2000, 8000, 20000, 50000, 100000];
      return [];
    }

    function colorForMetric(value, theme) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return CLASS_COLORS.unknown;
      const bins = metricBins(theme);
      for (let i = bins.length - 1; i >= 1; i--) {
        if (value >= bins[i]) return METRIC_COLORS[Math.min(i - 1, METRIC_COLORS.length - 1)];
      }
      return METRIC_COLORS[0];
    }

    function countryFillColor(iso3) {
      const theme = el("themeSelect").value;
      if (theme === "classification") return CLASS_COLORS[getClassInfo(iso3).key];
      return colorForMetric(getMetricValue(iso3), theme);
    }

    function countryStyle(feature) {
      const iso3 = countryIso3(feature);
      const isSelected = iso3 && iso3 === selectedCountryIso3;
      return {
        color: isSelected ? "#ffffff" : "rgba(15,23,42,.72)",
        weight: isSelected ? 2.5 : .8,
        fillColor: countryFillColor(iso3),
        fillOpacity: iso3 ? .88 : .30,
        opacity: 1
      };
    }

    function metricLabel(theme = el("themeSelect").value) {
      return {
        classification: "First / Second / Third World",
        populationDensity: "Population Density (people/km²)",
        population: "Population",
        gdp: `GDP (${el("yearSelect").value})`,
        gdpPerCapita: `GDP per Capita (${el("yearSelect").value})`
      }[theme] || "Metric";
    }

    function formattedMetric(iso3) {
      const theme = el("themeSelect").value;
      const value = getMetricValue(iso3);
      if (theme === "classification") return getClassInfo(iso3).label;
      if (theme === "populationDensity") return `${formatNumber(value, 1)} people/km²`;
      if (theme === "population") return formatNumber(value, 0);
      if (theme === "gdp") return formatMoney(value);
      if (theme === "gdpPerCapita") return value ? formatMoney(value) : "No data";
      return String(value ?? "No data");
    }

    function updateLegend() {
      const theme = el("themeSelect").value;
      const box = el("legend");
      if (theme === "classification") {
        box.innerHTML = `
          <h4>World Classification Legend</h4>
          <div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${CLASS_COLORS.first}"></span>First World</div><span>High income</span></div>
          <div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${CLASS_COLORS.second}"></span>Second World</div><span>Upper-middle</span></div>
          <div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${CLASS_COLORS.third}"></span>Third World</div><span>Lower/Low</span></div>
          <div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${CLASS_COLORS.unknown}"></span>No data</div><span>Unclassified</span></div>
          <div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${THEMATIC_WATER_COLOR}"></span>Water bodies</div><span>Ocean/sea</span></div>
        `;
        return;
      }

      const bins = metricBins(theme);
      const rows = [];
      for (let i = 0; i < METRIC_COLORS.length; i++) {
        const min = bins[i];
        const max = bins[i + 1];
        const label = i === METRIC_COLORS.length - 1 ? `≥ ${formatBin(min, theme)}` : `${formatBin(min, theme)} - ${formatBin(max, theme)}`;
        rows.push(`<div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${METRIC_COLORS[i]}"></span>${label}</div></div>`);
      }
      rows.push(`<div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${CLASS_COLORS.unknown}"></span>No data</div></div>`);
      rows.push(`<div class="legend-row"><div class="legend-left"><span class="swatch" style="background:${THEMATIC_WATER_COLOR}"></span>Water bodies</div></div>`);
      box.innerHTML = `<h4>${escapeHTML(metricLabel(theme))}</h4>${rows.join("")}`;
    }

    function formatBin(value, theme) {
      if (theme === "gdp") return formatMoney(value);
      if (theme === "gdpPerCapita") return value >= 1000 ? `$${formatNumber(value / 1000, 0)}k` : `$${formatNumber(value, 0)}`;
      if (theme === "population") {
        if (value >= 1000000) return `${formatNumber(value / 1000000, 0)}M`;
        return formatNumber(value, 0);
      }
      return formatNumber(value, 0);
    }

    function showHover(event, html) {
      const box = el("hoverBox");
      const rect = el("mapShell").getBoundingClientRect();
      box.innerHTML = html;
      box.style.display = "block";
      box.style.left = `${event.clientX - rect.left + 14}px`;
      box.style.top = `${event.clientY - rect.top + 14}px`;
    }

    function hideHover() {
      el("hoverBox").style.display = "none";
    }

    function updateHoverPosition(event) {
      const box = el("hoverBox");
      const rect = el("mapShell").getBoundingClientRect();
      if (box.style.display !== "block") return;
      box.style.left = `${event.clientX - rect.left + 14}px`;
      box.style.top = `${event.clientY - rect.top + 14}px`;
    }

    function countryHoverHTML(iso3, feature) {
      const cls = getClassInfo(iso3);
      return `
        <b>${escapeHTML(countryName(iso3, feature))}</b>
        <div>${escapeHTML(metricLabel())}: <strong>${escapeHTML(formattedMetric(iso3))}</strong></div>
        <div>Class: <strong>${escapeHTML(cls.label)}</strong></div>
        <div>ISO_A3: <strong>${escapeHTML(iso3 || "No data")}</strong></div>
      `;
    }

    function buildWorldLayer() {
      layers.worldClassification.clearLayers();
      countryLayerByIso3 = {};
      const worldLayer = L.geoJSON(countryGeoJSON, {
        pane: "countryThemePane",
        style: countryStyle,
        onEachFeature: (feature, layer) => {
          const iso3 = countryIso3(feature);
          if (iso3) {
            countryLayerByIso3[iso3] = layer;
            featureByIso3[iso3] = feature;
          }
          layer.on({
            mouseover: (e) => {
              if (iso3 !== selectedCountryIso3) {
                e.target.setStyle({ weight: 2, color: "#ffffff", fillOpacity: .86 });
              }
              showHover(e.originalEvent, countryHoverHTML(iso3, feature));
            },
            mousemove: (e) => updateHoverPosition(e.originalEvent),
            mouseout: (e) => {
              if (iso3 !== selectedCountryIso3) e.target.setStyle(countryStyle(feature));
              hideHover();
            },
            click: () => selectCountryByIso3(iso3, { zoom: false, loadArea: true })
          });
        }
      }).addTo(layers.worldClassification);
      syncLayerVisibility();
    }

    function updateWorldStyles() {
      Object.entries(countryLayerByIso3).forEach(([iso3, layer]) => {
        layer.setStyle(countryStyle(layer.feature));
      });
      updateLegend();
      updateThematicWaterVisibility();
      renderGlobe();
    }

    function highlightSelectedCountry(iso3) {
      if (selectedCountryLayer && selectedCountryLayer.feature) {
        selectedCountryLayer.setStyle(countryStyle(selectedCountryLayer.feature));
      }
      selectedCountryIso3 = iso3;
      selectedCountryLayer = countryLayerByIso3[iso3] || null;
      if (selectedCountryLayer) {
        selectedCountryLayer.setStyle(countryStyle(selectedCountryLayer.feature));
        selectedCountryLayer.bringToFront();
      }
      renderGlobe();
    }

    function findCountry(query) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return null;
      return restCountries.find(c =>
        c.cca3?.toLowerCase() === q ||
        c.cca2?.toLowerCase() === q ||
        c.name?.common?.toLowerCase() === q ||
        c.name?.official?.toLowerCase() === q
      ) || null;
    }

    function iso3FromIso2(iso2) {
      const code = String(iso2 || "").trim().toUpperCase();
      if (!code) return null;
      if (restByIso2[code]?.cca3) return restByIso2[code].cca3;
      if (wbByIso2[code]?.id) return wbByIso2[code].id;
      const wbMatch = worldBankCountries.find(row => row.iso2Code === code);
      if (wbMatch?.id) return wbMatch.id;
      const restMatch = restCountries.find(c => c.cca2 === code);
      return restMatch?.cca3 || null;
    }

    function countryFromIso3(iso3) {
      return iso3 ? (restByIso3[iso3] || restCountries.find(c => c.cca3 === iso3) || null) : null;
    }

    function mergeRestCountryRecord(country) {
      if (!country || !country.cca3) return;
      const previous = restByIso3[country.cca3] || {};
      const merged = { ...previous, ...country };
      restByIso3[country.cca3] = merged;
      if (merged.cca2) restByIso2[merged.cca2] = merged;
      const idx = restCountries.findIndex(c => c.cca3 === merged.cca3);
      if (idx >= 0) restCountries[idx] = merged;
      else restCountries.push(merged);
    }

    function restDetailsMissing(country) {
      return !country || !country.currencies || !country.languages || typeof country.landlocked !== "boolean" || !Array.isArray(country.borders);
    }

    async function ensureRestCountryDetails(iso3) {
      if (!iso3 || !restDetailsMissing(restByIso3[iso3])) return restByIso3[iso3] || null;
      try {
        const data = await fetchJSON(`${API.REST_COUNTRIES_ALPHA}${encodeURIComponent(iso3)}`, {}, 18000);
        const country = Array.isArray(data) ? data[0] : data;
        if (country?.cca3) {
          mergeRestCountryRecord(country);
          return restByIso3[country.cca3];
        }
      } catch (err) {
        console.warn("REST Countries alpha lookup failed", iso3, err);
      }
      return restByIso3[iso3] || null;
    }

    async function loadRestCountries() {
      let data = [];
      try {
        data = await fetchJSON(API.REST_COUNTRIES, {}, 25000);
      } catch (err) {
        console.warn("REST Countries field-filtered request failed; trying full endpoint", err);
        try {
          data = await fetchJSON(API.REST_COUNTRIES_ALL, {}, 30000);
        } catch (err2) {
          console.warn("REST Countries full request failed; dashboard will use World Bank data and per-country lookup on click", err2);
          data = [];
        }
      }

      restCountries = Array.isArray(data) ? data : [];
      restCountries.sort((a, b) => (a.name?.common || "").localeCompare(b.name?.common || ""));
      restByIso3 = {};
      restByIso2 = {};
      restCountries.forEach(mergeRestCountryRecord);
      el("countryList").innerHTML = restCountries.map(c => `<option value="${escapeHTML(c.name?.common || c.cca3)}"></option>`).join("");
    }

    async function loadWorldBankCountries() {
      const data = await fetchJSON(API.WORLD_BANK_COUNTRIES, {}, 25000);
      worldBankCountries = Array.isArray(data?.[1]) ? data[1].filter(row => row.region?.value !== "Aggregates") : [];
      wbByIso3 = {};
      wbByIso2 = {};
      worldBankCountries.forEach(row => {
        if (row.id) wbByIso3[row.id] = row;
        if (row.iso2Code) wbByIso2[row.iso2Code] = row;
      });
    }

    async function loadWorldBankNumericIndicator(url, targetObject, label) {
      Object.keys(targetObject).forEach(key => delete targetObject[key]);
      try {
        const data = await fetchJSON(url, {}, 30000);
        const rows = Array.isArray(data?.[1]) ? data[1] : [];
        rows.forEach(row => {
          const iso = row.countryiso3code;
          const value = Number(row.value);
          if (iso && iso.length === 3 && Number.isFinite(value) && value > 0) {
            targetObject[iso] = value;
          }
        });
      } catch (err) {
        console.warn(`World Bank ${label} failed`, err);
      }
    }

    async function loadGdpData(year) {
      await loadWorldBankNumericIndicator(API.WORLD_BANK_GDP + encodeURIComponent(year), gdpByIso3, "GDP");
    }

    async function loadPopulationData(year) {
      await loadWorldBankNumericIndicator(API.WORLD_BANK_POPULATION + encodeURIComponent(year), populationByIso3, "population");
    }

    async function loadAreaData() {
      await loadWorldBankNumericIndicator(API.WORLD_BANK_AREA, areaByIso3, "surface area");
    }

    function cloneCoordinates(coords) {
      return JSON.parse(JSON.stringify(coords));
    }

    function reversePolygonRings(coords) {
      return coords.map(ring => [...ring].reverse());
    }

    function reverseFeatureRings(feature) {
      const clone = {
        ...feature,
        properties: { ...(feature.properties || {}) },
        geometry: feature.geometry ? { ...feature.geometry, coordinates: cloneCoordinates(feature.geometry.coordinates) } : feature.geometry
      };
      if (!clone.geometry) return clone;
      if (clone.geometry.type === "Polygon") {
        clone.geometry.coordinates = reversePolygonRings(clone.geometry.coordinates);
      } else if (clone.geometry.type === "MultiPolygon") {
        clone.geometry.coordinates = clone.geometry.coordinates.map(poly => reversePolygonRings(poly));
      }
      return clone;
    }

    function normalizeWorldGeoJSONForD3(geojson) {
      if (!geojson || !Array.isArray(geojson.features) || typeof d3 === "undefined" || !d3.geoArea) return geojson;
      geojson.features = geojson.features.map(feature => {
        try {
          // Some country GeoJSON files contain rings with a winding order that makes
          // D3 fill the complement of small islands/territories. When that happens,
          // oceans receive the thematic country color. Rewind those features so the
          // blue water layer remains visible for every map theme.
          return d3.geoArea(feature) > Math.PI * 2 ? reverseFeatureRings(feature) : feature;
        } catch (err) {
          return feature;
        }
      });
      return geojson;
    }

    async function loadWorldGeoJSON() {
      countryGeoJSON = await fetchJSON(API.WORLD_GEOJSON, {}, 30000);
      if (!countryGeoJSON || !Array.isArray(countryGeoJSON.features)) {
        throw new Error("Invalid world GeoJSON");
      }
      countryGeoJSON = normalizeWorldGeoJSONForD3(countryGeoJSON);
      featureByIso3 = {};
      countryGeoJSON.features.forEach(f => {
        const iso3 = countryIso3(f);
        if (iso3) featureByIso3[iso3] = f;
      });
    }

    function updateCountryDashboard(iso3) {
      const c = restByIso3[iso3] || {};
      const wb = wbByIso3[iso3] || {};
      const feature = featureByIso3[iso3];
      const cls = getClassInfo(iso3);
      const population = getPopulation(iso3);
      const area = getArea(iso3);
      const density = getDensity(iso3);
      const gdp = getGdp(iso3);
      const gdpPc = getGdpPerCapita(iso3);
      const capital = c.capital?.[0] || wb.capitalCity || "No data";
      const lat = c.latlng?.[0] ?? wb.latitude ?? null;
      const lon = c.latlng?.[1] ?? wb.longitude ?? null;

      el("countryCard").innerHTML = `
        <h3>Country dashboard</h3>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          ${c.flags?.svg ? `<img class="flag" src="${c.flags.svg}" alt="${escapeHTML(countryName(iso3, feature))} flag">` : ""}
          <div>
            <b style="font-size:18px;">${escapeHTML(countryName(iso3, feature))}</b><br>
            <span class="badge" style="background:${countryFillColor(iso3)}22;border-color:${countryFillColor(iso3)}55;color:#fff;">${escapeHTML(cls.label)}</span>
          </div>
        </div>
        <div class="mini-stats">
          <div class="stat"><b>${formatNumber(population)}</b><span>Population</span></div>
          <div class="stat"><b>${area ? `${formatNumber(area)} km²` : "No data"}</b><span>Area</span></div>
          <div class="stat"><b>${density ? formatNumber(density, 1) : "No data"}</b><span>Density / km²</span></div>
          <div class="stat"><b>${formatMoney(gdp)}</b><span>GDP ${escapeHTML(el("yearSelect").value)}</span></div>
        </div>
        <div class="row"><span>ISO_A2 / ISO_A3</span><strong>${escapeHTML(c.cca2 || wb.iso2Code || "--")} / ${escapeHTML(iso3 || "--")}</strong></div>
        <div class="row"><span>Capital</span><strong>${escapeHTML(capital)}</strong></div>
        <div class="row"><span>World Bank income level</span><strong>${escapeHTML(cls.incomeText)}</strong></div>
        <div class="row"><span>Classification logic</span><strong>${escapeHTML(cls.detail)}</strong></div>
        <div class="row"><span>Region</span><strong>${escapeHTML(c.region || wb.region?.value || "No data")}</strong></div>
        <div class="row"><span>Subregion</span><strong>${escapeHTML(c.subregion || wb.adminregion?.value || "No data")}</strong></div>
        <div class="row"><span>GDP per capita</span><strong>${gdpPc ? formatMoney(gdpPc) : "No data"}</strong></div>
      `;

      const quickCard = el("countryQuickCard");
      if (quickCard) {
        quickCard.innerHTML = `
          <h3>Selected Country</h3>
          <div class="quick-head">
            ${c.flags?.svg ? `<img class="flag" src="${c.flags.svg}" alt="${escapeHTML(countryName(iso3, feature))} flag">` : ""}
            <div>
              <div class="quick-title">${escapeHTML(countryName(iso3, feature))}</div>
              <div class="quick-sub">${escapeHTML(cls.label)} · ISO_A3: ${escapeHTML(iso3 || "--")}</div>
            </div>
          </div>
          <div class="quick-grid">
            <div class="quick-stat"><b>${escapeHTML(capital)}</b><span>Capital</span></div>
            <div class="quick-stat"><b>${formatNumber(population)}</b><span>Population</span></div>
            <div class="quick-stat"><b>${escapeHTML(currencyList(c.currencies))}</b><span>Currency</span></div>
            <div class="quick-stat"><b>${density ? formatNumber(density, 1) : "No data"}</b><span>Density / km²</span></div>
          </div>
        `;
      }
    }

    async function selectCountryByIso3(iso3, opts = {}) {
      if (!iso3) return;
      await ensureRestCountryDetails(iso3);
      highlightSelectedCountry(iso3);
      updateCountryDashboard(iso3);
      const c = restByIso3[iso3] || {};
      const wb = wbByIso3[iso3] || {};
      const feature = featureByIso3[iso3];
      const name = countryName(iso3, feature);
      const capital = c.capital?.[0] || wb.capitalCity || name;
      let lat = Number(c.latlng?.[0] ?? wb.latitude);
      let lon = Number(c.latlng?.[1] ?? wb.longitude);

      if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && feature) {
        try {
          const center = turf.center(feature).geometry.coordinates;
          lon = center[0];
          lat = center[1];
        } catch (err) {}
      }

      selectedAnalysisFeature = feature ? JSON.parse(JSON.stringify(feature)) : null;
      selectedAnalysisName = name;
      currentFocus = { lat, lon, name: capital, type: "country", iso3 };
      if (el("globePanel").style.display === "block" && Number.isFinite(lat) && Number.isFinite(lon) && opts.rotateGlobe !== false) {
        globeRotation = [-lon, -lat];
        renderGlobe();
      }
      setDetails("Selected country", `
        <div class="row"><span>Country</span><strong>${escapeHTML(name)}</strong></div>
        <div class="row"><span>Class</span><strong>${escapeHTML(getClassInfo(iso3).label)}</strong></div>
        <div class="row"><span>${escapeHTML(metricLabel())}</span><strong>${escapeHTML(formattedMetric(iso3))}</strong></div>
        <div class="row"><span>ISO_A3</span><strong>${escapeHTML(iso3)}</strong></div>
      `);

      if (opts.zoom !== false && countryLayerByIso3[iso3]) {
        map.fitBounds(countryLayerByIso3[iso3].getBounds().pad(0.08));
      }

      if (Number.isFinite(lat) && Number.isFinite(lon) && opts.loadArea !== false) {
        await loadWeather(lat, lon, capital);
        await loadOsmAreaData(lat, lon, capital);
        await loadFlightsAround(lat, lon, capital);
      }
    }

    async function geocodePlace(query, polygon = false) {
      const url = `${API.NOMINATIM}?format=jsonv2&limit=1&addressdetails=1&polygon_geojson=${polygon ? 1 : 0}&q=${encodeURIComponent(query)}`;
      const results = await fetchJSON(url, { headers: { "Accept": "application/json" } }, 20000);
      if (!Array.isArray(results) || !results.length) return null;
      return results[0];
    }

    async function searchPlace() {
      const query = el("placeSearch").value.trim();
      if (!query) return alert("Type a country or city name first.");
      const directCountry = findCountry(query);
      if (directCountry?.cca3) {
        await selectCountryByIso3(directCountry.cca3, { zoom: true, loadArea: true, rotateGlobe: true });
        return;
      }

      try {
        setLoading(`Searching for ${query}...`, true);
        const result = await geocodePlace(query, false);
        if (!result) return alert("No matching country or city was found.");

        const lat = Number(result.lat);
        const lon = Number(result.lon);
        const displayName = result.display_name || query;
        const iso2 = result.address?.country_code?.toUpperCase();
        const resolvedIso3 = iso3FromIso2(iso2);
        let country = countryFromIso3(resolvedIso3);
        if (resolvedIso3) {
          await selectCountryByIso3(resolvedIso3, { zoom: false, loadArea: false, rotateGlobe: true });
          country = countryFromIso3(resolvedIso3) || country;
        }

        currentFocus = { lat, lon, name: query, type: "city", iso3: resolvedIso3 || null };
        map.setView([lat, lon], 11);
        layers.searchResult.clearLayers();
        const icon = L.divIcon({ className: "", html: `<div class="search-marker">📍</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([lat, lon], { icon })
          .bindPopup(`<b>${escapeHTML(query)}</b><br>${escapeHTML(displayName)}`)
          .addTo(layers.searchResult)
          .openPopup();

        setDetails("Selected place", `
          <div class="row"><span>Name</span><strong>${escapeHTML(query)}</strong></div>
          <div class="row"><span>Country</span><strong>${escapeHTML(country?.name?.common || result.address?.country || "No data")}</strong></div>
          <div class="row"><span>Coordinates</span><strong>${lat.toFixed(5)}, ${lon.toFixed(5)}</strong></div>
          <div class="row"><span>Turf drawing</span><strong>Add points + distance/area</strong></div>
        `);

        await loadWeather(lat, lon, query);
        await loadOsmAreaData(lat, lon, query);
        await loadFlightsAround(lat, lon, query);
      } catch (err) {
        console.error(err);
        alert("Search failed. Try another country or city.");
      } finally {
        setLoading("", false);
        syncLayerVisibility();
      }
    }

    function weatherCodeText(code) {
      const map = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        80: "Rain showers", 81: "Moderate rain showers", 82: "Violent rain showers", 95: "Thunderstorm"
      };
      return map[code] || `Weather code ${code}`;
    }

    async function loadWeather(lat, lon, placeName) {
      try {
        const url = `${API.OPEN_METEO}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
        const data = await fetchJSON(url, {}, 15000);
        const current = data.current || {};
        el("weatherCard").innerHTML = `
          <h3>Weather - ${escapeHTML(placeName || "Selected place")}</h3>
          <div class="mini-stats">
            <div class="stat"><b>${current.temperature_2m ?? "--"}°C</b><span>Temperature</span></div>
            <div class="stat"><b>${current.wind_speed_10m ?? "--"}</b><span>Wind km/h</span></div>
            <div class="stat"><b>${current.relative_humidity_2m ?? "--"}%</b><span>Humidity</span></div>
            <div class="stat"><b style="font-size:14px">${escapeHTML(weatherCodeText(current.weather_code))}</b><span>Condition</span></div>
          </div>
        `;
      } catch (err) {
        console.warn("Weather failed", err);
        el("weatherCard").innerHTML = `<h3>Weather dashboard</h3><div class="hint">Weather data could not be loaded right now.</div>`;
      }
    }

    function buildOverpassQuery(lat, lon, radiusMeters) {
      return `
        [out:json][timeout:30];
        (
          way["highway"~"motorway|trunk|primary|secondary"](around:${radiusMeters},${lat},${lon});
          node["place"~"city|town|village|suburb"](around:${radiusMeters},${lat},${lon});
          nwr["tourism"](around:${radiusMeters},${lat},${lon});
          nwr["historic"](around:${radiusMeters},${lat},${lon});
          nwr["amenity"~"museum|theatre|place_of_worship"](around:${radiusMeters},${lat},${lon});
        );
        out geom 1200;
      `;
    }

    function getFeatureTags(feature) {
      return feature?.properties?.tags || {};
    }

    function featureName(feature) {
      const tags = getFeatureTags(feature);
      return tags.name || tags["name:en"] || tags["name:ar"] || tags.ref || "Unnamed feature";
    }

    function styleRoad(feature) {
      const tags = getFeatureTags(feature);
      const highway = tags.highway || "road";
      const weight = highway === "motorway" ? 5 : highway === "trunk" ? 4 : highway === "primary" ? 3 : 2;
      return { color: "#f97316", weight, opacity: .9 };
    }

    function tourismIcon(feature) {
      const tags = getFeatureTags(feature);
      let emoji = "📍";
      if (tags.historic) emoji = "🏛️";
      if (tags.tourism === "museum" || tags.amenity === "museum") emoji = "🏺";
      if (tags.tourism === "hotel") emoji = "🏨";
      if (tags.tourism === "viewpoint") emoji = "🌄";
      if (tags.amenity === "place_of_worship") emoji = "⛪";
      return L.divIcon({ className: "", html: `<div class="poi-marker">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    }

    function popupRowsFromTags(tags) {
      const keys = ["name", "name:en", "name:ar", "highway", "tourism", "historic", "amenity", "place", "population", "wikipedia"];
      return keys.filter(k => tags[k]).map(k => `<div class="row"><span>${escapeHTML(k)}</span><strong>${escapeHTML(tags[k])}</strong></div>`).join("");
    }

    function markerLatLng(layer) {
      if (layer.getLatLng) {
        const p = layer.getLatLng();
        return { lat: p.lat, lon: p.lng };
      }
      if (layer.getBounds) {
        const c = layer.getBounds().getCenter();
        return { lat: c.lat, lon: c.lng };
      }
      return null;
    }

    function poiTypeFromTags(tags) {
      if (tags.historic) return "Historic / heritage site";
      if (tags.tourism === "museum" || tags.amenity === "museum") return "Museum";
      if (tags.tourism === "viewpoint") return "Viewpoint";
      if (tags.amenity === "place_of_worship") return "Religious landmark";
      if (tags.tourism) return `Tourism: ${tags.tourism}`;
      return "Tourism attraction";
    }

    function renderSuggestions(items) {
      const box = el("suggestionsCard");
      if (!box) return;
      if (!items.length) {
        box.innerHTML = `<h3>Top tourism and historic suggestions</h3><div class="hint">No clear tourism or historic places were returned for this fixed 60 km area.</div>`;
        return;
      }
      box.innerHTML = `<h3>Top tourism and historic suggestions</h3><div class="list">${items.map((item, index) => `
        <button class="item suggestion-btn" data-lat="${item.lat}" data-lon="${item.lon}" data-name="${escapeHTML(item.name)}" data-type="${escapeHTML(item.type)}">
          <b>${index + 1}. ${escapeHTML(item.name)}</b>
          <span>${escapeHTML(item.type)}</span>
        </button>`).join("")}</div>`;
      box.querySelectorAll(".suggestion-btn").forEach(btn => {
        btn.addEventListener("click", () => goToSuggestion(Number(btn.dataset.lat), Number(btn.dataset.lon), btn.dataset.name, btn.dataset.type));
      });
    }

    function goToSuggestion(lat, lon, name, type) {
      setBaseMap("osm");
      map.setView([lat, lon], 16);
      L.popup()
        .setLatLng([lat, lon])
        .setContent(`<b>${escapeHTML(name)}</b><br>${escapeHTML(type || "Suggested place")}`)
        .openOn(map);
      setDetails(name || "Suggested place", `
        <div class="row"><span>Type</span><strong>${escapeHTML(type || "Suggested place")}</strong></div>
        <div class="row"><span>Coordinates</span><strong>${lat.toFixed(5)}, ${lon.toFixed(5)}</strong></div>
      `);
    }

    async function loadOsmAreaData(lat, lon, placeName) {
      const radiusMeters = FIXED_RADIUS_KM * 1000;
      const query = buildOverpassQuery(lat, lon, radiusMeters);
      layers.cityNames.clearLayers();
      layers.roads.clearLayers();
      layers.tourism.clearLayers();
      renderSuggestions([]);

      try {
        setLoading(`Loading roads, city labels, and tourism data around ${placeName}...`, true);
        const osm = await fetchJSON(API.OVERPASS, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
        }, 35000);

        const geojson = osmtogeojson(osm);
        const suggestions = [];
        const seenSuggestions = new Set();

        function addSuggestion(item) {
          if (!item || !item.name || item.name === "Unnamed feature" || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
          const key = `${item.name.toLowerCase()}:${item.lat.toFixed(4)}:${item.lon.toFixed(4)}`;
          if (seenSuggestions.has(key)) return;
          seenSuggestions.add(key);
          suggestions.push(item);
        }

        L.geoJSON(geojson, {
          filter: f => !!getFeatureTags(f).highway,
          style: styleRoad,
          onEachFeature: (feature, layer) => {
            const tags = getFeatureTags(feature);
            layer.bindPopup(`<b>${escapeHTML(featureName(feature))}</b><br>Major road`);
            layer.on("click", () => setDetails("Major road", popupRowsFromTags(tags) || `<div class="hint">No extra road details are available.</div>`));
          }
        }).addTo(layers.roads);

        L.geoJSON(geojson, {
          filter: f => !!getFeatureTags(f).place,
          pointToLayer: (feature, latlng) => {
            const icon = L.divIcon({ className: "", html: `<div class="city-dot"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
            const marker = L.marker(latlng, { icon });
            marker.bindTooltip(escapeHTML(featureName(feature)), { permanent: true, direction: "right", className: "city-label" });
            return marker;
          },
          onEachFeature: (feature, layer) => {
            const tags = getFeatureTags(feature);
            layer.bindPopup(`<b>${escapeHTML(featureName(feature))}</b><br>${escapeHTML(tags.place || "City / town")}`);
            layer.on("click", () => setDetails("City / town", popupRowsFromTags(tags) || `<div class="hint">No extra city details are available.</div>`));
          }
        }).addTo(layers.cityNames);

        L.geoJSON(geojson, {
          filter: f => {
            const tags = getFeatureTags(f);
            return !!(tags.tourism || tags.historic || ["museum", "theatre", "place_of_worship"].includes(tags.amenity));
          },
          pointToLayer: (feature, latlng) => L.marker(latlng, { icon: tourismIcon(feature) }),
          style: () => ({ color: "#a78bfa", weight: 2, fillColor: "#a78bfa", fillOpacity: .16 }),
          onEachFeature: (feature, layer) => {
            const tags = getFeatureTags(feature);
            const name = featureName(feature);
            const type = poiTypeFromTags(tags);
            const point = markerLatLng(layer);
            const score = (tags.wikipedia ? 8 : 0) + (tags.wikidata ? 6 : 0) + (tags.historic ? 8 : 0) + (tags.tourism === "museum" || tags.amenity === "museum" ? 4 : 0) + (tags.name ? 2 : 0);
            layer.bindPopup(`<b>${escapeHTML(name)}</b><br>${escapeHTML(type)}`);
            layer.on("click", () => setDetails(type, popupRowsFromTags(tags) || `<div class="hint">No extra attraction details are available.</div>`));
            if (point && (tags.historic || tags.tourism || tags.amenity === "museum" || tags.amenity === "place_of_worship")) {
              addSuggestion({ name, type, lat: point.lat, lon: point.lon, score });
            }
          }
        }).addTo(layers.tourism);

        renderSuggestions(suggestions.sort((a, b) => b.score - a.score).slice(0, 12));
      } catch (err) {
        console.warn("Overpass failed", err);
        renderSuggestions([]);
      } finally {
        setLoading("", false);
        syncLayerVisibility();
      }
    }

    function flightIcon(heading) {
      const rotation = Number.isFinite(Number(heading)) ? Number(heading) : 0;
      return L.divIcon({
        className: "flight-icon",
        html: `<div style="transform: rotate(${rotation}deg);">✈️</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
    }

    async function loadFlightsAround(lat, lon, placeName) {
      layers.flights.clearLayers();
      stopDemoFlights();
      const radiusKm = Math.min(FIXED_RADIUS_KM, 120);
      const delta = radiusKm / 111;
      const url = `${API.OPENSKY}?lamin=${lat - delta}&lomin=${lon - delta}&lamax=${lat + delta}&lomax=${lon + delta}`;

      try {
        const data = await fetchJSON(url, {}, 15000);
        const states = Array.isArray(data.states) ? data.states : [];
        const valid = states.filter(s => s[5] !== null && s[6] !== null).slice(0, 60);
        if (!valid.length) throw new Error("No flights returned");

        valid.forEach(s => {
          const callsign = (s[1] || "Unknown").trim();
          const originCountry = s[2] || "Unknown";
          const longitude = s[5];
          const latitude = s[6];
          const altitude = s[7];
          const velocity = s[9];
          const heading = s[10];
          const marker = L.marker([latitude, longitude], { icon: flightIcon(heading) }).addTo(layers.flights);
          marker.bindPopup(`<b>${escapeHTML(callsign)}</b><br>${escapeHTML(originCountry)}<br>Altitude: ${formatNumber(altitude)} m`);
          marker.on("click", () => setDetails("Flight information", `
            <div class="row"><span>Callsign</span><strong>${escapeHTML(callsign)}</strong></div>
            <div class="row"><span>Origin country</span><strong>${escapeHTML(originCountry)}</strong></div>
            <div class="row"><span>Altitude</span><strong>${formatNumber(altitude)} m</strong></div>
            <div class="row"><span>Speed</span><strong>${velocity ? Math.round(velocity * 3.6) : "--"} km/h</strong></div>
            <div class="row"><span>Heading</span><strong>${heading ?? "--"}°</strong></div>
          `));
        });
      } catch (err) {
        console.warn("OpenSky failed or no flights. Using demo flights.", err);
        createDemoFlights(lat, lon, placeName);
      } finally {
        syncLayerVisibility();
      }
    }

    function createDemoFlights(lat, lon, placeName) {
      layers.flights.clearLayers();
      demoFlights = [];
      const count = 8;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.08 + Math.random() * 0.45;
        const heading = Math.round(Math.random() * 360);
        const p = {
          id: `DEMO-${100 + i}`,
          lat: lat + Math.sin(angle) * dist,
          lon: lon + Math.cos(angle) * dist,
          heading,
          speed: 650 + Math.round(Math.random() * 260),
          altitude: 8000 + Math.round(Math.random() * 35000)
        };
        const marker = L.marker([p.lat, p.lon], { icon: flightIcon(p.heading) }).addTo(layers.flights);
        marker.bindPopup(`<b>${p.id}</b><br>Demo flight around ${escapeHTML(placeName || "selected area")}`);
        marker.on("click", () => setDetails("Demo flight", `
          <div class="hint">Demo data appears when OpenSky is unavailable or has no aircraft in the selected area.</div>
          <div class="row"><span>Callsign</span><strong>${p.id}</strong></div>
          <div class="row"><span>Altitude</span><strong>${formatNumber(p.altitude)} ft</strong></div>
          <div class="row"><span>Speed</span><strong>${p.speed} km/h</strong></div>
          <div class="row"><span>Heading</span><strong>${p.heading}°</strong></div>
        `));
        demoFlights.push({ ...p, marker });
      }

      demoFlightTimer = setInterval(() => {
        demoFlights.forEach(f => {
          const rad = f.heading * Math.PI / 180;
          f.lat += Math.cos(rad) * 0.01;
          f.lon += Math.sin(rad) * 0.01;
          f.heading = (f.heading + (Math.random() * 12 - 6) + 360) % 360;
          f.marker.setLatLng([f.lat, f.lon]);
          f.marker.setIcon(flightIcon(f.heading));
        });
      }, 2500);
    }

    function stopDemoFlights() {
      if (demoFlightTimer) clearInterval(demoFlightTimer);
      demoFlightTimer = null;
      demoFlights = [];
    }

    function locateMe() {
      if (!navigator.geolocation) {
        alert("This browser does not support geolocation.");
        return;
      }
      navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        userLocation = { lat, lon };
        layers.user.clearLayers();
        const marker = L.circleMarker([lat, lon], {
          radius: 9,
          color: "#fff",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 1
        }).addTo(layers.user);
        marker.bindPopup("My current location").openPopup();
        map.setView([lat, lon], 12);
        setDetails("My current location", `
          <div class="row"><span>Latitude</span><strong>${lat.toFixed(5)}</strong></div>
          <div class="row"><span>Longitude</span><strong>${lon.toFixed(5)}</strong></div>
        `);
      }, () => alert("Location failed. Allow location access in your browser and try again."));
    }

    function setWorldView() {
      if (el("globePanel").style.display === "block") {
        globeRotation = [0, -15];
        renderGlobe();
      } else {
        map.setView([20, 0], 2);
      }
    }

    function updateThematicWaterVisibility() {
      const worldToggle = document.querySelector("input[data-layer='worldClassification']");
      const globeMode = el("globePanel").style.display === "block";
      const shouldShowWater = !!(worldToggle?.checked) && !globeMode;
      if (!thematicWaterLayer) return;
      if (shouldShowWater) {
        if (!map.hasLayer(thematicWaterLayer)) thematicWaterLayer.addTo(map);
      } else if (map.hasLayer(thematicWaterLayer)) {
        map.removeLayer(thematicWaterLayer);
      }
    }

    function syncLayerVisibility() {
      document.querySelectorAll("input[data-layer]").forEach(input => {
        const key = input.dataset.layer;
        if (key === "earthInset") {
          const inset = el("earthInset");
          if (inset) inset.style.display = input.checked ? "block" : "none";
          if (input.checked) renderEarthInset();
          return;
        }
        if (!layers[key]) return;
        if (input.checked) {
          if (!map.hasLayer(layers[key])) layers[key].addTo(map);
        } else {
          if (map.hasLayer(layers[key])) map.removeLayer(layers[key]);
        }
      });
      updateThematicWaterVisibility();
    }

    function setBaseMap(type) {
      document.querySelectorAll("input[name='basemap']").forEach(r => r.checked = r.value === type);
      const globeMode = type === "globe";
      if (!globeMode) currentBaseType = type;
      el("leafletMap").style.display = globeMode ? "none" : "block";
      el("globePanel").style.display = globeMode ? "block" : "none";

      if (globeMode) {
        updateThematicWaterVisibility();
        renderGlobe();
        return;
      }

      if (currentBaseLayer && map.hasLayer(currentBaseLayer)) map.removeLayer(currentBaseLayer);
      currentBaseLayer = baseLayers[type] || baseLayers.osm;
      currentBaseLayer.addTo(map);
      syncLayerVisibility();
      setTimeout(() => map.invalidateSize(), 80);
    }

    function selectedFeatureGeoJSON() {
      if (selectedAnalysisFeature) return selectedAnalysisFeature;
      if (selectedCountryIso3 && featureByIso3[selectedCountryIso3]) return featureByIso3[selectedCountryIso3];
      if (currentFocus?.iso3 && featureByIso3[currentFocus.iso3]) return featureByIso3[currentFocus.iso3];
      if (currentFocus && Number.isFinite(currentFocus.lat) && Number.isFinite(currentFocus.lon)) {
        return turf.point([currentFocus.lon, currentFocus.lat], { name: currentFocus.name || "Selected point" });
      }
      return null;
    }

    function ensureTurfLayerActive() {
      const turfCheckbox = document.querySelector("input[data-layer='turf']");
      if (turfCheckbox) turfCheckbox.checked = true;
      if (!map.hasLayer(layers.turf)) layers.turf.addTo(map);
      if (el("leafletMap").style.display === "none") {
        setBaseMap(currentBaseType || "osm");
      } else {
        syncLayerVisibility();
      }
    }

    function setTurfPointButtonState() {
      const btn = el("addPointModeBtn");
      if (!btn) return;
      btn.textContent = turfPointMode ? "Points: On" : "Points: Off";
      btn.classList.toggle("green", turfPointMode);
      btn.classList.toggle("purple", !turfPointMode);
      map.getContainer().style.cursor = turfPointMode ? "crosshair" : "";
    }

    function updateTurfPointStatus(message) {
      const status = el("turfPointStatus");
      if (!status) return;
      status.textContent = message || `Points: ${turfPointCoords.length}`;
    }

    function turfBuffer() {
      ensureTurfLayerActive();
      if (!currentFocus || !Number.isFinite(currentFocus.lat) || !Number.isFinite(currentFocus.lon)) {
        alert("Search for a country or city first.");
        return;
      }
      const point = turf.point([currentFocus.lon, currentFocus.lat], { name: currentFocus.name || "Selected point" });
      const buffered = turf.buffer(point, FIXED_RADIUS_KM, { units: "kilometers" });
      const layer = L.geoJSON(buffered, {
        style: { color: "#a78bfa", weight: 2, fillColor: "#a78bfa", fillOpacity: .18 }
      }).addTo(layers.turf);
      map.fitBounds(layer.getBounds().pad(.1));
      setDetails("Turf.js buffer", `
        <div class="row"><span>Tool</span><strong>turf.buffer()</strong></div>
        <div class="row"><span>Center</span><strong>${escapeHTML(currentFocus.name || "Selected point")}</strong></div>
        <div class="row"><span>Radius</span><strong>${FIXED_RADIUS_KM} km</strong></div>
      `);
      syncLayerVisibility();
    }

    function turfCountryCenter() {
      ensureTurfLayerActive();
      const feature = selectedCountryIso3 ? featureByIso3[selectedCountryIso3] : null;
      if (!feature) return alert("Click or search a country first.");
      const center = turf.center(feature);
      const [lon, lat] = center.geometry.coordinates;
      const icon = L.divIcon({ className: "", html: `<div class="center-marker">◎</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([lat, lon], { icon }).bindPopup(`Turf center of ${escapeHTML(countryName(selectedCountryIso3, feature))}`).addTo(layers.turf);
      map.setView([lat, lon], 5);
      setDetails("Turf.js country center", `
        <div class="row"><span>Tool</span><strong>turf.center()</strong></div>
        <div class="row"><span>Country</span><strong>${escapeHTML(countryName(selectedCountryIso3, feature))}</strong></div>
        <div class="row"><span>Coordinates</span><strong>${lat.toFixed(5)}, ${lon.toFixed(5)}</strong></div>
      `);
      syncLayerVisibility();
    }

    function turfBoundingBox() {
      ensureTurfLayerActive();
      const feature = selectedFeatureGeoJSON();
      if (!feature) return alert("Search or click a country first.");
      const bbox = turf.bbox(feature);
      const polygon = turf.bboxPolygon(bbox);
      const layer = L.geoJSON(polygon, {
        style: { color: "#38bdf8", weight: 2, dashArray: "6 6", fillColor: "#38bdf8", fillOpacity: .08 }
      }).addTo(layers.turf);
      map.fitBounds(layer.getBounds().pad(.1));
      setDetails("Turf.js bounding box", `
        <div class="row"><span>Tool</span><strong>turf.bbox() + turf.bboxPolygon()</strong></div>
        <div class="row"><span>Selected feature</span><strong>${escapeHTML(selectedAnalysisName || (selectedCountryIso3 ? countryName(selectedCountryIso3, feature) : currentFocus.name))}</strong></div>
        <div class="row"><span>BBox</span><strong>${bbox.map(v => v.toFixed(3)).join(", ")}</strong></div>
      `);
      syncLayerVisibility();
    }

    function turfDistanceFromMe() {
      ensureTurfLayerActive();
      if (!userLocation) return alert("Click 'Locate Me' first, then run Distance from Me.");
      if (!currentFocus || !Number.isFinite(currentFocus.lat) || !Number.isFinite(currentFocus.lon)) return alert("Search or click a country/city first.");
      const from = turf.point([userLocation.lon, userLocation.lat], { name: "My location" });
      const to = turf.point([currentFocus.lon, currentFocus.lat], { name: currentFocus.name || "Selected place" });
      const line = turf.lineString([[userLocation.lon, userLocation.lat], [currentFocus.lon, currentFocus.lat]]);
      const km = turf.distance(from, to, { units: "kilometers" });
      const layer = L.geoJSON(line, { style: { color: "#22c55e", weight: 4 } }).addTo(layers.turf);
      map.fitBounds(layer.getBounds().pad(.2));
      setDetails("Turf.js distance", `
        <div class="row"><span>Tool</span><strong>turf.distance()</strong></div>
        <div class="row"><span>From</span><strong>My location</strong></div>
        <div class="row"><span>To</span><strong>${escapeHTML(currentFocus.name || "Selected place")}</strong></div>
        <div class="row"><span>Distance</span><strong>${formatNumber(km, 2)} km</strong></div>
      `);
      syncLayerVisibility();
    }

    function clearTurf() {
      layers.turf.clearLayers();
      turfPointMode = false;
      turfPointCoords = [];
      turfPointMarkers = [];
      turfMeasureLayer = null;
      setTurfPointButtonState();
      updateTurfPointStatus("Points: 0");
      setDetails("Turf.js analysis cleared", `<div class="row"><span>Status</span><strong>Cleared</strong></div>`);
    }

    function refreshTurfPointGeometry() {
      ensureTurfLayerActive();
      if (turfMeasureLayer) {
        layers.turf.removeLayer(turfMeasureLayer);
        turfMeasureLayer = null;
      }
      const group = L.layerGroup();

      if (turfPointCoords.length >= 2) {
        const line = turf.lineString(turfPointCoords);
        L.geoJSON(line, { style: { color: "#f59e0b", weight: 4, opacity: .95 } }).addTo(group);

        for (let i = 0; i < turfPointCoords.length - 1; i++) {
          const a = turfPointCoords[i];
          const b = turfPointCoords[i + 1];
          const segment = turf.lineString([a, b]);
          const km = turf.length(segment, { units: "kilometers" });
          const mid = turf.midpoint(turf.point(a), turf.point(b));
          const coords = mid.geometry.coordinates;
          L.marker([coords[1], coords[0]], {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div class="distance-label">${formatNumber(km, 2)} km</div>`,
              iconSize: [80, 22],
              iconAnchor: [40, 11]
            })
          }).addTo(group);
        }
      }

      if (turfPointCoords.length >= 3) {
        const closed = [...turfPointCoords, turfPointCoords[0]];
        const polygon = turf.polygon([closed]);
        const areaM2 = turf.area(polygon);
        const areaKm2 = areaM2 / 1000000;
        L.geoJSON(polygon, { style: { color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: .16 } }).addTo(group);
        const center = turf.centroid(polygon).geometry.coordinates;
        L.marker([center[1], center[0]], {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div class="area-label">Area: ${formatNumber(areaKm2, 3)} km²</div>`,
            iconSize: [130, 26],
            iconAnchor: [65, 13]
          })
        }).addTo(group);
      }
      turfMeasureLayer = group.addTo(layers.turf);
      updateTurfPointStatus(`Points: ${turfPointCoords.length}`);
      syncLayerVisibility();
    }

    function addTurfPoint(latlng) {
      ensureTurfLayerActive();
      const index = turfPointCoords.length + 1;
      turfPointCoords.push([latlng.lng, latlng.lat]);
      const icon = L.divIcon({ className: "", html: `<div class="measure-marker">${index}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      const marker = L.marker(latlng, { icon, draggable: true })
        .bindPopup(`Point ${index}<br>${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`)
        .addTo(layers.turf);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        turfPointCoords[index - 1] = [p.lng, p.lat];
        marker.setPopupContent(`Point ${index}<br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
        refreshTurfPointGeometry();
      });
      turfPointMarkers.push(marker);
      refreshTurfPointGeometry();
      setDetails("Turf.js point", `
        <div class="row"><span>Point</span><strong>${index}</strong></div>
        <div class="row"><span>Coordinates</span><strong>${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</strong></div>
      `);
    }

    function toggleTurfPointMode() {
      turfPointMode = !turfPointMode;
      ensureTurfLayerActive();
      setTurfPointButtonState();
      updateTurfPointStatus(`Points: ${turfPointCoords.length}${turfPointMode ? " | ON" : " | OFF"}`);
    }

    function calculateTurfPointDistance() {
      ensureTurfLayerActive();
      if (turfPointCoords.length < 2) return alert("Add at least two points first.");
      const line = turf.lineString(turfPointCoords);
      const km = turf.length(line, { units: "kilometers" });
      const miles = turf.length(line, { units: "miles" });
      refreshTurfPointGeometry();
      updateTurfPointStatus(`Distance: ${formatNumber(km, 3)} km`);
      setDetails("Turf.js point distance", `
        <div class="row"><span>Tool</span><strong>turf.length()</strong></div>
        <div class="row"><span>Points</span><strong>${turfPointCoords.length}</strong></div>
        <div class="row"><span>Distance</span><strong>${formatNumber(km, 3)} km</strong></div>
        <div class="row"><span>Distance</span><strong>${formatNumber(miles, 3)} miles</strong></div>
      `);
    }

    function calculateTurfPointArea() {
      ensureTurfLayerActive();
      if (turfPointCoords.length < 3) return alert("Add at least three points first.");
      const polygon = turf.polygon([[...turfPointCoords, turfPointCoords[0]]]);
      const areaM2 = turf.area(polygon);
      const areaKm2 = areaM2 / 1000000;
      refreshTurfPointGeometry();
      updateTurfPointStatus(`Area: ${formatNumber(areaKm2, 3)} km²`);
      setDetails("Turf.js polygon area", `
        <div class="row"><span>Tool</span><strong>turf.area()</strong></div>
        <div class="row"><span>Points</span><strong>${turfPointCoords.length}</strong></div>
        <div class="row"><span>Area</span><strong>${formatNumber(areaKm2, 3)} km²</strong></div>
        <div class="row"><span>Area</span><strong>${formatNumber(areaM2, 0)} m²</strong></div>
      `);
    }

    function clearTurfPoints() {
      turfPointMode = false;
      setTurfPointButtonState();
      turfPointMarkers.forEach(marker => layers.turf.removeLayer(marker));
      turfPointMarkers = [];
      turfPointCoords = [];
      if (turfMeasureLayer) layers.turf.removeLayer(turfMeasureLayer);
      turfMeasureLayer = null;
      updateTurfPointStatus("Points: 0");
      setDetails("Turf.js points cleared", `<div class="row"><span>Status</span><strong>Points cleared</strong></div>`);
    }

    function renderEarthInset() {
      const inset = el("earthInset");
      const svgNode = el("earthInsetSvg");
      if (!countryGeoJSON || !d3 || !inset || !svgNode || inset.style.display === "none") return;
      const width = inset.clientWidth || 310;
      const height = inset.clientHeight || 230;
      const radius = Math.min(width, height) * 0.38;
      earthInsetSvg = d3.select("#earthInsetSvg");
      earthInsetSvg.attr("viewBox", `0 0 ${width} ${height}`);
      earthInsetSvg.selectAll("*").remove();
      earthInsetProjection = d3.geoOrthographic()
        .scale(radius)
        .translate([width / 2, height / 2 + 6])
        .rotate(globeRotation)
        .clipAngle(90);
      earthInsetPath = d3.geoPath(earthInsetProjection);
      earthInsetSvg.append("path")
        .datum({ type: "Sphere" })
        .attr("d", earthInsetPath)
        .attr("fill", THEMATIC_WATER_COLOR)
        .attr("opacity", .28)
        .attr("stroke", "rgba(255,255,255,.25)");
      earthInsetSvg.append("g")
        .selectAll("path")
        .data(countryGeoJSON.features)
        .join("path")
        .attr("d", earthInsetPath)
        .attr("fill", d => countryFillColor(countryIso3(d)))
        .attr("fill-opacity", d => countryIso3(d) === selectedCountryIso3 ? .95 : .75)
        .attr("stroke", d => countryIso3(d) === selectedCountryIso3 ? "#ffffff" : "rgba(15,23,42,.75)")
        .attr("stroke-width", d => countryIso3(d) === selectedCountryIso3 ? 1.6 : .45)
        .style("cursor", "pointer")
        .on("click", (event, d) => selectCountryByIso3(countryIso3(d), { zoom: true, loadArea: true }));
      d3.select("#earthInsetSvg").call(d3.drag()
        .on("start", function(event) {
          this._start = { x: event.x, y: event.y, rotate: [...globeRotation] };
        })
        .on("drag", function(event) {
          const start = this._start || { x: event.x, y: event.y, rotate: [...globeRotation] };
          const dx = event.x - start.x;
          const dy = event.y - start.y;
          globeRotation = [start.rotate[0] + dx * 0.35, Math.max(-80, Math.min(80, start.rotate[1] - dy * 0.25))];
          renderEarthInset();
        })
      );
    }

    function initGlobe() {
      globeSvg = d3.select("#globeSvg");
      renderGlobe();
      window.addEventListener("resize", () => {
        if (el("globePanel").style.display === "block") renderGlobe();
      renderEarthInset();
      });
    }

    function refreshGlobeGeometry() {
      if (!globeProjection || !globePath || !globeSvg) return;
      globeProjection.rotate(globeRotation);
      globeSvg.selectAll("path").attr("d", globePath);
    }

    function globeLonLatSpan(feature) {
      try {
        const b = d3.geoBounds(feature);
        let lonSpan = Math.abs(b[1][0] - b[0][0]);
        if (lonSpan > 180) lonSpan = 360 - lonSpan;
        const latSpan = Math.abs(b[1][1] - b[0][1]);
        return { lonSpan, latSpan };
      } catch (err) {
        return { lonSpan: 360, latSpan: 180 };
      }
    }

    function projectedFeatureLooksInverted(feature, path, radius) {
      try {
        const span = globeLonLatSpan(feature);
        const b = path.bounds(feature);
        const w = Math.abs(b[1][0] - b[0][0]);
        const h = Math.abs(b[1][1] - b[0][1]);
        const area = d3.geoArea(feature);
        const smallOrMediumCountry = span.lonSpan < 70 && span.latSpan < 70;
        const almostWholeGlobe = w > radius * 1.45 || h > radius * 1.45;
        const impossibleSphericalArea = area > Math.PI;
        return impossibleSphericalArea || (smallOrMediumCountry && almostWholeGlobe);
      } catch (err) {
        return false;
      }
    }

    function preparedGlobeFeatures(path, radius) {
      return countryGeoJSON.features.map(feature => {
        let fixed = feature;
        if (projectedFeatureLooksInverted(fixed, path, radius)) {
          fixed = reverseFeatureRings(fixed);
        }
        if (projectedFeatureLooksInverted(fixed, path, radius)) {
          fixed = {
            ...fixed,
            properties: { ...(fixed.properties || {}), __globeProblem: true }
          };
        }
        return fixed;
      });
    }

    function renderGlobe() {
      if (!countryGeoJSON || !d3 || !el("globeSvg")) return;
      const panel = el("globePanel");
      const width = panel.clientWidth || el("mapShell").clientWidth || 800;
      const height = panel.clientHeight || el("mapShell").clientHeight || 600;
      const radius = Math.min(width, height) * 0.42 * globeScaleBoost;

      globeSvg = d3.select("#globeSvg");
      globeSvg.attr("viewBox", `0 0 ${width} ${height}`);
      globeSvg.selectAll("*").remove();

      globeProjection = d3.geoOrthographic()
        .scale(radius)
        .translate([width / 2, height / 2])
        .rotate(globeRotation)
        .clipAngle(90);
      globePath = d3.geoPath(globeProjection);
      const globeFeatures = preparedGlobeFeatures(globePath, radius);

      const oceanMaskId = "globe-ocean-mask";
      const sphereDatum = { type: "Sphere" };

      // Base ocean: always blue under every thematic country layer.
      globeSvg.append("path")
        .datum(sphereDatum)
        .attr("class", "globe-sphere globe-ocean-base")
        .attr("d", globePath)
        .attr("fill", THEMATIC_WATER_COLOR)
        .attr("opacity", 1)
        .attr("stroke", "rgba(255,255,255,.35)")
        .attr("stroke-width", 1.4)
        .style("pointer-events", "none");

      // SVG ocean mask: white = water visible, black = land punched out.
      // This creates a real water-bodies layer above thematic fills without hiding countries.
      const defs = globeSvg.append("defs");
      const mask = defs.append("mask")
        .attr("id", oceanMaskId)
        .attr("maskUnits", "userSpaceOnUse")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", height);
      mask.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "black");
      mask.append("path")
        .datum(sphereDatum)
        .attr("d", globePath)
        .attr("fill", "white");
      mask.append("g")
        .selectAll("path")
        .data(globeFeatures.filter(d => !d.properties?.__globeProblem))
        .join("path")
        .attr("d", globePath)
        .attr("fill-rule", "evenodd")
        .attr("fill", "black")
        .attr("stroke", "black")
        .attr("stroke-width", 1.2);

      globeCountryPaths = globeSvg.append("g")
        .attr("class", "globe-country-layer")
        .selectAll("path")
        .data(globeFeatures)
        .join("path")
        .attr("class", "globe-country")
        .attr("d", globePath)
        .attr("fill-rule", "evenodd")
        .attr("fill", d => d.properties?.__globeProblem ? "transparent" : countryFillColor(countryIso3(d)))
        .attr("fill-opacity", d => d.properties?.__globeProblem ? 0 : (countryIso3(d) === selectedCountryIso3 ? .98 : .88))
        .attr("stroke", d => countryIso3(d) === selectedCountryIso3 ? "#ffffff" : "rgba(15,23,42,.7)")
        .attr("stroke-width", d => countryIso3(d) === selectedCountryIso3 ? 1.8 : .6)
        .style("cursor", d => d.properties?.__globeProblem ? "default" : "pointer")
        .style("pointer-events", d => d.properties?.__globeProblem ? "none" : "all")
        .on("mouseover", (event, d) => {
          d3.select(event.currentTarget).attr("stroke", "#fff").attr("stroke-width", 1.8);
          showHover(event, countryHoverHTML(countryIso3(d), d));
        })
        .on("mousemove", event => updateHoverPosition(event))
        .on("mouseout", (event, d) => {
          d3.select(event.currentTarget)
            .attr("stroke", countryIso3(d) === selectedCountryIso3 ? "#ffffff" : "rgba(15,23,42,.7)")
            .attr("stroke-width", countryIso3(d) === selectedCountryIso3 ? 1.8 : .6);
          hideHover();
        })
        .on("click", (event, d) => {
          if (globeWasDragged) return;
          selectCountryByIso3(countryIso3(d), { zoom: false, loadArea: true, rotateGlobe: false });
        });

      // Top ocean overlay. It is masked so only oceans/seas are painted blue.
      // This keeps the water color fixed for Classification, Population, Density, GDP, and GDP per Capita.
      globeSvg.append("path")
        .datum(sphereDatum)
        .attr("class", "globe-water-top-layer")
        .attr("d", globePath)
        .attr("fill", THEMATIC_WATER_COLOR)
        .attr("opacity", 1)
        .attr("mask", `url(#${oceanMaskId})`)
        .style("pointer-events", "none");

      globeSvg.append("path")
        .datum(sphereDatum)
        .attr("class", "globe-outline")
        .attr("d", globePath)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,.65)")
        .attr("stroke-width", 1.2)
        .style("pointer-events", "none");

      setupGlobeDrag();
    }

    function setupGlobeDrag() {
      const drag = d3.drag()
        .on("start", function(event) {
          globeWasDragged = false;
          this._start = { x: event.x, y: event.y, rotate: [...globeRotation] };
          d3.select("#globeSvg").style("cursor", "grabbing");
        })
        .on("drag", function(event) {
          globeWasDragged = true;
          const start = this._start || { x: event.x, y: event.y, rotate: [...globeRotation] };
          const dx = event.x - start.x;
          const dy = event.y - start.y;
          globeRotation = [start.rotate[0] + dx * 0.55, Math.max(-89, Math.min(89, start.rotate[1] - dy * 0.42))];
          refreshGlobeGeometry();
        })
        .on("end", function() {
          d3.select("#globeSvg").style("cursor", "grab");
          setTimeout(() => { globeWasDragged = false; }, 120);
        });
      globeSvg.call(drag);
      globeSvg.on("wheel", (event) => {
        event.preventDefault();
        globeScaleBoost = Math.max(.7, Math.min(2.2, globeScaleBoost + (event.deltaY < 0 ? .08 : -.08)));
        renderGlobe();
      });
    }


    function toggleToolPopup(panelId, buttonId) {
      const panel = el(panelId);
      const button = el(buttonId);
      if (!panel || !button) return;
      const willOpen = !panel.classList.contains("open");
      document.querySelectorAll(".tool-popup").forEach(p => p.classList.remove("open"));
      document.querySelectorAll(".map-fab").forEach(b => b.classList.remove("active"));
      if (willOpen) {
        panel.classList.add("open");
        button.classList.add("active");
      }
    }

    el("baseMapToggleBtn").addEventListener("click", () => toggleToolPopup("baseMapPopup", "baseMapToggleBtn"));
    el("layerToggleBtn").addEventListener("click", () => toggleToolPopup("layerPopup", "layerToggleBtn"));
    el("turfToggleBtn").addEventListener("click", () => toggleToolPopup("turfPopup", "turfToggleBtn"));
    document.querySelectorAll(".close-popup").forEach(btn => btn.addEventListener("click", () => {
      const panelId = btn.dataset.close;
      const panel = panelId ? el(panelId) : null;
      if (panel) panel.classList.remove("open");
      document.querySelectorAll(".map-fab").forEach(b => b.classList.remove("active"));
    }));

    document.querySelectorAll("input[data-layer]").forEach(input => input.addEventListener("change", syncLayerVisibility));
    document.querySelectorAll("input[name='basemap']").forEach(input => input.addEventListener("change", e => setBaseMap(e.target.value)));

    document.querySelectorAll(".collapse-head").forEach(head => {
      head.addEventListener("click", () => {
        const section = head.closest(".section");
        section.classList.toggle("collapsed");
        const chev = head.querySelector(".chev");
        if (chev) chev.textContent = section.classList.contains("collapsed") ? "Click to open tools ▸" : "Click to manage ▾";
      });
    });

    el("searchBtn").addEventListener("click", searchPlace);
    el("placeSearch").addEventListener("keydown", e => { if (e.key === "Enter") searchPlace(); });
    el("locateBtn").addEventListener("click", locateMe);
    el("themeSelect").addEventListener("change", updateWorldStyles);
    el("yearSelect").addEventListener("change", async e => {
      setLoading(`Loading World Bank GDP and population for ${e.target.value}...`, true);
      await Promise.all([loadGdpData(e.target.value), loadPopulationData(e.target.value)]);
      updateWorldStyles();
      if (selectedCountryIso3) updateCountryDashboard(selectedCountryIso3);
      setLoading("", false);
    });

    el("bufferBtn").addEventListener("click", turfBuffer);
    el("centerBtn").addEventListener("click", turfCountryCenter);
    el("bboxBtn").addEventListener("click", turfBoundingBox);
    el("distanceBtn").addEventListener("click", turfDistanceFromMe);
    el("clearTurfBtn").addEventListener("click", clearTurf);
    el("addPointModeBtn").addEventListener("click", toggleTurfPointMode);
    el("distancePointsBtn").addEventListener("click", calculateTurfPointDistance);
    el("areaPointsBtn").addEventListener("click", calculateTurfPointArea);
    el("clearPointsBtn").addEventListener("click", clearTurfPoints);

    map.on("click", event => {
      if (turfPointMode) addTurfPoint(event.latlng);
    });

    async function initialize() {
      try {
        setLoading("Loading global country boundaries and live API data...", true);
        await Promise.all([
          loadRestCountries(),
          loadWorldBankCountries(),
          loadWorldGeoJSON(),
          loadGdpData(el("yearSelect").value),
          loadPopulationData(el("yearSelect").value),
          loadAreaData()
        ]);
        buildWorldLayer();
        initGlobe();
        updateLegend();
        syncLayerVisibility();
        setDetails("Project ready", `
          <div class="hint">The large map screen contains all visual results, base maps, world country classes, operational layers, distances, and area tools. Click any country to send full information to the right dashboard.</div>
          <div class="row"><span>Classification layer</span><strong>All countries</strong></div>
          <div class="row"><span>Data join key</span><strong>ISO_A3 / CCA3</strong></div>
          <div class="row"><span>Turf drawing</span><strong>Add points + distance/area</strong></div>
        `);
      } catch (err) {
        console.error(err);
        setDetails("Initialization error", `<div class="hint">The application could not load one of the required global data sources. Check your internet connection and refresh the page.</div>`);
      } finally {
        setLoading("", false);
      }
    }

    initialize();
