# SafeZone Cow Tracker

A real-time GPS-based cattle monitoring system developed by **Jean Claude & Samuel** from Near East University. This comprehensive solution enables farmers to track cow locations using ESP32-based GPS collars, manage farm geofences, and receive real-time alerts when cattle breach designated boundaries.

**Version:** 1.0.0
**Academic Year:** 2025-2026
**Status:** ✅ Operational (Development)

---

## Table of Contents

- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [How to Use](#how-to-use)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [ESP32 Integration](#esp32-integration)
- [WebSocket Communication](#websocket-communication)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Quick Start

### Prerequisites
- **Node.js** v14 or higher
- **npm** or yarn package manager
- **Modern web browser** (Chrome, Firefox, Safari, Edge)
- **ESP32 microcontroller** with GPS module (for collar integration)
- **SQLite3** (included with Node.js)

### Installation

1. **Navigate to project directory:**
   ```bash
   cd safezone
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   Or for development mode with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Open browser: `http://localhost:3000`
   - Server runs on **port 3000** (web + Socket.IO)
   - ESP32 WebSocket bridge runs on **port 8081**

5. **Default login credentials:**
   - **Email:** `jeanclaudemng@gmail.com`
   - **Password:** `safezone123456`

---

## System Architecture

### Technology Stack

**Backend:**
- Node.js with Express.js
- SQLite database (better-sqlite3)
- WebSocket (ws) for ESP32 communication
- Socket.IO for web client real-time updates
- Gmail API for email notifications
- Cron jobs for scheduled tasks

**Frontend:**
- Vanilla JavaScript (ES6+)
- Leaflet.js for interactive maps
- Leaflet Draw for fence creation
- HTML5 Geolocation API
- Responsive CSS design

**Hardware:**
- ESP32 microcontroller
- GPS module (Neo-6M or compatible)
- WebSocket client (port 8081)

### Network Ports

- **3000** - Web server (HTTP + Socket.IO for browsers)
- **8081** - WebSocket bridge (ESP32 devices only)

---

## How to Use

SafeZone provides three methods for farm setup and cattle tracking.

### Option 1: Use Device GPS (WiFi Positioning)

Register a new farm using your computer or mobile device's GPS location.

**Steps:**
1. Navigate to **Farm and Fence** page
2. Select **[1] Use this device's GPS**
3. Enter farm name (or leave empty for auto-generation: farm1, farm2, etc.)
4. Click **Register Farm** - system detects GPS location
5. On success, click **Continue to Fence Editor**
6. Draw fence boundaries using polygon or freehand tools
7. Save your fence

**Best for:** Initial farm setup, defining new farm boundaries

---

### Option 2: Use Cow's Collar GPS

Use GPS coordinates from an already connected ESP32 collar to define farm location.

**Steps:**
1. Ensure ESP32 collar is powered on and connected
2. Navigate to **Farm and Fence** page
3. Select **[2] Use GPS from one of my cow's collars**
4. Select a cow from the list of connected collars
5. System uses the cow's current GPS location
6. Proceed to Fence Editor to draw boundaries

**Best for:** Farms where ESP32 collars are already deployed

---

### Option 3: Select Saved Farm

Access and edit existing farm configurations.

**Steps:**
1. Navigate to **Farm and Fence** page
2. Select **[3] Select a saved farm**
3. Choose from your list of registered farms
4. Click **Continue to Fence Editor**
5. View or modify existing fence boundaries

**Best for:** Managing multiple farms, editing existing fences

---

## Project Structure

```
safezone/
├── server/                          # Backend Node.js application
│   ├── config/
│   │   └── database.js              # SQLite database configuration
│   ├── routes/
│   │   ├── auth.js                  # Authentication (login/signup)
│   │   ├── farms.js                 # Farm & fence management
│   │   ├── cows.js                  # Cow tracking & assignment
│   │   └── dashboard.js             # Dashboard statistics
│   ├── middleware/
│   │   └── auth.js                  # JWT authentication middleware
│   ├── services/
│   │   ├── cronJobs.js              # Scheduled tasks
│   │   └── notificationService.js   # Email alerts
│   ├── utils/
│   │   ├── gmailService.js          # Gmail API integration
│   │   └── simplePdfGenerator.js    # PDF report generation
│   ├── websocket-bridge.js          # ESP32 WebSocket server (port 8081)
│   └── index.js                     # Main server entry point
│
├── public/                          # Frontend static files
│   ├── html/
│   │   ├── index.html                        # Login page
│   │   ├── page2_dashboard.html              # Main dashboard
│   │   ├── page3_notification.html           # Notifications list
│   │   ├── page4_read-a-notification.html    # Notification detail
│   │   ├── page5_editing-fence.html          # Fence editor (Leaflet)
│   │   ├── page6_real-time-tracking.html     # Live GPS tracking map
│   │   ├── page7_assistive-collaboration.html
│   │   ├── page8_farm-information.html       # Farm details
│   │   ├── page9_user-profile.html           # User settings
│   │   ├── page10_customize-alerts.html      # Alert configuration
│   │   ├── page11_log-out.html               # Logout
│   │   ├── page12_sign-up.html               # Registration
│   │   ├── page13_farm-management.html       # Farm & cow management
│   │   ├── page14_farm-and-fence.html        # Farm setup method selection
│   │   ├── page15_farm-and-fence-option1.html # Device GPS setup
│   │   ├── page16_farm-and-fence-option2.html # Collar GPS setup
│   │   └── page17_farm-and-fence-option3.html # Saved farm selection
│   ├── js/
│   │   ├── app.js                   # Main application logic
│   │   ├── auth.js                  # Authentication handling
│   │   ├── farm-management.js       # Farm/cow/fence management
│   │   └── tracking-new-cows.js     # New cow detection
│   ├── css/
│   │   └── styles.css               # Application styles
│   └── images/                      # Logo and icons
│
├── database/
│   └── modeblack.db                 # SQLite database file
│
├── document/
│   ├── README.md                    # This file
│   └── PROJECT_STATUS_REPORT.md     # Detailed project status
│
├── package.json                     # Dependencies & scripts
└── .env                             # Environment variables (not in repo)
```

---

## Database Schema

SafeZone uses SQLite with **5 main tables** for data persistence.

### Table 1: `dbt1` (Farmers/Users)

Stores farmer account information.

```sql
CREATE TABLE dbt1 (
  farmer_name TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  farmer_token TEXT UNIQUE NOT NULL,
  total_farms INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `farmer_name` - Username (primary key)
- `email` - Login email (unique)
- `password` - Authentication password ⚠️ (plain text - needs hashing)
- `farmer_token` - Unique farmer identifier token
- `total_farms` - Count of farms owned by farmer

---

### Table 2: `dbt2` (Farms)

Stores farm locations and GPS coordinates.

```sql
CREATE TABLE dbt2 (
  farm_name TEXT PRIMARY KEY,
  farm_token TEXT UNIQUE NOT NULL,
  farmer_token TEXT NOT NULL,
  farm_gps TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token)
);
```

**Key Fields:**
- `farm_name` - Farm identifier (primary key)
- `farm_token` - Unique farm token for relationships
- `farmer_token` - Owner reference
- `farm_gps` - GPS coordinates as "latitude,longitude"

---

### Table 3: `dbt3` (Fences)

Stores geofence polygon coordinates.

```sql
CREATE TABLE dbt3 (
  fence_name TEXT PRIMARY KEY,
  fence_token TEXT UNIQUE NOT NULL,
  farmer_token TEXT NOT NULL,
  farm_token TEXT,
  fence_coordinate TEXT NOT NULL,
  area_size REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token),
  FOREIGN KEY (farm_token) REFERENCES dbt2(farm_token)
);
```

**Key Fields:**
- `fence_name` - Fence identifier
- `fence_token` - Unique fence token
- `farm_token` - **Links fence to specific farm**
- `fence_coordinate` - JSON array of polygon coordinates
- `area_size` - Calculated area in square meters

**Important:** Each farm can have **one fence** linked via `farm_token`.

---

### Table 4: `dbt4` (Cows - Main Tracking)

Primary cow tracking table with GPS data and statistics.

```sql
CREATE TABLE dbt4 (
  cow_name TEXT PRIMARY KEY,
  cow_nickname TEXT,
  cow_token TEXT UNIQUE NOT NULL,
  collar_id TEXT PRIMARY KEY,
  farmer_token TEXT NOT NULL,
  farm_token TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  state_fence TEXT DEFAULT 'unknown',
  time_inside INTEGER DEFAULT 0,
  time_outside INTEGER DEFAULT 0,
  total_breach INTEGER DEFAULT 0,
  gps_latitude REAL,
  gps_longitude REAL,
  collar_state TEXT DEFAULT 'disconnected',
  registered_at DATETIME,
  assigned_at DATETIME,
  connected_at DATETIME,
  last_seen DATETIME,
  FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token),
  FOREIGN KEY (farm_token) REFERENCES dbt2(farm_token)
);
```

**Key Fields:**
- `cow_name` - System-generated name (cow1, cow2, etc.)
- `cow_nickname` - User-defined friendly name
- `collar_id` - ESP32 MAC address (XX:XX:XX:XX:XX:XX)
- `farm_token` - Assigned farm (NULL if unassigned)
- `state_fence` - Current fence status (inside/outside/unknown)
- `gps_latitude`, `gps_longitude` - Latest GPS coordinates
- `collar_state` - Connection status (connected/disconnected/unknown)
- `registered_at` - Cow creation timestamp
- `assigned_at` - Farm assignment timestamp
- `connected_at` - Last ESP32 connection time
- `last_seen` - Last GPS update received

---

### Table 5: `dbt5` (ESP32 New Cows)

Temporary holding table for newly connected ESP32 devices.

```sql
CREATE TABLE dbt5 (
  cow_name TEXT PRIMARY KEY,
  cow_nickname TEXT,
  cow_token TEXT UNIQUE NOT NULL,
  collar_id TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  collar_state TEXT DEFAULT 'connected'
);
```

**Purpose:** When an ESP32 first connects, it's registered here. After farm assignment, data moves to `dbt4`.

---

## API Endpoints

All authenticated endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

### Authentication

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "jeanclaudemng@gmail.com",
  "password": "safezone123456"
}

Response 200:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "farmer": {
    "name": "jean claude",
    "email": "jeanclaudemng@gmail.com",
    "token": "7wi3pfe29mmioqd0zt"
  }
}
```

#### Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "farmerName": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

---

### Farms

#### Get All Farms
```http
GET /api/farms
Headers: { Authorization: "Bearer <token>" }

Response 200:
{
  "farms": [
    {
      "farm_name": "saiyan",
      "farm_token": "x40uhxlr4ifmipkv3xc",
      "farm_gps": "35.20287,33.36490",
      "timestamp": "2025-12-12 18:30:15"
    }
  ]
}
```

#### Create Farm
```http
POST /api/farms
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "farmName": "Green Valley",
  "gps": "35.1856,33.3823",
  "allowRename": false
}

Response 201:
{
  "success": true,
  "farm_id": "Green Valley",
  "farm_token": "abc123xyz"
}

Response 409 (Duplicate):
{
  "originalName": "Green Valley",
  "suggestedName": "Green Valley (2)"
}
```

#### Rename Farm
```http
PUT /api/farms/:farmToken/name
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "name": "New Farm Name"
}
```

#### Delete Farm
```http
DELETE /api/farms/:farmToken
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "transferToFarmToken": "otherFarmToken"  // Optional
}
```

---

### Fences

#### Get All Fences
```http
GET /api/farms/fences
Headers: { Authorization: "Bearer <token>" }

Response 200:
{
  "fences": [
    {
      "fence_id": "fence1",
      "farm_token": "x40uhxlr4ifmipkv3xc",
      "fence_nodes": "[{\"lat\":35.20,\"lng\":33.36},{...}]",
      "area_size": 15234.56,
      "fence_token": "fence_token_123",
      "timestamp": "2025-12-12 19:00:00"
    }
  ]
}
```

#### Create Fence
```http
POST /api/farms/fences
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "fenceName": "Main Fence",
  "nodes": [
    {"lat": 35.20287, "lng": 33.36490},
    {"lat": 35.20300, "lng": 33.36500},
    {"lat": 35.20285, "lng": 33.36510}
  ],
  "farmToken": "x40uhxlr4ifmipkv3xc"
}

Response 201:
{
  "success": true,
  "fence_id": "Main Fence",
  "area_size": 1234.56,
  "fence_token": "fence_abc123"
}
```

---

### Cows

#### Get All Cows
```http
GET /api/cows
Headers: { Authorization: "Bearer <token>" }

Response 200:
[
  {
    "cow_name": "cow1",
    "cow_nickname": "Bessie",
    "collar_id": "38:18:2B:8A:14:0C",
    "cow_token": "COW_1765565225468_i1lsgq94a",
    "farm_token": "x40uhxlr4ifmipkv3xc",
    "state_fence": "unknown",
    "collar_state": "connected",
    "gps_latitude": null,
    "gps_longitude": null,
    "registered_at": "2025-12-12 18:50:51",
    "connected_at": "2025-12-12 19:13:30",
    "last_seen": "2025-12-12 18:58:05"
  }
]
```

#### Get New/Unassigned Cows
```http
GET /api/cows/new
Headers: { Authorization: "Bearer <token>" }

Response 200:
{
  "newCows": [
    {
      "cow_name": "cow2",
      "collar_id": "AA:BB:CC:DD:EE:FF",
      "cow_token": "COW_token_xyz",
      "collar_state": "connected",
      "timestamp": "2025-12-12 20:00:00"
    }
  ]
}
```

#### Assign Cow to Farm
```http
PUT /api/cows/:cowToken/assign-farm
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "farmToken": "x40uhxlr4ifmipkv3xc"
}

Response 200:
{
  "success": true,
  "message": "Cow assigned to farm successfully"
}
```

#### Set Cow Nickname
```http
PUT /api/cows/:collarId/nickname
Headers: { Authorization: "Bearer <token>" }
Content-Type: application/json

{
  "nickname": "Bessie"
}
```

#### Delete Cow
```http
DELETE /api/cows/:collarId
Headers: { Authorization: "Bearer <token>" }
```

---

## ESP32 Integration

### Hardware Setup

**Required Components:**
- ESP32 Dev Module (30-pin)
- GPS Module (Neo-6M or compatible)
- Battery (Li-ion 3.7V, 2000mAh+)
- GPS Antenna (included with module)
- Wires and connectors

### Wiring Diagram

```
ESP32 GPIO        Neo-6M GPS Module
┌──────────┐      ┌──────────┐
│ GPIO 16  ├─────→│ RX       │
│ GPIO 17  │←─────┤ TX       │
│ 5V       ├─────→│ VCC      │
│ GND      ├─────→│ GND      │
└──────────┘      └──────────┘
```

### Firmware Configuration

Update these values in your ESP32 code:

```cpp
// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* websocketServer = "192.168.0.110";  // Your server IP
const uint16_t websocketPort = 8081;

// Farmer Email (for device registration)
const char* farmerEmail = "jeanclaudemng@gmail.com";

// GPS Serial Configuration
#define GPS_RX_PIN 17
#define GPS_TX_PIN 16
#define GPS_BAUD 9600

// Update Interval (milliseconds)
const unsigned long UPDATE_INTERVAL = 60000;  // 60 seconds
```

### ESP32 Message Protocol

#### 1. Device Registration (on connect)
```json
{
  "type": "register",
  "deviceId": "ESP32_38182B8A140C",
  "macAddress": "38:18:2B:8A:14:0C",
  "ipAddress": "192.168.0.106",
  "farmerEmail": "jeanclaudemng@gmail.com"
}
```

**Server Response:**
```json
{
  "type": "register_ack",
  "status": "success",
  "deviceId": "ESP32_38182B8A140C",
  "serverTime": 1734024000
}
```

#### 2. GPS Data Transmission
```json
{
  "type": "gps_data",
  "latitude": 35.20287,
  "longitude": 33.36490,
  "altitude": 120.5,
  "speed": 0.0,
  "satellites": 8,
  "currentZone": "inside",
  "insideFence": true,
  "timestamp": 1734024000
}
```

#### 3. Alarm/Breach Notification
```json
{
  "type": "alarm",
  "alarmType": "breach",
  "alarmLevel": "warning",
  "message": "Cow has left the fence",
  "latitude": 35.20287,
  "longitude": 33.36490,
  "timestamp": 1734024000
}
```

### Server → ESP32 Commands

#### Fence Update
```json
{
  "type": "fence_update",
  "fenceData": [
    {"lat": 35.20287, "lng": 33.36490},
    {"lat": 35.20300, "lng": 33.36500},
    {"lat": 35.20285, "lng": 33.36510}
  ],
  "timestamp": 1734024000
}
```

---

## WebSocket Communication

### Architecture

```
ESP32 Collar ──(port 8081)──> WebSocket Bridge ──(Socket.IO)──> Main Server
                                      │
                                      └──> Web Clients (port 3000)
```

### Connection States

**ESP32 Collar States:**
- `connected` - WebSocket active, GPS transmitting
- `disconnected` - No active connection
- `unknown` - Never connected or state unclear

**Visual Indicators:**
- 🟢 **● connected** (green) - Active and transmitting
- 🔴 **○ disconnected** (red) - Offline
- 🟡 **◐ unknown** (yellow) - Status uncertain

---

## Troubleshooting

### ESP32 Connection Issues

**Problem:** ESP32 not connecting to WebSocket server

**Solutions:**
1. Verify WiFi credentials are correct
2. Check server IP address matches in firmware
3. Ensure port 8081 is not blocked by firewall:
   ```bash
   lsof -i :8081  # Check if port is listening
   ```
4. Confirm ESP32 is on same network as server
5. Check server logs for connection attempts:
   ```bash
   tail -f /tmp/server-output.log
   ```

---

**Problem:** GPS coordinates showing as NULL

**Solutions:**
1. Move to open area with clear sky view
2. Wait 2-5 minutes for GPS fix acquisition
3. Check GPS module wiring (RX/TX)
4. Verify GPS module has power (LED blinking)
5. Test GPS module separately with serial monitor

---

**Problem:** "Connection reset by peer" error

**Solution:**
1. Check WebSocket bridge is running:
   ```bash
   lsof -i :8081
   ```
2. Restart server to start WebSocket bridge:
   ```bash
   npm start
   ```
3. Verify ESP32 firmware WebSocket library version

---

### Database Issues

**Problem:** "No such column" errors

**Solution:**
Check database schema matches expected structure:
```bash
sqlite3 database/modeblack.db ".schema dbt4"
```

If columns missing (registered_at, connected_at, etc.):
```bash
sqlite3 database/modeblack.db
sqlite> ALTER TABLE dbt4 ADD COLUMN registered_at DATETIME;
sqlite> ALTER TABLE dbt4 ADD COLUMN assigned_at DATETIME;
sqlite> ALTER TABLE dbt4 ADD COLUMN connected_at DATETIME;
sqlite> ALTER TABLE dbt4 ADD COLUMN last_seen DATETIME;
sqlite> .quit
```

---

**Problem:** Duplicate farm names

**Solution:**
The system suggests alternative names automatically. To force a specific name:
1. Delete existing farm with same name first
2. Or use the suggested name (e.g., "farm1 (2)")
3. Or set `allowRename: true` in API request

---

### Map & Fence Issues

**Problem:** Fence not displaying on real-time tracking map

**Solutions:**
1. Verify fence has `farm_token` matching selected farm:
   ```bash
   sqlite3 database/modeblack.db "SELECT fence_name, farm_token FROM dbt3;"
   ```
2. Check fence was saved successfully in Fence Editor
3. Ensure "Show Fence Lines" toggle is ON
4. Refresh page to reload fence data

---

**Problem:** Cannot draw fence in Fence Editor

**Solutions:**
1. Ensure Leaflet and Leaflet Draw libraries loaded
2. Check browser console for JavaScript errors (F12)
3. Verify farm GPS coordinates are valid
4. Clear browser cache and reload

---

### Authentication Issues

**Problem:** Login fails with correct credentials

**Solutions:**
1. Verify email exists in database:
   ```bash
   sqlite3 database/modeblack.db "SELECT email FROM dbt1;"
   ```
2. Check password matches (case-sensitive)
3. Clear localStorage and try again
4. Verify JWT_SECRET is set in server

---

**Problem:** "Unauthorized" errors on API calls

**Solutions:**
1. Check authToken is stored in localStorage
2. Verify token hasn't expired (24-hour expiry)
3. Login again to get fresh token
4. Check Authorization header format:
   ```javascript
   'Authorization': 'Bearer ' + token
   ```

---

## Development

### Running in Development Mode

```bash
# Install dependencies
npm install

# Start with auto-reload (if nodemon installed)
npm run dev

# Or standard start
npm start

# Server starts on http://localhost:3000
```

### Environment Variables

Create `.env` file in project root:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=safezone-jwt-secret-change-in-production
GMAIL_USER=your-email@gmail.com
GMAIL_PASSWORD=your-app-specific-password
APP_URL=http://localhost:3000
```

### Database Inspection

```bash
# Open database
sqlite3 database/modeblack.db

# List all tables
sqlite> .tables

# View table structure
sqlite> .schema dbt4

# Query data
sqlite> SELECT * FROM dbt1;
sqlite> SELECT cow_name, collar_state, connected_at FROM dbt4;

# Export to CSV
sqlite> .mode csv
sqlite> .output cows.csv
sqlite> SELECT * FROM dbt4;
sqlite> .quit
```

### Server Logs

View real-time logs:
```bash
# Redirect output to file
npm start 2>&1 | tee server.log

# Follow log file
tail -f server.log

# Search logs
grep "ERROR" server.log
grep "ESP32" server.log
```

---

## Project Status & Limitations

### Current Status: ✅ Operational (Development)

**Working Features:**
- ✅ User authentication (login/signup)
- ✅ Farm creation with GPS detection
- ✅ Fence drawing and editing (Leaflet)
- ✅ ESP32 device registration
- ✅ Real-time GPS tracking
- ✅ WebSocket communication (ESP32 ↔ Server)
- ✅ Farm-specific fence filtering
- ✅ Connection state monitoring
- ✅ Email notifications (Gmail)
- ✅ Cow assignment to farms
- ✅ Timestamp tracking (registered/connected/last seen)

**Known Limitations:**
- ⚠️ Passwords stored in plain text (security risk)
- ⚠️ One fence per farm restriction
- ⚠️ No GPS coordinate history table
- ⚠️ No SSL/TLS encryption
- ⚠️ SQLite (not suitable for production scale)
- ⚠️ No automated backups

**For detailed status, see:** [PROJECT_STATUS_REPORT.md](PROJECT_STATUS_REPORT.md)

---

## Contributors

**Development Team:**
- **Jean Claude** - Full Stack Development, Hardware Integration
- **Samuel** - Full Stack Development, Testing

**Institution:** Near East University
**Academic Year:** 2025-2026
**Course:** Final Year Project

---

## Support & Contact

For questions or issues:

**Technical Support:**
- Check [Troubleshooting](#troubleshooting) section first
- Review [PROJECT_STATUS_REPORT.md](PROJECT_STATUS_REPORT.md)
- Inspect server logs for error details

**Project Team:**
- Email: jeanclaudemng@gmail.com
- Institution: Near East University, Cyprus

---

## License

This project is proprietary software developed for academic purposes.

**Copyright © 2025 Jean Claude & Samuel**
All rights reserved.

---

**Last Updated:** December 12, 2025
**Version:** 1.0.0
**Documentation Status:** ✅ Up to date
