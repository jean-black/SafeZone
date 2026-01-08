const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sendConfirmationEmail, sendRecoveryCodeEmail, sendPasswordResetNotification } = require('../services/emailService');
const { now } = require('../utils/dateFormatter');
const {
  handleFailedLogin,
  resetFailedLoginAttempts,
  notifyPasswordChange,
  notifyUsernameChange,
  notifyEmailChange
} = require('../services/notificationService');
const { getLocationFromCoordinates, getLocationFromIP } = require('../services/geolocationService');

// Helper function to generate recovery code (4 digits)
function generateRecoveryCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper function to generate confirmation code (4 digits)
function generateConfirmationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper function to validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Login endpoint - now uses email instead of username
router.post('/login', async (req, res) => {
  try {
    const { email, password, latitude, longitude } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get location information
    let locationData;

    // Priority 1: Use WiFi/GPS coordinates if provided by client
    if (latitude && longitude) {
      locationData = await getLocationFromCoordinates(latitude, longitude);
      console.log(`Login attempt with GPS coordinates: ${latitude}, ${longitude}`);
    } else {
      // Priority 2: Fall back to IP-based geolocation
      const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
      locationData = await getLocationFromIP(userIP);
      console.log(`Login attempt from IP: ${userIP}`);
    }

    const location = locationData.coordinates || locationData.location;
    const country = locationData.country;

    // Find user by email - check both farmers (dbt1) and developers (dbt10)
    let user = db.prepare('SELECT * FROM dbt1 WHERE user_id = ?').get(email);
    let isDeveloper = false;
    let userName, userToken;

    // If not found in dbt1, check dbt10 (developers)
    if (!user) {
      user = db.prepare('SELECT * FROM dbt10 WHERE email = ?').get(email);
      isDeveloper = true;
    }

    if (!user) {
      // Track failed login for non-existent user
      console.log(`Failed login attempt for non-existent user: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Track failed login attempt with location data
      const attempts = await handleFailedLogin(email, location, country);
      console.log(`Failed login attempt #${attempts} for ${email} from ${country} (${location})`);

      return res.status(401).json({
        error: 'Invalid credentials',
        attempts: attempts >= 3 ? 'Multiple failed attempts detected. Check your email for security alert.' : undefined
      });
    }

    // Password is correct - reset failed login attempts
    resetFailedLoginAttempts(email);

    // Get user details based on user type
    if (isDeveloper) {
      userName = user.developer_name;
      userToken = user.developer_token;
    } else {
      userName = user.farmer_name;
      userToken = user.farmer_token;
    }

    // Update connection state to connected in the correct table
    const currentTime = now();

    if (isDeveloper) {
      const updateConnectionStmt = db.prepare(`
        UPDATE dbt10
        SET connection_state = 'connected',
            connected_at = CASE
              WHEN connection_state = 'disconnected' THEN ?
              ELSE connected_at
            END,
            last_seen = ?
        WHERE email = ?
      `);
      updateConnectionStmt.run(currentTime, currentTime, email);
      console.log(`Developer logged in: ${email}`);
    } else {
      const updateConnectionStmt = db.prepare(`
        UPDATE dbt1
        SET connection_state = 'connected',
            connected_at = CASE
              WHEN connection_state = 'disconnected' THEN ?
              ELSE connected_at
            END,
            last_seen = ?
        WHERE user_id = ?
      `);
      updateConnectionStmt.run(currentTime, currentTime, email);
      console.log(`Farmer logged in: ${email}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { farmerId: email, token: userToken, userType: isDeveloper ? 'developer' : 'farmer' },
      process.env.JWT_SECRET || 'safezone-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      farmer_id: email,
      farmer_name: userName,
      email: email,
      userType: isDeveloper ? 'developer' : 'farmer'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Signup endpoint - creates account with email and generates username
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check password length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists (using user_id in new schema)
    const checkEmailStmt = db.prepare('SELECT user_id FROM dbt1 WHERE user_id = ?');
    const existingEmail = checkEmailStmt.get(email);

    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate username from email (part before @)
    const baseUsername = email.split('@')[0];
    let username = baseUsername;

    // Check if username exists, add number if needed
    const checkUsernameStmt = db.prepare('SELECT farmer_name FROM dbt1 WHERE farmer_name = ?');
    let existingUsername = checkUsernameStmt.get(username);

    if (existingUsername) {
      let counter = 1;
      while (existingUsername) {
        username = `${baseUsername}${counter}`;
        existingUsername = checkUsernameStmt.get(username);
        counter++;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate tokens and codes
    const farmerToken = generateToken();
    const recoveryCode = generateRecoveryCode();
    const confirmationCode = generateConfirmationCode();

    // Get the default developer token (first developer in system)
    const defaultDeveloper = db.prepare('SELECT developer_token FROM dbt10 ORDER BY registered_at LIMIT 1').get();
    const developerToken = defaultDeveloper ? defaultDeveloper.developer_token : null;

    // Insert new user (updated for new schema)
    const insertStmt = db.prepare(`
      INSERT INTO dbt1 (farmer_name, user_id, farmer_token, password, recovery_code, confirmation_code, total_farms, total_cows, developer_token, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `);

    insertStmt.run(username, email, farmerToken, hashedPassword, recoveryCode, confirmationCode, developerToken, now());

    // Update developer's total_number_of_user count
    if (developerToken) {
      db.prepare('UPDATE dbt10 SET total_number_of_user = total_number_of_user + 1 WHERE developer_token = ?')
        .run(developerToken);
      console.log(`[Signup] Incremented total_number_of_user for developer: ${developerToken}`);
    }

    // Send confirmation email
    try {
      await sendConfirmationEmail(email, username, confirmationCode);
      await sendRecoveryCodeEmail(email, username, recoveryCode);
    } catch (emailError) {
      console.error('Error sending emails:', emailError);
      // Continue even if email fails - user can still use the system
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { farmerId: email, token: farmerToken },
      process.env.JWT_SECRET || 'safezone-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token: jwtToken,
      farmer_id: email,
      farmer_name: username,
      email: email,
      message: 'Account created successfully. Please check your email for confirmation code and recovery code.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email confirmation endpoint
router.post('/confirm-email', async (req, res) => {
  try {
    const { email, confirmationCode } = req.body;

    if (!email || !confirmationCode) {
      return res.status(400).json({ error: 'Email and confirmation code are required' });
    }

    // Find user (using user_id in new schema)
    const stmt = db.prepare('SELECT * FROM dbt1 WHERE user_id = ? AND confirmation_code = ?');
    const user = stmt.get(email, confirmationCode);

    if (!user) {
      return res.status(400).json({ error: 'Invalid confirmation code' });
    }

    // Update user as confirmed (remove confirmation_code field as it's not in new schema)
    const updateStmt = db.prepare('UPDATE dbt1 SET confirmation_code = NULL WHERE user_id = ?');
    updateStmt.run(email);

    res.json({ success: true, message: 'Email confirmed successfully' });
  } catch (error) {
    console.error('Email confirmation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend confirmation code
router.post('/resend-confirmation', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const stmt = db.prepare('SELECT * FROM dbt1 WHERE email = ?');
    const user = stmt.get(email);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email_confirmed) {
      return res.status(400).json({ error: 'Email already confirmed' });
    }

    // Generate new confirmation code
    const confirmationCode = generateConfirmationCode();
    const updateStmt = db.prepare('UPDATE dbt1 SET confirmation_code = ? WHERE email = ?');
    updateStmt.run(confirmationCode, email);

    // Send confirmation email
    try {
      await sendConfirmationEmail(email, user.farmer_name, confirmationCode);
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      return res.status(500).json({ error: 'Failed to send confirmation email' });
    }

    res.json({ success: true, message: 'Confirmation code sent to your email' });
  } catch (error) {
    console.error('Resend confirmation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password - Send recovery code to email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists (check both dbt1 for farmers and dbt10 for developers)
    let user = db.prepare('SELECT user_id, farmer_name, recovery_code FROM dbt1 WHERE user_id = ?').get(email);
    let isDeveloper = false;

    if (!user) {
      // Check dbt10 for developers
      user = db.prepare('SELECT email, developer_name, recovery_code FROM dbt10 WHERE email = ?').get(email);
      isDeveloper = true;
    }

    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    // Get existing recovery code or generate new one if null
    let recoveryCode = user.recovery_code;

    if (!recoveryCode) {
      recoveryCode = generateRecoveryCode();

      if (isDeveloper) {
        const updateStmt = db.prepare('UPDATE dbt10 SET recovery_code = ? WHERE email = ?');
        updateStmt.run(recoveryCode, email);
      } else {
        const updateStmt = db.prepare('UPDATE dbt1 SET recovery_code = ? WHERE user_id = ?');
        updateStmt.run(recoveryCode, email);
      }
    }

    // Send recovery code email
    try {
      const userName = isDeveloper ? user.developer_name : user.farmer_name;
      await sendRecoveryCodeEmail(email, userName, recoveryCode);
      console.log(`Recovery code sent to ${email} (${isDeveloper ? 'developer' : 'farmer'})`);
    } catch (emailError) {
      console.error('Error sending recovery code email:', emailError);
      return res.status(500).json({ error: 'Failed to send recovery code email' });
    }

    res.json({
      success: true,
      message: 'Recovery code sent to your email. Please check your inbox and spam folder.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password recovery - Step 1: Verify recovery code
router.post('/verify-recovery-code', async (req, res) => {
  try {
    const { recoveryCode } = req.body;

    if (!recoveryCode) {
      return res.status(400).json({ error: 'Recovery code is required' });
    }

    // Check farmers (dbt1)
    let user = db.prepare('SELECT user_id as email, farmer_name FROM dbt1 WHERE recovery_code = ?').get(recoveryCode.toUpperCase());
    let isDeveloper = false;

    // If not found, check developers (dbt10)
    if (!user) {
      user = db.prepare('SELECT email, developer_name as farmer_name FROM dbt10 WHERE recovery_code = ?').get(recoveryCode.toUpperCase());
      isDeveloper = true;
    }

    if (!user) {
      return res.status(404).json({ error: 'Invalid recovery code' });
    }

    res.json({
      success: true,
      email: user.email,
      farmer_name: user.farmer_name,
      userType: isDeveloper ? 'developer' : 'farmer',
      message: 'Recovery code verified'
    });
  } catch (error) {
    console.error('Verify recovery code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password recovery - Step 2: Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { recoveryCode, newPassword } = req.body;

    if (!recoveryCode || !newPassword) {
      return res.status(400).json({ error: 'Recovery code and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check farmers (dbt1)
    let user = db.prepare('SELECT user_id as email, farmer_name FROM dbt1 WHERE recovery_code = ?').get(recoveryCode.toUpperCase());
    let isDeveloper = false;

    // If not found, check developers (dbt10)
    if (!user) {
      user = db.prepare('SELECT email, developer_name as farmer_name FROM dbt10 WHERE recovery_code = ?').get(recoveryCode.toUpperCase());
      isDeveloper = true;
    }

    if (!user) {
      return res.status(404).json({ error: 'Invalid recovery code' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in the correct table
    if (isDeveloper) {
      const updateStmt = db.prepare('UPDATE dbt10 SET password = ? WHERE recovery_code = ?');
      updateStmt.run(hashedPassword, recoveryCode.toUpperCase());
    } else {
      const updateStmt = db.prepare('UPDATE dbt1 SET password = ? WHERE recovery_code = ?');
      updateStmt.run(hashedPassword, recoveryCode.toUpperCase());
    }

    // Send password reset notification
    try {
      await sendPasswordResetNotification(user.email, user.farmer_name);
    } catch (emailError) {
      console.error('Error sending password reset notification:', emailError);
      // Continue even if email fails
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get profile endpoint - returns current user profile data
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userToken = req.user.token;
    const userType = req.user.userType; // 'farmer' or 'developer' from JWT

    let user, userName, userEmail, timestamp;

    // Check if developer or farmer based on JWT userType
    if (userType === 'developer') {
      // Get developer data
      const stmt = db.prepare('SELECT developer_name, email, registered_at FROM dbt10 WHERE developer_token = ?');
      user = stmt.get(userToken);

      if (user) {
        userName = user.developer_name;
        userEmail = user.email;
        timestamp = user.registered_at;
      }
    } else {
      // Get farmer data (default)
      const stmt = db.prepare('SELECT farmer_name, user_id, timestamp FROM dbt1 WHERE farmer_token = ?');
      user = stmt.get(userToken);

      if (user) {
        userName = user.farmer_name;
        userEmail = user.user_id;
        timestamp = user.timestamp;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      farmer_name: userName,
      email: userEmail,
      timestamp: timestamp,
      userType: userType
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile endpoint - requires password for email/password changes
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { farmer_name, email, password, currentPassword } = req.body;
    const userToken = req.user.token;
    const userType = req.user.userType; // 'farmer' or 'developer' from JWT

    let user, isDeveloper = false;
    let currentName, currentEmail;

    // Get current user data from correct table
    if (userType === 'developer') {
      const stmt = db.prepare('SELECT * FROM dbt10 WHERE developer_token = ?');
      user = stmt.get(userToken);
      isDeveloper = true;
      if (user) {
        currentName = user.developer_name;
        currentEmail = user.email;
      }
    } else {
      const stmt = db.prepare('SELECT * FROM dbt1 WHERE farmer_token = ?');
      user = stmt.get(userToken);
      if (user) {
        currentName = user.farmer_name;
        currentEmail = user.user_id;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If changing email or password, verify current password
    if ((email && email !== currentEmail) || password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required for security changes' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid current password' });
      }
    }

    // Update name if provided (farmer_name for farmers, developer_name for developers)
    if (farmer_name && farmer_name !== currentName) {
      if (isDeveloper) {
        // Check if developer name is already taken
        const checkStmt = db.prepare('SELECT developer_name FROM dbt10 WHERE developer_name = ? AND developer_token != ?');
        const existing = checkStmt.get(farmer_name, userToken);

        if (existing) {
          return res.status(400).json({ error: 'Username already taken' });
        }

        // Update developer name
        const updateStmt = db.prepare('UPDATE dbt10 SET developer_name = ? WHERE developer_token = ?');
        updateStmt.run(farmer_name, userToken);

        // Send notification for username change
        notifyUsernameChange(userToken, currentEmail, currentName, farmer_name);
      } else {
        // Check if farmer name is already taken
        const checkStmt = db.prepare('SELECT farmer_name FROM dbt1 WHERE farmer_name = ? AND farmer_token != ?');
        const existing = checkStmt.get(farmer_name, userToken);

        if (existing) {
          return res.status(400).json({ error: 'Username already taken' });
        }

        // Update farmer name
        const updateStmt = db.prepare('UPDATE dbt1 SET farmer_name = ? WHERE farmer_token = ?');
        updateStmt.run(farmer_name, userToken);

        // Send notification for username change
        notifyUsernameChange(userToken, currentEmail, currentName, farmer_name);
      }
    }

    // Update email if provided
    if (email && email !== currentEmail) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      if (isDeveloper) {
        // Check if email is already taken in dbt10
        const checkStmt = db.prepare('SELECT email FROM dbt10 WHERE email = ?');
        const existing = checkStmt.get(email);

        if (existing) {
          return res.status(400).json({ error: 'Email already in use' });
        }

        // Generate new confirmation code
        const confirmationCode = generateConfirmationCode();
        const updateStmt = db.prepare('UPDATE dbt10 SET email = ?, confirmation_code = ? WHERE developer_token = ?');
        updateStmt.run(email, confirmationCode, userToken);

        // Send notification for email change
        notifyEmailChange(userToken, currentEmail, email);

        // Send confirmation email
        try {
          await sendConfirmationEmail(email, currentName, confirmationCode);
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Continue even if email fails
        }
      } else {
        // Check if email is already taken in dbt1
        const checkStmt = db.prepare('SELECT user_id FROM dbt1 WHERE user_id = ?');
        const existing = checkStmt.get(email);

        if (existing) {
          return res.status(400).json({ error: 'Email already in use' });
        }

        // Generate new confirmation code
        const confirmationCode = generateConfirmationCode();
        const updateStmt = db.prepare('UPDATE dbt1 SET user_id = ?, confirmation_code = ? WHERE farmer_token = ?');
        updateStmt.run(email, confirmationCode, userToken);

        // Send notification for email change
        notifyEmailChange(userToken, currentEmail, email);

        // Send confirmation email
        try {
          await sendConfirmationEmail(email, currentName, confirmationCode);
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
          // Continue even if email fails
        }
      }
    }

    // Update password if provided
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      if (isDeveloper) {
        const updateStmt = db.prepare('UPDATE dbt10 SET password = ? WHERE developer_token = ?');
        updateStmt.run(hashedPassword, userToken);

        // Send notification for password change
        await notifyPasswordChange(userToken, currentName, currentEmail);
      } else {
        const updateStmt = db.prepare('UPDATE dbt1 SET password = ? WHERE farmer_token = ?');
        updateStmt.run(hashedPassword, userToken);

        // Send notification for password change
        await notifyPasswordChange(userToken, currentName, currentEmail);
      }
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint - marks user as disconnected
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.farmerId;

    // Update farmer connection state to disconnected
    const updateConnectionStmt = db.prepare(`
      UPDATE dbt1
      SET connection_state = 'disconnected',
          last_seen = ?
      WHERE user_id = ?
    `);
    updateConnectionStmt.run(now(), userEmail);

    console.log(`User logged out: ${userEmail}`);

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
