const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');
const gmailService = require('../utils/gmailService');
const { notifyNewCowRegistered } = require('../services/notificationService');
const { now } = require('../utils/dateFormatter');

// Get all cows
router.get('/', authenticateToken, (req, res) => {
  try {
    const userToken = req.user.token;

    // Check if user is a developer
    const developer = db.prepare('SELECT developer_token FROM dbt10 WHERE developer_token = ?').get(userToken);

    let cows = [];

    if (developer) {
      // Developer: load real cows (dbt4) AND virtual cows (dbt6)
      const realCows = db.prepare(`
        SELECT
          cow_name, cow_nickname, collar_id, cow_token, farm_token, state_fence,
          time_inside, time_outside, total_breach, collar_state,
          registered_at, assigned_at, connected_at, last_seen, timestamp,
          gps_latitude, gps_longitude,
          actual_time_inside_fence, actual_time_outside_fence, zone_changed_at,
          (gps_latitude || ',' || gps_longitude) as real_time_coordinate,
          'real' as cow_type
        FROM dbt4
        ORDER BY timestamp ASC
      `).all();

      const virtualCows = db.prepare(`
        SELECT
          cow_name, cow_nickname, collar_id, cow_token, farm_token, state_fence,
          time_inside, time_outside, total_breach,
          NULL as collar_state,
          registered_at, NULL as assigned_at, NULL as connected_at, NULL as last_seen, timestamp,
          gps_latitude, gps_longitude,
          actual_time_inside_fence, actual_time_outside_fence, zone_changed_at,
          (gps_latitude || ',' || gps_longitude) as real_time_coordinate,
          'virtual' as cow_type
        FROM dbt6
        WHERE developer_token = ?
        ORDER BY timestamp ASC
      `).all(userToken);

      cows = [...realCows, ...virtualCows];
    } else {
      // Farmer: load only their real cows from dbt4
      const stmt = db.prepare(`
        SELECT cow_name, cow_nickname, collar_id, cow_token, farm_token, state_fence, time_inside, time_outside, total_breach,
               collar_state, registered_at, assigned_at, connected_at, last_seen, timestamp,
               gps_latitude, gps_longitude,
               actual_time_inside_fence, actual_time_outside_fence, zone_changed_at,
               (gps_latitude || ',' || gps_longitude) as real_time_coordinate,
               'real' as cow_type
        FROM dbt4
        WHERE farmer_token = ?
        ORDER BY timestamp ASC
      `);
      cows = stmt.all(userToken);
    }

    res.json({ cows });
  } catch (error) {
    console.error('Cows error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ESP32 register endpoint - automatically adds cow when ESP32 connects
router.post('/register', async (req, res) => {
  try {
    const { macAddress, farmerToken, farmerEmail } = req.body;

    if (!macAddress) {
      return res.status(400).json({ error: 'MAC address is required' });
    }

    let resolvedFarmerToken = farmerToken;

    // If email is provided instead of token, look up the farmer
    if (!resolvedFarmerToken && farmerEmail) {
      const farmerStmt = db.prepare('SELECT farmer_token FROM dbt1 WHERE email = ?');
      const farmer = farmerStmt.get(farmerEmail);

      if (!farmer) {
        return res.status(404).json({ error: 'Farmer not found with this email' });
      }

      resolvedFarmerToken = farmer.farmer_token;
    }

    if (!resolvedFarmerToken) {
      return res.status(400).json({ error: 'Either farmer token or email is required' });
    }

    // Check if this collar (MAC address) already exists
    const checkStmt = db.prepare('SELECT * FROM dbt4 WHERE collar_id = ?');
    const existingCow = checkStmt.get(macAddress);

    if (existingCow) {
      // Collar already registered, return existing cow info
      return res.json({
        success: true,
        cow_token: existingCow.cow_token,
        cow_name: existingCow.cow_name,
        collar_id: existingCow.collar_id,
        message: 'Collar already registered'
      });
    }

    // Generate cow token
    const cowToken = generateToken();

    // Get current cow count for dynamic naming
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM dbt4 WHERE farmer_token = ?');
    const result = countStmt.get(resolvedFarmerToken);
    const queueNumber = (result.count || 0) + 1;
    const cowName = `cow${queueNumber}`;

    // Insert new cow with MAC address as collar_id (farm_token is NULL - will appear in "new cows" list)
    const stmt = db.prepare(`
      INSERT INTO dbt4 (cow_name, cow_nickname, collar_id, cow_token, farmer_token, farm_token, state_fence, time_inside, time_outside, total_breach, timestamp)
      VALUES (?, NULL, ?, ?, ?, NULL, 'outside', 0, 0, 0, ?)
    `);
    stmt.run(cowName, macAddress, cowToken, resolvedFarmerToken, now());

    // Increment total_cow counter
    const updateStmt = db.prepare('UPDATE dbt1 SET total_cow = total_cow + 1 WHERE farmer_token = ?');
    updateStmt.run(resolvedFarmerToken);

    // Create notification for new cow registration
    notifyNewCowRegistered(resolvedFarmerToken, cowToken, cowName, macAddress);

    res.json({
      success: true,
      cow_token: cowToken,
      cow_name: cowName,
      collar_id: macAddress,
      message: 'Cow registered successfully and added to new cows list'
    });
  } catch (error) {
    console.error('Register cow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cow nickname
router.put('/:collarId/nickname', authenticateToken, (req, res) => {
  try {
    const { collarId } = req.params;
    const { nickname } = req.body;
    const farmerToken = req.user.token;

    // Check if user is a developer (developers can update any cow)
    const isDeveloper = db.prepare('SELECT developer_token FROM dbt10 WHERE developer_token = ?').get(farmerToken);

    // Try updating in dbt4 (assigned real cows)
    let stmt = db.prepare(`
      UPDATE dbt4
      SET cow_nickname = ?
      WHERE collar_id = ? ${!isDeveloper ? 'AND farmer_token = ?' : ''}
    `);
    let result = isDeveloper ? stmt.run(nickname || null, collarId) : stmt.run(nickname || null, collarId, farmerToken);

    if (result.changes > 0) {
      console.log(`[Nickname] Updated dbt4 cow: ${collarId} with nickname: ${nickname}`);
      return res.json({ success: true, message: 'Cow nickname updated successfully' });
    }

    // Try updating in dbt5 (new ESP32 connected cows)
    stmt = db.prepare(`
      UPDATE dbt5
      SET cow_nickname = ?
      WHERE collar_id = ?
    `);
    result = stmt.run(nickname || null, collarId);

    if (result.changes > 0) {
      console.log(`[Nickname] Updated dbt5 cow: ${collarId} with nickname: ${nickname}`);
      return res.json({ success: true, message: 'Cow nickname updated successfully' });
    }

    // Try updating in dbt6 (virtual cows for development)
    stmt = db.prepare(`
      UPDATE dbt6
      SET cow_nickname = ?
      WHERE collar_id = ? ${!isDeveloper ? 'AND farmer_token = ?' : ''}
    `);
    result = isDeveloper ? stmt.run(nickname || null, collarId) : stmt.run(nickname || null, collarId, farmerToken);

    if (result.changes > 0) {
      console.log(`[Nickname] Updated dbt6 virtual cow: ${collarId} with nickname: ${nickname}`);
      return res.json({ success: true, message: 'Cow nickname updated successfully' });
    }

    // Cow not found in any table
    console.log(`[Nickname] Cow not found with collar_id: ${collarId}`);
    res.status(404).json({ error: 'Cow not found' });
  } catch (error) {
    console.error('Update cow nickname error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete cow - with dynamic cow name redistribution
router.delete('/:collarId', authenticateToken, (req, res) => {
  try {
    const { collarId } = req.params;
    const farmerToken = req.user.token;

    // Delete cow
    const stmt = db.prepare('DELETE FROM dbt4 WHERE collar_id = ? AND farmer_token = ?');
    const result = stmt.run(collarId, farmerToken);

    if (result.changes > 0) {
      // Decrement total_cow counter
      const updateStmt = db.prepare('UPDATE dbt1 SET total_cow = total_cow - 1 WHERE farmer_token = ?');
      updateStmt.run(farmerToken);

      // Decrement developer's total_cows counter (sum of dbt4 + dbt6)
      const farmer = db.prepare('SELECT developer_token FROM dbt1 WHERE farmer_token = ?').get(farmerToken);
      if (farmer && farmer.developer_token) {
        db.prepare('UPDATE dbt10 SET total_cows = total_cows - 1 WHERE developer_token = ?')
          .run(farmer.developer_token);
        console.log(`[Delete] Decremented developer total_cows for: ${farmer.developer_token}`);
      }

      // Redistribute cow names dynamically
      // Get all remaining cows for this farmer, ordered by id
      const getCowsStmt = db.prepare('SELECT id, collar_id FROM dbt4 WHERE farmer_token = ? ORDER BY id ASC');
      const remainingCows = getCowsStmt.all(farmerToken);

      // Update cow names sequentially from cow1
      const updateNameStmt = db.prepare('UPDATE dbt4 SET cow_name = ? WHERE id = ?');
      remainingCows.forEach((cow, index) => {
        const newCowName = `cow${index + 1}`;
        updateNameStmt.run(newCowName, cow.id);
      });

      res.json({ success: true, message: 'Cow deleted and names redistributed successfully' });
    } else {
      res.status(404).json({ error: 'Cow not found' });
    }
  } catch (error) {
    console.error('Delete cow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ESP32 data submission endpoint
router.post('/esp32/data', async (req, res) => {
  try {
    const { cowToken, state, timeSpent, alarmState } = req.body;

    if (!cowToken) {
      return res.status(400).json({ error: 'Cow token is required' });
    }

    // Update cow state and time tracking
    if (state) {
      const updateStateStmt = db.prepare('UPDATE dbt4 SET state_fence = ? WHERE cow_token = ?');
      updateStateStmt.run(state, cowToken);
    }

    // Update time spent inside/outside (time in seconds)
    if (timeSpent !== undefined && state) {
      if (state === 'inside') {
        const updateTimeStmt = db.prepare('UPDATE dbt4 SET time_inside = time_inside + ? WHERE cow_token = ?');
        updateTimeStmt.run(timeSpent, cowToken);
      } else if (state === 'outside') {
        const updateTimeStmt = db.prepare('UPDATE dbt4 SET time_outside = time_outside + ? WHERE cow_token = ?');
        updateTimeStmt.run(timeSpent, cowToken);
      }
    }

    // Handle alarm breach
    if (alarmState && alarmState !== 'normal') {
      // Increment alarm breach counter
      const updateAlarmStmt = db.prepare('UPDATE dbt4 SET total_breach = total_breach + 1 WHERE cow_token = ?');
      updateAlarmStmt.run(cowToken);

      // Get cow details for email
      const cowStmt = db.prepare('SELECT cow_name, cow_nickname, collar_id FROM dbt4 WHERE cow_token = ?');
      const cow = cowStmt.get(cowToken);

      // Use nickname if available, otherwise cow name
      const displayName = cow?.cow_nickname || cow?.cow_name || `Collar ${cow?.collar_id || cowToken}`;

      // Send alert email
      await gmailService.sendAlert(
        process.env.GMAIL_RECEIVER || 'jeanclaudemng@gmail.com',
        'SafeZone Alert',
        `${displayName} (${cow?.collar_id}) has triggered alarm: ${alarmState}`
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('ESP32 data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test email endpoint
router.post('/test-email', authenticateToken, async (req, res) => {
  try {
    const { receiver } = req.body;
    const testReceiver = receiver || process.env.GMAIL_RECEIVER || 'jeanclaudemng@gmail.com';

    const result = await gmailService.sendAlert(
      testReceiver,
      'Test Email from SafeZone',
      'This is a test email to verify Gmail integration is working correctly. If you receive this message, the email system is functioning properly!'
    );

    if (result.success) {
      res.json({ success: true, message: 'Test email sent successfully!', messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, error: 'Failed to send test email' });
  }
});

// Get new cows (cows without farm assignment)
router.get('/new', authenticateToken, (req, res) => {
  try {
    const farmerToken = req.user.token;

    // Get unassigned cows from dbt4
    const stmt4 = db.prepare(`
      SELECT cow_name, cow_nickname, collar_id, cow_token, collar_state, registered_at, connected_at, last_seen, timestamp
      FROM dbt4
      WHERE farmer_token = ? AND (farm_token IS NULL OR farm_token = '')
      ORDER BY timestamp ASC
    `);
    const dbt4Cows = stmt4.all(farmerToken);

    // Get all new ESP32 cows from dbt5 (these have no farmer_token yet)
    const stmt5 = db.prepare(`
      SELECT cow_name, cow_nickname, collar_id, cow_token, collar_state, timestamp
      FROM dbt5
      ORDER BY timestamp ASC
    `);
    const dbt5Cows = stmt5.all();

    // Combine both lists
    const newCows = [...dbt4Cows, ...dbt5Cows];

    res.json({ newCows });
  } catch (error) {
    console.error('Get new cows error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign cow to farm
router.put('/:cowToken/assign-farm', authenticateToken, (req, res) => {
  try {
    const { cowToken } = req.params;
    const { farmToken } = req.body;
    const farmerToken = req.user.token;

    // Verify the farm belongs to this farmer (if farmToken provided)
    if (farmToken) {
      const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
      const farm = farmStmt.get(farmToken, farmerToken);

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found' });
      }
    }

    // Check if cow exists in dbt5 (new ESP32 connected cows)
    const dbt5Cow = db.prepare('SELECT * FROM dbt5 WHERE cow_token = ?').get(cowToken);

    if (dbt5Cow) {
      // Cow is in dbt5 - move it to dbt4 with farm assignment
      console.log('[Assign] Moving cow from dbt5 to dbt4:', dbt5Cow.cow_name);

      // Insert into dbt4
      // Initialize alarm_triggered columns to 0 for new assigned cows (null = unassigned, 0 = ready, 1 = triggered)
      const insertStmt = db.prepare(`
        INSERT INTO dbt4 (
          cow_name, cow_nickname, collar_id, cow_token, farmer_token, farm_token,
          state_fence, time_inside, time_outside, total_breach, timestamp,
          alarm1_triggered, alarm2_triggered, alarm3_triggered, assigned_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'outside', 0, 0, 0, ?, 0, 0, 0, ?)
      `);
      insertStmt.run(
        dbt5Cow.cow_name,
        dbt5Cow.cow_nickname,
        dbt5Cow.collar_id,
        dbt5Cow.cow_token,
        farmerToken,
        farmToken || null,
        now(),
        now()
      );

      // Delete from dbt5
      const deleteStmt = db.prepare('DELETE FROM dbt5 WHERE cow_token = ?');
      deleteStmt.run(cowToken);

      // Increment farmer's total_cow counter
      const updateFarmerStmt = db.prepare('UPDATE dbt1 SET total_cow = total_cow + 1 WHERE farmer_token = ?');
      updateFarmerStmt.run(farmerToken);

      // Increment developer's total_cows counter (sum of dbt4 + dbt6)
      const farmer = db.prepare('SELECT developer_token FROM dbt1 WHERE farmer_token = ?').get(farmerToken);
      if (farmer && farmer.developer_token) {
        db.prepare('UPDATE dbt10 SET total_cows = total_cows + 1 WHERE developer_token = ?')
          .run(farmer.developer_token);
        console.log(`[Assign] Incremented developer total_cows for: ${farmer.developer_token}`);
      }

      return res.json({ success: true, message: 'Cow moved from dbt5 to dbt4 and assigned successfully' });
    }

    // If not in dbt5, check if it's in dbt4 and update
    // Check if user is a developer (developers can assign any cow, farmers can only assign their own)
    const isDeveloper = db.prepare('SELECT developer_token FROM dbt10 WHERE developer_token = ?').get(farmerToken);

    let dbt4Cow;
    if (isDeveloper) {
      // Developer: can assign any cow
      dbt4Cow = db.prepare('SELECT * FROM dbt4 WHERE cow_token = ?').get(cowToken);
    } else {
      // Farmer: can only assign their own cows
      dbt4Cow = db.prepare('SELECT * FROM dbt4 WHERE cow_token = ? AND farmer_token = ?').get(cowToken, farmerToken);
    }

    if (dbt4Cow) {
      // Update cow's farm assignment in dbt4
      const updateStmt = db.prepare(`
        UPDATE dbt4
        SET farm_token = ?, assigned_at = ?
        WHERE cow_token = ?
      `);
      updateStmt.run(farmToken || null, now(), cowToken);

      console.log(`[Assign] ${isDeveloper ? 'Developer' : 'Farmer'} assigned cow from dbt4: ${dbt4Cow.cow_name} to farm: ${farmToken}`);

      // Clean up any duplicate entry in dbt5 with the same collar_id
      const cleanupStmt = db.prepare('DELETE FROM dbt5 WHERE collar_id = ?');
      const cleanupResult = cleanupStmt.run(dbt4Cow.collar_id);

      if (cleanupResult.changes > 0) {
        console.log(`[Cleanup] Removed duplicate from dbt5 for collar_id: ${dbt4Cow.collar_id}`);
      }

      return res.json({ success: true, message: 'Cow farm assignment updated successfully' });
    }

    // Check if cow exists in dbt6 (virtual cows for development)
    const dbt6Cow = db.prepare('SELECT * FROM dbt6 WHERE cow_token = ?').get(cowToken);

    if (dbt6Cow) {
      // Update virtual cow's farm assignment in dbt6
      console.log('[Assign] Assigning virtual cow from dbt6:', dbt6Cow.cow_name, 'to farm:', farmToken);

      // Check if user is a developer (developer tokens are in dbt10, not dbt1)
      const isDeveloper = db.prepare('SELECT developer_token FROM dbt10 WHERE developer_token = ?').get(farmerToken);

      const updateStmt = db.prepare(`
        UPDATE dbt6
        SET farm_token = ?, assigned_at = ?${!isDeveloper ? ', farmer_token = ?' : ''}
        WHERE cow_token = ?
      `);

      // Only set farmer_token if user is an actual farmer (not a developer)
      if (isDeveloper) {
        // Developer: update farm_token and assigned_at
        updateStmt.run(farmToken || null, farmToken ? now() : null, cowToken);
        console.log('[Assign] Developer account - farm_token and assigned_at updated, farmer_token left unchanged');
      } else {
        // Farmer: update farm_token, assigned_at, and farmer_token
        updateStmt.run(farmToken || null, farmToken ? now() : null, farmerToken, cowToken);
        console.log('[Assign] Farmer account - farm_token, assigned_at, and farmer_token updated');
      }

      return res.json({ success: true, message: 'Virtual cow farm assignment updated successfully' });
    }

    // Cow not found in any table
    res.status(404).json({ error: 'Cow not found' });
  } catch (error) {
    console.error('Assign cow to farm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk assign cows to farm
router.post('/bulk-assign', authenticateToken, (req, res) => {
  try {
    const { cowTokens, farmToken } = req.body;
    const farmerToken = req.user.token;

    if (!Array.isArray(cowTokens) || cowTokens.length === 0) {
      return res.status(400).json({ error: 'cowTokens must be a non-empty array' });
    }

    // Verify the farm belongs to this farmer
    if (farmToken) {
      const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
      const farm = farmStmt.get(farmToken, farmerToken);

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found' });
      }
    }

    // Update all cows' farm assignments
    const stmt = db.prepare(`
      UPDATE dbt4
      SET farm_token = ?
      WHERE cow_token = ? AND farmer_token = ?
    `);

    const updateMany = db.transaction((cows) => {
      for (const cowToken of cows) {
        stmt.run(farmToken || null, cowToken, farmerToken);
      }
    });

    updateMany(cowTokens);

    res.json({ success: true, message: `${cowTokens.length} cows assigned successfully` });
  } catch (error) {
    console.error('Bulk assign cows error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cow name
router.put('/:cowToken/name', authenticateToken, (req, res) => {
  try {
    const { cowToken } = req.params;
    const { name } = req.body;
    const farmerToken = req.user.token;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const stmt = db.prepare(`
      UPDATE dbt4
      SET cow_name = ?
      WHERE cow_token = ? AND farmer_token = ?
    `);
    const result = stmt.run(name.trim(), cowToken, farmerToken);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Cow name updated successfully' });
    } else {
      res.status(404).json({ error: 'Cow not found' });
    }
  } catch (error) {
    console.error('Update cow name error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
