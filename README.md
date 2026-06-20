# Smart GIS Dashboard for Global Country Analysis

**Student:** Yazan Hashlamoun  
**University:** Palestine Polytechnic University  
**Course Supervisor:** Dr. Motaz Qafisheh  
**Project Type:** Interactive Web GIS Dashboard  
**Main Mapping Library:** Leaflet.js  
**Additional GIS Libraries:** D3.js, Turf.js, OSMToGeoJSON

---

## 1. Project Overview

This project is an interactive Web GIS dashboard for global country analysis. The application displays world country boundaries on a dynamic map and connects them with live data from public APIs. Users can click a country or search for a country/city to view demographic, economic, weather, tourism, and spatial analysis information.

The dashboard includes:

- Interactive world choropleth map.
- First / Second / Third World country classification.
- Population, population density, GDP, and GDP per capita themes.
- Live API data loading using JavaScript `fetch()`.
- Country search and city search.
- Country dashboard with flag, capital, population, area, density, GDP, and income level.
- Weather dashboard for the selected country/city.
- OSM-based nearby roads, city labels, tourism, and historic landmarks.
- D3 3D Earth mode with thematic country coloring.
- Turf.js spatial tools for distance, area, buffer, center, and bounding box.
- User location tool.
- Multiple base maps: OpenStreetMap, Satellite, Dark Map, and 3D Earth.

---

## 2. Project Requirements Covered

The project follows the Web GIS dashboard requirements by using a mapping engine, live API ingestion, dynamic data joining, choropleth styling, legend, hover/click interactions, and user controls.

### Main implemented requirements

- **Live API ingestion:** Data is loaded when the page starts and when the user changes the selected year or searches for a place.
- **No hardcoded statistical values:** Population, GDP, country information, weather, and OSM features are fetched from external APIs.
- **Dynamic data joining:** API data is matched with the world GeoJSON layer using country identifiers, especially ISO A3 / CCA3 codes.
- **Interactive choropleth styling:** Countries are colored dynamically based on the selected theme.
- **Legend panel:** The legend updates automatically according to the selected data layer.
- **Hover / popup interaction:** Moving the mouse over a country shows the country name, ISO code, selected metric, and classification.
- **Data filter / switch:** The user can switch between classification, population density, population, GDP, and GDP per capita.
- **Spatial analysis:** Turf.js tools allow the user to measure distance, calculate polygon area, create buffers, find country center points, and generate bounding boxes.

---

## 3. Technologies Used

| Technology | Purpose |
|---|---|
| HTML5 | Page structure |
| CSS3 | Dashboard styling and responsive layout |
| JavaScript | Application logic and API integration |
| Leaflet.js | Main interactive web map |
| D3.js / d3-geo | 3D Earth orthographic projection |
| Turf.js | Spatial analysis tools |
| OSMToGeoJSON | Convert Overpass OSM JSON to GeoJSON |
| REST Countries API | Country metadata |
| World Bank API | GDP, population, income classification |
| Open-Meteo API | Weather data |
| Nominatim API | Country/city search and geocoding |
| Overpass API | Roads, city labels, tourism, and historic places |
| OpenSky API | Live aircraft data when available |

---

## 4. Live APIs Used

### 4.1 REST Countries API

Used to retrieve country metadata such as:

- Country name
- ISO A2 and ISO A3 codes
- Capital city
- Population
- Area
- Region and subregion
- Flag
- Currencies
- Languages
- Borders
- Landlocked status

### 4.2 World Bank API

Used to retrieve economic and development data:

- GDP using indicator `NY.GDP.MKTP.CD`
- Population using indicator `SP.POP.TOTL`
- Surface area using indicator `AG.SRF.TOTL.K2`
- Country income level for classification logic

The selected year can be changed from the dashboard, and the map recolors automatically.

### 4.3 Open-Meteo API

Used to show current weather information for the selected capital or searched city:

- Temperature
- Wind speed
- Humidity
- Weather condition code

### 4.4 Nominatim API

Used for searching countries and cities by name and converting the result into coordinates.

### 4.5 Overpass API

Used to load nearby geographic features around the selected place:

- Major roads
- City/town/village labels
- Tourism places
- Historic landmarks
- Museums and places of worship

### 4.6 OpenSky API

Used to display live aircraft around the selected area when available. If no aircraft are returned or the service is unavailable, the project shows demo aircraft movement so the flight layer remains understandable during presentation.

---

## 5. Data Joining Logic

The main geographic base layer is a world country GeoJSON file. Each country feature contains an ISO 3-letter code. The project joins API data to map features using this shared key.

### Main join fields

| Data Source | Join Field |
|---|---|
| World GeoJSON | Feature ID / ISO A3 |
| REST Countries API | `cca3` |
| World Bank API | `countryiso3code` |
| World Bank Country Metadata | `id` |

### Join workflow

1. Load world country boundaries as GeoJSON.
2. Load REST Countries data and store each country by `cca3`.
3. Load World Bank country metadata and store each country by ISO A3.
4. Load GDP, population, and area indicators from World Bank.
5. For every GeoJSON country feature, read its ISO A3 code.
6. Match that ISO A3 code with REST Countries and World Bank data.
7. Calculate derived values such as population density and GDP per capita.
8. Apply a style function to color the country according to the selected dashboard theme.

---

## 6. Country Classification Logic

The First / Second / Third World classification is based on the World Bank income level field.

| World Bank Income Level | Dashboard Class | Color |
|---|---|---|
| High income | First World | Green |
| Upper-middle income | Second World | Orange |
| Lower-middle income / Low income | Third World | Red |
| No data | No data | Gray |

This classification is used for the main thematic map and also appears inside the country dashboard.

---

## 7. Map Themes

The dashboard supports the following thematic layers:

1. First / Second / Third World Classification
2. Population Density
3. Population
4. GDP
5. GDP per Capita

When the user changes the theme, the map style function recalculates the color of every country and the legend updates automatically.

---

## 8. User Interface Controls

The project includes several controls:

- **Base map control:** Switch between OpenStreetMap, Satellite, Dark Map, and 3D Earth.
- **Operational layers control:** Turn map layers on or off.
- **Turf.js tools control:** Run spatial analysis tools.
- **Locate me button:** Detect the user's current position.
- **Search box:** Search for a country or city.
- **Theme dropdown:** Change the choropleth variable.
- **Year dropdown:** Change the World Bank data year.

---

## 9. Turf.js Spatial Analysis Tools

The project uses Turf.js to support interactive spatial analysis directly in the browser.

### Implemented tools

- **Add Points:** User can click points on the map.
- **Distance:** Calculates distance between added points.
- **Area:** Calculates polygon area from three or more added points.
- **60 km Buffer:** Creates a buffer around the selected place.
- **Country Center:** Finds the center point of the selected country.
- **Bounding Box:** Creates a bounding box around the selected feature.
- **Distance from Me:** Calculates distance from the user's location to the selected country/city.

The point measurement tool also shows the distance between each segment directly on the map and displays the polygon area inside the polygon.

---

## 10. D3 3D Earth Mode

The project includes a D3.js 3D Earth view using an orthographic projection. The 3D Earth mode allows users to:

- View countries on a globe-style projection.
- Drag to rotate the Earth.
- Use the mouse wheel to zoom.
- Click countries to update the dashboard.
- Keep water bodies colored blue while countries keep their thematic colors.

---

## 11. How to Run the Project

### Option 1: Open directly

1. Download the project files.
2. Keep the main HTML file in the project folder.
3. Open the HTML file in a modern browser such as Google Chrome or Microsoft Edge.

### Option 2: Run using VS Code Live Server

1. Open the project folder in Visual Studio Code.
2. Install the **Live Server** extension.
3. Right-click the HTML file.
4. Choose **Open with Live Server**.

This option is recommended because some browsers handle external API requests better when the page runs from a local server.

---

## 12. File Structure

```text
project-folder/
│
├── index.html        # Main Web GIS dashboard file
└── README.md         # Project documentation
```

The current project is implemented as a single HTML file that includes the structure, styling, and JavaScript logic together.

---

## 13. Notes and Limitations

- The dashboard depends on live public APIs, so internet connection is required.
- Some APIs may be temporarily slow or rate-limited, especially Overpass and OpenSky.
- OpenSky may return no aircraft for some selected areas. In that case, demo aircraft are displayed for presentation purposes.
- Nominatim is used for search and should be used responsibly.
- The project does not require paid API keys.
- Weather data is shown using Open-Meteo, which does not require an API key.

---

## 14. Technical Reflection

The main technical challenge was joining live API data with the world country boundary layer. Different APIs use different country identifiers, so the project standardizes the join around ISO A3 / CCA3 country codes. REST Countries provides `cca3`, World Bank provides `countryiso3code`, and the world GeoJSON layer provides an ISO A3-style identifier.

The second challenge was keeping the map style dynamic. Instead of writing fixed colors into the GeoJSON, the project uses a JavaScript style function. This function reads the selected dashboard theme, calculates the country value, chooses the correct color bin, and redraws the country layer whenever the user changes the theme or the data year.

The third challenge was integrating different map types in one interface. Leaflet is used for the main 2D map, while D3 is used for the 3D Earth projection. Both views use the same country data and the same color logic, which keeps the visual output consistent.

Turf.js adds spatial analysis capabilities directly inside the browser. This strengthens the GIS part of the project because the user can interactively measure distances, calculate areas, and generate spatial outputs without using desktop GIS software.

---

## 15. Credits

Developed by **Yazan Hashlamoun**  
Course Supervisor: **Dr. Motaz Qafisheh**  
**Palestine Polytechnic University**  
© 2026 Yazan Hashlamoun. All rights reserved.
