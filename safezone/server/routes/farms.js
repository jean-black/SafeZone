const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { authenticateToken, generateToken, calculatePolygonArea } = require('../middleware/auth');
const { now } = require('../utils/dateFormatter');

// Get all farms
router.get('/', authenticateToken, (req, res) => {
  try {
    const farmerToken = req.user.token;

    const stmt = db.prepare("SELECT farm_name, farm_gps, farm_token, timestamp FROM dbt2 WHERE user_token = ? AND farm_name IS NOT NULL AND farm_name != ''");
    const farms = stmt.all(farmerToken);

    res.json({ farms });
  } catch (error) {
    console.error('Farms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new farm
router.post('/', authenticateToken, (req, res) => {
  try {
    let { farmName, gps, allowRename } = req.body;
    const farmerToken = req.user.token;
    const farmToken = generateToken();

    // If no farm name provided, generate default name
    if (!farmName || farmName.trim() === '') {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE user_token = ?');
      const countResult = countStmt.get(farmerToken);
      const farmNumber = (countResult.count || 0) + 1;
      farmName = `farm${farmNumber}`;
    }

    // Check for duplicate farm name
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND user_token = ?');
    const result = checkStmt.get(farmName, farmerToken);

    if (result.count > 0) {
      // Farm name exists
      // If allowRename is not explicitly set to true, return error with suggested name
      if (!allowRename) {
        // Calculate suggested name
        let counter = 1;
        let suggestedName;
        do {
          suggestedName = `${farmName}${counter.toString().padStart(2, '0')}`;
          const checkNew = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND user_token = ?');
          const newResult = checkNew.get(suggestedName, farmerToken);
          if (newResult.count === 0) {
            break;
          }
          counter++;
        } while (counter < 100);

        return res.status(409).json({
          error: 'Farm name already exists',
          duplicate: true,
          originalName: farmName,
          suggestedName: suggestedName
        });
      }

      // If allowRename is true, append a 2-digit number
      let counter = 1;
      let newFarmName;
      do {
        newFarmName = `${farmName}${counter.toString().padStart(2, '0')}`;
        const checkNew = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND user_token = ?');
        const newResult = checkNew.get(newFarmName, farmerToken);
        if (newResult.count === 0) {
          farmName = newFarmName;
          break;
        }
        counter++;
      } while (counter < 100);
    }

    // Get developer_token
    const userType = req.user.userType || 'farmer';
    let developerToken = null;

    if (userType === 'developer') {
      developerToken = farmerToken; // Developer's own token

      // CRITICAL: Ensure developer has a corresponding farmer record in dbt1
      // This is required for FOREIGN KEY constraint (user_token → dbt1)
      const farmerCheck = db.prepare('SELECT user_token FROM dbt1 WHERE user_token = ?').get(farmerToken);
      if (!farmerCheck) {
        // Create a dummy farmer record for the developer
        const developer = db.prepare('SELECT developer_name FROM dbt10 WHERE user_token = ?').get(farmerToken);
        const developerName = developer ? developer.developer_name : 'Unknown Developer';

        db.prepare(`
          INSERT INTO dbt1 (farmer_name, user_id, user_token, password, timestamp, developer_token, connection_state, user_account_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${developerName} (Developer Account)`,
          `dev_${farmerToken}`,
          farmerToken,
          'DEVELOPER_ACCOUNT',
          now(),
          farmerToken,
          'disconnected',
          'developer'
        );
        console.log(`[Farm Creation] Created dummy farmer record for developer: ${farmerToken}`);
      }
    } else {
      // Get developer_token from the farmer
      const farmer = db.prepare('SELECT developer_token FROM dbt1 WHERE user_token = ?').get(farmerToken);
      developerToken = farmer ? farmer.developer_token : null;
    }

    // Insert farm with all columns including ph (placeholder), counts, and is_used
    const stmt = db.prepare(`
      INSERT INTO dbt2 (
        farm_name, farm_token, user_token, farm_gps, timestamp,
        ph, total_number_of_cow, total_number_of_fence, is_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(farmName, farmToken, farmerToken, gps, now(), developerToken, 0, 0, 0);

    // Increment total_farms counter for the user (farmer or developer)
    if (userType === 'developer') {
      const updateStmt = db.prepare('UPDATE dbt10 SET total_farms = total_farms + 1 WHERE user_token = ?');
      updateStmt.run(farmerToken);
    } else {
      const updateStmt = db.prepare('UPDATE dbt1 SET total_farms = total_farms + 1 WHERE user_token = ?');
      updateStmt.run(farmerToken);
    }

    res.json({ success: true, farm_id: farmName, farm_token: farmToken });
  } catch (error) {
    console.error('Create farm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update farm GPS
router.put('/:farmName', authenticateToken, (req, res) => {
  try {
    const { farmName } = req.params;
    const { gps } = req.body;
    const farmerToken = req.user.token;

    // Update the farm GPS coordinates
    const stmt = db.prepare('UPDATE dbt2 SET farm_gps = ? WHERE farm_name = ? AND user_token = ?');
    const result = stmt.run(gps, farmName, farmerToken);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Farm GPS updated successfully' });
    } else {
      res.status(404).json({ error: 'Farm not found' });
    }
  } catch (error) {
    console.error('Update farm GPS error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all fences
router.get('/fences', authenticateToken, (req, res) => {
  try {
    const userToken = req.user.token;
    const userType = req.user.userType || 'farmer';

    // AUTOMATIC FIX: Ensure farms with only one fence have it marked as is_used = 1
    try {
      db.prepare(`
        UPDATE dbt3
        SET is_used = 1
        WHERE farm_token IN (
          SELECT farm_token
          FROM dbt3
          WHERE farm_token IS NOT NULL
          GROUP BY farm_token
          HAVING COUNT(*) = 1
        )
        AND is_used = 0
      `).run();
    } catch (err) {
      console.error('[Fence Auto-fix 1] Error:', err.message);
    }

    // AUTOMATIC FIX: Ensure all fences have ph (placeholder - copy from farm if missing)
    // NOTE: ph is a placeholder column, no longer used for authentication
    try {
      db.prepare(`
        UPDATE dbt3
        SET ph = (
          SELECT dbt2.ph
          FROM dbt2
          WHERE dbt2.farm_token = dbt3.farm_token
        )
        WHERE ph IS NULL AND farm_token IS NOT NULL
      `).run();
    } catch (err) {
      console.error('[Fence Auto-fix 2] Error:', err.message);
    }

    // Get fences for the user
    // IMPORTANT: Both farmers and developers use user_token column (column 3)
    // Developers have a farmer record created with their developer_token as user_token
    const stmt = db.prepare(`
      SELECT fence_name, fence_coordinate, fence_token, farm_token, timestamp, is_used
      FROM dbt3
      WHERE user_token = ?
    `);
    const fences = stmt.all(userToken);
    console.log(`[GET Fences] User ${userToken} (${userType}) has ${fences.length} fences`);

    // Parse fence coordinates and calculate area
    const fencesWithArea = fences.map(fence => {
      let nodes = [];
      let area = 0;

      if (fence.fence_coordinate) {
        try {
          nodes = JSON.parse(fence.fence_coordinate);
          area = calculatePolygonArea(nodes);
        } catch (e) {
          console.error('Error parsing fence coordinates:', e);
        }
      }

      return {
        fence_id: fence.fence_name,
        farm_token: fence.farm_token,
        fence_nodes: fence.fence_coordinate,
        area_size: area,
        fence_token: fence.fence_token,
        timestamp: fence.timestamp,
        is_used: fence.is_used || 0  // IMPORTANT: Include active state
      };
    });

    res.json({ fences: fencesWithArea });
  } catch (error) {
    console.error('Fences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Select/activate a fence for a farm (mark as is_used = 1)
// IMPORTANT: This route must come BEFORE /fences to ensure proper matching
router.post('/fences/select', authenticateToken, (req, res) => {
  try {
    const { fenceToken, farmToken } = req.body;
    const userToken = req.user.token;
    const userType = req.user.userType || 'farmer';

    if (!fenceToken) {
      return res.status(400).json({ error: 'Fence token is required' });
    }

    console.log(`[Fence Selection] User: ${userToken} (${userType}), Fence: ${fenceToken}, Farm: ${farmToken || 'none'}`);

    // Verify the fence belongs to this user
    // IMPORTANT: Both farmers and developers use user_token column (column 3)
    // Developers have a farmer record created with their developer_token as user_token
    const fence = db.prepare('SELECT * FROM dbt3 WHERE fence_token = ? AND user_token = ?').get(fenceToken, userToken);

    if (!fence) {
      console.error(`[Fence Selection] Fence not found. Token: ${fenceToken}, User: ${userToken}`);
      return res.status(404).json({ error: 'Fence not found or you do not have permission' });
    }

    // If fence is being assigned to a farm
    if (farmToken) {
      // Step 1: Set all fences for this farm to is_used = 0
      db.prepare('UPDATE dbt3 SET is_used = 0 WHERE farm_token = ?').run(farmToken);
      console.log(`[Fence Selection] Deactivated all fences for farm: ${farmToken}`);

      // Step 2: Update the selected fence to is_used = 1 and assign it to the farm
      db.prepare('UPDATE dbt3 SET is_used = 1, farm_token = ? WHERE fence_token = ?')
        .run(farmToken, fenceToken);
      console.log(`[Fence Selection] Activated fence ${fenceToken} for farm ${farmToken}`);
    } else {
      // Just activate the fence without assigning to a farm
      db.prepare('UPDATE dbt3 SET is_used = 1 WHERE fence_token = ?')
        .run(fenceToken);
      console.log(`[Fence Selection] Activated fence ${fenceToken} (no farm assignment)`);
    }

    res.json({ success: true, message: 'Fence activated successfully' });
  } catch (error) {
    console.error('Select fence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new fence
router.post('/fences', authenticateToken, (req, res) => {
  try {
    let { fenceName, nodes, farmToken } = req.body;
    const userToken = req.user.token;
    const userType = req.user.userType || 'farmer';

    console.log('Creating fence:', { fenceName, nodeCount: nodes?.length, farmToken, userToken, userType });

    // Validate inputs - only nodes are required
    if (!nodes || nodes.length < 3) {
      console.error('Invalid fence data:', { fenceName, nodeCount: nodes?.length });
      return res.status(400).json({ error: 'Invalid fence data. Need at least 3 nodes.' });
    }

    // CRITICAL FIX: Get the actual user_token (owner) of the farm
    // user_token MUST exist in dbt1 (FOREIGN KEY constraint)
    let farmerToken;
    let developerToken = null;

    if (farmToken) {
      // Get the farm to find its actual owner (user_token)
      const farm = db.prepare('SELECT user_token, ph FROM dbt2 WHERE farm_token = ?').get(farmToken);

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found' });
      }

      // Use the farm's actual user_token (owner), NOT the current user's token
      farmerToken = farm.user_token;
      developerToken = farm.ph;

      console.log(`[Fence] Farm owner (user_token): ${farmerToken}, Developer: ${developerToken}`);
    } else {
      // No farmToken provided - fence without farm assignment
      if (userType === 'developer') {
        return res.status(400).json({ error: 'Developers must assign fences to a farm' });
      }

      farmerToken = userToken; // Farmer creating fence without farm

      // Get developer_token from the farmer
      const farmer = db.prepare('SELECT developer_token FROM dbt1 WHERE user_token = ?').get(farmerToken);
      developerToken = farmer ? farmer.developer_token : null;
    }

    // If no fence name provided, generate default name
    if (!fenceName || fenceName.trim() === '') {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM dbt3 WHERE user_token = ?');
      const countResult = countStmt.get(farmerToken);
      const fenceNumber = (countResult.count || 0) + 1;
      fenceName = `fence${fenceNumber}`;
    }

    const area = calculatePolygonArea(nodes);

    // Generate fence token
    const fenceToken = generateToken();

    // IMPORTANT: When creating a new fence for a farm, set old fences to is_used = 0
    if (farmToken) {
      db.prepare('UPDATE dbt3 SET is_used = 0 WHERE farm_token = ?').run(farmToken);
      console.log(`[Fence] Set old fences to is_used = 0 for farm: ${farmToken}`);
    }

    // Insert fence into dbt3 with farm_token, ph (placeholder), and is_used = 1 (new fence is active)
    const stmt = db.prepare(`
      INSERT INTO dbt3 (fence_name, fence_token, user_token, fence_coordinate, area_size, farm_token, ph, timestamp, is_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Determine is_used value: if fence has a farm_token, it should be is_used = 1
    const isUsed = farmToken ? 1 : 0;

    const result = stmt.run(fenceName, fenceToken, farmerToken, JSON.stringify(nodes), area, farmToken || null, developerToken, now(), isUsed);

    console.log('Fence created successfully:', { fence_id: fenceName, area_size: area, fence_token: fenceToken, farm_token: farmToken, is_used: isUsed });

    // Update dbt2 farm's total_number_of_fence if fence is assigned to a farm
    if (farmToken) {
      db.prepare('UPDATE dbt2 SET total_number_of_fence = total_number_of_fence + 1 WHERE farm_token = ?')
        .run(farmToken);
      console.log(`[Fence] Incremented dbt2 total_number_of_fence for farm: ${farmToken}`);
    }

    // AUTOMATIC FIX: If a farm has only one fence, ensure it's marked as is_used = 1
    // This handles cases where fences were created without farmToken or with old buggy code
    db.exec(`
      UPDATE dbt3
      SET is_used = 1
      WHERE farm_token IN (
        SELECT farm_token
        FROM dbt3
        WHERE farm_token IS NOT NULL
        GROUP BY farm_token
        HAVING COUNT(*) = 1
      )
      AND is_used = 0
    `);
    console.log(`[Fence] Auto-fixed: Set is_used = 1 for farms with only one fence`);

    res.json({ success: true, fence_id: fenceName, area_size: area, fence_token: fenceToken });
  } catch (error) {
    console.error('Create fence error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Update farm name
router.put('/:farmToken/name', authenticateToken, (req, res) => {
  try {
    const { farmToken } = req.params;
    const { name } = req.body;
    const farmerToken = req.user.token;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const stmt = db.prepare(`
      UPDATE dbt2
      SET farm_name = ?
      WHERE farm_token = ? AND user_token = ?
    `);
    const result = stmt.run(name.trim(), farmToken, farmerToken);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Farm name updated successfully' });
    } else {
      res.status(404).json({ error: 'Farm not found' });
    }
  } catch (error) {
    console.error('Update farm name error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete farm with cow transfer handling
router.delete('/:farmToken', authenticateToken, (req, res) => {
  try {
    const { farmToken } = req.params;
    const { transferToFarmToken } = req.body;
    const farmerToken = req.user.token;

    // Check if farm exists
    const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND user_token = ?');
    const farm = farmStmt.get(farmToken, farmerToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // If transferToFarmToken is provided, verify it exists
    if (transferToFarmToken) {
      const targetFarmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND user_token = ?');
      const targetFarm = targetFarmStmt.get(transferToFarmToken, farmerToken);

      if (!targetFarm) {
        return res.status(404).json({ error: 'Target farm not found' });
      }

      // Transfer cows to the target farm
      const transferStmt = db.prepare('UPDATE dbt4 SET farm_token = ? WHERE farm_token = ? AND user_token = ?');
      transferStmt.run(transferToFarmToken, farmToken, farmerToken);
    } else {
      // Set cows' farm_token to NULL (they become "new cows")
      const unassignStmt = db.prepare('UPDATE dbt4 SET farm_token = NULL WHERE farm_token = ? AND user_token = ?');
      unassignStmt.run(farmToken, farmerToken);
    }

    // Delete the farm
    const deleteStmt = db.prepare('DELETE FROM dbt2 WHERE farm_token = ? AND user_token = ?');
    deleteStmt.run(farmToken, farmerToken);

    // Decrement total_farms counter for the user (farmer or developer)
    const userType = req.user.userType || 'farmer';
    if (userType === 'developer') {
      const updateStmt = db.prepare('UPDATE dbt10 SET total_farms = total_farms - 1 WHERE user_token = ?');
      updateStmt.run(farmerToken);
    } else {
      const updateStmt = db.prepare('UPDATE dbt1 SET total_farms = total_farms - 1 WHERE user_token = ?');
      updateStmt.run(farmerToken);
    }

    res.json({
      success: true,
      message: 'Farm deleted successfully',
      cowsTransferred: transferToFarmToken ? true : false
    });
  } catch (error) {
    console.error('Delete farm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update fence name
router.put('/fences/:fenceToken/name', authenticateToken, (req, res) => {
  try {
    const { fenceToken } = req.params;
    const { name } = req.body;
    const farmerToken = req.user.token;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const stmt = db.prepare(`
      UPDATE dbt3
      SET fence_name = ?
      WHERE fence_token = ? AND user_token = ?
    `);
    const result = stmt.run(name.trim(), fenceToken, farmerToken);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Fence name updated successfully' });
    } else {
      res.status(404).json({ error: 'Fence not found' });
    }
  } catch (error) {
    console.error('Update fence name error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete fence
router.delete('/fences/:fenceToken', authenticateToken, (req, res) => {
  try {
    const { fenceToken } = req.params;
    const farmerToken = req.user.token;

    // Get fence details before deleting to update farm counters
    const fence = db.prepare('SELECT farm_token FROM dbt3 WHERE fence_token = ? AND user_token = ?').get(fenceToken, farmerToken);

    const stmt = db.prepare('DELETE FROM dbt3 WHERE fence_token = ? AND user_token = ?');
    const result = stmt.run(fenceToken, farmerToken);

    if (result.changes > 0) {
      // Update dbt2 farm's total_number_of_fence if fence was assigned to a farm
      if (fence && fence.farm_token) {
        db.prepare('UPDATE dbt2 SET total_number_of_fence = total_number_of_fence - 1 WHERE farm_token = ?')
          .run(fence.farm_token);
        console.log(`[Fence] Decremented dbt2 total_number_of_fence for farm: ${fence.farm_token}`);
      }

      res.json({ success: true, message: 'Fence deleted successfully' });
    } else {
      res.status(404).json({ error: 'Fence not found' });
    }
  } catch (error) {
    console.error('Delete fence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update farm selection (is_used) for page19/page6
router.post('/select', authenticateToken, (req, res) => {
  try {
    const { farmToken, selectAll } = req.body; // farmToken or selectAll: true
    const userToken = req.user.token;
    const userType = req.user.userType || 'farmer';

    console.log(`[Farm Selection] User: ${userToken}, Farm: ${farmToken || 'ALL'}, SelectAll: ${selectAll}`);

    // First, reset is_used = 0 for all farms OWNED by this user (user_token matches)
    // Note: developer_token indicates who manages the farm, but user_token indicates who OWNS it
    db.prepare('UPDATE dbt2 SET is_used = 0 WHERE user_token = ?').run(userToken);

    // Then, set is_used = 1 for selected farm(s)
    if (selectAll) {
      // User selected "all farms" option - mark ALL their OWNED farms as is_used = 1
      db.prepare('UPDATE dbt2 SET is_used = 1 WHERE user_token = ?').run(userToken);
      console.log(`[Farm Selection] Marked ALL farms as selected for user: ${userToken}`);
    } else if (farmToken) {
      // User selected a specific farm - mark only that farm as is_used = 1
      db.prepare('UPDATE dbt2 SET is_used = 1 WHERE farm_token = ? AND user_token = ?')
        .run(farmToken, userToken);
      console.log(`[Farm Selection] Marked farm ${farmToken} as selected for user: ${userToken}`);
    }

    res.json({ success: true, message: 'Farm selection updated successfully' });
  } catch (error) {
    console.error('Update farm selection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download farm report
router.get('/:farmToken/download', authenticateToken, (req, res) => {
  try {
    const { farmToken } = req.params;
    const farmerToken = req.user.token;

    // Get farm details
    const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND user_token = ?');
    const farm = farmStmt.get(farmToken, farmerToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // Get cows in this farm
    const cowsStmt = db.prepare(`
      SELECT cow_name, cow_nickname, collar_id, state_fence, time_inside, time_outside, total_breach
      FROM dbt4
      WHERE farm_token = ? AND user_token = ?
      ORDER BY cow_name ASC
    `);
    const cows = cowsStmt.all(farmToken, farmerToken);

    // Get fences (all farmer's fences)
    const fencesStmt = db.prepare(`
      SELECT fence_name, fence_coordinate
      FROM dbt3
      WHERE user_token = ?
      ORDER BY fence_name ASC
    `);
    const fences = fencesStmt.all(farmerToken);

    // Create report data
    const report = {
      farm: {
        name: farm.farm_name,
        gps: farm.farm_gps,
        createdAt: farm.timestamp
      },
      cows: cows.map(cow => ({
        name: cow.cow_name,
        nickname: cow.cow_nickname,
        collarId: cow.collar_id,
        state: cow.state_fence,
        timeInside: cow.time_inside,
        timeOutside: cow.time_outside,
        breaches: cow.total_breach
      })),
      fences: fences.map(fence => ({
        name: fence.fence_name,
        coordinates: fence.fence_coordinate
      })),
      totalCows: cows.length,
      cowsInside: cows.filter(c => c.state_fence === 'inside').length,
      cowsOutside: cows.filter(c => c.state_fence === 'outside').length,
      generatedAt: now()
    };

    res.json(report);
  } catch (error) {
    console.error('Download farm report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
