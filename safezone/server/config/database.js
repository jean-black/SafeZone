const Database = require('better-sqlite3');
const path = require('path');

// Initialize SQLite database with timeout option
const dbPath = path.join(__dirname, '../../database/modeblack.db');
const db = new Database(dbPath, {
  timeout: 10000, // Wait up to 10 seconds for locks to clear
  verbose: null // Disable verbose logging (use console.log for debugging)
});

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Set synchronous mode to NORMAL for better performance with WAL
db.pragma('synchronous = NORMAL');

// Cache size for better performance
db.pragma('cache_size = -64000'); // 64MB cache

// Initialize database tables
function initializeDatabase() {
  try {
    // Create all tables with the new schema
    // IMPORTANT: All timestamp columns should be explicitly set using now() from dateFormatter
    // DEFAULT CURRENT_TIMESTAMP returns UTC time, not local time
    db.exec(`
      -- dbt1: Farmers table (with notification and security tracking)
      CREATE TABLE IF NOT EXISTS dbt1 (
        farmer_name TEXT NOT NULL,
        user_id TEXT NOT NULL UNIQUE,
        farmer_token TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        timestamp DATETIME,
        recovery_code TEXT,
        confirmation_code TEXT,
        total_farms INTEGER DEFAULT 0,
        total_cows INTEGER DEFAULT 0,
        failed_login_attempts INTEGER DEFAULT 0,
        last_failed_login DATETIME,
        failed_login_location TEXT,
        failed_login_country TEXT,
        developer_token TEXT,
        connected_at DATETIME,
        last_seen DATETIME,
        connection_state TEXT DEFAULT 'disconnected',
        is_banished INTEGER DEFAULT 0,
        user_account_type TEXT,
        banished_at DATETIME,
        page6_last_used_parameter TEXT
      );

      -- dbt2: Farms table
      CREATE TABLE IF NOT EXISTS dbt2 (
        farm_name TEXT NOT NULL,
        farm_token TEXT PRIMARY KEY,
        farmer_token TEXT NOT NULL,
        farm_gps TEXT,
        timestamp DATETIME,
        FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token) ON DELETE CASCADE
      );

      -- dbt3: Fences table
      CREATE TABLE IF NOT EXISTS dbt3 (
        fence_name TEXT NOT NULL,
        fence_token TEXT PRIMARY KEY,
        farmer_token TEXT NOT NULL,
        fence_coordinate TEXT NOT NULL,
        area_size REAL,
        timestamp DATETIME,
        FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token) ON DELETE CASCADE
      );

      -- dbt4: Cows table
      CREATE TABLE IF NOT EXISTS dbt4 (
        cow_name TEXT NOT NULL,
        cow_nickname TEXT,
        cow_token TEXT PRIMARY KEY,
        collar_id TEXT NOT NULL UNIQUE,
        farmer_token TEXT,
        farm_token TEXT,
        timestamp DATETIME,
        state_fence TEXT DEFAULT 'unknown',
        time_inside INTEGER DEFAULT 0,
        time_outside INTEGER DEFAULT 0,
        total_breach INTEGER DEFAULT 0,
        gps_latitude REAL,
        gps_longitude REAL,
        collar_state TEXT DEFAULT 'disconnected',
        connected_at DATETIME,
        last_seen DATETIME,
        registered_at DATETIME,
        assigned_at DATETIME,
        actual_time_inside_fence INTEGER DEFAULT 0,
        actual_time_outside_fence INTEGER DEFAULT 0,
        zone_changed_at DATETIME,
        alarm1_triggered INTEGER,
        alarm2_triggered INTEGER,
        alarm3_triggered INTEGER,
        alarm1_triggered_at DATETIME,
        alarm2_triggered_at DATETIME,
        alarm3_triggered_at DATETIME,
        current_breach_cycle TEXT,
        FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token) ON DELETE SET NULL,
        FOREIGN KEY (farm_token) REFERENCES dbt2(farm_token) ON DELETE SET NULL
      );

      -- dbt5: New ESP32 connected cows table
      CREATE TABLE IF NOT EXISTS dbt5 (
        cow_name TEXT NOT NULL,
        cow_nickname TEXT,
        cow_token TEXT PRIMARY KEY,
        collar_id TEXT NOT NULL UNIQUE,
        timestamp DATETIME,
        collar_state TEXT DEFAULT 'disconnected'
      );

      -- dbt6: Virtual cows table
      CREATE TABLE IF NOT EXISTS dbt6 (
        cow_name TEXT NOT NULL,
        cow_nickname TEXT,
        cow_token TEXT PRIMARY KEY,
        collar_id TEXT NOT NULL UNIQUE,
        farmer_token TEXT,
        timestamp DATETIME,
        state_fence TEXT DEFAULT 'unknown',
        time_inside INTEGER DEFAULT 0,
        time_outside INTEGER DEFAULT 0,
        total_breach INTEGER DEFAULT 0,
        gps_latitude REAL,
        gps_longitude REAL,
        actual_time_inside_fence INTEGER DEFAULT 0,
        actual_time_outside_fence INTEGER DEFAULT 0,
        zone_changed_at DATETIME,
        alarm1_triggered INTEGER,
        alarm2_triggered INTEGER,
        alarm3_triggered INTEGER,
        alarm1_triggered_at DATETIME,
        alarm2_triggered_at DATETIME,
        alarm3_triggered_at DATETIME,
        current_breach_cycle TEXT,
        FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token) ON DELETE SET NULL
      );

      -- dbt7: Farmer collaborative recovery table
      -- agent_id is the MAC address of the device that accepts recovery
      -- recovery_code enables agent to access page7
      CREATE TABLE IF NOT EXISTS dbt7 (
        recovery_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        farmer_token TEXT NOT NULL,
        farm_token TEXT NOT NULL,
        lost_cow_token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME,
        connection_state TEXT DEFAULT 'disconnected',
        agent_accept_state TEXT DEFAULT 'pending',
        recovery_code TEXT NOT NULL,
        recovery_completion_state TEXT DEFAULT 'pending',
        FOREIGN KEY (farmer_token) REFERENCES dbt1(farmer_token) ON DELETE CASCADE,
        FOREIGN KEY (farm_token) REFERENCES dbt2(farm_token) ON DELETE CASCADE,
        FOREIGN KEY (lost_cow_token) REFERENCES dbt4(cow_token) ON DELETE CASCADE
      );

      -- dbt8: Notifications table (with sender/receiver tokens)
      -- Note: sender has NO foreign key because it can be from dbt1 (farmer) OR dbt10 (developer)
      CREATE TABLE IF NOT EXISTS dbt8 (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        cow_token TEXT,
        notification_type TEXT NOT NULL,
        message TEXT,
        metadata TEXT,
        is_read INTEGER DEFAULT 0,
        timestamp DATETIME,
        sender TEXT,
        receiver TEXT,
        message_type TEXT,
        FOREIGN KEY (receiver) REFERENCES dbt1(farmer_token) ON DELETE CASCADE,
        FOREIGN KEY (cow_token) REFERENCES dbt4(cow_token) ON DELETE CASCADE
      );

      -- dbt10: Developers table
      CREATE TABLE IF NOT EXISTS dbt10 (
        developer_name TEXT NOT NULL,
        email TEXT,
        developer_token TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        registered_at DATETIME,
        recovery_code TEXT,
        confirmation_code TEXT,
        total_farms INTEGER DEFAULT 0,
        total_cows INTEGER DEFAULT 0,
        failed_login_attempts INTEGER DEFAULT 0,
        last_failed_login DATETIME,
        failed_login_location TEXT,
        failed_login_country TEXT,
        connected_at DATETIME,
        last_seen DATETIME,
        connection_state TEXT DEFAULT 'disconnected',
        total_number_of_user INTEGER DEFAULT 0,
        total_number_of_banished_user INTEGER DEFAULT 0,
        page19_last_used_parameter TEXT,
        total_number_of_connected_user INTEGER DEFAULT 0
      );

      -- dbt11: Developer virtual agent collaborative recovery table
      -- virtual_agent_id is like agent1, agent2, etc.
      -- No recovery_code needed for virtual agents (page18 access)
      -- Note: lost_cow_token has NO foreign key - allows both real and virtual cows
      -- The actual cow relationship is managed through dbt14 junction table
      CREATE TABLE IF NOT EXISTS dbt11 (
        recovery_id TEXT PRIMARY KEY,
        virtual_agent_id TEXT NOT NULL,
        developer_token TEXT NOT NULL,
        farm_token TEXT NOT NULL,
        lost_cow_token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME,
        connection_state TEXT DEFAULT 'disconnected',
        virtual_agent_accept_state TEXT DEFAULT 'pending',
        recovery_code TEXT,
        FOREIGN KEY (developer_token) REFERENCES dbt10(developer_token) ON DELETE CASCADE,
        FOREIGN KEY (farm_token) REFERENCES dbt2(farm_token) ON DELETE CASCADE
      );

      -- dbt13: Junction table for multiple cows in farmer recovery (dbt7)
      CREATE TABLE IF NOT EXISTS dbt13 (
        recovery_cow_id INTEGER PRIMARY KEY AUTOINCREMENT,
        recovery_id TEXT NOT NULL,
        cow_token TEXT NOT NULL,
        FOREIGN KEY (recovery_id) REFERENCES dbt7(recovery_id) ON DELETE CASCADE,
        FOREIGN KEY (cow_token) REFERENCES dbt4(cow_token) ON DELETE CASCADE
      );

      -- dbt14: Junction table for multiple cows in developer virtual recovery (dbt11)
      CREATE TABLE IF NOT EXISTS dbt14 (
        recovery_cow_id INTEGER PRIMARY KEY AUTOINCREMENT,
        recovery_id TEXT NOT NULL,
        cow_token TEXT NOT NULL,
        FOREIGN KEY (recovery_id) REFERENCES dbt11(recovery_id) ON DELETE CASCADE,
        FOREIGN KEY (cow_token) REFERENCES dbt6(cow_token) ON DELETE CASCADE
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_dbt2_farmer ON dbt2(farmer_token);
      CREATE INDEX IF NOT EXISTS idx_dbt3_farmer ON dbt3(farmer_token);
      CREATE INDEX IF NOT EXISTS idx_dbt4_farmer ON dbt4(farmer_token);
      CREATE INDEX IF NOT EXISTS idx_dbt4_farm ON dbt4(farm_token);
      CREATE INDEX IF NOT EXISTS idx_dbt8_receiver ON dbt8(receiver);
      CREATE INDEX IF NOT EXISTS idx_dbt8_sender ON dbt8(sender);
      CREATE INDEX IF NOT EXISTS idx_dbt8_read ON dbt8(is_read);
      CREATE INDEX IF NOT EXISTS idx_dbt8_type ON dbt8(notification_type);
      CREATE INDEX IF NOT EXISTS idx_dbt13_recovery ON dbt13(recovery_id);
      CREATE INDEX IF NOT EXISTS idx_dbt13_cow ON dbt13(cow_token);
      CREATE INDEX IF NOT EXISTS idx_dbt14_recovery ON dbt14(recovery_id);
      CREATE INDEX IF NOT EXISTS idx_dbt14_cow ON dbt14(cow_token);
    `);

    // Migrate existing tables - add missing columns if they don't exist
    const columns = db.pragma('table_info(dbt4)');
    const columnNames = columns.map(col => col.name);

    if (!columnNames.includes('collar_state')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN collar_state TEXT DEFAULT "disconnected"');
      console.log('Added collar_state column to dbt4');
    }

    if (!columnNames.includes('connected_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN connected_at DATETIME');
      console.log('Added connected_at column to dbt4');
    }

    if (!columnNames.includes('last_seen')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN last_seen DATETIME');
      console.log('Added last_seen column to dbt4');
    }

    if (!columnNames.includes('registered_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN registered_at DATETIME');
      console.log('Added registered_at column to dbt4');
    }

    if (!columnNames.includes('assigned_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN assigned_at DATETIME');
      console.log('Added assigned_at column to dbt4');
    }

    if (!columnNames.includes('actual_time_inside_fence')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN actual_time_inside_fence INTEGER DEFAULT 0');
      console.log('Added actual_time_inside_fence column to dbt4');
    }

    if (!columnNames.includes('actual_time_outside_fence')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN actual_time_outside_fence INTEGER DEFAULT 0');
      console.log('Added actual_time_outside_fence column to dbt4');
    }

    if (!columnNames.includes('zone_changed_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN zone_changed_at DATETIME');
      console.log('Added zone_changed_at column to dbt4');
    }

    // Migrate dbt6 - add missing columns if they don't exist
    const dbt6Columns = db.pragma('table_info(dbt6)');
    const dbt6ColumnNames = dbt6Columns.map(col => col.name);

    if (!dbt6ColumnNames.includes('gps_latitude')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN gps_latitude REAL');
      console.log('Added gps_latitude column to dbt6');
    }

    if (!dbt6ColumnNames.includes('gps_longitude')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN gps_longitude REAL');
      console.log('Added gps_longitude column to dbt6');
    }

    if (!dbt6ColumnNames.includes('actual_time_inside_fence')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN actual_time_inside_fence INTEGER DEFAULT 0');
      console.log('Added actual_time_inside_fence column to dbt6');
    }

    if (!dbt6ColumnNames.includes('actual_time_outside_fence')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN actual_time_outside_fence INTEGER DEFAULT 0');
      console.log('Added actual_time_outside_fence column to dbt6');
    }

    if (!dbt6ColumnNames.includes('zone_changed_at')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN zone_changed_at DATETIME');
      console.log('Added zone_changed_at column to dbt6');
    }

    // Add alarm state columns to dbt4
    if (!columnNames.includes('alarm1_triggered')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm1_triggered INTEGER');
      console.log('Added alarm1_triggered column to dbt4');
    }

    if (!columnNames.includes('alarm2_triggered')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm2_triggered INTEGER');
      console.log('Added alarm2_triggered column to dbt4');
    }

    if (!columnNames.includes('alarm3_triggered')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm3_triggered INTEGER');
      console.log('Added alarm3_triggered column to dbt4');
    }

    if (!columnNames.includes('alarm1_triggered_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm1_triggered_at DATETIME');
      console.log('Added alarm1_triggered_at column to dbt4');
    }

    if (!columnNames.includes('alarm2_triggered_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm2_triggered_at DATETIME');
      console.log('Added alarm2_triggered_at column to dbt4');
    }

    if (!columnNames.includes('alarm3_triggered_at')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN alarm3_triggered_at DATETIME');
      console.log('Added alarm3_triggered_at column to dbt4');
    }

    if (!columnNames.includes('current_breach_cycle')) {
      db.exec('ALTER TABLE dbt4 ADD COLUMN current_breach_cycle TEXT');
      console.log('Added current_breach_cycle column to dbt4');
    }

    // Add alarm state columns to dbt6
    if (!dbt6ColumnNames.includes('alarm1_triggered')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm1_triggered INTEGER');
      console.log('Added alarm1_triggered column to dbt6');
    }

    if (!dbt6ColumnNames.includes('alarm2_triggered')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm2_triggered INTEGER');
      console.log('Added alarm2_triggered column to dbt6');
    }

    if (!dbt6ColumnNames.includes('alarm3_triggered')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm3_triggered INTEGER');
      console.log('Added alarm3_triggered column to dbt6');
    }

    if (!dbt6ColumnNames.includes('alarm1_triggered_at')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm1_triggered_at DATETIME');
      console.log('Added alarm1_triggered_at column to dbt6');
    }

    if (!dbt6ColumnNames.includes('alarm2_triggered_at')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm2_triggered_at DATETIME');
      console.log('Added alarm2_triggered_at column to dbt6');
    }

    if (!dbt6ColumnNames.includes('alarm3_triggered_at')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN alarm3_triggered_at DATETIME');
      console.log('Added alarm3_triggered_at column to dbt6');
    }

    if (!dbt6ColumnNames.includes('current_breach_cycle')) {
      db.exec('ALTER TABLE dbt6 ADD COLUMN current_breach_cycle TEXT');
      console.log('Added current_breach_cycle column to dbt6');
    }

    // Migrate dbt1 - add missing columns if they don't exist
    const dbt1Columns = db.pragma('table_info(dbt1)');
    const dbt1ColumnNames = dbt1Columns.map(col => col.name);

    if (!dbt1ColumnNames.includes('developer_token')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN developer_token TEXT');
      console.log('Added developer_token column to dbt1');
    }

    if (!dbt1ColumnNames.includes('connected_at')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN connected_at DATETIME');
      console.log('Added connected_at column to dbt1');
    }

    if (!dbt1ColumnNames.includes('last_seen')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN last_seen DATETIME');
      console.log('Added last_seen column to dbt1');
    }

    if (!dbt1ColumnNames.includes('connection_state')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN connection_state TEXT DEFAULT "disconnected"');
      console.log('Added connection_state column to dbt1');
    }

    if (!dbt1ColumnNames.includes('is_banished')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN is_banished INTEGER DEFAULT 0');
      console.log('Added is_banished column to dbt1');
    }

    if (!dbt1ColumnNames.includes('user_account_type')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN user_account_type TEXT');
      console.log('Added user_account_type column to dbt1');
    }

    if (!dbt1ColumnNames.includes('banished_at')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN banished_at DATETIME');
      console.log('Added banished_at column to dbt1');
    }

    if (!dbt1ColumnNames.includes('page6_last_used_parameter')) {
      db.exec('ALTER TABLE dbt1 ADD COLUMN page6_last_used_parameter TEXT');
      console.log('Added page6_last_used_parameter column to dbt1');
    }

    // Migrate dbt7 - add missing columns if they don't exist
    const dbt7Columns = db.pragma('table_info(dbt7)');
    const dbt7ColumnNames = dbt7Columns.map(col => col.name);

    if (!dbt7ColumnNames.includes('recovery_completion_state')) {
      db.exec('ALTER TABLE dbt7 ADD COLUMN recovery_completion_state TEXT DEFAULT "pending"');
      console.log('Added recovery_completion_state column to dbt7');
    }

    // Migrate dbt10 - add missing columns if they don't exist
    const dbt10Columns = db.pragma('table_info(dbt10)');
    const dbt10ColumnNames = dbt10Columns.map(col => col.name);

    if (!dbt10ColumnNames.includes('total_number_of_user')) {
      db.exec('ALTER TABLE dbt10 ADD COLUMN total_number_of_user INTEGER DEFAULT 0');
      console.log('Added total_number_of_user column to dbt10');
    }

    if (!dbt10ColumnNames.includes('total_number_of_banished_user')) {
      db.exec('ALTER TABLE dbt10 ADD COLUMN total_number_of_banished_user INTEGER DEFAULT 0');
      console.log('Added total_number_of_banished_user column to dbt10');
    }

    if (!dbt10ColumnNames.includes('page19_last_used_parameter')) {
      db.exec('ALTER TABLE dbt10 ADD COLUMN page19_last_used_parameter TEXT');
      console.log('Added page19_last_used_parameter column to dbt10');
    }

    if (!dbt10ColumnNames.includes('total_number_of_connected_user')) {
      db.exec('ALTER TABLE dbt10 ADD COLUMN total_number_of_connected_user INTEGER DEFAULT 0');
      console.log('Added total_number_of_connected_user column to dbt10');
    }

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    return false;
  }
}

module.exports = { db, initializeDatabase };
