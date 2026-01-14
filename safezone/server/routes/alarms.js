const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { sendZone2BreachEmail, sendLine2BreachEmail } = require('../services/emailService');
const { authenticateToken } = require('../middleware/auth');

// Alarm1 trigger (audio alarm after 10 seconds in zone2)
// This is alarm1 in the system
router.post('/alarm1-trigger', authenticateToken, async (req, res) => {
    try {
        const { cowToken } = req.body;
        const userEmail = req.user.farmerId;
        const userType = req.user.userType;

        console.log('🔊 Processing alarm1 (audio) trigger for cow:', cowToken);
        console.log('📧 User email:', userEmail, '| User type:', userType);

        // Check cow's alarm1_triggered state
        let cow = db.prepare('SELECT cow_token, alarm1_triggered FROM dbt6 WHERE cow_token = ?').get(cowToken);
        if (!cow) {
            cow = db.prepare('SELECT cow_token, alarm1_triggered FROM dbt4 WHERE cow_token = ?').get(cowToken);
        }

        if (!cow) {
            console.error('❌ Cow not found:', cowToken);
            return res.status(404).json({ error: 'Cow not found' });
        }

        // Check alarm state
        if (cow.alarm1_triggered === null) {
            console.log('⚠️ Alarm1 not triggered - cow not assigned (alarm1_triggered is null)');
            return res.status(400).json({ error: 'Cannot trigger alarm for unassigned cow' });
        }

        if (cow.alarm1_triggered === 1) {
            console.log('⚠️ Alarm1 already triggered for this breach cycle - skipping duplicate trigger');
            return res.status(400).json({ error: 'Alarm already triggered for this breach cycle' });
        }

        // Set timestamp (column26) - only if not already set
        const cowTable = db.prepare('SELECT cow_token FROM dbt6 WHERE cow_token = ?').get(cowToken) ? 'dbt6' : 'dbt4';

        // Check if timestamp already exists (protection: cannot fill again if != null)
        const currentCow = db.prepare(`SELECT alarm1_triggered_at FROM ${cowTable} WHERE cow_token = ?`).get(cowToken);
        if (currentCow.alarm1_triggered_at !== null) {
            console.log('⚠️ Alarm1 timestamp already set - protected from overwrite');
            return res.status(400).json({ error: 'Alarm1 timestamp already set' });
        }

        const now = new Date().toISOString();

        // Set timestamp in column26
        db.prepare(`UPDATE ${cowTable} SET alarm1_triggered_at = ? WHERE cow_token = ?`).run(now, cowToken);

        // Note: alarm1_triggered (column23) is computed by position update endpoints
        // based on: state_fence IN ('zone2', 'zone3') AND alarm1_triggered_at != null
        // This ensures consistency and avoids race conditions with GPS updates

        console.log(`✅ Alarm1 timestamp set: ${now}`);
        console.log(`✅ Alarm1_triggered flag will be computed by next position update`);
        res.json({ success: true, message: 'Alarm1 triggered and database updated' });

    } catch (error) {
        console.error('Error triggering alarm1:', error);
        res.status(500).json({ error: 'Failed to trigger alarm1' });
    }
});

// Zone2 breach notification (cow in warning zone for 25+ seconds)
// This is alarm2 in the system
router.post('/zone2-breach', authenticateToken, async (req, res) => {
    try {
        const { cowToken, cowName, cowNickname, latitude, longitude, timestamp } = req.body;
        const userEmail = req.user.farmerId; // JWT stores email in farmerId field
        const userType = req.user.userType; // 'farmer' or 'developer'

        console.log('📧 Processing zone2 breach notification for cow:', cowToken);
        console.log('📧 User email:', userEmail, '| User type:', userType);

        // Check cow's alarm2_triggered state
        // First check dbt6 (virtual cows), then dbt4 (real cows)
        let cow = db.prepare('SELECT cow_token, alarm2_triggered FROM dbt6 WHERE cow_token = ?').get(cowToken);
        if (!cow) {
            cow = db.prepare('SELECT cow_token, alarm2_triggered FROM dbt4 WHERE cow_token = ?').get(cowToken);
        }

        if (!cow) {
            console.error('❌ Cow not found:', cowToken);
            return res.status(404).json({ error: 'Cow not found' });
        }

        // Check alarm state: null = unassigned cow (don't trigger), 1 = already triggered (don't repeat), 0 = ready to trigger
        if (cow.alarm2_triggered === null) {
            console.log('⚠️ Alarm2 not triggered - cow not assigned (alarm2_triggered is null)');
            return res.status(400).json({ error: 'Cannot trigger alarm for unassigned cow' });
        }

        if (cow.alarm2_triggered === 1) {
            console.log('⚠️ Alarm2 already triggered for this breach cycle - skipping duplicate email');
            return res.status(400).json({ error: 'Alarm already triggered for this breach cycle' });
        }

        // Get user based on type
        let user;
        if (userType === 'developer') {
            user = db.prepare('SELECT email, developer_name AS username FROM dbt10 WHERE email = ?').get(userEmail);
        } else {
            user = db.prepare('SELECT user_id AS email, farmer_name AS username FROM dbt1 WHERE user_id = ?').get(userEmail);
        }

        if (!user) {
            console.error('❌ User not found:', userEmail);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('📧 Sending email to:', user.email, '| Username:', user.username);

        // Send email
        const cowData = {
            cowToken,
            cowName,
            cowNickname,
            latitude,
            longitude,
            timestamp
        };

        // Check if timestamp already exists (protection: cannot fill again if != null)
        const cowTable = db.prepare('SELECT cow_token FROM dbt6 WHERE cow_token = ?').get(cowToken) ? 'dbt6' : 'dbt4';
        const currentCow = db.prepare(`SELECT alarm2_triggered_at, state_fence FROM ${cowTable} WHERE cow_token = ?`).get(cowToken);

        if (currentCow.alarm2_triggered_at !== null) {
            console.log('⚠️ Alarm2 timestamp already set - protected from overwrite');
            return res.status(400).json({ error: 'Alarm2 timestamp already set' });
        }

        // Send email
        await sendZone2BreachEmail(user.email, user.username, cowData);

        // Set timestamp in column27
        const now = new Date().toISOString();
        db.prepare(`UPDATE ${cowTable} SET alarm2_triggered_at = ? WHERE cow_token = ?`).run(now, cowToken);

        // Note: alarm2_triggered (column24) is computed by position update endpoints
        // based on: state_fence = 'zone2' AND alarm2_triggered_at != null
        // This ensures consistency and avoids race conditions with GPS updates

        console.log('✅ Zone2 breach email sent successfully to', user.email);
        console.log(`✅ Alarm2 timestamp set: ${now}`);
        console.log(`✅ Alarm2_triggered flag will be computed by next position update`);
        res.json({ success: true, message: 'Zone2 breach notification sent' });

    } catch (error) {
        console.error('Error sending zone2 breach notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Line2 breach notification (cow entered danger zone, >50m from fence)
// This is alarm3 in the system
router.post('/line2-breach', authenticateToken, async (req, res) => {
    try {
        const { cowToken, cowName, cowNickname, latitude, longitude, timestamp } = req.body;
        const userEmail = req.user.farmerId; // JWT stores email in farmerId field
        const userType = req.user.userType; // 'farmer' or 'developer'

        console.log('📧 Processing line2 breach notification for cow:', cowToken);
        console.log('📧 User email:', userEmail, '| User type:', userType);

        // Check cow's alarm3_triggered state
        // First check dbt6 (virtual cows), then dbt4 (real cows)
        let cow = db.prepare('SELECT cow_token, alarm3_triggered FROM dbt6 WHERE cow_token = ?').get(cowToken);
        if (!cow) {
            cow = db.prepare('SELECT cow_token, alarm3_triggered FROM dbt4 WHERE cow_token = ?').get(cowToken);
        }

        if (!cow) {
            console.error('❌ Cow not found:', cowToken);
            return res.status(404).json({ error: 'Cow not found' });
        }

        // Check alarm state: null = unassigned cow (don't trigger), 1 = already triggered (don't repeat), 0 = ready to trigger
        if (cow.alarm3_triggered === null) {
            console.log('⚠️ Alarm3 not triggered - cow not assigned (alarm3_triggered is null)');
            return res.status(400).json({ error: 'Cannot trigger alarm for unassigned cow' });
        }

        if (cow.alarm3_triggered === 1) {
            console.log('⚠️ Alarm3 already triggered for this breach cycle - skipping duplicate email');
            return res.status(400).json({ error: 'Alarm already triggered for this breach cycle' });
        }

        // Get user based on type
        let user;
        if (userType === 'developer') {
            user = db.prepare('SELECT email, developer_name AS username FROM dbt10 WHERE email = ?').get(userEmail);
        } else {
            user = db.prepare('SELECT user_id AS email, farmer_name AS username FROM dbt1 WHERE user_id = ?').get(userEmail);
        }

        if (!user) {
            console.error('❌ User not found:', userEmail);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('📧 Sending email to:', user.email, '| Username:', user.username);

        // Send email
        const cowData = {
            cowToken,
            cowName,
            cowNickname,
            latitude,
            longitude,
            timestamp
        };

        // Check if timestamp already exists (protection: cannot fill again if != null)
        const cowTable = db.prepare('SELECT cow_token FROM dbt6 WHERE cow_token = ?').get(cowToken) ? 'dbt6' : 'dbt4';
        const currentCow = db.prepare(`SELECT alarm3_triggered_at, state_fence FROM ${cowTable} WHERE cow_token = ?`).get(cowToken);

        if (currentCow.alarm3_triggered_at !== null) {
            console.log('⚠️ Alarm3 timestamp already set - protected from overwrite');
            return res.status(400).json({ error: 'Alarm3 timestamp already set' });
        }

        // Send email
        await sendLine2BreachEmail(user.email, user.username, cowData);

        // Set timestamp in column28
        const now = new Date().toISOString();
        db.prepare(`UPDATE ${cowTable} SET alarm3_triggered_at = ? WHERE cow_token = ?`).run(now, cowToken);

        // Note: alarm3_triggered (column25) is computed by position update endpoints
        // based on: state_fence = 'zone3' AND alarm3_triggered_at != null
        // This ensures consistency and avoids race conditions with GPS updates

        console.log('✅ Line2 breach email sent successfully to', user.email);
        console.log(`✅ Alarm3 timestamp set: ${now}`);
        console.log(`✅ Alarm3_triggered flag will be computed by next position update`);
        res.json({ success: true, message: 'Line2 breach notification sent' });

    } catch (error) {
        console.error('Error sending line2 breach notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// GET alarm state for a specific cow (check if alarms can be triggered)
router.get('/alarm-state/:cowToken', authenticateToken, (req, res) => {
    try {
        const { cowToken } = req.params;

        // Check dbt6 (virtual cows) first, then dbt4 (real cows)
        let cow = db.prepare(`
            SELECT cow_token, state_fence,
                   alarm1_triggered, alarm2_triggered, alarm3_triggered,
                   alarm1_triggered_at, alarm2_triggered_at, alarm3_triggered_at
            FROM dbt6 WHERE cow_token = ?
        `).get(cowToken);

        if (!cow) {
            cow = db.prepare(`
                SELECT cow_token, state_fence,
                       alarm1_triggered, alarm2_triggered, alarm3_triggered,
                       alarm1_triggered_at, alarm2_triggered_at, alarm3_triggered_at
                FROM dbt4 WHERE cow_token = ?
            `).get(cowToken);
        }

        if (!cow) {
            return res.status(404).json({ error: 'Cow not found' });
        }

        // Check if alarms can trigger based on timestamp existence (not triggered value)
        // canTrigger = timestamp is null (hasn't been set yet in this breach cycle)
        res.json({
            cowToken: cow.cow_token,
            state_fence: cow.state_fence,
            alarm1: {
                triggered: cow.alarm1_triggered,
                canTrigger: cow.alarm1_triggered_at === null, // Can trigger if timestamp not set
                triggeredAt: cow.alarm1_triggered_at
            },
            alarm2: {
                triggered: cow.alarm2_triggered,
                canTrigger: cow.alarm2_triggered_at === null, // Can trigger if timestamp not set
                triggeredAt: cow.alarm2_triggered_at
            },
            alarm3: {
                triggered: cow.alarm3_triggered,
                canTrigger: cow.alarm3_triggered_at === null, // Can trigger if timestamp not set
                triggeredAt: cow.alarm3_triggered_at
            }
        });
    } catch (error) {
        console.error('Error getting alarm state:', error);
        res.status(500).json({ error: 'Failed to get alarm state' });
    }
});

// Test email endpoint to verify email format
router.post('/test-email', async (req, res) => {
    try {
        const { email, type } = req.body;
        const testEmail = email || 'modeblackmng@gmail.com';
        const emailType = type || 'zone2'; // 'zone2' or 'line2'

        console.log(`📧 Sending test ${emailType} email to:`, testEmail);

        const testCowData = {
            cowToken: 'TEST_COW_123456789',
            cowName: 'test_cow_1',
            cowNickname: 'TestCow',
            latitude: 35.441170,
            longitude: 33.436734,
            timestamp: new Date().toISOString()
        };

        if (emailType === 'line2') {
            await sendLine2BreachEmail(testEmail, 'Test User', testCowData);
            console.log('✅ Test line2 breach email sent to', testEmail);
            res.json({ success: true, message: 'Test line2 breach email sent successfully' });
        } else {
            await sendZone2BreachEmail(testEmail, 'Test User', testCowData);
            console.log('✅ Test zone2 breach email sent to', testEmail);
            res.json({ success: true, message: 'Test zone2 breach email sent successfully' });
        }

    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ error: 'Failed to send test email', details: error.message });
    }
});

module.exports = router;
