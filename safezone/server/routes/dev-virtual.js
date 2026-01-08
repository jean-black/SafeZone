const express = require('express');
const { db } = require('../config/database');
const { now } = require('../utils/dateFormatter');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// WebSocket server will be injected
let wss = null;

function setWebSocketServer(websocketServer) {
  wss = websocketServer;
}

const router = express.Router();

// Middleware to verify developer authentication
function authenticateDeveloper(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'safezone-secret-key');

    if (decoded.userType !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    req.developerToken = decoded.token;
    req.developerId = decoded.farmerId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Generate unique token
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// GET all farms (for developer to select from)
router.get('/farms', authenticateDeveloper, (req, res) => {
  try {
    const farms = db.prepare(`
      SELECT
        f.farm_name,
        f.farm_token,
        f.farm_gps,
        f.timestamp,
        COALESCE(dev.developer_name, fr.farmer_name) as owner_name,
        COALESCE(dev.developer_token, fr.farmer_token) as owner_token,
        COUNT(DISTINCT fe.fence_token) as fence_count,
        (COUNT(DISTINCT c.cow_token) + COUNT(DISTINCT vc.cow_token)) as cow_count
      FROM dbt2 f
      LEFT JOIN dbt1 fr ON f.farmer_token = fr.farmer_token AND (f.developer_token IS NULL OR f.developer_token = '')
      LEFT JOIN dbt10 dev ON f.developer_token = dev.developer_token AND f.developer_token != ''
      LEFT JOIN dbt3 fe ON f.farm_token = fe.farm_token
      LEFT JOIN dbt4 c ON f.farm_token = c.farm_token
      LEFT JOIN dbt6 vc ON f.farm_token = vc.farm_token
      GROUP BY f.farm_token
      ORDER BY f.timestamp DESC
    `).all();

    res.json({ farms });
  } catch (error) {
    console.error('Error fetching farms:', error);
    res.status(500).json({ error: 'Failed to fetch farms' });
  }
});

// GET all virtual cows (from dbt6)
router.get('/virtual-cows', authenticateDeveloper, (req, res) => {
  try {
    const virtualCows = db.prepare(`
      SELECT
        v.cow_name,
        v.cow_nickname,
        v.cow_token,
        v.collar_id,
        v.farm_token,
        v.developer_token,
        v.timestamp,
        v.state_fence,
        v.time_inside,
        v.time_outside,
        v.total_breach,
        v.gps_latitude,
        v.gps_longitude,
        v.actual_time_inside_fence,
        v.actual_time_outside_fence,
        v.zone_changed_at,
        f.farm_name,
        dev.developer_name as owner_name
      FROM dbt6 v
      LEFT JOIN dbt2 f ON v.farm_token = f.farm_token
      LEFT JOIN dbt10 dev ON v.developer_token = dev.developer_token
      ORDER BY v.timestamp DESC
    `).all();

    res.json({ virtualCows });
  } catch (error) {
    console.error('Error fetching virtual cows:', error);
    res.status(500).json({ error: 'Failed to fetch virtual cows' });
  }
});

// POST create a new virtual cow
router.post('/virtual-cows', authenticateDeveloper, (req, res) => {
  try {
    const { cowName, cowNickname, farmToken } = req.body;

    if (!cowName) {
      return res.status(400).json({ error: 'Cow name is required' });
    }

    // Check if cow name already exists
    const existingCow = db.prepare('SELECT cow_token FROM dbt6 WHERE cow_name = ?').get(cowName);

    let finalCowName = cowName;
    if (existingCow) {
      // Append 3-digit number if name exists
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      finalCowName = `${cowName}${randomSuffix}`;
    }

    // Generate unique tokens
    const cowToken = generateToken();
    const collarId = `VC${Date.now().toString().slice(-8)}`; // Virtual Collar ID

    // Insert into dbt6 (virtual cow table)
    // Initialize alarm_triggered columns to 0 for new virtual cows
    const insertStmt = db.prepare(`
      INSERT INTO dbt6 (
        cow_name,
        cow_nickname,
        cow_token,
        collar_id,
        farm_token,
        developer_token,
        timestamp,
        state_fence,
        time_inside,
        time_outside,
        total_breach,
        registered_at,
        assigned_at,
        gps_latitude,
        gps_longitude,
        alarm1_triggered,
        alarm2_triggered,
        alarm3_triggered
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const currentTime = now();
    insertStmt.run(
      finalCowName,
      cowNickname || finalCowName,
      cowToken,
      collarId,
      farmToken || null, // Assign to farm if provided
      req.developerToken, // Always set for developer-created cows
      currentTime, // timestamp
      'inside', // Default state_fence
      0, // time_inside
      0, // time_outside
      0, // total_breach
      currentTime, // registered_at - when cow is created
      farmToken ? currentTime : null, // assigned_at - only if assigned to a farm
      0.0, // gps_latitude
      0.0, // gps_longitude
      0, // alarm1_triggered
      0, // alarm2_triggered
      0  // alarm3_triggered
    );

    // Update developer's total_cows counter
    const updateDeveloperStmt = db.prepare('UPDATE dbt10 SET total_cows = total_cows + 1 WHERE developer_token = ?');
    updateDeveloperStmt.run(req.developerToken);
    console.log(`[Create Virtual Cow] Incremented total_cows for developer: ${req.developerToken}`);

    res.json({
      success: true,
      virtualCow: {
        cow_name: finalCowName,
        cow_nickname: cowNickname || finalCowName,
        cow_token: cowToken,
        collar_id: collarId,
        farm_token: farmToken || null,
        developer_token: req.developerToken
      }
    });
  } catch (error) {
    console.error('Error creating virtual cow:', error);
    res.status(500).json({ error: 'Failed to create virtual cow' });
  }
});

// PUT assign virtual cow to a farm
router.put('/virtual-cows/:cowToken/assign', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken } = req.params;
    const { farmToken } = req.body;

    if (!farmToken) {
      return res.status(400).json({ error: 'Farm token is required' });
    }

    // Verify farm exists
    const farm = db.prepare('SELECT farm_name FROM dbt2 WHERE farm_token = ?').get(farmToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // Update virtual cow with farm_token
    const updateStmt = db.prepare(`
      UPDATE dbt6
      SET farm_token = ?,
          timestamp = ?
      WHERE cow_token = ?
    `);

    const result = updateStmt.run(farmToken, now(), cowToken);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Virtual cow not found' });
    }

    res.json({
      success: true,
      message: `Virtual cow assigned to ${farm.farm_name}`
    });
  } catch (error) {
    console.error('Error assigning virtual cow:', error);
    res.status(500).json({ error: 'Failed to assign virtual cow' });
  }
});

// PUT unassign virtual cow from farm
router.put('/virtual-cows/:cowToken/unassign', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken } = req.params;

    // Update virtual cow to remove farm_token
    const updateStmt = db.prepare(`
      UPDATE dbt6
      SET farm_token = NULL,
          timestamp = ?
      WHERE cow_token = ?
    `);

    const result = updateStmt.run(now(), cowToken);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Virtual cow not found' });
    }

    res.json({
      success: true,
      message: 'Virtual cow unassigned from farm'
    });
  } catch (error) {
    console.error('Error unassigning virtual cow:', error);
    res.status(500).json({ error: 'Failed to unassign virtual cow' });
  }
});

// POST update virtual controller selection (dbt12)
router.post('/controller/select', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken, farmToken } = req.body;
    console.log('[Virtual Controller] Selecting cow:', cowToken, 'farm:', farmToken, 'developer:', req.developerToken);

    // First, set all previously selected cows to disconnected
    const disconnectResult = db.prepare(`
      UPDATE dbt6
      SET virtual_controller_connection_state = 'disconnected'
      WHERE developer_token = ? AND virtual_controller_connection_state = 'connected'
    `).run(req.developerToken);
    console.log('[Virtual Controller] Disconnected previous cows:', disconnectResult.changes);

    // Update the selected cow to connected
    const connectResult = db.prepare(`
      UPDATE dbt6
      SET virtual_controller_connection_state = 'connected',
          connected_at = ?,
          last_seen = ?
      WHERE cow_token = ?
    `).run(now(), now(), cowToken);
    console.log('[Virtual Controller] Connected cow:', cowToken, 'rows affected:', connectResult.changes);

    // Check if controller entry exists for this developer
    const existing = db.prepare('SELECT * FROM dbt12 WHERE developer_token = ?').get(req.developerToken);

    if (existing) {
      // Update existing entry
      const updateStmt = db.prepare(`
        UPDATE dbt12
        SET selected_cow_token = ?,
            selected_farm_token = ?,
            connected_at = ?,
            last_seen_at = ?,
            connection_state = 'connected'
        WHERE developer_token = ?
      `);

      updateStmt.run(cowToken, farmToken, now(), now(), req.developerToken);
    } else {
      // Insert new entry
      const insertStmt = db.prepare(`
        INSERT INTO dbt12 (
          developer_token,
          selected_cow_token,
          selected_farm_token,
          connected_at,
          last_seen_at,
          connection_state,
          last_speed_scale
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(req.developerToken, cowToken, farmToken, now(), now(), 'connected', 0);
    }

    // Update page19_last_used_parameter in dbt10 with current state
    const currentState = db.prepare('SELECT * FROM dbt12 WHERE developer_token = ?').get(req.developerToken);
    if (currentState) {
      const parameterState = JSON.stringify({
        selected_cow_token: currentState.selected_cow_token,
        selected_farm_token: currentState.selected_farm_token,
        last_speed_scale: currentState.last_speed_scale,
        last_updated: now()
      });
      db.prepare('UPDATE dbt10 SET page19_last_used_parameter = ? WHERE developer_token = ?')
        .run(parameterState, req.developerToken);
      console.log('[Page19 State] Saved to dbt10:', parameterState);
    }

    res.json({
      success: true,
      message: 'Virtual controller selection updated'
    });
  } catch (error) {
    console.error('Error updating controller selection:', error);
    res.status(500).json({ error: 'Failed to update selection' });
  }
});

// GET current controller selection
router.get('/controller/current', authenticateDeveloper, (req, res) => {
  try {
    const selection = db.prepare(`
      SELECT
        vc.developer_token,
        vc.selected_cow_token,
        vc.selected_farm_token,
        vc.connection_state,
        vc.last_speed_scale,
        c.cow_name,
        c.cow_nickname,
        c.gps_latitude,
        c.gps_longitude,
        f.farm_name
      FROM dbt12 vc
      LEFT JOIN dbt6 c ON vc.selected_cow_token = c.cow_token
      LEFT JOIN dbt2 f ON vc.selected_farm_token = f.farm_token
      WHERE vc.developer_token = ?
    `).get(req.developerToken);

    res.json({ selection: selection || null });
  } catch (error) {
    console.error('Error fetching controller selection:', error);
    res.status(500).json({ error: 'Failed to fetch selection' });
  }
});

// POST update virtual cow position
router.post('/virtual-cows/:cowToken/position', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken } = req.params;
    const { latitude, longitude, speed, zone } = req.body;

    console.log(`📥 [Server] Received position update for cow ${cowToken}:`);
    console.log(`   - latitude: ${latitude}`);
    console.log(`   - longitude: ${longitude}`);
    console.log(`   - speed: ${speed} (type: ${typeof speed})`);
    console.log(`   - zone: ${zone}`);

    // Get current cow data before updating
    const cowExists = db.prepare(`
      SELECT cow_token, cow_name, state_fence, zone_changed_at,
             time_inside, time_outside,
             actual_time_inside_fence, actual_time_outside_fence,
             total_breach,
             alarm1_triggered, alarm2_triggered, alarm3_triggered,
             alarm1_triggered_at, alarm2_triggered_at, alarm3_triggered_at
      FROM dbt6
      WHERE cow_token = ?
    `).get(cowToken);

    if (!cowExists) {
      return res.status(404).json({ error: 'Virtual cow not found' });
    }

    // Calculate zone transition and time updates
    let cumulativeTimeInside = cowExists.time_inside || 0;
    let cumulativeTimeOutside = cowExists.time_outside || 0;
    let actualTimeInside = cowExists.actual_time_inside_fence || 0;
    let actualTimeOutside = cowExists.actual_time_outside_fence || 0;
    let totalBreach = cowExists.total_breach || 0;
    const oldZone = cowExists.state_fence;
    const newZone = zone || oldZone || 'unknown';
    const zoneChanged = oldZone && oldZone !== newZone;

    if (zoneChanged) {
      console.log(`\n🔄 [Virtual Cow] Zone transition: ${oldZone} → ${newZone}`);

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
      if (newZone === 'zone1') {
        actualTimeOutside = 0;
        console.log(`  🔄 Reset actual_time_outside_fence to 0 (now inside)`);
      } else if (newZone === 'zone2' || newZone === 'zone3') {
        actualTimeInside = 0;
        console.log(`  🔄 Reset actual_time_inside_fence to 0 (now outside)`);
      }

      // Increment breach counter if cow moved from inside (zone1) to outside (zone2/zone3)
      if (oldZone === 'zone1' && (newZone === 'zone2' || newZone === 'zone3')) {
        totalBreach += 1;
        console.log(`  🚨 BREACH DETECTED! Total breaches: ${totalBreach}`);
      }

      // Reset all alarm triggers when cow returns to zone1 (safe zone)
      if (newZone === 'zone1' && (oldZone === 'zone2' || oldZone === 'zone3')) {
        console.log(`  🔔 Cow returned to safe zone - resetting all alarm triggers`);
      }

      console.log(`  💾 Final values - Cumulative: inside=${cumulativeTimeInside}s, outside=${cumulativeTimeOutside}s | Actual: inside=${actualTimeInside}s, outside=${actualTimeOutside}s | Breaches: ${totalBreach}`);
    }

    // Determine if we need to reset alarms (when cow returns to safe zone)
    const shouldResetAlarms = zoneChanged && newZone === 'zone1' && (oldZone === 'zone2' || oldZone === 'zone3');

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
      alarm1Triggered = ((newZone === 'zone2' || newZone === 'zone3') && cowExists.alarm1_triggered_at !== null) ? 1 : 0;
      alarm2Triggered = ((newZone === 'zone2' || newZone === 'zone3') && cowExists.alarm2_triggered_at !== null) ? 1 : 0;
      alarm3Triggered = ((newZone === 'zone2' || newZone === 'zone3') && cowExists.alarm3_triggered_at !== null) ? 1 : 0;
    }
    // If shouldResetAlarms, all stay 0

    // Update virtual cow with position, zone, and time tracking
    const updateStmt = db.prepare(`
      UPDATE dbt6
      SET gps_latitude = ?,
          gps_longitude = ?,
          state_fence = ?,
          time_inside = ?,
          time_outside = ?,
          actual_time_inside_fence = ?,
          actual_time_outside_fence = ?,
          total_breach = ?,
          zone_changed_at = ?,
          timestamp = ?,
          alarm1_triggered = ?,
          alarm2_triggered = ?,
          alarm3_triggered = ?,
          alarm1_triggered_at = ?,
          alarm2_triggered_at = ?,
          alarm3_triggered_at = ?
      WHERE cow_token = ?
    `);

    const result = updateStmt.run(
      latitude,
      longitude,
      newZone,
      cumulativeTimeInside,
      cumulativeTimeOutside,
      actualTimeInside,
      actualTimeOutside,
      totalBreach,
      zoneChanged ? now() : cowExists.zone_changed_at,
      now(),
      alarm1Triggered,
      alarm2Triggered,
      alarm3Triggered,
      shouldResetAlarms ? null : cowExists.alarm1_triggered_at, // Reset timestamps to null
      shouldResetAlarms ? null : cowExists.alarm2_triggered_at,
      shouldResetAlarms ? null : cowExists.alarm3_triggered_at,
      cowToken
    );

    // Update last speed in dbt12 if this is the selected cow
    if (speed !== undefined) {
      console.log(`💾 [Server] Updating dbt12 with speed ${speed} for cow ${cowToken}, dev ${req.developerToken}`);
      const result = db.prepare(`
        UPDATE dbt12
        SET last_speed_scale = ?,
            last_seen_at = ?
        WHERE selected_cow_token = ? AND developer_token = ?
      `).run(speed, now(), cowToken, req.developerToken);
      console.log(`   Updated ${result.changes} row(s) in dbt12`);

      // Verify the update
      const verification = db.prepare('SELECT last_speed_scale FROM dbt12 WHERE selected_cow_token = ? AND developer_token = ?').get(cowToken, req.developerToken);
      console.log(`   ✅ Verified: dbt12.last_speed_scale = ${verification?.last_speed_scale}`);

      // Update page19_last_used_parameter in dbt10 with current state
      const currentState = db.prepare('SELECT * FROM dbt12 WHERE developer_token = ?').get(req.developerToken);
      if (currentState) {
        const parameterState = JSON.stringify({
          selected_cow_token: currentState.selected_cow_token,
          selected_farm_token: currentState.selected_farm_token,
          last_speed_scale: currentState.last_speed_scale,
          last_updated: now()
        });
        db.prepare('UPDATE dbt10 SET page19_last_used_parameter = ? WHERE developer_token = ?')
          .run(parameterState, req.developerToken);
        console.log('[Page19 State] Saved to dbt10 after speed update');
      }
    } else {
      console.log(`⚠️ [Server] speed is undefined, not updating dbt12`);
    }

    // Broadcast position update to all WebSocket clients for real-time sync
    if (wss) {
      const cow = db.prepare(`
        SELECT cow_name, cow_nickname, collar_id,
               time_inside, time_outside,
               actual_time_inside_fence, actual_time_outside_fence,
               total_breach, zone_changed_at,
               gps_latitude, gps_longitude
        FROM dbt6
        WHERE cow_token = ?
      `).get(cowToken);

      console.log(`📡 [BROADCAST] Virtual cow position update for ${cow?.cow_nickname || cowToken}`);
      console.log(`   DB Position: (${cow?.gps_latitude}, ${cow?.gps_longitude})`);
      console.log(`   Param Position: (${latitude}, ${longitude})`);
      console.log(`   Match: ${cow?.gps_latitude === latitude && cow?.gps_longitude === longitude ? 'YES' : 'NO - MISMATCH!'}`);

      const broadcastData = {
        type: 'virtual_cow_position',
        cow_token: cowToken,
        cow_name: cow?.cow_name,
        cow_nickname: cow?.cow_nickname,
        collar_id: cow?.collar_id,
        latitude: latitude,  // Use parameter, not database value
        longitude: longitude,  // Use parameter, not database value
        zone: newZone,
        time_inside: cow?.time_inside,
        time_outside: cow?.time_outside,
        actual_time_inside_fence: cow?.actual_time_inside_fence,
        actual_time_outside_fence: cow?.actual_time_outside_fence,
        total_breach: cow?.total_breach,
        zone_changed_at: cow?.zone_changed_at,
        speed: speed,
        timestamp: now()
      };

      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN = 1
          client.send(JSON.stringify(broadcastData));
        }
      });
      console.log(`   Broadcast sent to ${wss.clients.size} client(s)`);
    }

    res.json({
      success: true,
      position: { latitude, longitude, speed }
    });
  } catch (error) {
    console.error('Error updating virtual cow position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// DELETE virtual cow
router.delete('/virtual-cows/:cowToken', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken } = req.params;

    // Delete from dbt6
    const deleteStmt = db.prepare('DELETE FROM dbt6 WHERE cow_token = ? AND developer_token = ?');
    const result = deleteStmt.run(cowToken, req.developerToken);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Virtual cow not found' });
    }

    // Decrement developer's total_cows counter
    const updateDeveloperStmt = db.prepare('UPDATE dbt10 SET total_cows = total_cows - 1 WHERE developer_token = ?');
    updateDeveloperStmt.run(req.developerToken);
    console.log(`[Delete Virtual Cow] Decremented total_cows for developer: ${req.developerToken}`);

    // Clear from dbt12 if it was selected
    db.prepare(`
      UPDATE dbt12
      SET selected_cow_token = NULL
      WHERE selected_cow_token = ?
    `).run(cowToken);

    res.json({
      success: true,
      message: 'Virtual cow deleted'
    });
  } catch (error) {
    console.error('Error deleting virtual cow:', error);
    res.status(500).json({ error: 'Failed to delete virtual cow' });
  }
});

// POST heartbeat to keep connection alive
router.post('/controller/heartbeat', authenticateDeveloper, (req, res) => {
  try {
    const { cowToken, farmToken } = req.body;

    // Update last_seen_at in dbt12 to indicate connection is still alive
    db.prepare(`
      UPDATE dbt12
      SET last_seen_at = ?
      WHERE developer_token = ? AND selected_cow_token = ?
    `).run(now(), req.developerToken, cowToken);

    // Update last_seen in dbt6 for the virtual cow
    db.prepare(`
      UPDATE dbt6
      SET last_seen = ?
      WHERE cow_token = ? AND developer_token = ?
    `).run(now(), cowToken, req.developerToken);

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
});

// POST disconnect virtual controller
router.post('/controller/disconnect', authenticateDeveloper, (req, res) => {
  try {
    // Set all cows controlled by this developer to disconnected
    db.prepare(`
      UPDATE dbt6
      SET virtual_controller_connection_state = 'disconnected',
          last_seen = ?
      WHERE developer_token = ? AND virtual_controller_connection_state = 'connected'
    `).run(now(), req.developerToken);

    // Update dbt12 to mark as disconnected (but keep selected_cow_token, selected_farm_token, and last_speed_scale)
    // This allows restoration when page19 is reopened
    db.prepare(`
      UPDATE dbt12
      SET connection_state = 'disconnected',
          last_seen_at = ?
      WHERE developer_token = ?
    `).run(now(), req.developerToken);

    res.json({
      success: true,
      message: 'Virtual controller disconnected and reset'
    });
  } catch (error) {
    console.error('Error disconnecting controller:', error);
    res.status(500).json({ error: 'Failed to disconnect controller' });
  }
});

// GET farm fence center for resetting position
router.get('/farms/:farmToken/fence-center', authenticateDeveloper, (req, res) => {
  try {
    const { farmToken } = req.params;

    // Get farm GPS as fallback
    const farm = db.prepare('SELECT farm_name, farm_gps FROM dbt2 WHERE farm_token = ?').get(farmToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // Get fences for this farm
    const fences = db.prepare(`
      SELECT fence_name, fence_coordinate
      FROM dbt3
      WHERE farm_token = ?
    `).all(farmToken);

    let centerLat = 0;
    let centerLng = 0;

    if (fences.length > 0 && fences[0].fence_coordinate) {
      // Calculate center of first fence
      const coords = JSON.parse(fences[0].fence_coordinate);
      if (coords && coords.length > 0) {
        const sumLat = coords.reduce((sum, coord) => sum + coord.lat, 0);
        const sumLng = coords.reduce((sum, coord) => sum + coord.lng, 0);
        centerLat = sumLat / coords.length;
        centerLng = sumLng / coords.length;
      }
    } else if (farm.farm_gps) {
      // Use farm GPS as fallback
      const [lat, lng] = farm.farm_gps.split(',').map(Number);
      centerLat = lat;
      centerLng = lng;
    }

    res.json({
      farm_name: farm.farm_name,
      center: {
        latitude: centerLat,
        longitude: centerLng
      },
      has_fence: fences.length > 0
    });
  } catch (error) {
    console.error('Error getting farm fence center:', error);
    res.status(500).json({ error: 'Failed to get fence center' });
  }
});

module.exports = router;
module.exports.setWebSocketServer = setWebSocketServer;
