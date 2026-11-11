# 🚗 ParkPal — Computer Exhibition 2026 Presentation Guide

> **Project Name:** ParkPal  
> **Category:** Smart Cities / Web & Mobile Application / Geospatial AI  
> **Tagline:** *"Explore Parking Anywhere — A Global Exhibition Demo"*

---

## 🎯 1. The Real-World Problem (As seen in your notebook)
1. **The "No Parking" Trap:** Drivers circling downtown streets in panic, only to see "NO PARKING" boards, facing heavy towing fines and traffic bottlenecks.
2. **Fuel & Time Wastage:** Urban studies show drivers spend an average of **15 to 20 minutes** hunting for legal parking spots, wasting fuel and increasing city emissions.
3. **Trip Uncertainty:** Long journeys often result in arrival with no available parking at malls, stadiums, or tourist hubs.

---

## 💡 2. The ParkPal Solution & Core Features
- **Global "SCAN" Demo:** Generates 20–30 simulated parking stations within 4 km of any searched city or map location, without relying on local parking-map coverage.
- **Interactive Availability:** Displays simulated open-slot counts, rates, vehicle types, and EV options. These are exhibition data, not real parking availability or prices.
- **"Plan Trip" Preview:** Draws a demo route but does not book parking or guarantee a spot.
- **Community Registry:** Stores user-submitted demo entries separately from generated scan results.

---

## 📋 3. How to Set Up Your Exhibition Stall

### 🖼️ Tri-Fold Chart Board Layout

```
+---------------------------------------------------------------------------------+
|                                 PARKPAL                                         |
|              Smart Urban Parking Scanner & Trip Planner                         |
+------------------------+-------------------------------+------------------------+
|   LEFT PANEL           |        CENTER PANEL           |      RIGHT PANEL       |
|                        |                               |                        |
| 1. Problem Statement   |   App UI & Workflow           | 1. Future Scope        |
|    - Traffic Jams      |   (Photos/Diagrams of         |    - IoT ultrasonic    |
|    - "No Parking" fine |    your app screen & notebook)|      parking sensors   |
|    - Fuel wastage      |                               |    - Smart camera      |
|                        |   Live Demo Instructions:     |      license plate     |
| 2. Target Audience     |   "Tap the SCAN button to     |      scanner (ANPR)    |
|    - Daily commuters   |    see simulated spots!"     |                        |
|    - Road-trippers     |                               | 2. Tech Stack          |
|    - EV car owners     |   Key Innovations:            |    - HTML5 / CSS3      |
|                        |   - Global Demo Generator    |    - Modern JavaScript |
| 3. Statistics          |   - Separate Community List  |    - Leaflet.js map with online tiles  |
|    - 30% city traffic  |   - Trip Route Preview       |    - Web Audio API     |
|      caused by parking |                               |                        |
+------------------------+-------------------------------+------------------------+
|                      [ LAPTOP / TABLET LIVE DEMO RUNNING HERE ]                 |
+---------------------------------------------------------------------------------+
```

---

## 🎤 4. Winning Viva / Judge Q&A Cheatsheet

### Q1: "What inspired you to build ParkPal?"
> **Answer:** *"For this exhibition prototype, ParkPal can demonstrate its parking flow in any city. It generates 20–30 clearly labeled sample stations around the searched location, so the demo works even where parking data is unavailable."*

### Q2: "Where do the parking stations come from?"
> **Answer:** *"This is a global exhibition demo. Its parking locations, vacancy counts, prices, and vehicle options are generated sample data—not live listings. A production version could replace the generator with verified parking feeds."*

### Q3: "What does the 'Plan Trip' feature do?"
> **Answer:** *"Plan Trip previews a route. It does not book parking or guarantee a spot."*

### Q4: "How does the app know if a spot is free or occupied in the real world?"
> **Answer:** *"The displayed vacancy is simulated for the exhibition and is not live occupancy. A production version could integrate verified IoT sensors or parking-provider feeds."*

---

## 🚀 How to Run Your Project

### Option 1: Live Node.js Full-Stack Server (Recommended)
1. Open your terminal in `D:\ParkPal`.
2. Run:
   ```bash
   npm start
   ```
3. Open your browser to **http://localhost:3000**
   - The top header will display a **"Global Demo Mode: Online"** indicator!

### Option 2: In VS Code
1. Open the folder `D:\ParkPal` in VS Code.
2. In the terminal tab (`Ctrl + ~`), run: `npm start`.
3. Press `Ctrl + Shift + P` -> `Simple Browser: Show` -> enter `http://localhost:3000`.

---

## 🛠️ Full-Stack Architecture
- **Backend Server:** Node.js (v22) + Express.js
- **RESTful Endpoints:**
  - `GET /api/stations` — Returns all parking spots
  - `GET /api/stations/scan?lat=...&lng=...` — Generates 20–30 deterministic demo stations around any valid coordinates
  - `POST /api/stations` — Crowdsourced registration with persistent JSON storage
  - `GET /api/route` — Route preview
  - `GET /api/search` — Global place search
- **Parking scan data:** Generated on demand; no global parking database is stored.
- **Database:** `data/stations.json` (Separate community demo registry)
- **Frontend:** Responsive Mobile-First UI (Leaflet, global map layers, Web Audio Radar Synthesizer)

## Default exhibition location

The demo starts at **St. Mary's Residential Central School, Poojappura, Thiruvananthapuram** (PIN 695012), centered at `8.485395, 76.987891`. This is the exhibition starting point; dragging the location pin lets you choose another demo center.
