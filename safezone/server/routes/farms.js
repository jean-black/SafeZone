const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { authenticateToken, generateToken, calculatePolygonArea } = require('../middleware/auth');
const { now } = require('../utils/dateFormatter');

// Get all farms
router.get('/', authenticateToken, (req, res) => {
  try {
    const farmerToken = req.user.token;

    const stmt = db.prepare("SELECT farm_name, farm_gps, farm_token, timestamp FROM dbt2 WHERE farmer_token = ? AND farm_name IS NOT NULL AND farm_name != ''");
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
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farmer_token = ?');
      const countResult = countStmt.get(farmerToken);
      const farmNumber = (countResult.count || 0) + 1;
      farmName = `farm${farmNumber}`;
    }

    // Check for duplicate farm name
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND farmer_token = ?');
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
          const checkNew = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND farmer_token = ?');
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
        const checkNew = db.prepare('SELECT COUNT(*) as count FROM dbt2 WHERE farm_name = ? AND farmer_token = ?');
        const newResult = checkNew.get(newFarmName, farmerToken);
        if (newResult.count === 0) {
          farmName = newFarmName;
          break;
        }
        counter++;
      } while (counter < 100);
    }

    const stmt = db.prepare('INSERT INTO dbt2 (farm_name, farm_token, farmer_token, farm_gps, timestamp) VALUES (?, ?, ?, ?, ?)');
    stmt.run(farmName, farmToken, farmerToken, gps, now());

    // Increment total_farms counter for the user (farmer or developer)
    const userType = req.user.userType || 'farmer';
    if (userType === 'developer') {
      const updateStmt = db.prepare('UPDATE dbt10 SET total_farms = total_farms + 1 WHERE developer_token = ?');
      updateStmt.run(farmerToken);
    } else {
      const updateStmt = db.prepare('UPDATE dbt1 SET total_farms = total_farms + 1 WHERE farmer_token = ?');
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
    const stmt = db.prepare('UPDATE dbt2 SET farm_gps = ? WHERE farm_name = ? AND farmer_token = ?');
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
    const farmerToken = req.user.token;

    const stmt = db.prepare(`
      SELECT fence_name, fence_coordinate, fence_token, farm_token, timestamp
      FROM dbt3
      WHERE farmer_token = ?
    `);
    const fences = stmt.all(farmerToken);

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
        timestamp: fence.timestamp
      };
    });

    res.json({ fences: fencesWithArea });
  } catch (error) {
    console.error('Fences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new fence
router.post('/fences', authenticateToken, (req, res) => {
  try {
    let { fenceName, nodes, farmToken } = req.body;
    const farmerToken = req.user.token;

    console.log('Creating fence:', { fenceName, nodeCount: nodes?.length, farmToken, farmerToken });

    // Validate inputs - only nodes are required
    if (!nodes || nodes.length < 3) {
      console.error('Invalid fence data:', { fenceName, nodeCount: nodes?.length });
      return res.status(400).json({ error: 'Invalid fence data. Need at least 3 nodes.' });
    }

    // If no fence name provided, generate default name
    if (!fenceName || fenceName.trim() === '') {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM dbt3 WHERE farmer_token = ?');
      const countResult = countStmt.get(farmerToken);
      const fenceNumber = (countResult.count || 0) + 1;
      fenceName = `fence${fenceNumber}`;
    }

    const area = calculatePolygonArea(nodes);

    // Generate fence token
    const fenceToken = generateToken();

    // Insert fence into dbt3 with farm_token
    const stmt = db.prepare(`
      INSERT INTO dbt3 (fence_name, fence_token, farmer_token, fence_coordinate, area_size, farm_token, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(fenceName, fenceToken, farmerToken, JSON.stringify(nodes), area, farmToken || null, now());

    console.log('Fence created successfully:', { fence_id: fenceName, area_size: area, fence_token: fenceToken, farm_token: farmToken });

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
      WHERE farm_token = ? AND farmer_token = ?
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
    const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
    const farm = farmStmt.get(farmToken, farmerToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // If transferToFarmToken is provided, verify it exists
    if (transferToFarmToken) {
      const targetFarmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
      const targetFarm = targetFarmStmt.get(transferToFarmToken, farmerToken);

      if (!targetFarm) {
        return res.status(404).json({ error: 'Target farm not found' });
      }

      // Transfer cows to the target farm
      const transferStmt = db.prepare('UPDATE dbt4 SET farm_token = ? WHERE farm_token = ? AND farmer_token = ?');
      transferStmt.run(transferToFarmToken, farmToken, farmerToken);
    } else {
      // Set cows' farm_token to NULL (they become "new cows")
      const unassignStmt = db.prepare('UPDATE dbt4 SET farm_token = NULL WHERE farm_token = ? AND farmer_token = ?');
      unassignStmt.run(farmToken, farmerToken);
    }

    // Delete the farm
    const deleteStmt = db.prepare('DELETE FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
    deleteStmt.run(farmToken, farmerToken);

    // Decrement total_farms counter for the user (farmer or developer)
    const userType = req.user.userType || 'farmer';
    if (userType === 'developer') {
      const updateStmt = db.prepare('UPDATE dbt10 SET total_farms = total_farms - 1 WHERE developer_token = ?');
      updateStmt.run(farmerToken);
    } else {
      const updateStmt = db.prepare('UPDATE dbt1 SET total_farms = total_farms - 1 WHERE farmer_token = ?');
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
      WHERE fence_token = ? AND farmer_token = ?
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

    const stmt = db.prepare('DELETE FROM dbt3 WHERE fence_token = ? AND farmer_token = ?');
    const result = stmt.run(fenceToken, farmerToken);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Fence deleted successfully' });
    } else {
      res.status(404).json({ error: 'Fence not found' });
    }
  } catch (error) {
    console.error('Delete fence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download farm report
router.get('/:farmToken/download', authenticateToken, (req, res) => {
  try {
    const { farmToken } = req.params;
    const farmerToken = req.user.token;

    // Get farm details
    const farmStmt = db.prepare('SELECT * FROM dbt2 WHERE farm_token = ? AND farmer_token = ?');
    const farm = farmStmt.get(farmToken, farmerToken);

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // Get cows in this farm
    const cowsStmt = db.prepare(`
      SELECT cow_name, cow_nickname, collar_id, state_fence, time_inside, time_outside, total_breach
      FROM dbt4
      WHERE farm_token = ? AND farmer_token = ?
      ORDER BY cow_name ASC
    `);
    const cows = cowsStmt.all(farmToken, farmerToken);

    // Get fences (all farmer's fences)
    const fencesStmt = db.prepare(`
      SELECT fence_name, fence_coordinate
      FROM dbt3
      WHERE farmer_token = ?
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
