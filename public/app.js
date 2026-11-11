// ParkPal - Global Parking Exhibition Demo
// Simulated parking facilities are generated around any searched map location.

document.addEventListener('DOMContentLoaded', () => {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  // Exhibition default: St. Mary's Residential Central School, Poojappura.
  // Coordinates are the mapped school-campus location; a manually saved pin still takes priority.
  const DEFAULT_EXHIBITION_LOCATION = {
    name: "St. Mary's Central School",
    city: 'Poojappura, Thiruvananthapuram',
    coords: [8.485395, 76.987891]
  };
  let initialCoords = DEFAULT_EXHIBITION_LOCATION.coords.slice();
  try {
    const saved = localStorage.getItem('parkpal_custom_location');
    if (saved) initialCoords = JSON.parse(saved);
  } catch (e) {}

  // App State
  const state = {
    userLocation: initialCoords,
    userCity: DEFAULT_EXHIBITION_LOCATION.city,
    zoomLevel: 15,
    activeFilter: 'all',
    currentRoute: null,
    isNavigating: false,
    currentMapLayerIndex: 0,
    audioEnabled: true,
    isNodeOnline: false,
    stations: [],
    demoStations: [],
    communityStations: [],
    isPickingNexusLocation: false,
    pickedLocation: null,
    navigationStations: []
  };

  // Google Maps Layers
  const mapLayers = [
    {
      name: "Google Maps (Roadmap)",
      layer: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Map data &copy; Google Maps'
      })
    },
    {
      name: "Google Satellite (Real Aerial Imagery)",
      layer: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Imagery &copy; Google Satellite'
      })
    }
  ];

  // Map & Markers setup
  let map;
  let userMarker;
  let nexusLocationMarker = null;
  let userAccuracyCircle;
  let stationMarkers = [];
  let routePolyline = null;
  let audioCtx = null;
  let panDebounceTimer = null;
  let latestParkingRequestId = 0;

  // Initialize Map with Google Maps
  function initMap() {
    map = L.map('map', {
      center: state.userLocation,
      zoom: state.zoomLevel,
      zoomControl: false,
      attributionControl: false
    });

    // Keep the NEXUS selection pin above ordinary station and user markers.
    map.createPane('nexusPinPane');
    map.getPane('nexusPinPane').style.zIndex = 750;

    // Add Google Maps primary layer
    mapLayers[0].layer.addTo(map);

    // Initial User GPS Marker
    updateUserMarker();

    // Setup map interactions
    map.on('click', (e) => {
      if (state.isPickingNexusLocation) {
        confirmNexusMapPin(e.latlng);
      } else if (document.getElementById('registerModal').style.display === 'flex') {
        setNexusPickedLocation(e.latlng, 'Location updated from the map.');
      }
    });

    // Load mapped parking facilities when panning to a new location.
    map.on('moveend', () => {
      clearTimeout(panDebounceTimer);
      panDebounceTimer = setTimeout(() => {
        const center = map.getCenter();
        loadDemoParking(center.lat, center.lng, false);
      }, 700);
    });

    // Setup Map Layer Toggle Button
    const btnMapLayer = document.getElementById('btnMapLayer');
    if (btnMapLayer) {
      btnMapLayer.addEventListener('click', toggleMapLayer);
    }

    // Connect to Backend and acquire Real GPS
    checkBackend();
    applyStartingLocation();
  }

  // Toggle between road and satellite map layers.
  function toggleMapLayer() {
    map.removeLayer(mapLayers[state.currentMapLayerIndex].layer);
    state.currentMapLayerIndex = (state.currentMapLayerIndex + 1) % mapLayers.length;
    const nextLayer = mapLayers[state.currentMapLayerIndex];
    nextLayer.layer.addTo(map);
    showToast(`Map Style: ${nextLayer.name}`, 'fa-layer-group');
  }

  // Update or create the draggable user location pin.
  function updateUserMarker(accuracy = null) {
    if (userMarker) map.removeLayer(userMarker);
    if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

    const userIcon = L.divIcon({
      className: 'user-pin-wrapper',
      html: '<div class="pin-user"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    userMarker = L.marker(state.userLocation, { icon: userIcon, draggable: true }).addTo(map);
    userMarker.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif; text-align:center;">
        <b style="color:#2563eb;">📍 Exhibition Demo Location</b><br>
      <span style="font-size:12px; font-weight:700;">St. Mary's Central School, Poojappura</span><br>
        <span style="font-size:11px; color:#10b981; font-weight:700;">
          (Drag pin anywhere to fine-tune!)
        </span>
      </div>
    `).openPopup();

    userMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      state.userLocation = [pos.lat, pos.lng];
      localStorage.setItem('parkpal_custom_location', JSON.stringify(state.userLocation));
      showToast(`Exact location updated to [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}]`, 'fa-location-dot');
      loadDemoParking(pos.lat, pos.lng, true);
    });

    if (accuracy && accuracy < 250) {
      userAccuracyCircle = L.circle(state.userLocation, {
        radius: accuracy,
        color: '#3b82f6',
        fillColor: '#93c5fd',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(map);
    }
  }

  // Use the school campus as the exhibition default. A pin the user previously
  // saved by dragging the marker is preserved and takes priority. No IP/GPS lookup
  // runs automatically, so the demo opens at the school even without internet.
  async function applyStartingLocation(fly = false) {
    const saved = localStorage.getItem('parkpal_custom_location');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2 &&
            Number.isFinite(parsed[0]) && Number.isFinite(parsed[1]) &&
            Math.abs(parsed[0]) <= 90 && Math.abs(parsed[1]) <= 180) {
          state.userLocation = parsed;
          updateUserMarker();
          if (fly) map.flyTo(state.userLocation, 16);
          else map.setView(state.userLocation, 16);
          showToast('Centered on your saved demo location!', 'fa-map-pin');
          loadDemoParking(state.userLocation[0], state.userLocation[1], true);
          return;
        }
      } catch (e) {
        // Ignore damaged or outdated saved coordinates and use the school default.
      }
    }

    state.userLocation = DEFAULT_EXHIBITION_LOCATION.coords.slice();
    state.userCity = DEFAULT_EXHIBITION_LOCATION.city;
    updateUserMarker();
    if (fly) map.flyTo(state.userLocation, 16);
    else map.setView(state.userLocation, 16);
    showToast("Exhibition location: St. Mary's Central School, Poojappura", 'fa-school');
    loadDemoParking(state.userLocation[0], state.userLocation[1], true);
  }

  // Check Node.js Server Connectivity
  async function checkBackend() {
    const badge = document.getElementById('nodeStatusBadge');
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        state.isNodeOnline = true;
        if (badge) {
          badge.innerHTML = `<i class="fa-solid fa-flask"></i> Global Demo Mode: Online`;
          badge.className = 'badge node-status';
        }
      }
    } catch (e) {
      state.isNodeOnline = false;
      if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-cloud"></i> Standalone Mode`;
      }
    }
  }

  // Keep approved community stations separate from short-lived simulated scan results.
  // A demo scan must never overwrite the stations saved in data/stations.json.
  function combineStationCollections() {
    state.stations = [...state.communityStations, ...state.demoStations];
  }

  async function loadApprovedCommunityStations() {
    try {
      const response = await fetch('/api/stations');
      if (!response.ok) throw new Error('Could not load approved community stations');
      const json = await response.json();
      if (json.success && Array.isArray(json.data)) {
        state.communityStations = json.data.map(st => ({
          ...st,
          isDemoData: false,
          isApproved: st.isApproved !== false && st.approvalStatus !== 'rejected'
        }));
        combineStationCollections();
      }
    } catch (error) {
      // Keep the last successfully loaded community station list on transient failures.
      console.warn('Community station refresh failed; keeping saved stations in view.', error);
      combineStationCollections();
    }
  }

  // Load temporary simulated map markers separately from approved community stations.
  // These demo records are for map/exhibition display only; NEXORA filters them out.
  async function loadDemoParking(lat, lng, showFeedback = false) {
    try {
      await Promise.all([
        loadApprovedCommunityStations(),
        (async () => {
          const params = new URLSearchParams({
            lat: String(lat),
            lng: String(lng),
            radius: '4'
          });
          const response = await fetch(`/api/stations/scan?${params.toString()}`);
          if (!response.ok) throw new Error('Demo parking scan failed');
          const result = await response.json();
          if (!result.success || !Array.isArray(result.stations)) {
            throw new Error(result.message || 'Demo parking data is unavailable');
          }
          state.demoStations = result.stations.map(station => ({
            ...station,
            isDemoData: true,
            isApproved: false
          }));
        })()
      ]);

      combineStationCollections();
      renderStationMarkers();
      if (showFeedback) {
        showToast(
          `Loaded ${state.demoStations.length} demo locations and ${state.communityStations.length} saved community station(s).`,
          'fa-square-parking'
        );
      }
      return true;
    } catch (error) {
      console.warn('Parking locations could not be refreshed:', error);
      // Keep any demo locations already loaded and keep registered stations separate.
      combineStationCollections();
      renderStationMarkers();
      if (showFeedback) {
        showToast('Could not load demo parking locations. Check that the Node.js server is running.', 'fa-circle-exclamation');
      }
      return false;
    }
  }

  // During navigation, show only the parking stops explicitly selected for this trip.
  function renderStationMarkers(filteredList = state.stations) {
    stationMarkers.forEach(m => map.removeLayer(m));
    stationMarkers = [];

    const visibleStations = state.isNavigating ? state.navigationStations : filteredList;

    visibleStations.forEach(st => {
      const isCommunityStation = !st.isDemoData && st.isApproved !== false;
      const pinColor = isCommunityStation ? 'pin-green' : 'pin-blue';
      const capacityLabel = isCommunityStation
        ? `Approved station: ${st.slotsAvailable} of ${st.totalSlots} spaces`
        : `Demo availability: ${st.slotsAvailable} of ${st.totalSlots} spaces`;

      const customIcon = L.divIcon({
        className: 'custom-pin-container',
        html: `<div class="custom-pin ${pinColor}"><i class="fa-solid fa-square-parking"></i></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([st.lat, st.lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width: 180px;">
          <h4 style="margin:0 0 4px 0; color:#0f172a; font-size:13px; font-weight:700;">${escapeHtml(st.name)}</h4>
          <p style="margin:0 0 6px 0; font-size:11px; color:#64748b;">
            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(st.distance || 'Saved location')} • <strong>${escapeHtml(st.rate || 'Community parking')}</strong>
          </p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span style="font-size:11px; font-weight:700; color:${isCommunityStation ? '#047857' : '#1d4ed8'}; background:${isCommunityStation ? '#d1fae5' : '#dbeafe'}; padding:2px 6px; border-radius:4px;">
              ${escapeHtml(capacityLabel)}
            </span>
            <button class="popup-nav" style="background:#2563eb; color:#fff; border:none; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
              Navigate
            </button>
          </div>
        </div>
      `);
      marker.on('popupopen', event => {
        event.popup.getElement().querySelector('.popup-nav').onclick = () => startNavigation(st);
      });

      stationMarkers.push(marker);
    });
  }

  // Sound Synthesizer for Radar Audio
  function playRadarPing() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }

  // Live Clock Update
  function updateClock() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const clockEl = document.getElementById('statusClock');
    if (clockEl) clockEl.textContent = `${hrs}:${mins}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Show Toast
  function showToast(message, icon = 'fa-circle-check') {
    const toast = document.getElementById('toastNotice');
    toast.innerHTML = `<i class="fa-solid ${escapeHtml(icon)}"></i> ${escapeHtml(message)}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // SCAN ACTION (NEXORA searches approved, available stations within 2 km of the map pin)
  const btnScan = document.getElementById('btnScan');
  const radarOverlay = document.getElementById('radarOverlay');
  const bottomSheet = document.getElementById('bottomSheet');
  const scanBarContainer = document.querySelector('.scan-bar-container');

  // Hide the nearby list and SCAN control during routes; only selected trip stops remain pinned.
  function setNavigationMode(active) {
    state.isNavigating = active;
    if (!active) state.navigationStations = [];
    bottomSheet.classList.remove('open');

    if (active) {
      const parkingList = document.getElementById('parkingList');
      if (parkingList) parkingList.innerHTML = '';
      document.getElementById('sheetSubtitle').textContent =
        'Only selected parking stops are visible during navigation';
      radarOverlay.style.display = 'none';
    }

    if (btnScan) btnScan.disabled = active;
    if (scanBarContainer) scanBarContainer.style.display = active ? 'none' : '';
  }

  btnScan.addEventListener('click', performScan);

  async function performScan() {
    if (state.isNavigating) return;
    playRadarPing();
    radarOverlay.style.display = 'flex';
    bottomSheet.classList.remove('open');

    // NEXORA SCAN is centred on the user's draggable selected location pin.
    const center = { lat: state.userLocation[0], lng: state.userLocation[1] };
    setTimeout(() => playRadarPing(), 500);

    try {
      const response = await fetch(
        `/api/nexora/find?lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(center.lng)}`
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'NEXORA scan failed.');
      }

      state.demoStations = [];
      state.stations = (result.stations || []).map(station => ({
        ...station,
        isDemoData: false,
        isApproved: true,
        distance: Number(station.distanceKm) < 1
          ? `${Math.round(Number(station.distanceKm) * 1000)} m`
          : `${Number(station.distanceKm).toFixed(1)} km`
      }));
      renderStationMarkers(state.stations);
      document.getElementById('sheetTitle').textContent = 'NEXORA · Available Parking';
      document.getElementById('sheetSubtitle').textContent =
        `Within 2 km of your selected map pin · ${state.stations.length} found`;

      setTimeout(() => {
        radarOverlay.style.display = 'none';
        if (state.isNavigating) return;
        renderParkingSheet();
        bottomSheet.classList.add('open');
        showToast(
          result.message || `NEXORA found ${state.stations.length} available approved station(s).`,
          'fa-location-crosshairs'
        );
      }, 450);
    } catch (error) {
      radarOverlay.style.display = 'none';
      showToast(error.message || 'NEXORA could not search parking stations.', 'fa-circle-exclamation');
    }
  }

  // Render Parking List in Bottom Sheet
  function renderParkingSheet() {
    const listEl = document.getElementById('parkingList');
    listEl.innerHTML = '';

    if (state.isNavigating) {
      bottomSheet.classList.remove('open');
      document.getElementById('sheetSubtitle').textContent =
        'Only selected parking stops are visible during navigation';
      return;
    }

    let filtered = state.stations;
    if (state.activeFilter === 'free') {
      filtered = filtered.filter(s => s.price === 'Free');
    } else if (state.activeFilter === 'ev') {
      filtered = filtered.filter(s => s.type && s.type.includes('ev'));
    } else if (state.activeFilter === 'bike') {
      filtered = filtered.filter(s => s.type && s.type.includes('bike'));
    }

    document.getElementById('sheetSubtitle').textContent =
      `Showing ${filtered.length} parking stations`;

    if (filtered.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'parking-empty-state';
      emptyState.textContent = state.stations.length === 0
        ? 'No approved community stations or demo parking stations are available.'
        : 'No stations match this filter.';
      listEl.appendChild(emptyState);
    }

    filtered.forEach(st => {
      const card = document.createElement('div');
      card.className = 'parking-card';
      card.innerHTML = `
        <div class="parking-info">
          <h4>${escapeHtml(st.name)}</h4>
          <div class="parking-meta">
            <span><i class="fa-solid fa-location-arrow"></i> ${escapeHtml(st.distance || 'Nearby')}</span>
            <span>•</span>
            <span class="price-text ${st.price === 'Free' ? 'free' : ''}">${escapeHtml(st.rate)}</span>
          </div>
          <div class="parking-badges">
            <span class="slot-badge ${st.isDemoData ? 'slot-blue' : 'slot-green'}">${st.isDemoData ? `Demo: ${st.slotsAvailable} of ${st.totalSlots} spaces shown open` : `Approved: ${st.slotsAvailable} of ${st.totalSlots} spaces`}</span>
            <span class="tag-badge">${st.isDemoData ? 'Simulated demo data' : 'Approved community station'}</span>
            ${st.type && st.type.includes('ev') ? '<span class="tag-badge"><i class="fa-solid fa-bolt"></i> EV</span>' : ''}
            ${st.type && st.type.includes('bike') ? '<span class="tag-badge"><i class="fa-solid fa-motorcycle"></i> Bike</span>' : ''}
          </div>
        </div>
        <div class="parking-actions">
          <button class="btn-nav" data-id="${st.id}">
            <i class="fa-solid fa-diamond-turn-right"></i> Navigate
          </button>
        </div>
      `;

      card.querySelector('.btn-nav').addEventListener('click', (e) => {
        e.stopPropagation();
        startNavigation(st);
      });

      card.addEventListener('click', () => {
        map.flyTo([st.lat, st.lng], 17);
        const marker = stationMarkers.find(m => {
          const latlng = m.getLatLng();
          return Math.abs(latlng.lat - st.lat) < 0.0001 && Math.abs(latlng.lng - st.lng) < 0.0001;
        });
        if (marker) marker.openPopup();
      });

      listEl.appendChild(card);
    });

    renderStationMarkers(filtered);
  }

  // Filter Chips in Bottom Sheet
  document.querySelectorAll('.sheet-filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.sheet-filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.getAttribute('data-filter');
      renderParkingSheet();
    });
  });

  // Close Bottom Sheet
  document.getElementById('btnCloseSheet').addEventListener('click', () => {
    bottomSheet.classList.remove('open');
  });

  // Route preview to a simulated parking station.
  async function startNavigation(station) {
    setNavigationMode(true);
    state.navigationStations = [station];

    if (routePolyline) map.removeLayer(routePolyline);
    renderStationMarkers();

    let routeCoords = [state.userLocation, [station.lat, station.lng]];
    let distanceText = station.distance || '400 m';
    let durationText = '4 min drive';

    try {
      const res = await fetch(`/api/route?startLat=${state.userLocation[0]}&startLng=${state.userLocation[1]}&endLat=${station.lat}&endLng=${station.lng}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.coordinates && json.coordinates.length > 0) {
          routeCoords = json.coordinates;
          distanceText = `${json.distanceKm} km`;
          durationText = `${json.durationMinutes} min drive`;
        }
      }
    } catch (err) {}

    routePolyline = L.polyline(routeCoords, {
      color: '#2563eb',
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    const navBanner = document.getElementById('navBanner');
    document.getElementById('navDestName').textContent = `Navigating to ${station.name}`;
    document.getElementById('navDist').innerHTML = `<i class="fa-solid fa-location-arrow"></i> ${distanceText}`;
    document.getElementById('navETA').innerHTML = `<i class="fa-regular fa-clock"></i> ${durationText}`;
    document.getElementById('navSlots').textContent = station.isDemoData
      ? `Demo availability: ${station.slotsAvailable} of ${station.totalSlots} spaces shown open`
      : `Approved community station • ${station.slotsAvailable} of ${station.totalSlots} spaces`;
    navBanner.style.display = 'flex';

    showToast(`${station.isDemoData ? 'Demo route preview' : 'Route to approved station'}: ${station.name}.`, 'fa-diamond-turn-right');
  }

  // End Navigation
  document.getElementById('btnEndNav').addEventListener('click', () => {
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    document.getElementById('navBanner').style.display = 'none';
    state.navigationStations = [];
    setNavigationMode(false);
    renderStationMarkers();
    showToast("Navigation ended. Parking markers are visible again.", "fa-route");
  });

  // NEXUS: choose the station location with a pin on ParkPal's existing map.
  const nexusPinStatus = document.getElementById('nexusPinStatus');
  const btnNexusPickOnMap = document.getElementById('btnNexusPickOnMap');
  const btnNexusUseMapCenter = document.getElementById('btnNexusUseMapCenter');
  const nexusPinPickerBanner = document.getElementById('nexusPinPickerBanner');
  const nexusPinPickerMessage = document.getElementById('nexusPinPickerMessage');
  const btnNexusConfirmPinPick = document.getElementById('btnNexusConfirmPinPick');
  const btnNexusCancelPinPick = document.getElementById('btnNexusCancelPinPick');

  function setNexusPinStatus(message, kind = '') {
    nexusPinStatus.textContent = message;
    nexusPinStatus.className = 'nexus-file-status' + (kind ? ' ' + kind : '');
  }

  function updateNexusPinMarker(lat, lng) {
    const icon = L.divIcon({
      className: 'nexus-map-pin-wrap',
      html: '<div class="nexus-map-pin" role="img" aria-label="Selected parking location pin"><span>P</span></div>',
      iconSize: [48, 56],
      iconAnchor: [24, 52]
    });
    if (nexusLocationMarker) {
      nexusLocationMarker.setLatLng([lat, lng]);
      nexusLocationMarker.setIcon(icon);
      nexusLocationMarker.setZIndexOffset(10000);
    } else {
      nexusLocationMarker = L.marker([lat, lng], {
        icon: icon,
        pane: 'nexusPinPane',
        draggable: true,
        autoPan: true,
        zIndexOffset: 10000,
        keyboard: true,
        title: 'NEXUS selected parking location'
      }).addTo(map);
      nexusLocationMarker.on('dragend', () => {
        const pos = nexusLocationMarker.getLatLng();
        setNexusPickedLocation(pos, 'Pin moved. ParkPal will register this exact point.');
      });
    }
    nexusLocationMarker.bindPopup('<strong>NEXUS parking station pin</strong><br>Drag the bright red pin to fine-tune this location.');
    if (nexusLocationMarker.bringToFront) nexusLocationMarker.bringToFront();
  }

  function setNexusPickedLocation(location, message) {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setNexusPinStatus('That map position is not a valid coordinate.', 'error');
      return;
    }
    state.pickedLocation = [lat, lng];
    updateNexusPinMarker(lat, lng);
    const status = document.getElementById('regLocationStatus');
    status.textContent = 'Pinned at: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
    setNexusPinStatus(message + ' Coordinates: ' + lat.toFixed(6) + ', ' + lng.toFixed(6), 'success');
  }

  function confirmNexusMapPin(location) {
    // Preview the pin on the live map first. Do not cover it with the form yet.
    setNexusPickedLocation(location, 'Pin placed and visible on the map.');
    btnNexusConfirmPinPick.disabled = false;
    nexusPinPickerMessage.textContent = 'The bright red P pin marks your spot. Tap another point or drag the pin, then confirm.';
    showToast('NEXUS pin is visible. Check its position, then confirm.', 'fa-location-dot');
  }

  function clearNexusPinMarker() {
    if (nexusLocationMarker) {
      map.removeLayer(nexusLocationMarker);
      nexusLocationMarker = null;
    }
  }

  btnNexusPickOnMap.addEventListener('click', () => {
    state.isPickingNexusLocation = true;
    state.pickedLocation = null;
    clearNexusPinMarker();
    document.getElementById('regLocationStatus').textContent = 'No pin selected yet — choose a point on the map.';
    btnNexusConfirmPinPick.disabled = true;
    nexusPinPickerMessage.textContent = 'Tap the exact parking spot on the map. A large red P pin will appear at that point.';
    registerModal.style.display = 'none';
    nexusPinPickerBanner.style.display = 'flex';
    setNexusPinStatus('Choose a point on the map. The selected pin will be shown before you confirm.', '');
    showToast('Tap the map where the parking station is located.', 'fa-map-pin');
  });

  btnNexusConfirmPinPick.addEventListener('click', () => {
    if (!state.pickedLocation) {
      setNexusPinStatus('Tap the map to place a pin before confirming.', 'error');
      return;
    }
    state.isPickingNexusLocation = false;
    nexusPinPickerBanner.style.display = 'none';
    registerModal.style.display = 'flex';
    showToast('Pin confirmed. Complete the station details.', 'fa-check-circle');
  });

  btnNexusUseMapCenter.addEventListener('click', () => {
    const center = map.getCenter();
    setNexusPickedLocation(center, 'Using the current map center.');
  });

  btnNexusCancelPinPick.addEventListener('click', () => {
    state.isPickingNexusLocation = false;
    nexusPinPickerBanner.style.display = 'none';
    clearNexusPinMarker();
    state.pickedLocation = null;
    document.getElementById('regLocationStatus').textContent = 'No pin selected. Choose a location before registering.';
    registerModal.style.display = 'flex';
    setNexusPinStatus('Pin selection cancelled. Pick a location before registering.', '');
  });

  // Register Community Parking Station
  const btnRegister = document.getElementById('btnRegister');
  const registerModal = document.getElementById('registerModal');
  const btnCloseRegister = document.getElementById('btnCloseRegister');
  const btnCancelRegister = document.getElementById('btnCancelRegister');
  const registerForm = document.getElementById('registerForm');

  btnRegister.addEventListener('click', () => {
    state.isPickingNexusLocation = false;
    nexusPinPickerBanner.style.display = 'none';
    const center = map.getCenter();
    setNexusPickedLocation(center, 'Initial pin set to the current map center. Use Pick on map to choose another spot.');
    registerModal.style.display = 'flex';
  });

  function closeRegisterModal() {
    registerModal.style.display = 'none';
    state.isPickingNexusLocation = false;
    nexusPinPickerBanner.style.display = 'none';
    clearNexusPinMarker();
  }

  [btnCloseRegister, btnCancelRegister].forEach(b => {
    b.addEventListener('click', closeRegisterModal);
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const slots = parseInt(document.getElementById('regSlots').value) || 2;
    const priceType = document.getElementById('regPrice').value;

    const types = [];
    if (document.getElementById('regCar').checked) types.push('car');
    if (document.getElementById('regBike').checked) types.push('bike');
    if (document.getElementById('regEV').checked) types.push('ev');

    if (!state.pickedLocation) {
      showToast('Choose a parking station pin on the map first.', 'fa-location-dot');
      return;
    }

    const payload = {
      name: name,
      lat: state.pickedLocation[0],
      lng: state.pickedLocation[1],
      slots: slots,
      price: priceType,
      rate: priceType === 'Free' ? 'Totally Free (Community)' : '₹20/hr',
      type: types.length ? types : ['car']
    };

    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Station registration failed');
      const saved = await res.json();
      if (!saved.success || !saved.data) throw new Error('The server did not return the saved station.');
      const approvedStation = { ...saved.data, isDemoData: false, isApproved: true };
      state.communityStations = [
        approvedStation,
        ...state.communityStations.filter(st => String(st.id) !== String(approvedStation.id))
      ];
      combineStationCollections();
    }
    catch (err) {
      showToast('Could not save this community station. Please try again.', 'fa-circle-exclamation');
      return;
    }

    registerModal.style.display = 'none';
    registerForm.reset();
    state.pickedLocation = null;
    clearNexusPinMarker();

    map.flyTo([payload.lat, payload.lng], 17);
    renderStationMarkers();
    showToast(`"${name}" approved and saved. Its green station pin will remain on the map.`, 'fa-circle-check');
  });

  // FAB 3: Plan Trip — searchable city-wide OSM locations, not a fixed four-item list.
  const btnPlanTrip = document.getElementById('btnPlanTrip');
  const planTripModal = document.getElementById('planTripModal');
  const btnCloseTrip = document.getElementById('btnCloseTrip');
  const btnCancelTrip = document.getElementById('btnCancelTrip');
  const btnStartTripRoute = document.getElementById('btnStartTripRoute');
  const tripLocationSearch = document.getElementById('tripLocationSearch');
  const tripCategoryFilter = document.getElementById('tripCategoryFilter');
  const tripLocationResults = document.getElementById('tripLocationResults');
  const tripLocationCount = document.getElementById('tripLocationCount');
  const tripSelectedLocation = document.getElementById('tripSelectedLocation');
  let tripSearchTimer = null;
  let tripSearchRequest = 0;
  let tripResultsPage = 1;
  let tripResults = [];
  let selectedTripLocation = null;

  function attachTripResultEvents() {
    tripLocationResults.querySelectorAll('.trip-location-result').forEach(button => {
      button.addEventListener('click', () => {
        const poi = tripResults[Number(button.getAttribute('data-trip-index'))];
        if (!poi) return;
        selectedTripLocation = poi;
        resetNexoraTripPanel();
        btnStartTripRoute.disabled = false;
        tripSelectedLocation.innerHTML = `<strong>${escapeHtml(poi.name)}</strong><span>${escapeHtml(poi.category || 'Place')} · ${Number(poi.lat).toFixed(5)}, ${Number(poi.lng).toFixed(5)}</span>`;
        btnStartTripRoute.disabled = false;
        tripLocationResults.querySelectorAll('.trip-location-result').forEach(item => {
          const active = item === button;
          item.classList.toggle('selected', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      });
    });
  }

  async function loadTripLocations(options = {}) {
    const append = Boolean(options.append);
    const requestId = ++tripSearchRequest;
    const page = append ? tripResultsPage + 1 : 1;
    const query = tripLocationSearch.value.trim();
    const category = tripCategoryFilter.value || 'all';
    if (!append) {
      tripResultsPage = 1;
      tripLocationResults.innerHTML = '<p class="trip-location-message">Searching the city locations index…</p>';
    }

    try {
      const params = new URLSearchParams({ q: query, category, page: String(page), limit: '30' });
      const response = await fetch(`/api/pois?${params.toString()}`);
      const result = await response.json();
      if (requestId !== tripSearchRequest) return;

      if (!response.ok || !result.success) {
        tripLocationResults.innerHTML = `<p class="trip-location-message">${escapeHtml(result.message || 'Could not load city locations.')}</p>`;
        tripLocationCount.textContent = result.datasetNotLoaded ? 'City data not imported' : 'Search unavailable';
        return;
      }

      tripResultsPage = page;
      if (!append) {
        tripResults = [];
        tripLocationResults.innerHTML = '';
      }
      const offset = append ? tripResults.length : 0;
      const items = result.data || [];
      tripResults = tripResults.concat(items);
      if (!tripResults.length) {
        tripLocationResults.innerHTML = '<p class="trip-location-message">No matching places found. Try another name or category.</p>';
      } else {
        const htmlItems = items.map((poi, localIndex) => {
          const index = offset + localIndex;
          const selected = selectedTripLocation && selectedTripLocation.id === poi.id;
          return `<button type="button" class="trip-location-result${selected ? ' selected' : ''}" data-trip-index="${index}" role="option" aria-selected="${selected ? 'true' : 'false'}">
            <span class="trip-location-result-icon"><i class="fa-solid fa-location-dot"></i></span>
            <span class="trip-location-result-copy"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml(poi.category || 'Place')}${poi.address ? ` · ${escapeHtml(poi.address)}` : ''}</small></span>
            <i class="fa-solid fa-plus trip-location-add"></i>
          </button>`;
        }).join('');
        tripLocationResults.insertAdjacentHTML('beforeend', htmlItems);
      }

      tripLocationCount.textContent = `${result.count} matching · ${result.datasetCount} city locations`;
      if (!append && Array.isArray(result.categories)) {
        const current = tripCategoryFilter.value || 'all';
        tripCategoryFilter.innerHTML = '<option value="all">All categories</option>' +
          result.categories.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
        tripCategoryFilter.value = result.categories.includes(current) ? current : 'all';
      }

      const oldMore = document.getElementById('tripLoadMore');
      if (oldMore) oldMore.remove();
      if (result.hasMore) {
        tripLocationResults.insertAdjacentHTML('beforeend',
          '<button type="button" id="tripLoadMore" class="trip-load-more">Load more locations</button>');
        document.getElementById('tripLoadMore').addEventListener('click', () => loadTripLocations({ append: true }));
      }
      attachTripResultEvents();
    } catch (error) {
      if (requestId !== tripSearchRequest) return;
      tripLocationResults.innerHTML = '<p class="trip-location-message">Could not reach the local ParkPal server. Start it with npm start and try again.</p>';
      tripLocationCount.textContent = 'Server unavailable';
    }
  }

  btnPlanTrip.addEventListener('click', () => {
    planTripModal.style.display = 'flex';
    loadTripLocations();
  });
  [btnCloseTrip, btnCancelTrip].forEach(button => {
    button.addEventListener('click', () => planTripModal.style.display = 'none');
  });

  function clearTripDestinationSelection() {
    selectedTripLocation = null;
    tripSelectedLocation.textContent = 'No destination selected yet.';
    resetNexoraTripPanel();
    btnStartTripRoute.disabled = true;
  }

  tripLocationSearch.addEventListener('input', () => {
    clearTripDestinationSelection();
    clearTimeout(tripSearchTimer);
    tripSearchTimer = setTimeout(() => loadTripLocations(), 250);
  });
  tripCategoryFilter.addEventListener('change', () => {
    clearTripDestinationSelection();
    loadTripLocations();
  });

  let tripRouteCoordinates = null;
  let tripParkingResults = [];

  function resetNexoraTripPanel(message = 'Choose a destination, then find available parking stops.') {
    tripRouteCoordinates = null;
    tripParkingResults = [];
    document.getElementById('nexoraTripStatus').textContent = message;
    document.getElementById('nexoraTripResults').innerHTML =
      '<p class="nexora-parking-empty">No route search yet.</p>';
    btnStartTripRoute.innerHTML = '<i class="fa-solid fa-magnifying-glass-location"></i> Find Route Parking';
  }

  const MAX_NEXORA_TRIP_STOPS = 6;

  function updateNexoraTripSelectionCount() {
    const choices = Array.from(document.querySelectorAll('.nexora-trip-choice'));
    const selectedCount = choices.filter(input => input.checked).length;

    choices.forEach(input => {
      const disableUnselected = !input.checked && selectedCount >= MAX_NEXORA_TRIP_STOPS;
      input.disabled = disableUnselected;
      const option = input.closest('.nexora-parking-option');
      if (option) option.classList.toggle('at-selection-limit', disableUnselected);
    });

    const status = document.getElementById('nexoraTripStatus');
    if (tripParkingResults.length) {
      status.textContent = selectedCount
        ? `${selectedCount} of ${MAX_NEXORA_TRIP_STOPS} parking stop(s) selected. ParkPal will visit them in route order.`
        : `NEXORA found ${tripParkingResults.length} approved available station(s). Select up to ${MAX_NEXORA_TRIP_STOPS}.`;
      document.getElementById('tripParkVal').textContent =
        `${selectedCount} selected · ${tripParkingResults.length} found`;
    } else {
      document.getElementById('tripParkVal').textContent = 'No stops found';
    }
  }

  function renderNexoraTripStations(stations) {
    const resultsEl = document.getElementById('nexoraTripResults');
    if (!stations.length) {
      resultsEl.innerHTML =
        '<p class="nexora-parking-empty">No approved parking stations with available slots were found within 2 km of this route. You can still start the trip without a parking stop.</p>';
      return;
    }

    resultsEl.innerHTML = stations.map((station, index) => {
      const distance = Number(station.distanceToRouteKm);
      const distanceLabel = distance < 1
        ? `${Math.round(distance * 1000)} m from route`
        : `${distance.toFixed(1)} km from route`;
      return `<label class="nexora-parking-option">
        <input type="checkbox" class="nexora-trip-choice" data-station-index="${index}">
        <span class="nexora-parking-option-copy">
          <strong>${escapeHtml(station.name || 'Approved parking station')}</strong>
          <small>${escapeHtml(distanceLabel)} · ${escapeHtml(station.slotsAvailable)} available slots · ${escapeHtml(station.rate || station.price || 'Community parking')}</small>
        </span>
      </label>`;
    }).join('');

    resultsEl.querySelectorAll('.nexora-trip-choice').forEach(input => {
      input.addEventListener('change', updateNexoraTripSelectionCount);
    });
    updateNexoraTripSelectionCount();
  }

  async function findTripParkingAlongRoute() {
    if (!selectedTripLocation) {
      showToast('Choose a destination first.', 'fa-location-dot');
      return;
    }

    btnStartTripRoute.disabled = true;
    btnStartTripRoute.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> NEXORA is searching…';
    document.getElementById('nexoraTripStatus').textContent =
      'Building your route and checking approved parking within 2 km.';
    document.getElementById('nexoraTripResults').innerHTML =
      '<p class="nexora-parking-empty">NEXORA is checking the route corridor…</p>';

    const destination = [Number(selectedTripLocation.lat), Number(selectedTripLocation.lng)];
    try {
      const routeResponse = await fetch(
        `/api/route?startLat=${state.userLocation[0]}&startLng=${state.userLocation[1]}&endLat=${destination[0]}&endLng=${destination[1]}`
      );
      const routeJson = await routeResponse.json();
      if (!routeResponse.ok || !routeJson.success ||
          !Array.isArray(routeJson.coordinates) || routeJson.coordinates.length < 2) {
        throw new Error(routeJson.message || 'Could not build a route to this destination.');
      }

      tripRouteCoordinates = routeJson.coordinates;
      if (routeJson.source === 'straight-line-fallback') {
        showToast('Road routing is offline. NEXORA is checking the straight-line preview only.', 'fa-triangle-exclamation');
      }
      const discoveryResponse = await fetch('/api/nexora/along-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeCoordinates: tripRouteCoordinates })
      });
      const discoveryJson = await discoveryResponse.json();
      if (!discoveryResponse.ok || !discoveryJson.success) {
        throw new Error(discoveryJson.message || 'NEXORA could not inspect this route.');
      }

      tripParkingResults = Array.isArray(discoveryJson.stations)
        ? discoveryJson.stations
        : [];
      renderNexoraTripStations(tripParkingResults);
      updateNexoraTripSelectionCount();
      document.getElementById('tripDistVal').textContent =
        routeJson.distanceKm ? `${routeJson.distanceKm} km` : '—';
      document.getElementById('tripTimeVal').textContent =
        routeJson.durationMinutes ? `${routeJson.durationMinutes} min` : '—';
      btnStartTripRoute.disabled = false;
      btnStartTripRoute.innerHTML = '<i class="fa-solid fa-route"></i> Start Trip with Selected Stops';
      showToast(`NEXORA found ${tripParkingResults.length} route parking option(s).`, 'fa-check-circle');
    } catch (error) {
      tripRouteCoordinates = null;
      tripParkingResults = [];
      document.getElementById('nexoraTripStatus').textContent = error.message;
      document.getElementById('nexoraTripResults').innerHTML =
        `<p class="nexora-parking-empty">${escapeHtml(error.message)}</p>`;
      btnStartTripRoute.disabled = false;
      btnStartTripRoute.innerHTML = '<i class="fa-solid fa-rotate"></i> Try Route Search Again';
    }
  }

  async function startPlannedTripWithSelectedStops() {
    if (!selectedTripLocation || !tripRouteCoordinates) {
      await findTripParkingAlongRoute();
      return;
    }

    const destination = [Number(selectedTripLocation.lat), Number(selectedTripLocation.lng)];
    const selectedIndexes = Array.from(
      document.querySelectorAll('.nexora-trip-choice:checked')
    ).map(input => Number(input.getAttribute('data-station-index')));
    const selectedStops = selectedIndexes
      .map(index => tripParkingResults[index])
      .filter(Boolean)
      .sort((a, b) => Number(a.routeProgress) - Number(b.routeProgress));

    if (selectedStops.length > MAX_NEXORA_TRIP_STOPS) {
      showToast(`Choose up to ${MAX_NEXORA_TRIP_STOPS} parking stops for one trip.`, 'fa-circle-exclamation');
      return;
    }

    const waypoints = [
      state.userLocation,
      ...selectedStops.map(station => [Number(station.lat), Number(station.lng)]),
      destination
    ];

    btnStartTripRoute.disabled = true;
    btnStartTripRoute.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing trip…';
    try {
      const response = await fetch('/api/route/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints })
      });
      const route = await response.json();
      if (!response.ok || !route.success ||
          !Array.isArray(route.coordinates) || route.coordinates.length < 2) {
        throw new Error(route.message || 'Could not build the multi-stop route.');
      }

      planTripModal.style.display = 'none';
      if (route.source === 'straight-line-fallback') {
        showToast('Road routing is offline. Showing a straight-line multi-stop preview.', 'fa-triangle-exclamation');
      }
      setNavigationMode(true);
      state.navigationStations = selectedStops;
      if (routePolyline) map.removeLayer(routePolyline);
      routePolyline = L.polyline(route.coordinates, {
        color: '#10b981',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      renderStationMarkers();
      map.fitBounds(routePolyline.getBounds(), { padding: [45, 45] });

      const navBanner = document.getElementById('navBanner');
      document.getElementById('navDestName').textContent = selectedStops.length
        ? `Trip to ${selectedTripLocation.name} · ${selectedStops.length} parking stop(s)`
        : `Trip to ${selectedTripLocation.name}`;
      document.getElementById('navDist').innerHTML =
        `<i class="fa-solid fa-route"></i> ${route.distanceKm} km`;
      document.getElementById('navETA').innerHTML =
        `<i class="fa-regular fa-clock"></i> ${route.durationMinutes} mins`;
      document.getElementById('navSlots').textContent = selectedStops.length
        ? `${selectedStops.length} selected approved stop(s) · not reserved`
        : 'No parking stop selected · not reserved';
      navBanner.style.display = 'flex';
      showToast(
        selectedStops.length
          ? `Trip started with ${selectedStops.length} selected parking stop(s).`
          : 'Trip started directly to your destination.',
        'fa-route'
      );
    } catch (error) {
      showToast(error.message || 'Could not start the planned trip.', 'fa-circle-exclamation');
    } finally {
      btnStartTripRoute.disabled = false;
      btnStartTripRoute.innerHTML = '<i class="fa-solid fa-route"></i> Start Trip with Selected Stops';
    }
  }

  btnStartTripRoute.addEventListener('click', async () => {
    if (!tripRouteCoordinates) {
      await findTripParkingAlongRoute();
    } else {
      await startPlannedTripWithSelectedStops();
    }
  });

  // FAB 4 & 5: Zoom In & Zoom Out
  document.getElementById('btnMyLocation').addEventListener('click', () => {
    const location = userMarker.getLatLng();
    map.flyTo(location, 16);
    userMarker.openPopup();
  });
  document.getElementById('btnZoomIn').addEventListener('click', () => map.zoomIn());
  document.getElementById('btnZoomOut').addEventListener('click', () => map.zoomOut());

  // Global location search for jumping to a city or address.
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchDropdown = document.getElementById('searchDropdown');
  let searchDebounce = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearSearchBtn.style.display = query.length > 0 ? 'flex' : 'none';

    if (query.length < 2) {
      searchDropdown.style.display = 'none';
      return;
    }

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      // Fetch real global places from API
      let remoteMatches = [];
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          remoteMatches = json.results || [];
        }
      } catch (e) {}

      if (remoteMatches.length > 0) {
        searchDropdown.innerHTML = remoteMatches.map(m => `
          <div class="search-item" data-lat="${escapeHtml(m.lat)}" data-lng="${escapeHtml(m.lng)}" data-name="${escapeHtml(m.name)}">
            <i class="fa-solid fa-location-dot" style="color:#2563eb;"></i>
            <span>${escapeHtml(m.name)}</span>
            <span class="meta">${escapeHtml(m.fullName.split(',').slice(1, 3).join(','))}</span>
          </div>
        `).join('');
        searchDropdown.style.display = 'block';

        searchDropdown.querySelectorAll('.search-item').forEach(item => {
          item.addEventListener('click', () => {
            const lat = parseFloat(item.getAttribute('data-lat'));
            const lng = parseFloat(item.getAttribute('data-lng'));
            const name = item.getAttribute('data-name');
            searchInput.value = name;
            searchDropdown.style.display = 'none';
            map.flyTo([lat, lng], 15);
            showToast(`Loading parking stations in ${name}...`, 'fa-spinner fa-spin');
            loadDemoParking(lat, lng, true);
          });
        });
      } else {
        searchDropdown.innerHTML = `<div class="search-item" style="color:#94a3b8;">No matching locations found</div>`;
        searchDropdown.style.display = 'block';
      }
    }, 300);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchDropdown.style.display = 'none';
  });

  // Android Bottom Keys
  document.getElementById('homeKey').addEventListener('click', () => {
    bottomSheet.classList.remove('open');
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    document.getElementById('navBanner').style.display = 'none';
    state.navigationStations = [];
    setNavigationMode(false);
    renderStationMarkers();
    map.flyTo(state.userLocation, 15);
  });

  document.getElementById('backKey').addEventListener('click', () => {
    if (bottomSheet.classList.contains('open')) {
      bottomSheet.classList.remove('open');
    } else if (document.getElementById('navBanner').style.display !== 'none') {
      document.getElementById('btnEndNav').click();
    }
  });

  // Toggle Phone Frame Mockup vs Fullscreen for Tablets
  const toggleViewBtn = document.getElementById('toggleViewBtn');
  const phoneContainer = document.getElementById('phoneContainer');
  toggleViewBtn.addEventListener('click', () => {
    phoneContainer.classList.toggle('fullscreen-mode');
    setTimeout(() => map.invalidateSize(), 300);
  });

  // Judge & Viva Presentation Guide Modal
  const openPitchBtn = document.getElementById('openPitchBtn');
  const pitchModal = document.getElementById('pitchModal');
  const btnClosePitch = document.getElementById('btnClosePitch');

  openPitchBtn.addEventListener('click', () => pitchModal.style.display = 'flex');
  btnClosePitch.addEventListener('click', () => pitchModal.style.display = 'none');

  // Viva 1-Click Scenario Triggers
  document.getElementById('scenScan').addEventListener('click', () => {
    pitchModal.style.display = 'none';
    performScan();
  });

  document.getElementById('scenTrip').addEventListener('click', () => {
    pitchModal.style.display = 'none';
    btnPlanTrip.click();
    setTimeout(() => document.getElementById('btnStartTripRoute').click(), 400);
  });

  document.getElementById('scenRegister').addEventListener('click', () => {
    pitchModal.style.display = 'none';
    btnRegister.click();
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none';
  });

  // Initialize
  initMap();
});
