let routes = [];
let stops = [];
let trips = [];
let stopTimes = [];

let stopMap = new Map();
let tripMap = new Map();
let routeTripsMap = new Map();

let root;
let realtimeTripUpdates = new Map();
let realtimeVehiclePositions = new Map();
let realtimeAlerts = [];

let map;
let markers = [];
let vehicleMarkers = new Map();

const TRIP_UPDATES_URL = 'tripupdates.pb';
const VEHICLE_POSITIONS_URL = 'vehicleupdates.pb';
const ALERTS_URL = 'alerts.pb';

async function loadData() {
  console.log("Loading GTFS static data...");

  // --- FIX: Load static files sequentially ---
  try {
    routes = await (await fetch('data/routes.json')).json();
    console.log("Loaded routes.json");
    
    stops = await (await fetch('data/stops.json')).json();
    console.log("Loaded stops.json");
    
    trips = await (await fetch('data/trips.json')).json();
    console.log("Loaded trips.json");
    
    stopTimes = await (await fetch('data/stop_times.json')).json();
    console.log("Loaded stop_times.json");
    
  } catch (e) {
    console.error("CRITICAL ERROR: Could not load static data files.", e);
    alert("Error: Could not load core app data. Please check the 'data' folder and server console.");
    return;
  }
  // --- END OF FIX ---
  
  console.log("Static GTFS data loaded.");

  buildIndexes();
  console.log("Indexes built.");

  // Set default map view to Victoria
  map = L.map('map').setView([48.4284, -123.3656], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  populateRoutes(); // This will now work!

  document.getElementById('route').addEventListener('change', onRouteChange);
  document.getElementById('route').addEventListener('change', updateVehicleMarkers);
  document.getElementById('stop').addEventListener('change', onStopChange);
  
  // --- UNDO: Re-added event listener for the alerts dropdown ---
  document.getElementById('alerts-select').addEventListener('change', onAlertChange);

  console.log("Loading GTFS-Realtime proto...");
  try {
    root = await protobuf.load('gtfs-realtime.proto');
    console.log("Proto loaded.");
  } catch (e) {
    console.error("Could not load gtfs-realtime.proto. Make sure the file is accessible.", e);
    return;
  }

  // Fetch immediately on load
  fetchRealtimeUpdates();
  
  // Set to 10-second refresh
  setInterval(fetchRealtimeUpdates, 10000);
}

function buildIndexes() {
  stops.forEach(stop => stopMap.set(stop.stop_id, stop));
  trips.forEach(trip => {
    tripMap.set(trip.trip_id, trip);
    if (!routeTripsMap.has(trip.route_id)) {
      routeTripsMap.set(trip.route_id, []);
    }
    routeTripsMap.get(trip.route_id).push(trip.trip_id);
  });
}

function populateRoutes() {
  const routeSelect = document.getElementById('route');
  routeSelect.innerHTML = '<option value="" disabled selected>Choose route</option>'; // Clear "Loading..."
  routes.forEach(route => {
    const option = document.createElement('option');
    option.value = route.route_id;
    option.textContent = `${route.route_short_name} - ${route.route_long_name}`;
    routeSelect.appendChild(option);
  });
  routeSelect.disabled = false; // Enable the dropdown

  const stopSelect = document.getElementById('stop');
  stopSelect.innerHTML = '<option value="" disabled selected>Choose stop</option>';
  stopSelect.disabled = true;
}

function onRouteChange() {
  const selectedRouteId = document.getElementById('route').value;
  const tripIds = routeTripsMap.get(selectedRouteId) || [];

  const stopSet = new Set();
  stopTimes.forEach(st => {
    if (tripIds.includes(st.trip_id)) {
      stopSet.add(st.stop_id);
    }
  });

  const stopSelect = document.getElementById('stop');
  stopSelect.innerHTML = '<option value="" disabled selected>Choose stop</option>';
  
  const sortedStops = Array.from(stopSet)
    .map(stopId => stopMap.get(stopId))
    .filter(Boolean) 
    .sort((a, b) => a.stop_name.localeCompare(b.stop_name));

  sortedStops.forEach(stop => {
    const option = document.createElement('option');
    option.value = stop.stop_id;
    option.textContent = stop.stop_name;
    stopSelect.appendChild(option);
  });
  
  stopSelect.disabled = false;

  document.getElementById('departures').innerHTML = '<li>Please select a stop.</li>';
  clearMarkers();
}

function onStopChange() {
  const routeId = document.getElementById('route').value;
  const stopId = document.getElementById('stop').value;
  if (!routeId || !stopId) return;

  const tripIds = routeTripsMap.get(routeId) || [];
  const stop = stopMap.get(stopId);

  if (stop) {
    map.setView([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], 15);
    clearMarkers();

    const marker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)]).addTo(map);
    marker.bindPopup(`<b>${stop.stop_name}</b>`).openPopup();
    markers.push(marker);
  }

  updateDepartures(routeId, stopId, tripIds);
}

function updateDepartures(routeId, stopId, tripIds) {
  console.log(`Updating departures for stop ${stopId} on route ${routeId}`);

  const now = new Date();
  const serviceDayStart = new Date(now);
  serviceDayStart.setHours(0, 0, 0, 0);
  const nowSeconds = Math.floor((now.getTime() - serviceDayStart.getTime()) / 1000);

  const departures = stopTimes
    .filter(st => tripIds.includes(st.trip_id) && st.stop_id === stopId)
    .map(st => {
      const scheduledSeconds = timeToSeconds(st.departure_time);
      let delaySeconds = 0;
      let adjustedSeconds = scheduledSeconds;
      let isCanceled = false;
      let hasRealtime = false;
      let statusClass = 'scheduled';

      const tripUpdate = realtimeTripUpdates.get(st.trip_id);
      
      if (tripUpdate) {
        if (tripUpdate.isDeleted === true || tripUpdate.trip?.scheduleRelationship === 'CANCELED') {
          isCanceled = true;
        } else {
          let stu = tripUpdate.stopTimeUpdate?.find(u => {
            return (
              (u.stopSequence && u.stopSequence === parseInt(st.stop_sequence)) ||
              (u.stopId && u.stopId === st.stop_id)
            );
          });

          if (stu) {
            hasRealtime = true;
            if (stu.scheduleRelationship === 'SKIPPED') {
              isCanceled = true;
            } else if (stu.departure?.delay != null) {
              delaySeconds = stu.departure.delay;
            } else if (stu.arrival?.delay != null) {
              delaySeconds = stu.arrival.delay;
            }
          }
        }
      }

      adjustedSeconds = scheduledSeconds + delaySeconds;
      
      if (hasRealtime) {
        if (delaySeconds > 60) {
          statusClass = 'delayed';
        } else {
          statusClass = 'on-time';
        }
      }
      
      return {
        scheduledSeconds,
        adjustedSeconds,
        delaySeconds,
        isCanceled,
        hasRealtime,
        departureTimeStr: st.departure_time,
        tripId: st.trip_id,
        statusClass: statusClass
      };
    })
    .filter(d => !d.isCanceled && d.adjustedSeconds >= nowSeconds)
    .sort((a, b) => a.adjustedSeconds - b.adjustedSeconds)
    .filter((dep, index, self) =>
      index === self.findIndex(d => d.adjustedSeconds === dep.adjustedSeconds)
    )
    .slice(0, 5);

  const departuresList = document.getElementById('departures');
  departuresList.innerHTML = '';

  if (departures.length === 0) {
    departuresList.innerHTML = '<li>No upcoming departures.</li>';
    return;
  }

  departures.forEach(d => {
    const timeStr = formatSecondsTo12Hour(d.adjustedSeconds);
    let infoStr = '';

    if (d.hasRealtime) {
      if (d.delaySeconds > 60) {
        infoStr = ` (Delayed ${Math.round(d.delaySeconds / 60)} min)`;
      } else if (d.delaySeconds < -60) {
        infoStr = ` (Early ${Math.round(Math.abs(d.delaySeconds) / 60)} min)`;
      } else {
        infoStr = ' (On Time)';
      }
    } else {
      infoStr = ' (Scheduled)';
    }

    const li = document.createElement('li');
    li.textContent = `${timeStr}${infoStr}`;
    li.classList.add(d.statusClass);
    departuresList.appendChild(li);
  });
}

// Resilient Fetching & Cache Busting
async function fetchRealtimeUpdates() {
  if (!root) {
    console.warn("Proto definition not loaded. Skipping realtime fetch.");
    return;
  }
  
  const cacheBuster = new Date().getTime();
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  console.log("Fetching realtime updates (every 10 seconds)...");

  // --- Fetch Trip Updates ---
  try {
    const tripRes = await fetch(`${TRIP_UPDATES_URL}?t=${cacheBuster}`);
    if (!tripRes.ok) throw new Error(`HTTP error! status: ${tripRes.status}`);
    const tripBuf = await tripRes.arrayBuffer();
    const tripDecoded = FeedMessage.decode(new Uint8Array(tripBuf));
    
    realtimeTripUpdates.clear();
    tripDecoded.entity.forEach(entity => {
      if (entity.tripUpdate && entity.tripUpdate.trip) {
        realtimeTripUpdates.set(entity.tripUpdate.trip.tripId, entity.tripUpdate);
      }
    });
    console.log("Trip updates decoded:", realtimeTripUpdates.size);
  } catch (e) {
    console.error("Failed to fetch/decode TRIP updates:", e);
  }

  // --- Fetch Vehicle Positions ---
  try {
    // --- THIS IS THE FIX ---
    // Changed "cacheBbuster" (with two 'B's) back to "cacheBuster"
    const vehicleRes = await fetch(`${VEHICLE_POSITIONS_URL}?t=${cacheBuster}`);
    // --- END OF FIX ---
    
    if (!vehicleRes.ok) throw new Error(`HTTP error! status: ${vehicleRes.status}`);
    const vehicleBuf = await vehicleRes.arrayBuffer();
    const vehicleDecoded = FeedMessage.decode(new Uint8Array(vehicleBuf));
    
    realtimeVehiclePositions.clear();
    vehicleDecoded.entity.forEach(entity => {
      if (entity.vehicle && entity.vehicle.vehicle && entity.vehicle.vehicle.id) {
        realtimeVehiclePositions.set(entity.vehicle.vehicle.id, entity.vehicle);
      } else if (entity.vehicle && entity.vehicle.trip && entity.vehicle.trip.tripId) {
        realtimeVehiclePositions.set(entity.vehicle.trip.tripId, entity.vehicle);
      }
    });
    console.log("Vehicle positions decoded:", realtimeVehiclePositions.size);
    updateVehicleMarkers();
  } catch (e) {
    console.error("Failed to fetch/decode VEHICLE positions:", e);
  }

  // --- Fetch Alerts ---
  try {
    const alertRes = await fetch(`${ALERTS_URL}?t=${cacheBuster}`);
    if (!alertRes.ok) throw new Error(`HTTP error! status: ${alertRes.status}`);
    const alertBuf = await alertRes.arrayBuffer();
    const alertDecoded = FeedMessage.decode(new Uint8Array(alertBuf));
    
    realtimeAlerts = [];
    alertDecoded.entity.forEach(entity => {
      if (entity.alert) {
        realtimeAlerts.push(entity.alert);
      }
    });
    console.log("Alerts decoded:", realtimeAlerts.length);
    updateAlerts();
  } catch (e) {
    console.error("Failed to fetch/decode ALERT updates:", e);
  }

  // --- Update Departures ---
  const routeId = document.getElementById('route').value;
  const stopId = document.getElementById('stop').value;
  if (routeId && stopId) {
    const tripIds = routeTripsMap.get(routeId) || [];
    updateDepartures(routeId, stopId, tripIds);
  }
}

function updateVehicleMarkers() {
  vehicleMarkers.forEach(marker => map.removeLayer(marker));
  vehicleMarkers.clear();

  const selectedRouteId = document.getElementById('route').value;

  realtimeVehiclePositions.forEach((vehicle, key) => {
    const pos = vehicle.position;
    if (!pos || !pos.latitude || !pos.longitude) return;

    const trip = vehicle.trip;
    if (selectedRouteId && (!trip || trip.routeId !== selectedRouteId)) {
      return;
    }

    const marker = L.circleMarker([pos.latitude, pos.longitude], {
      color: '#0078d7',
      fillColor: '#0078d7',
      fillOpacity: 1,
      radius: 6,
    }).addTo(map);

    let label = `Vehicle ${vehicle.vehicle?.label || key}`;
    if (trip && trip.routeId) {
        const route = routes.find(r => r.route_id === trip.routeId);
        if(route) {
            label = `Route ${route.route_short_name} (${vehicle.vehicle?.label || 'Bus'})`;
        }
    }
    
    marker.bindPopup(label);
    vehicleMarkers.set(key, marker);
  });
}

// --- UNDO: Re-added onAlertChange function ---
// This runs when you select an alert from the dropdown
function onAlertChange(e) {
  const selectedOption = e.target.options[e.target.selectedIndex];
  const descriptionBox = document.getElementById('alert-description');
  const description = selectedOption.dataset.description;

  if (description) {
    // If the selected option has a description, show it
    descriptionBox.textContent = description;
    descriptionBox.style.display = 'block';
  } else {
    // Otherwise (e.g., "Select an alert..." is chosen), hide the box
    descriptionBox.textContent = '';
    descriptionBox.style.display = 'none';
  }
}

// --- UNDO: Reverted updateAlerts function to populate the dropdown ---
// This function now filters alerts and populates the <select> dropdown
function updateAlerts() {
  const alertSelect = document.getElementById('alerts-select');
  const descriptionBox = document.getElementById('alert-description');
  if (!alertSelect) {
    console.error("Alert select element not found!");
    return;
  }

  const noDescText = 'No description available.';
  
  // 1. Filter out alerts that have no description
  const validAlerts = realtimeAlerts.filter(alert => {
    const desc = alert.descriptionText?.translation?.[0]?.text;
    // Keep the alert only if a description exists, it's not empty, 
    // and it's not the default "No description available." text.
    return desc && desc.trim() !== '' && desc !== noDescText;
  });

  // Save the currently selected value so we can try to restore it
  const previouslySelected = alertSelect.value;
  
  // Clear previous options
  alertSelect.innerHTML = '';
  // Reset description box in case the selected alert disappears
  if (!alertSelect.options[alertSelect.selectedIndex]?.dataset.description) {
      descriptionBox.textContent = '';
      descriptionBox.style.display = 'none';
  }

  if (validAlerts.length === 0) {
    // 2. Handle case with no alerts
    alertSelect.innerHTML = '<option value="">No service alerts.</option>';
    alertSelect.disabled = true;
    return;
  }

  // 3. Populate the dropdown with valid alerts
  alertSelect.disabled = false;
  alertSelect.innerHTML = '<option value="">Select an alert to read...</option>';

  validAlerts.forEach((alert, index) => {
    const header = alert.headerText?.translation?.[0]?.text || 'Service Alert';
    // We already know the description exists because we filtered for it
    const desc = alert.descriptionText.translation[0].text;
    
    const option = document.createElement('option');
    // Use a simple index as the value
    option.value = index; 
    option.textContent = header;
    // Store the full description text in the option's dataset
    option.dataset.description = desc; 
    
    alertSelect.appendChild(option);
  });
  
  // Restore the previous selection if it still exists
  alertSelect.value = previouslySelected;
}

function formatSecondsTo12Hour(seconds) {
  let h = Math.floor(seconds / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12; // 12 AM or 12 PM
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const [h, m, s] = timeStr.split(':').map(Number);
  // Handle times past midnight (e.g., 25:10:00)
  return h * 3600 + m * 60 + s;
}

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

// Start the app
loadData();