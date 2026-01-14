const cron = require('node-cron');
const { db } = require('../config/database');
const gmailService = require('../utils/gmailService');
const megaUploader = require('../utils/megaUploader');
const pdfGenerator = require('../utils/simplePdfGenerator');
const { formatDate } = require('../utils/dateFormatter');

// Schedule 24MPF report generation (daily at 23:59)
function schedule24MPFReport() {
  cron.schedule('59 23 * * *', async () => {
    try {
      console.log('Generating 24MPF report...');

      const stmt = db.prepare(`
        SELECT
          COUNT(*) as total_cows,
          SUM(total_breach) as total_breaches,
          SUM(time_inside) as total_time_inside,
          SUM(time_outside) as total_time_outside,
          SUM(CASE WHEN state_fence = 'inside' THEN 1 ELSE 0 END) as cows_inside,
          SUM(CASE WHEN state_fence = 'outside' THEN 1 ELSE 0 END) as cows_outside
        FROM dbt4
      `);
      const reportData = stmt.get();

      const pdfBuffer = await pdfGenerator.generate24MPF(reportData);
      const megaLink = await megaUploader.uploadFile(pdfBuffer, `24MPF-${formatDate()}.pdf`);

      await gmailService.sendAlert(
        process.env.GMAIL_RECEIVER || 'jeanclaudemng@gmail.com',
        'SafeZone Daily Report',
        `Daily report is ready: ${megaLink}`
      );

      console.log('24MPF report generated and sent');
    } catch (error) {
      console.error('24MPF generation error:', error);
    }
  });
}

// Schedule database cleanup (daily at midnight)
function scheduleDatabaseCleanup() {
  cron.schedule('0 0 * * *', async () => {
    try {
      // Reset daily statistics if needed
      // For now, we keep historical data in the simplified schema
      // Future enhancement: could archive old data or reset counters

      console.log('Database cleanup check completed');
    } catch (error) {
      console.error('Database cleanup error:', error);
    }
  });
}

// Check for inactive farmers and mark as disconnected (every minute)
function scheduleInactivityCheck() {
  cron.schedule('* * * * *', async () => {
    try {
      // Mark farmers as disconnected if last_seen is older than 2 minutes
      const inactivityThreshold = 2; // minutes

      const updateStmt = db.prepare(`
        UPDATE dbt1
        SET connection_state = 'disconnected'
        WHERE connection_state = 'connected'
        AND last_seen < datetime('now', '-${inactivityThreshold} minutes')
      `);

      const result = updateStmt.run();

      if (result.changes > 0) {
        console.log(`Marked ${result.changes} farmer(s) as disconnected due to inactivity`);
      }
    } catch (error) {
      console.error('Inactivity check error:', error);
    }
  });
}

// Initialize all cron jobs
function initializeCronJobs() {
  schedule24MPFReport();
  scheduleDatabaseCleanup();
  scheduleInactivityCheck();
  console.log('Cron jobs initialized');
}

module.exports = { initializeCronJobs };
