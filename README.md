# 🚌 BC Transit Real-Time Bus Tracker

A simple, self-contained web application that tracks **real-time bus locations**, **trip updates**, and **service alerts** for **Victoria, BC**.  

It uses data from the [BC Transit Open Data Portal](https://bctransit.com/open-data) and animates bus positions smoothly on a **Leaflet** map.

> *(Feel free to take a screenshot of your app and replace the link above!)*

---

## ✨ Features

- 🗺 **Real-Time Map** – Displays all active buses, updated every 10 seconds.  
- 🚍 **Smooth Animation** – Bus icons slide smoothly to new positions instead of “teleporting.”  
- 🔍 **Route Filtering** – View only buses on a selected route.  
- ⏰ **Live Departures** – Select a route and stop to see upcoming departures, color-coded by real-time status:
- 🚨 **Service Alerts** – A dropdown displays all current service alerts.  
- 🌙 **Dark Mode** – Toggle between light and dark themes.

---

## 🧠 How to Run This Project

This project’s **code is complete**, but the **130 MB+ of static transit data** is **not included** in the repository (it’s too large for GitHub).  
You’ll need to add the data folder manually.

---

### 1️⃣ Download the Static Data

1. Go to the [BC Transit Open Data Portal](https://bctransit.com/open-data).  
2. Find the **Victoria** transit system.  
3. Download the **Static Data** `.zip` file.  
4. Unzip it — you’ll see many `.txt` files (`routes.txt`, `stops.txt`, etc.).  
5. **Important:** This app uses `.json` versions of those files. You already have these `.json` files.  
6. Create a folder named `data` in the **main project directory**.  
7. Copy your `.json` files (`routes.json`, `stops.json`, `trips.json`, `stop_times.json`, etc.) into this new `data` folder.

---

### 2️⃣ Set Up the Server

This project uses a small **Python Flask proxy server** to fetch live data (to bypass browser CORS restrictions).

Install the required libraries:

```bash
pip install Flask requests


