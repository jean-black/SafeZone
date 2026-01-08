const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import configuration and services
const { db, initializeDatabase } = require('./config/database');
const { initializeCronJobs } = require('./services/cronJobs');
const { notifyCowBreach } = require('./services/notificationService');
const { now } = require('./utils/dateFormatter');
const { initializeAutonomousMonitoring } = require('./services/autonomousMonitoring');
// const { simulateCowMovement, createTestCows } = require('./services/cowSimulation');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const farmsRoutes = require('./routes/farms');
const cowsRoutes = require('./routes/cows');
const recoveryRoutes = require('./routes/recovery');
const devVirtualRoutes = require('./routes/dev-virtual');
const alarmRoutes = require('./routes/alarms');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // Very high limit for development
  message: 'Too many requests from this IP'
});

// Middleware
app.use(limiter);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:", "https://unpkg.com", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', dashboardRoutes); // For /api/notifications and /api/database/test
app.use('/api/farms', farmsRoutes); // Includes fence routes at /api/farms/fences
app.use('/api/cows', cowsRoutes);
app.use('/api/recovery', recoveryRoutes); // Collaborative recovery routes
app.use('/api/collaborative', cowsRoutes); // Collaborative routes are in cows.js
app.use('/api/esp32', cowsRoutes); // ESP32 routes are in cows.js
app.use('/api/dev', devVirtualRoutes); // Developer virtual cow routes
app.use('/api/alarms', alarmRoutes); // Alarm notification routes
app.use('/api', cowsRoutes); // For /api/test-email

// Collaborative page route
app.get('/collaborative/:linkId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/html', 'index.html'));
});

// Redirect root to login page
app.get('/', (req, res) => {
  res.redirect('/html/index.html');
});

// Initialize database
initializeDatabase();

// Initialize autonomous cow monitoring (24/7 email notifications)
initializeAutonomousMonitoring();

// Create test cows (disabled - keeping clean database)
// createTestCows();

// Start server
const server = app.listen(PORT, () => {
  console.log(`SafeZone server running on port ${PORT}`);
  console.log(`Database: modeblack.db (SQLite)`);
  console.log(`Server structure: Modularized`);
});

// WebSocket setup for web browsers
const wss = new WebSocket.Server({ server });

// Pass WebSocket server to dev-virtual routes for real-time broadcasting
devVirtualRoutes.setWebSocketServer(wss);

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Periodic update for actual time tracking (every 10 seconds)
setInterval(() => {
  try {
    const currentTime = Date.now();

    // Update dbt6 (virtual cows)
    const virtualCows = db.prepare(`
      SELECT cow_token, cow_name, state_fence, zone_changed_at,
             time_inside, time_outside,
             actual_time_inside_fence, actual_time_outside_fence
      FROM dbt6
      WHERE zone_changed_at IS NOT NULL
    `).all();

    for (const cow of virtualCows) {
      if (!cow.zone_changed_at) continue;

      const zoneChangedTime = new Date(cow.zone_changed_at).getTime();
      const elapsedSeconds = Math.floor((currentTime - zoneChangedTime) / 1000);

      // Calculate new actual time based on current zone
      let newActualInside = cow.actual_time_inside_fence || 0;
      let newActualOutside = cow.actual_time_outside_fence || 0;

      if (cow.state_fence === 'zone1') {
        newActualInside = elapsedSeconds;
      } else if (cow.state_fence === 'zone2' || cow.state_fence === 'zone3') {
        newActualOutside = elapsedSeconds;
      }

      // Update database
      db.prepare(`
        UPDATE dbt6
        SET actual_time_inside_fence = ?,
            actual_time_outside_fence = ?
        WHERE cow_token = ?
      `).run(newActualInside, newActualOutside, cow.cow_token);
    }

    // Update dbt4 (real cows)
    const realCows = db.prepare(`
      SELECT cow_token, cow_name, state_fence, zone_changed_at,
             time_inside, time_outside,
             actual_time_inside_fence, actual_time_outside_fence
      FROM dbt4
      WHERE zone_changed_at IS NOT NULL
    `).all();

    for (const cow of realCows) {
      if (!cow.zone_changed_at) continue;

      const zoneChangedTime = new Date(cow.zone_changed_at).getTime();
      const elapsedSeconds = Math.floor((currentTime - zoneChangedTime) / 1000);

      // Calculate new actual time based on current zone
      let newActualInside = cow.actual_time_inside_fence || 0;
      let newActualOutside = cow.actual_time_outside_fence || 0;

      if (cow.state_fence === 'zone1') {
        newActualInside = elapsedSeconds;
      } else if (cow.state_fence === 'zone2' || cow.state_fence === 'zone3') {
        newActualOutside = elapsedSeconds;
      }

      // Update database
      db.prepare(`
        UPDATE dbt4
        SET actual_time_inside_fence = ?,
            actual_time_outside_fence = ?
        WHERE cow_token = ?
      `).run(newActualInside, newActualOutside, cow.cow_token);
    }
  } catch (error) {
    console.error('Error updating actual time:', error);
  }
}, 10000); // Run every 10 seconds

console.log('✓ Periodic actual time update started (every 10 seconds)');

// Socket.IO setup for ESP32 bridge
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Mark all collars as disconnected on server startup
// (since any previously connected devices lost connection when server stopped)
try {
  const result = db.prepare(`
    UPDATE dbt4
    SET collar_state = 'disconnected'
    WHERE collar_state = 'connected'
  `).run();

  if (result.changes > 0) {
    console.log(`✓ Marked ${result.changes} collar(s) as disconnected on startup`);
  }
} catch (error) {
  console.error('Error marking collars as disconnected:', error);
}

// Track active ESP32 connections in memory
const activeESP32Connections = new Map(); // Map<deviceId, { socketId, lastSeen }>

io.on('connection', (socket) => {
  console.log('\n🔌 [Socket.IO] NEW CLIENT CONNECTED');
  console.log('   Socket ID:', socket.id);
  console.log('   Time:', now());

  // Handle ESP32 device registration
  socket.on('esp32:register', (data) => {
    console.log('[ESP32 Register]', data.deviceId);

    try {
      // Add to active connections map
      const currentTime = now();
      activeESP32Connections.set(data.macAddress, {
        socketId: socket.id,
        lastSeen: currentTime,
        deviceId: data.deviceId
      });
      console.log('[ESP32] Added to active connections:', data.macAddress);

      // First check if cow already exists in dbt4 (assigned cows)
      const existingInDbt4 = db.prepare('SELECT * FROM dbt4 WHERE collar_id = ?').get(data.macAddress);

      if (existingInDbt4) {
        // Cow already registered and assigned - just update connection state
        console.log('[ESP32] Cow already exists in dbt4:', existingInDbt4.cow_name);

        const currentTime = now();
        const updateDbt4 = db.prepare(`
          UPDATE dbt4
          SET collar_state = 'connected', connected_at = ?, last_seen = ?
          WHERE collar_id = ?
        `);
        updateDbt4.run(currentTime, currentTime, data.macAddress);
        console.log('[ESP32] ✓ Updated collar_state to CONNECTED for', data.macAddress);
      } else {
        // Not in dbt4, check if in dbt5
        const existingInDbt5 = db.prepare('SELECT * FROM dbt5 WHERE collar_id = ?').get(data.macAddress);

        if (!existingInDbt5) {
          // New cow - create entry in dbt5
          const count = db.prepare('SELECT COUNT(*) as total FROM dbt5').get();
          const cowName = 'cow' + (count.total + 1);

          const stmt = db.prepare(`
            INSERT INTO dbt5 (
              cow_name, cow_nickname, collar_id, cow_token, timestamp
            ) VALUES (?, ?, ?, ?, ?)
          `);

          const cowToken = 'COW_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          const timestamp = now();

          stmt.run(
            cowName,              // cow_name (e.g., "cow1", "cow2")
            null,                 // cow_nickname (NULL - not set yet)
            data.macAddress,      // collar_id (MAC address)
            cowToken,             // cow_token
            timestamp             // timestamp
          );

          console.log('[ESP32] New cow created in dbt5:', cowName, '(MAC:', data.macAddress + ')');
        } else {
          console.log('[ESP32] Cow already exists in dbt5:', existingInDbt5.cow_name);
        }
      }

    } catch (error) {
      console.error('[ESP32 Register Error]', error);
    }
  });

  // Handle GPS data updates
  socket.on('esp32:gps_update', (data) => {
    console.log('[ESP32 GPS]', data.deviceId, '- Lat:', data.latitude, 'Lng:', data.longitude);

    try {
      // Update cow GPS position (NOT last_seen - that's for connection tracking only)
      const stmt = db.prepare(`
        UPDATE dbt4
        SET gps_latitude = ?, gps_longitude = ?, timestamp = ?
        WHERE collar_id = ?
      `);

      stmt.run(
        data.latitude,
        data.longitude,
        now(),
        data.deviceId
      );

      // Broadcast GPS update to all WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'gps_update',
            deviceId: data.deviceId,
            latitude: data.latitude,
            longitude: data.longitude,
            currentZone: data.currentZone,
            insideFence: data.insideFence
          }));
        }
      });
    } catch (error) {
      console.error('[ESP32 GPS Error]', error);
    }
  });

  // Handle zone change events
  socket.on('esp32:zone_change', (data) => {
    console.log('[ESP32 Zone Change]', data.deviceId, '-', data.oldZone, '→', data.newZone);

    // Broadcast to WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'zone_change',
          deviceId: data.deviceId,
          oldZone: data.oldZone,
          newZone: data.newZone
        }));
      }
    });
  });

  // Handle alarm events
  socket.on('esp32:alarm', (data) => {
    console.log('[ESP32 Alarm]', data.deviceId, '-', data.alarmType, 'Level:', data.alarmLevel);

    try {
      // Update breach count and state
      if (data.alarmType === 'breach' || data.alarmType.startsWith('level')) {
        const stmt = db.prepare(`
          UPDATE dbt4
          SET state_fence = 'outside', total_breach = total_breach + 1
          WHERE collar_id = ?
        `);
        stmt.run(data.deviceId);

        // Send notification for level 2 breaches
        if (data.alarmLevel === 2 || data.alarmType === 'level2') {
          const cowStmt = db.prepare('SELECT cow_name, cow_nickname, cow_token, farmer_token FROM dbt4 WHERE collar_id = ?');
          const cow = cowStmt.get(data.deviceId);

          if (cow) {
            const cowDisplayName = cow.cow_nickname || cow.cow_name;
            const location = data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : 'Unknown location';
            notifyCowBreach(cow.farmer_token, cow.cow_token, cowDisplayName, location);
          }
        }
      } else if (data.alarmType === 'return') {
        const stmt = db.prepare(`
          UPDATE dbt4
          SET state_fence = 'inside'
          WHERE collar_id = ?
        `);
        stmt.run(data.deviceId);
      }

      // Broadcast alarm to WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'alarm',
            deviceId: data.deviceId,
            alarmType: data.alarmType,
            alarmLevel: data.alarmLevel,
            message: data.message
          }));
        }
      });
    } catch (error) {
      console.error('[ESP32 Alarm Error]', error);
    }
  });

  // Handle ESP32 disconnect from WebSocket bridge
  socket.on('esp32:disconnect', (data) => {
    console.log('[ESP32] ✗ Disconnect event received:', data.deviceId);

    try {
      // Remove from active connections
      if (activeESP32Connections.has(data.macAddress)) {
        activeESP32Connections.delete(data.macAddress);
        console.log('[ESP32] Removed from active connections:', data.macAddress);
      }

      // Update database to mark as disconnected
      const currentTime = now();
      const updateStmt = db.prepare(`
        UPDATE dbt4
        SET collar_state = 'disconnected', last_seen = ?
        WHERE collar_id = ?
      `);
      updateStmt.run(currentTime, data.macAddress);
      console.log('[ESP32] ✓ Updated collar_state to DISCONNECTED for', data.macAddress);
    } catch (error) {
      console.error('[ESP32 Disconnect Error]', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO client disconnected:', socket.id);

    // Find and remove ESP32 from active connections
    for (const [macAddress, connection] of activeESP32Connections.entries()) {
      if (connection.socketId === socket.id) {
        console.log('[ESP32] ✗ Connection lost:', macAddress);
        activeESP32Connections.delete(macAddress);

        // Update database to mark as disconnected with last_seen timestamp
        try {
          const currentTime = now();
          const updateStmt = db.prepare(`
            UPDATE dbt4
            SET collar_state = 'disconnected', last_seen = ?
            WHERE collar_id = ?
          `);
          updateStmt.run(currentTime, macAddress);
          console.log('[ESP32] ✓ Updated collar_state to DISCONNECTED for', macAddress);
        } catch (error) {
          console.error('[ESP32 Disconnect Error]', error);
        }
        break;
      }
    }
  });

  // ============================================
  // RECOVERY COLLABORATIVE WEBSOCKET EVENTS
  // ============================================

  // Join recovery room
  socket.on('join-recovery', (data) => {
    const { recoveryId } = data;
    console.log('\n📥 [Recovery] JOIN RECOVERY ROOM');
    console.log('   Recovery ID:', recoveryId);
    console.log('   Socket ID:', socket.id);
    socket.join(`recovery:${recoveryId}`);
    console.log('   ✅ Joined room: recovery:' + recoveryId);
  });

  // Agent position update
  socket.on('recovery:agent-position', (data) => {
    const { recoveryId, latitude, longitude } = data;
    console.log('[Recovery] Agent position update:', recoveryId, latitude, longitude);

    // Broadcast to all clients in this recovery room (except sender)
    socket.to(`recovery:${recoveryId}`).emit('recovery:agent-position-update', {
      recoveryId,
      latitude,
      longitude
    });
  });

  // Cow position update (when cow moves)
  socket.on('recovery:cow-position', (data) => {
    const { recoveryId, cowToken, latitude, longitude, zone } = data;

    console.log('\n========================================');
    console.log('📡 [Recovery] COW POSITION UPDATE RECEIVED');
    console.log('========================================');
    console.log('Recovery ID:', recoveryId);
    console.log('Cow Token:', cowToken);
    console.log('Position:', `(${latitude}, ${longitude})`);
    console.log('Zone:', zone);
    console.log('Timestamp:', now());

    // Determine which table to update based on recovery type
    // Check dbt11 (virtual recoveries) first
    console.log('\n🔍 [Recovery] Checking recovery type...');
    const virtualRecovery = db.prepare('SELECT recovery_id FROM dbt11 WHERE recovery_id = ?').get(recoveryId);
    const cowTable = virtualRecovery ? 'dbt6' : 'dbt4';

    console.log(`✓ Recovery type: ${virtualRecovery ? 'VIRTUAL' : 'PHYSICAL'}`);
    console.log(`✓ Target table: ${cowTable}`);

    // Check if cow exists before updating
    const cowExists = db.prepare(`SELECT cow_token, cow_name, state_fence, zone_changed_at, time_inside, time_outside, actual_time_inside_fence, actual_time_outside_fence, total_breach, alarm1_triggered, alarm2_triggered, alarm3_triggered, alarm1_triggered_at, alarm2_triggered_at, alarm3_triggered_at FROM ${cowTable} WHERE cow_token = ?`).get(cowToken);
    if (cowExists) {
      console.log(`✓ Cow found in ${cowTable}:`, cowExists.cow_name);
      console.log(`  Current zone: ${cowExists.state_fence}`);
      console.log(`  New zone: ${zone}`);
    } else {
      console.error(`❌ ERROR: Cow ${cowToken} NOT FOUND in ${cowTable}!`);
    }

    // Check if zone changed and calculate time updates
    let cumulativeTimeInside = cowExists?.time_inside || 0;
    let cumulativeTimeOutside = cowExists?.time_outside || 0;
    let actualTimeInside = cowExists?.actual_time_inside_fence || 0;
    let actualTimeOutside = cowExists?.actual_time_outside_fence || 0;
    let totalBreach = cowExists?.total_breach || 0;
    const oldZone = cowExists?.state_fence;
    const zoneChanged = oldZone && oldZone !== zone;

    if (zoneChanged) {
      console.log(`\n🔄 Zone transition detected: ${oldZone} → ${zone}`);

      // Calculate elapsed time since last zone change
      if (cowExists.zone_changed_at) {
        const lastChangeTime = new Date(cowExists.zone_changed_at);
        const currentTime = new Date();
        const elapsedSeconds = Math.floor((currentTime - lastChangeTime) / 1000);
        console.log(`  Time in previous zone: ${elapsedSeconds} seconds`);

        // Add elapsed time to BOTH cumulative AND actual counters based on OLD zone
        if (oldZone === 'zone1') {
          cumulativeTimeInside += elapsedSeconds;
          actualTimeInside += elapsedSeconds;
          console.log(`  Added ${elapsedSeconds}s to time inside (cumulative: ${cumulativeTimeInside}s, actual: ${actualTimeInside}s)`);
        } else if (oldZone === 'zone2' || oldZone === 'zone3') {
          cumulativeTimeOutside += elapsedSeconds;
          actualTimeOutside += elapsedSeconds;
          console.log(`  Added ${elapsedSeconds}s to time outside (cumulative: ${cumulativeTimeOutside}s, actual: ${actualTimeOutside}s)`);
        }
      }

      // Reset the ACTUAL counter for the NEW zone
      if (zone === 'zone1') {
        actualTimeOutside = 0;
        console.log(`  🔄 Reset actual_time_outside_fence to 0 (now inside)`);
      } else if (zone === 'zone2' || zone === 'zone3') {
        actualTimeInside = 0;
        console.log(`  🔄 Reset actual_time_inside_fence to 0 (now outside)`);
      }

      // Increment breach counter if cow moved from inside (zone1) to outside (zone2/zone3)
      if (oldZone === 'zone1' && (zone === 'zone2' || zone === 'zone3')) {
        totalBreach += 1;
        console.log(`  🚨 BREACH DETECTED! Total breaches: ${totalBreach}`);
      }

      // Reset all alarm triggers when cow returns to zone1 (safe zone)
      if (zone === 'zone1' && (oldZone === 'zone2' || oldZone === 'zone3')) {
        console.log(`  🔔 Cow returned to safe zone - resetting all alarm triggers`);
      }

      console.log(`  💾 Final values - Cumulative: inside=${cumulativeTimeInside}s, outside=${cumulativeTimeOutside}s | Actual: inside=${actualTimeInside}s, outside=${actualTimeOutside}s | Breaches: ${totalBreach}`);
    }

    // Determine if we need to reset alarms (when cow returns to safe zone)
    const shouldResetAlarms = zoneChanged && zone === 'zone1' && (oldZone === 'zone2' || oldZone === 'zone3');

    // Compute alarm triggered values based on new zone and timestamp existence
    // FIXED LOGIC:
    // Column23 = 1 when: state_fence IN ('zone2', 'zone3') AND alarm1_triggered_at != null
    // Column24 = 1 when: state_fence IN ('zone2', 'zone3') AND alarm2_triggered_at != null (stays 1 in both zones)
    // Column25 = 1 when: state_fence IN ('zone2', 'zone3') AND alarm3_triggered_at != null (stays 1 in both zones)

    let alarm1Triggered = 0;
    let alarm2Triggered = 0;
    let alarm3Triggered = 0;

    if (!shouldResetAlarms) {
      // Compute based on current zone and timestamp existence
      // All alarms stay active as long as cow is outside zone1 AND alarm was triggered
      alarm1Triggered = ((zone === 'zone2' || zone === 'zone3') && cowExists?.alarm1_triggered_at !== null) ? 1 : 0;
      alarm2Triggered = ((zone === 'zone2' || zone === 'zone3') && cowExists?.alarm2_triggered_at !== null) ? 1 : 0;
      alarm3Triggered = ((zone === 'zone2' || zone === 'zone3') && cowExists?.alarm3_triggered_at !== null) ? 1 : 0;
    }
    // If shouldResetAlarms, all stay 0

    // Update cow position in database
    console.log(`\n💾 [Recovery] Executing UPDATE on ${cowTable}...`);
    try {
      const updateStmt = db.prepare(
        `UPDATE ${cowTable}
         SET gps_latitude = ?,
             gps_longitude = ?,
             state_fence = ?,
             time_inside = ?,
             time_outside = ?,
             actual_time_inside_fence = ?,
             actual_time_outside_fence = ?,
             total_breach = ?,
             zone_changed_at = ?,
             alarm1_triggered = ?,
             alarm2_triggered = ?,
             alarm3_triggered = ?,
             alarm1_triggered_at = ?,
             alarm2_triggered_at = ?,
             alarm3_triggered_at = ?
         WHERE cow_token = ?`
      );

      const result = updateStmt.run(
        latitude,
        longitude,
        zone,
        cumulativeTimeInside,
        cumulativeTimeOutside,
        actualTimeInside,
        actualTimeOutside,
        totalBreach,
        zoneChanged ? now() : cowExists?.zone_changed_at,
        alarm1Triggered,
        alarm2Triggered,
        alarm3Triggered,
        shouldResetAlarms ? null : cowExists?.alarm1_triggered_at, // Reset timestamps to null
        shouldResetAlarms ? null : cowExists?.alarm2_triggered_at,
        shouldResetAlarms ? null : cowExists?.alarm3_triggered_at,
        cowToken
      );

      console.log('✅ UPDATE SUCCESSFUL!');
      console.log('   Rows affected:', result.changes);

      if (result.changes > 0) {
        // Verify the update
        const updatedCow = db.prepare(`SELECT cow_token, cow_name, gps_latitude, gps_longitude, state_fence, time_inside, time_outside, actual_time_inside_fence, actual_time_outside_fence, total_breach, zone_changed_at FROM ${cowTable} WHERE cow_token = ?`).get(cowToken);
        console.log('✓ Verified update in database:');
        console.log(`  Cow: ${updatedCow.cow_name}`);
        console.log(`  Position: (${updatedCow.gps_latitude}, ${updatedCow.gps_longitude})`);
        console.log(`  Zone: ${updatedCow.state_fence}`);
        console.log(`  Cumulative time inside: ${updatedCow.time_inside}s`);
        console.log(`  Cumulative time outside: ${updatedCow.time_outside}s`);
        console.log(`  Actual time inside: ${updatedCow.actual_time_inside_fence}s`);
        console.log(`  Actual time outside: ${updatedCow.actual_time_outside_fence}s`);
        console.log(`  Total breaches: ${updatedCow.total_breach}`);

        // Broadcast position update to all WebSocket clients (including page19)
        console.log('\n📡 [Recovery] Broadcasting to WebSocket clients...');
        const broadcastData = {
          type: 'virtual_cow_position',
          cow_token: cowToken,
          latitude: latitude,
          longitude: longitude,
          zone: zone,
          time_inside: updatedCow.time_inside,
          time_outside: updatedCow.time_outside,
          actual_time_inside_fence: updatedCow.actual_time_inside_fence,
          actual_time_outside_fence: updatedCow.actual_time_outside_fence,
          total_breach: updatedCow.total_breach,
          zone_changed_at: updatedCow.zone_changed_at,
          timestamp: now()
        };
        console.log('Broadcast data:', JSON.stringify(broadcastData));
        broadcastToWebSocketClients(broadcastData);
      } else {
        console.warn('⚠️ WARNING: No rows updated! Cow may not exist.');
      }
    } catch (err) {
      console.error('❌ DATABASE UPDATE FAILED!');
      console.error('Error:', err.message);
      console.error('Stack:', err.stack);
    }

    // Broadcast to all clients in this recovery room
    console.log('\n📡 [Recovery] Broadcasting to recovery room...');
    io.to(`recovery:${recoveryId}`).emit('recovery:cow-position-update', {
      recoveryId,
      cowToken,
      latitude,
      longitude,
      zone
    });
    console.log('========================================\n');
  });

  // Recovery cancelled by owner
  socket.on('recovery:cancel', (data) => {
    const { recoveryId } = data;
    console.log('[Recovery] Recovery cancelled:', recoveryId);

    // Broadcast to all clients in this recovery room
    io.to(`recovery:${recoveryId}`).emit('recovery:cancelled', {
      recoveryId
    });
  });

  // Recovery completed (all cows returned)
  socket.on('recovery:complete', (data) => {
    const { recoveryId } = data;
    console.log('[Recovery] Recovery completed:', recoveryId);

    // Broadcast to all clients in this recovery room
    io.to(`recovery:${recoveryId}`).emit('recovery:completed', {
      recoveryId
    });
  });
});

// Start cow movement simulation (disabled - using real ESP32 data)
// setTimeout(() => {
//   simulateCowMovement(wss);
//   console.log('Cow movement simulation started');
// }, 2000);

// Initialize cron jobs
initializeCronJobs();

// Start WebSocket bridge for ESP32 devices
const { broadcastToWebSocketClients } = require('./websocket-bridge');

module.exports = app;
