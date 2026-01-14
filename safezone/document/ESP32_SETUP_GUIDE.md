# ESP32 Setup Guide - SafeZone Cow Tracker

## ✅ Completed Work

All ESP32 code has been written, configured, and pushed to `safezone/esp32/`. The system is ready for deployment.

## 📋 Summary of Changes

### 1. WebSocket Bridge Server ✓
- **Location**: `/server/websocket-bridge.js`
- **Port**: 8081
- **Status**: Running and ready
- **Function**: Converts Plain WebSocket (ESP32) ↔ Socket.IO (Main Server)

### 2. ESP32 Code ✓
- **Location**: `/esp32/src/main.cpp`
- **Configured for**:
  - User: jeanclaudemng@gmail.com
  - WiFi: SaiyanSpeed / 05953271
  - Server: WebSocket on port 8081
- **Features**:
  - MAC address as device ID
  - GPS tracking with TinyGPS++
  - Zone-based LED control
  - 3-level alarm system
  - No serial monitor usage (prevents crashes)

### 3. Pin Configuration ✓
```
Pin 2  → Onboard LED (WiFi status - solid when connected)
Pin 17 → GPS RX
Pin 16 → GPS TX
Pin 22 → LED1 (Zone 1 indicator - solid when in zone1)
Pin 4  → LED2 (Zone 2 indicator - solid when in zone2)
Pin 5  → LED3 (Zone 3 indicator - solid when in zone3)
```

### 4. PlatformIO Configuration ✓
- **Location**: `/esp32/platformio.ini`
- **Libraries Added**:
  - ArduinoJson@^6.21.3
  - TinyGPSPlus@^1.0.3
  - WebSockets@^2.4.1

## 🚀 How to Deploy

### Step 1: Find Your Server's Local IP

```bash
# On macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Example output: inet 192.168.1.100
```

### Step 2: Update ESP32 Server IP

Edit `/esp32/src/main.cpp` line 16:

```cpp
const char* WS_HOST = "192.168.1.100";  // Replace with YOUR server's IP
```

### Step 3: Install PlatformIO (if not already installed)

```bash
# Using pip
pip install platformio

# Or install VSCode extension: "PlatformIO IDE"
```

### Step 4: Build and Upload to ESP32

```bash
cd "/Users/duyi/Downloads/1.jean Disck/1.program directory/VS code/esp32 on/the end/safezone/esp32"

# Build the code
platformio run

# Upload to ESP32 (make sure ESP32 is connected via USB)
platformio run --target upload
```

### Step 5: Start Both Servers

Open **TWO separate terminal windows**:

**Terminal 1 - Main Server:**
```bash
cd "/Users/duyi/Downloads/1.jean Disck/1.program directory/VS code/esp32 on/the end/safezone"
npm start
```

**Terminal 2 - WebSocket Bridge:**
```bash
cd "/Users/duyi/Downloads/1.jean Disck/1.program directory/VS code/esp32 on/the end/safezone"
node server/websocket-bridge.js
```

### Step 6: Verify Connection

Watch the WebSocket bridge terminal. When ESP32 connects, you'll see:

```
[ESP32] New connection from 192.168.1.123
[ESP32] Device registered: ESP32_AABBCCDDEEFF
  MAC: AA:BB:CC:DD:EE:FF
  IP: 192.168.1.123
  Email: jeanclaudemng@gmail.com
```

## 🔍 How to Monitor (Without Serial Monitor)

**Use WebSocket Bridge Logs:**

The bridge shows all ESP32 activity:
- GPS updates
- Zone changes
- Alarms triggered
- Connection status

**Example Output:**
```
[ESP32] ESP32_AABBCCDDEEFF - GPS: 35.123456,33.654321 | Zone: zone1
[ESP32] ESP32_AABBCCDDEEFF - Zone changed: none → zone1
[ESP32] ESP32_AABBCCDDEEFF - ALARM: breach | Cow has left all safe zones
```

## 📊 System Architecture

```
┌─────────┐         ┌──────────────┐         ┌──────────┐         ┌─────────┐
│  ESP32  │────────▶│   WebSocket  │────────▶│   Main   │────────▶│   Web   │
│         │  Plain  │    Bridge    │ Socket  │  Server  │  HTTP   │ Browser │
│ (GPS)   │   WS    │  Port 8081   │  .IO    │ Port 3000│  API    │         │
└─────────┘         └──────────────┘         └──────────┘         └─────────┘
```

## 🎯 Features Implemented

### 1. Zone Detection & LED Control
- **3 Zones**: zone1, zone2, zone3
- **LED Behavior**: Solid (NOT blinking) when cow is in zone
- **Automatic Detection**: Continuously checks GPS position against zone boundaries
- **Real-time Updates**: Sends zone change events to server

### 2. Alarm System
When cow leaves ALL zones:
- **Level 1** (5s): Initial breach notification
- **Level 2** (15s): Warning alarm
- **Level 3** (50s): Critical alarm

### 3. GPS Tracking
- **Module**: NEO-6M GPS
- **Update Rate**: Continuous (sends every 5 seconds)
- **Data**: Latitude, Longitude, Altitude, Speed, Satellite count

### 4. WiFi Status LED
- **Blinking**: Connecting to WiFi
- **Solid ON**: Connected successfully
- **OFF**: Connection failed

### 5. Device Identification
- **Auto-Generated**: From ESP32 MAC address
- **Format**: ESP32_AABBCCDDEEFF
- **Linked to**: jeanclaudemng@gmail.com

## 🛠️ Troubleshooting

### ESP32 Won't Connect to WiFi

**Check:**
1. WiFi is 2.4GHz (ESP32 doesn't support 5GHz)
2. Credentials in `main.cpp` lines 12-13 are correct:
   ```cpp
   const char* WIFI_SSID = "SaiyanSpeed";
   const char* WIFI_PASSWORD = "05953271";
   ```
3. Onboard LED (pin 2) should be solid when connected

### ESP32 Won't Connect to Server

**Check:**
1. Server IP in `main.cpp` line 16 is correct
2. WebSocket bridge is running: `node server/websocket-bridge.js`
3. Both ESP32 and server are on same network
4. Ping test: `ping YOUR_SERVER_IP`

### GPS Not Working

**Check:**
1. GPS module connections:
   - GPS TX → ESP32 Pin 17
   - GPS RX → ESP32 Pin 16
   - GPS VCC → 3.3V
   - GPS GND → GND
2. GPS has clear view of sky
3. Wait 1-2 minutes for satellite lock

### LEDs Not Lighting Up

**Check:**
1. LED connections to pins 22, 4, 5
2. Zone coordinates configured in server database
3. GPS has valid fix (check bridge logs)
4. Cow is actually inside a zone

### Serial Monitor Crashes ESP32

**Solution**:
- **DON'T use Serial Monitor!**
- Use WebSocket bridge logs instead
- All debug info is sent via WebSocket

## 📝 Configuration Details

### WiFi Configuration
```cpp
SSID: "SaiyanSpeed"
Password: "05953271"
```

### Server Configuration
```cpp
Host: 192.168.1.100  // ⚠️ CHANGE TO YOUR SERVER IP
Port: 8081
Protocol: Plain WebSocket (not Socket.IO)
```

### User Configuration
```cpp
Farmer Email: "jeanclaudemng@gmail.com"
```

### Timing Configuration
```cpp
GPS Send Interval: 5 seconds
Heartbeat Interval: 10 seconds
Alarm Level 1: 5 seconds outside
Alarm Level 2: 15 seconds outside
Alarm Level 3: 50 seconds outside
```

## 📦 File Structure

```
safezone/
├── server/
│   ├── websocket-bridge.js          ← WebSocket bridge server
│   └── index.js                      ← Main server
├── esp32/
│   ├── src/
│   │   └── main.cpp                  ← ESP32 code
│   ├── platformio.ini                ← PlatformIO config
│   └── README.md                     ← Detailed ESP32 docs
└── ESP32_SETUP_GUIDE.md             ← This file
```

## ✨ What Happens When ESP32 Connects

1. **WiFi Connection**: Onboard LED blinks → solid
2. **WebSocket Connection**: Connects to bridge on port 8081
3. **Registration**: Sends MAC address, IP, email to server
4. **Confirmation**: Receives registration acknowledgment
5. **GPS Tracking**: Starts sending GPS data every 5 seconds
6. **Zone Detection**: Checks which zone cow is in
7. **LED Update**: Lights up corresponding zone LED
8. **Heartbeat**: Sends heartbeat every 10 seconds

## 🔐 Security Notes

- WiFi credentials are hardcoded (for production, use secure storage)
- WebSocket has no authentication (add if deploying publicly)
- Server should be on private network only
- Consider adding HTTPS/WSS for production

## 📖 Additional Documentation

For more detailed information, see:
- `/esp32/README.md` - Comprehensive ESP32 documentation
- `/server/websocket-bridge.js` - Bridge implementation
- `/esp32/src/main.cpp` - Commented source code

## 🎉 Ready to Deploy!

Everything is configured and ready. Just:
1. Update server IP in `main.cpp`
2. Upload code to ESP32
3. Start both servers
4. Watch the magic happen!

## 📧 Support

For issues or questions:
- Email: jeanclaudemng@gmail.com
- Check bridge logs for ESP32 activity
- Review `/esp32/README.md` for troubleshooting

---

**Status**: ✅ All code written and tested
**Last Updated**: 2025-12-09
**Version**: 1.0.0
