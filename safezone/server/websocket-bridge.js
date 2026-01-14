const WebSocket = require('ws');
const io = require('socket.io-client');
const { now } = require('./utils/dateFormatter');

// WebSocket server for ESP32 (Plain WebSocket on port 8081)
const wss = new WebSocket.Server({ port: 8081 });

// Connect to main server Socket.IO on port 3000
const socket = io('http://localhost:3000', {
  transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  forceNew: true,
  timeout: 10000
});

console.log('WebSocket Bridge Server Starting...');
console.log('ESP32 WebSocket Server: ws://localhost:8081');
console.log('Main Server Socket.IO: http://localhost:3000');

// Track connected ESP32 devices
const connectedDevices = new Map();

// Socket.IO connection to main server
socket.on('connect', () => {
  console.log('✓ Connected to main server Socket.IO (port 3000)');
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected from main server Socket.IO');
});

socket.on('connect_error', (error) => {
  console.error('Main server connection error:', error.message);
  console.error('Error type:', error.type);
  console.error('Error description:', error.description);
});

// WebSocket server for ESP32 devices
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`\n[ESP32] New connection from ${clientIp}`);

  let deviceId = null;
  let deviceInfo = null;
  let isAlive = true;

  // Heartbeat ping/pong to detect dead connections
  ws.on('pong', () => {
    isAlive = true;
  });

  const heartbeatInterval = setInterval(() => {
    if (isAlive === false) {
      console.log(`[ESP32] Heartbeat timeout - terminating connection for ${deviceId || 'unknown'}`);
      clearInterval(heartbeatInterval);
      ws.terminate();
      return;
    }

    isAlive = false;
    ws.ping();
  }, 10000); // Ping every 10 seconds

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle device registration
      if (message.type === 'register') {
        deviceId = message.deviceId;
        deviceInfo = {
          deviceId: message.deviceId,
          macAddress: message.macAddress,
          ipAddress: message.ipAddress,
          farmerEmail: message.farmerEmail,
          ws: ws,
          connectedAt: now()
        };

        connectedDevices.set(deviceId, deviceInfo);

        console.log(`[ESP32] Device registered: ${deviceId}`);
        console.log(`  MAC: ${message.macAddress}`);
        console.log(`  IP: ${message.ipAddress}`);
        console.log(`  Email: ${message.farmerEmail}`);

        // Send registration confirmation
        ws.send(JSON.stringify({
          type: 'register_ack',
          status: 'success',
          deviceId: deviceId,
          serverTime: Date.now()
        }));

        // Forward registration to main server
        socket.emit('esp32:register', {
          deviceId: message.deviceId,
          macAddress: message.macAddress,
          ipAddress: message.ipAddress,
          farmerEmail: message.farmerEmail,
          timestamp: Date.now()
        });
      }

      // Handle GPS data
      else if (message.type === 'gps_data') {
        console.log(`[ESP32] ${deviceId || 'Unknown'} - GPS: ${message.latitude},${message.longitude} | Zone: ${message.currentZone}`);

        // Forward to main server via Socket.IO
        socket.emit('esp32:gps_update', {
          deviceId: deviceId || message.deviceId,
          latitude: message.latitude,
          longitude: message.longitude,
          altitude: message.altitude,
          speed: message.speed,
          satellites: message.satellites,
          currentZone: message.currentZone,
          insideFence: message.insideFence,
          timestamp: message.timestamp
        });
      }

      // Handle alarm events
      else if (message.type === 'alarm') {
        console.log(`[ESP32] ${deviceId || 'Unknown'} - ALARM: ${message.alarmType} | ${message.message}`);

        // Forward alarm to main server
        socket.emit('esp32:alarm', {
          deviceId: deviceId || message.deviceId,
          alarmType: message.alarmType,
          alarmLevel: message.alarmLevel,
          message: message.message,
          latitude: message.latitude,
          longitude: message.longitude,
          timestamp: message.timestamp
        });
      }

      // Handle zone change
      else if (message.type === 'zone_change') {
        console.log(`[ESP32] ${deviceId || 'Unknown'} - Zone changed: ${message.oldZone} → ${message.newZone}`);

        // Forward to main server
        socket.emit('esp32:zone_change', {
          deviceId: deviceId || message.deviceId,
          oldZone: message.oldZone,
          newZone: message.newZone,
          latitude: message.latitude,
          longitude: message.longitude,
          timestamp: message.timestamp
        });
      }

      // Handle status update
      else if (message.type === 'status') {
        // Forward status to main server
        socket.emit('esp32:status', {
          deviceId: deviceId || message.deviceId,
          wifiRSSI: message.wifiRSSI,
          freeHeap: message.freeHeap,
          uptime: message.uptime,
          timestamp: message.timestamp
        });
      }

      // Handle heartbeat
      else if (message.type === 'heartbeat') {
        ws.send(JSON.stringify({
          type: 'heartbeat_ack',
          serverTime: Date.now()
        }));
      }

    } catch (error) {
      console.error('[ESP32] Message parse error:', error.message);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeatInterval); // Clean up heartbeat interval

    if (deviceId) {
      console.log(`[ESP32] Device disconnected: ${deviceId}`);
      connectedDevices.delete(deviceId);

      // Extract MAC address from deviceId (format: ESP32_MACADDRESS)
      const macAddress = deviceId.replace('ESP32_', '').match(/.{1,2}/g).join(':');

      // Notify main server
      socket.emit('esp32:disconnect', {
        deviceId: deviceId,
        macAddress: macAddress,
        timestamp: Date.now()
      });
    } else {
      console.log(`[ESP32] Unknown device disconnected from ${clientIp}`);
    }
  });

  ws.on('error', (error) => {
    console.error('[ESP32] WebSocket error:', error.message);
    clearInterval(heartbeatInterval); // Clean up heartbeat interval on error
  });
});

// Handle commands from main server to ESP32 devices
socket.on('command:fence_update', (data) => {
  console.log(`[Server] Fence update command for ${data.deviceId}`);

  const device = connectedDevices.get(data.deviceId);
  if (device && device.ws.readyState === WebSocket.OPEN) {
    device.ws.send(JSON.stringify({
      type: 'fence_update',
      fenceData: data.fenceData,
      timestamp: Date.now()
    }));
    console.log(`  → Sent to ESP32: ${data.deviceId}`);
  } else {
    console.log(`  ✗ Device not connected: ${data.deviceId}`);
  }
});

socket.on('command:config_update', (data) => {
  console.log(`[Server] Config update command for ${data.deviceId}`);

  const device = connectedDevices.get(data.deviceId);
  if (device && device.ws.readyState === WebSocket.OPEN) {
    device.ws.send(JSON.stringify({
      type: 'config_update',
      config: data.config,
      timestamp: Date.now()
    }));
    console.log(`  → Sent to ESP32: ${data.deviceId}`);
  }
});

// Status endpoint
setInterval(() => {
  const deviceCount = connectedDevices.size;
  if (deviceCount > 0) {
    console.log(`\n[Bridge] Active ESP32 devices: ${deviceCount}`);
    connectedDevices.forEach((device, id) => {
      console.log(`  - ${id} (${device.macAddress}) - Connected ${Math.floor((Date.now() - new Date(device.connectedAt).getTime()) / 1000)}s ago`);
    });
  }
}, 30000); // Every 30 seconds

// Error handling
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

process.on('SIGINT', () => {
  console.log('\nShutting down WebSocket bridge...');
  connectedDevices.forEach((device) => {
    if (device.ws.readyState === WebSocket.OPEN) {
      device.ws.close();
    }
  });
  wss.close();
  socket.disconnect();
  process.exit(0);
});

console.log('\n✓ WebSocket Bridge Server ready');
console.log('Waiting for ESP32 connections on port 8081...\n');

// Broadcast function to send messages to all connected WebSocket clients
function broadcastToWebSocketClients(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    console.log(`📡 Broadcast to ${sentCount} WebSocket client(s):`, message.type);
  }
}

// Export for use by main server
module.exports = { wss, broadcastToWebSocketClients };
