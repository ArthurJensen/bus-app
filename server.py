import os
from flask import Flask, send_from_directory, Response, jsonify
import requests # You should have already run `pip install requests`

# --- Configuration ---
# I have pasted in the real URLs you provided.
# No API key is needed!

TRIP_UPDATES_DOWNLOAD_URL = "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48"
VEHICLE_POSITIONS_DOWNLOAD_URL = "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48"
ALERTS_DOWNLOAD_URL = "https://bct.tmix.se/gtfs-realtime/alerts.pb?operatorIds=48"
# The static URL is not needed for this server, only the real-time ones.

# --- Flask App Setup ---
app = Flask(__name__)

# Get the directory this script is in
base_dir = os.path.abspath(os.path.dirname(__file__))
data_dir = os.path.join(base_dir, 'data')

# --- API Proxy Routes ---
# These routes match the URLs in your app.js
# 
@app.route('/tripupdates.pb')
def proxy_trip_updates():
    """Fetches the live TripUpdates .pb file from the public URL."""
    return proxy_feed("tripupdates.pb", TRIP_UPDATES_DOWNLOAD_URL)

@app.route('/vehicleupdates.pb')
def proxy_vehicle_positions():
    """Fetches the live VehiclePositions .pb file from the public URL."""
    return proxy_feed("vehicleupdates.pb", VEHICLE_POSITIONS_DOWNLOAD_URL)

@app.route('/alerts.pb')
def proxy_alerts():
    """Fetches the live Alerts .pb file from the public URL."""
    return proxy_feed("alerts.pb", ALERTS_DOWNLOAD_URL)

def proxy_feed(feed_name, external_url):
    """
    Fetches the live GTFS-RT feed from the official public URL.
    """
    print(f"Proxying request for: {feed_name} from {external_url}")

    try:
        # Make the request to the *real* BC Transit server
        # No API key or special headers are needed
        response = requests.get(external_url, timeout=5)
        response.raise_for_status() # Raise an error for bad responses (4xx, 5xx)

        # Success! Send the raw protocol buffer data back to your app
        
        # --- FIX: CACHE BUSTING HEADERS ---
        # These headers tell the browser to NOT cache this response
        # and to always ask for a fresh one. This is CRITICAL.
        resp = Response(response.content, content_type="application/x-protobuf")
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
        # --- END OF FIX ---

    except requests.exceptions.RequestException as e:
        print(f"Error fetching {external_url}: {e}")
        return jsonify({"error": str(e)}), 500

# --- Static File Routes ---
# These routes serve your local files (index.html, app.js, data files, etc.)

@app.route('/')
def serve_index():
    """Serves the main index.html file."""
    return send_from_directory(base_dir, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serves other static files (app.js, styles.css, etc.)."""
    return send_from_directory(base_dir, filename)

@app.route('/data/<path:filename>')
def serve_data_files(filename):
    """Serves files from your 'data' directory."""
    return send_from_directory(data_dir, filename)

# --- Run the Server ---
if __name__ == '__main__':
    print("Starting Flask proxy server at http://localhost:8000")
    print("Serving static files from:", base_dir)
    print("Serving data files from:", data_dir)
    app.run(port=8000, debug=True)