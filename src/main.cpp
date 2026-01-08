#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

// ============================================
// FUNCTION PROTOTYPES
// ============================================
void connectToWiFi();
void setupWebSocket();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void registerDevice();
void handleWebSocketMessage(char* payload);
void updateZoneData(JsonObject fenceData);
void readGPS();
void sendGPSData();
void sendHeartbeat();
void updateZoneStatus();
void sendZoneChange();
double calculateDistance(double lat1, double lng1, double lat2, double lng2);
void updateLEDs();
void startAlarm();
void stopAlarm();
void handleAlarmSystem();
void sendAlarm(String alarmType, int level, String message);

// ============================================
// CONFIGURATION
// ============================================

// WiFi credentials
const char* WIFI_SSID = "SaiyanSpeed";
const char* WIFI_PASSWORD = "05953271";

// Server configuration (WebSocket Bridge)
const char* WS_HOST = "192.168.0.106";  // Your server's local IP address
const uint16_t WS_PORT = 8081;
const char* WS_PATH = "/";

// User configuration
const char* FARMER_EMAIL = "jeanclaudemng@gmail.com";

// Pin definitions - CORRECTED AS PER REQUIREMENTS
#define ONBOARD_LED_PIN 2       // WiFi status only (solid, not blinking)
#define GPS_RX_PIN 17           // GPS RX
#define GPS_TX_PIN 16           // GPS TX
#define LED1_PIN 22             // Zone 1 indicator
#define LED2_PIN 4              // Zone 2 indicator
#define LED3_PIN 5              // Zone 3 indicator

// ============================================
// GLOBAL OBJECTS
// ============================================

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
WebSocketsClient webSocket;

// ============================================
// DEVICE IDENTIFICATION
// ============================================

String deviceId;
String macAddress;

// ============================================
// GPS AND LOCATION VARIABLES
// ============================================

double currentLat = 0.0;
double currentLng = 0.0;
double currentAltitude = 0.0;
double currentSpeed = 0.0;
uint32_t satellites = 0;

// Zone definitions (will be updated from server)
struct Zone {
  String name;
  double centerLat;
  double centerLng;
  double radius; // in meters
};

Zone zones[3] = {
  {"zone1", 0.0, 0.0, 50.0},
  {"zone2", 0.0, 0.0, 50.0},
  {"zone3", 0.0, 0.0, 50.0}
};

String currentZone = "none";
String previousZone = "none";
bool insideFence = false;

// ============================================
// ALARM SYSTEM VARIABLES
// ============================================

bool alarmActive = false;
unsigned long alarmStartTime = 0;
int alarmLevel = 0; // 0 = none, 1 = warning, 2 = alert, 3 = critical

// Timing constants (in milliseconds)
const unsigned long ALARM_LEVEL1_DELAY = 5000;   // 5 seconds
const unsigned long ALARM_LEVEL2_DELAY = 15000;  // 15 seconds
const unsigned long ALARM_LEVEL3_DELAY = 50000;  // 50 seconds

// ============================================
// COMMUNICATION VARIABLES
// ============================================

unsigned long lastGPSSend = 0;
const unsigned long GPS_SEND_INTERVAL = 5000;  // Send GPS every 5 seconds

unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // Heartbeat every 10 seconds

bool wsConnected = false;
bool deviceRegistered = false;

// ============================================
// SETUP
// ============================================

void setup() {
  // Initialize Serial Monitor
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================");
  Serial.println("    SafeZone ESP32 Cow Tracker");
  Serial.println("========================================\n");

  // Initialize pins
  pinMode(ONBOARD_LED_PIN, OUTPUT);
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);

  // Turn off all LEDs initially
  digitalWrite(ONBOARD_LED_PIN, LOW);
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);

  // Get device ID (MAC address)
  macAddress = WiFi.macAddress();
  deviceId = "ESP32_" + macAddress;
  deviceId.replace(":", "");

  Serial.println("[SETUP] Device Information:");
  Serial.println("  Device ID: " + deviceId);
  Serial.println("  MAC Address: " + macAddress);
  Serial.println("  Farmer Email: " + String(FARMER_EMAIL));
  Serial.println();

  // Initialize GPS
  Serial.println("[SETUP] Initializing GPS...");
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("  GPS RX Pin: " + String(GPS_RX_PIN));
  Serial.println("  GPS TX Pin: " + String(GPS_TX_PIN));
  Serial.println();

  // Connect to WiFi
  connectToWiFi();

  // Setup WebSocket
  setupWebSocket();

  Serial.println("[SETUP] Initialization complete!\n");
  Serial.println("========================================\n");
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
  // Handle WebSocket
  webSocket.loop();

  // Read GPS data
  readGPS();

  // Update zone status
  updateZoneStatus();

  // Update LED indicators
  updateLEDs();

  // Handle alarm system
  handleAlarmSystem();

  // Send GPS data periodically
  if (wsConnected && deviceRegistered && (millis() - lastGPSSend > GPS_SEND_INTERVAL)) {
    sendGPSData();
    lastGPSSend = millis();
  }

  // Send heartbeat
  if (wsConnected && deviceRegistered && (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  delay(100);
}

// ============================================
// WIFI FUNCTIONS
// ============================================

void connectToWiFi() {
  Serial.println("[WiFi] Connecting to WiFi...");
  Serial.println("  SSID: " + String(WIFI_SSID));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Blink LED while connecting
  int attempts = 0;
  Serial.print("  ");
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    digitalWrite(ONBOARD_LED_PIN, !digitalRead(ONBOARD_LED_PIN));
    Serial.print(".");
    delay(500);
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    // WiFi connected - turn on LED solid
    digitalWrite(ONBOARD_LED_PIN, HIGH);
    Serial.println("[WiFi] ✓ Connected successfully!");
    Serial.println("  IP Address: " + WiFi.localIP().toString());
    Serial.println("  Signal Strength: " + String(WiFi.RSSI()) + " dBm");
    Serial.println();
  } else {
    // Failed - LED off
    digitalWrite(ONBOARD_LED_PIN, LOW);
    Serial.println("[WiFi] ✗ Connection FAILED!");
    Serial.println("  Could not connect after " + String(attempts) + " attempts");
    Serial.println();
  }
}

// ============================================
// WEBSOCKET FUNCTIONS
// ============================================

void setupWebSocket() {
  Serial.println("[WebSocket] Configuring WebSocket client...");
  Serial.println("  Server: " + String(WS_HOST) + ":" + String(WS_PORT));
  Serial.println("  Path: " + String(WS_PATH));

  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  Serial.println("[WebSocket] WebSocket client configured");
  Serial.println("  Reconnect Interval: 5000 ms");
  Serial.println();
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      deviceRegistered = false;
      Serial.println("[WebSocket] ✗ Disconnected from server");
      break;

    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[WebSocket] ✓ Connected to server!");
      Serial.println("  URL: " + String((char*)payload));
      Serial.println("[WebSocket] Registering device...");
      // Register device with server
      registerDevice();
      break;

    case WStype_TEXT:
      Serial.println("[WebSocket] ← Message received: " + String((char*)payload));
      handleWebSocketMessage((char*)payload);
      break;

    case WStype_ERROR:
      wsConnected = false;
      Serial.println("[WebSocket] ✗ Error occurred!");
      break;

    case WStype_PING:
      Serial.println("[WebSocket] ← PING");
      break;

    case WStype_PONG:
      Serial.println("[WebSocket] → PONG");
      break;
  }
}

void registerDevice() {
  StaticJsonDocument<512> doc;
  doc["type"] = "register";
  doc["deviceId"] = deviceId;
  doc["macAddress"] = macAddress;
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["farmerEmail"] = FARMER_EMAIL;
  doc["timestamp"] = millis();

  String message;
  serializeJson(doc, message);

  Serial.println("[WebSocket] → Sending registration:");
  Serial.println("  Device ID: " + deviceId);
  Serial.println("  MAC Address: " + macAddress);
  Serial.println("  IP Address: " + WiFi.localIP().toString());
  Serial.println("  Farmer Email: " + String(FARMER_EMAIL));

  webSocket.sendTXT(message);
}

void handleWebSocketMessage(char* payload) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    Serial.println("[WebSocket] ✗ JSON parse error: " + String(error.c_str()));
    return;
  }

  const char* msgType = doc["type"];

  if (strcmp(msgType, "register_ack") == 0) {
    deviceRegistered = true;
    Serial.println("[WebSocket] ✓ DEVICE REGISTERED SUCCESSFULLY!");
    Serial.println("  Status: Ready to send data");
    Serial.println();
  }
  else if (strcmp(msgType, "fence_update") == 0) {
    Serial.println("[Server] Fence/Zone update received");
    // Update fence/zone data from server
    JsonObject fenceData = doc["fenceData"];
    if (!fenceData.isNull()) {
      updateZoneData(fenceData);
      Serial.println("  Zones updated successfully");
    }
  }
  else if (strcmp(msgType, "config_update") == 0) {
    Serial.println("[Server] Configuration update received");
    // Handle configuration updates
    JsonObject config = doc["config"];
    if (!config.isNull()) {
      // Update configuration parameters
      Serial.println("  Configuration updated");
    }
  }
  else if (strcmp(msgType, "heartbeat_ack") == 0) {
    // Heartbeat acknowledged (silent - too verbose)
  }
  else {
    Serial.println("[Server] Unknown message type: " + String(msgType));
  }
}

void updateZoneData(JsonObject fenceData) {
  // Update zone coordinates from server
  if (fenceData.containsKey("zones")) {
    JsonArray zonesArray = fenceData["zones"];
    for (size_t i = 0; i < zonesArray.size() && i < 3; i++) {
      JsonObject zone = zonesArray[i];
      zones[i].name = zone["name"].as<String>();
      zones[i].centerLat = zone["centerLat"].as<double>();
      zones[i].centerLng = zone["centerLng"].as<double>();
      zones[i].radius = zone["radius"].as<double>();
    }
  }
}

// ============================================
// GPS FUNCTIONS
// ============================================

void readGPS() {
  static bool firstFixReported = false;

  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        bool wasZero = (currentLat == 0.0 && currentLng == 0.0);

        currentLat = gps.location.lat();
        currentLng = gps.location.lng();

        if (gps.altitude.isValid()) {
          currentAltitude = gps.altitude.meters();
        }

        if (gps.speed.isValid()) {
          currentSpeed = gps.speed.kmph();
        }

        if (gps.satellites.isValid()) {
          satellites = gps.satellites.value();
        }

        // Report first GPS fix
        if (wasZero && !firstFixReported) {
          Serial.println("[GPS] ✓ GPS FIX ACQUIRED!");
          Serial.println("  Location: " + String(currentLat, 6) + ", " + String(currentLng, 6));
          Serial.println("  Satellites: " + String(satellites));
          firstFixReported = true;
        }
      }
    }
  }
}

void sendGPSData() {
  if (currentLat == 0.0 && currentLng == 0.0) {
    Serial.println("[GPS] ⚠ No valid GPS data yet (waiting for fix...)");
    return; // No valid GPS data yet
  }

  StaticJsonDocument<512> doc;
  doc["type"] = "gps_data";
  doc["deviceId"] = deviceId;
  doc["latitude"] = currentLat;
  doc["longitude"] = currentLng;
  doc["altitude"] = currentAltitude;
  doc["speed"] = currentSpeed;
  doc["satellites"] = satellites;
  doc["currentZone"] = currentZone;
  doc["insideFence"] = insideFence;
  doc["timestamp"] = millis();

  String message;
  serializeJson(doc, message);

  Serial.println("[GPS] → Sending GPS data:");
  Serial.println("  Lat: " + String(currentLat, 6) + " | Lng: " + String(currentLng, 6));
  Serial.println("  Alt: " + String(currentAltitude, 1) + "m | Speed: " + String(currentSpeed, 1) + " km/h");
  Serial.println("  Satellites: " + String(satellites));
  Serial.println("  Zone: " + currentZone + " | Inside Fence: " + String(insideFence ? "YES" : "NO"));

  webSocket.sendTXT(message);
}

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["type"] = "heartbeat";
  doc["deviceId"] = deviceId;
  doc["timestamp"] = millis();

  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

// ============================================
// ZONE AND FENCE FUNCTIONS
// ============================================

void updateZoneStatus() {
  if (currentLat == 0.0 && currentLng == 0.0) {
    return; // No valid GPS data
  }

  // Check which zone the cow is in
  String newZone = "none";

  for (int i = 0; i < 3; i++) {
    if (zones[i].centerLat != 0.0 && zones[i].centerLng != 0.0) {
      double distance = calculateDistance(currentLat, currentLng,
                                         zones[i].centerLat, zones[i].centerLng);

      if (distance <= zones[i].radius) {
        newZone = zones[i].name;
        insideFence = true;
        break;
      }
    }
  }

  // Check if zone changed
  if (newZone != currentZone) {
    previousZone = currentZone;
    currentZone = newZone;

    // Send zone change event
    sendZoneChange();

    // If cow left all zones, trigger alarm
    if (currentZone == "none" && previousZone != "none") {
      startAlarm();
    }

    // If cow returned to a zone, stop alarm
    if (currentZone != "none" && previousZone == "none") {
      stopAlarm();
    }
  }

  // Update insideFence status
  insideFence = (currentZone != "none");
}

void sendZoneChange() {
  StaticJsonDocument<256> doc;
  doc["type"] = "zone_change";
  doc["deviceId"] = deviceId;
  doc["oldZone"] = previousZone;
  doc["newZone"] = currentZone;
  doc["latitude"] = currentLat;
  doc["longitude"] = currentLng;
  doc["timestamp"] = millis();

  String message;
  serializeJson(doc, message);

  Serial.println("[ZONE] *** ZONE CHANGE ***");
  Serial.println("  " + previousZone + " → " + currentZone);
  Serial.println("  Location: " + String(currentLat, 6) + ", " + String(currentLng, 6));

  webSocket.sendTXT(message);
}

double calculateDistance(double lat1, double lng1, double lat2, double lng2) {
  const double R = 6371000; // Earth's radius in meters
  double dLat = (lat2 - lat1) * PI / 180.0;
  double dLng = (lng2 - lng1) * PI / 180.0;

  double a = sin(dLat/2) * sin(dLat/2) +
             cos(lat1 * PI / 180.0) * cos(lat2 * PI / 180.0) *
             sin(dLng/2) * sin(dLng/2);
  double c = 2 * atan2(sqrt(a), sqrt(1-a));

  return R * c; // Distance in meters
}

// ============================================
// LED CONTROL FUNCTIONS
// ============================================

void updateLEDs() {
  // Turn off all zone LEDs first
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);

  // Turn on LED corresponding to current zone (solid, not blinking)
  if (currentZone == "zone1") {
    digitalWrite(LED1_PIN, HIGH);
  }
  else if (currentZone == "zone2") {
    digitalWrite(LED2_PIN, HIGH);
  }
  else if (currentZone == "zone3") {
    digitalWrite(LED3_PIN, HIGH);
  }
  // If currentZone == "none", all zone LEDs stay off
}

// ============================================
// ALARM SYSTEM FUNCTIONS
// ============================================

void startAlarm() {
  if (!alarmActive) {
    alarmActive = true;
    alarmStartTime = millis();
    alarmLevel = 0;

    Serial.println("[ALARM] ⚠ ALARM ACTIVATED!");
    Serial.println("  Reason: Cow has left all safe zones");

    sendAlarm("breach", 1, "Cow has left all safe zones");
  }
}

void stopAlarm() {
  if (alarmActive) {
    alarmActive = false;
    alarmLevel = 0;

    Serial.println("[ALARM] ✓ ALARM DEACTIVATED");
    Serial.println("  Reason: Cow has returned to safe zone");

    sendAlarm("return", 0, "Cow has returned to safe zone");
  }
}

void handleAlarmSystem() {
  if (!alarmActive) {
    return;
  }

  unsigned long timeOutside = millis() - alarmStartTime;

  // Alarm Level 1: 5 seconds outside
  if (alarmLevel == 0 && timeOutside >= ALARM_LEVEL1_DELAY) {
    alarmLevel = 1;
    Serial.println("[ALARM] ⚠ LEVEL 1 - 5 seconds outside");
    sendAlarm("level1", 1, "Cow outside for 5 seconds");
  }

  // Alarm Level 2: 15 seconds outside
  if (alarmLevel == 1 && timeOutside >= ALARM_LEVEL2_DELAY) {
    alarmLevel = 2;
    Serial.println("[ALARM] ⚠⚠ LEVEL 2 - 15 seconds outside (NOTIFICATION SENT)");
    sendAlarm("level2", 2, "Cow outside for 15 seconds");
  }

  // Alarm Level 3: 50 seconds outside
  if (alarmLevel == 2 && timeOutside >= ALARM_LEVEL3_DELAY) {
    alarmLevel = 3;
    Serial.println("[ALARM] ⚠⚠⚠ LEVEL 3 - 50 seconds outside (CRITICAL!)");
    sendAlarm("level3", 3, "Cow outside for 50 seconds - CRITICAL");
  }
}

void sendAlarm(String alarmType, int level, String message) {
  StaticJsonDocument<512> doc;
  doc["type"] = "alarm";
  doc["deviceId"] = deviceId;
  doc["alarmType"] = alarmType;
  doc["alarmLevel"] = level;
  doc["message"] = message;
  doc["latitude"] = currentLat;
  doc["longitude"] = currentLng;
  doc["timestamp"] = millis();

  String jsonMessage;
  serializeJson(doc, jsonMessage);
  webSocket.sendTXT(jsonMessage);
}
