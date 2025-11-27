# 🚌 BC Transit Real-Time Bus Tracker

A simple, self-contained web application that tracks **real-time bus locations**, **trip updates**, and **service alerts** for **Victoria, BC**.  

It uses data from the [BC Transit Open Data Portal](https://bctransit.com/open-data) and animates bus positions smoothly on a **Leaflet** map.

---

## ✨ Features

- 🗺 **Real-Time Map** – Displays all active buses, updated every 10 seconds.  
- 🚍 **Smooth Animation** – Bus icons slide smoothly to new positions instead of “teleporting.”  
- 🔍 **Route Filtering** – View only buses on a selected route.  
- ⏰ **Live Departures** – Select a route and stop to see upcoming departures, color-coded by real-time status:
- 🚨 **Service Alerts** – A dropdown displays all current service alerts.  
- 🌙 **Dark Mode** – Toggle between light and dark themes.

---

## 1️⃣ Retriving Bus Data

This project’s **code is complete**, but the **130 MB+ of static transit data** is **not included** when cloning the repository (it’s too large for GitHub).  



You will be required to add the data folder manually.
In order to download the data, go to the releases tab and download the `data.zip` file.

---

## 2️⃣ Downloading the required files
In order to copy the project onto your machine, open you preferred command line and paste this code:
```bash 
git clone https://github.com/ArthurJensen/bus-app
```
Create a folder called data inside of the cloned respository.

Extract the data.zip file that we downloaded earlier, and paste the contents into the newely created data folder.


---

### 3️⃣ Set Up the Server
This project uses a small **Python Flask proxy server** to fetch live data (to bypass browser CORS restrictions).
Before proceeding with setting up the server, make sure that you have flask installed.

```bash
pip install Flask requests
```
Once you have the data and the required files, use python to launch the server.py.
The python script should provide you with a link to view the project such as `http://localhost:8000`

