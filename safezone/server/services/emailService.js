const nodemailer = require('nodemailer');

// Gmail configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'modeblackmng@gmail.com',
    pass: 'dazcybxywevjoptd'
  }
});

// Send confirmation email
async function sendConfirmationEmail(email, username, confirmationCode) {
  const mailOptions = {
    from: '"SafeZone" <modeblackmng@gmail.com>',
    to: email,
    subject: 'SafeZone - Email Verification',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f3f4f6;
            padding: 60px 40px;
            border-radius: 8px;
          }
          .message-title {
            font-size: 32px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-text {
            font-size: 16px;
            color: #6b7280;
            margin-bottom: 40px;
          }
          .code-container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            margin: 30px 0;
          }
          .code {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 0;
          }
          .expiry-text {
            font-size: 15px;
            color: #6b7280;
            margin: 30px 0 10px 0;
          }
          .disclaimer {
            font-size: 15px;
            color: #6b7280;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #9ca3af;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Secure Authentication System</p>
          </div>

          <div class="content">
            <h2 class="message-title">Email Verification</h2>
            <p class="message-text">Please use the following code to complete your registration:</p>

            <div class="code-container">
              <p class="code">${confirmationCode}</p>
            </div>

            <p class="expiry-text">This code will expire in 10 minutes.</p>
            <p class="disclaimer">If you didn't request this code, please ignore this email.</p>
          </div>

          <div class="footer">
            SafeZone Security System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
}

// Send recovery code email (when user first signs up)
async function sendRecoveryCodeEmail(email, username, recoveryCode) {
  const mailOptions = {
    from: '"SafeZone" <modeblackmng@gmail.com>',
    to: email,
    subject: 'SafeZone - Password Recovery Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f3f4f6;
            padding: 60px 40px;
            border-radius: 8px;
          }
          .message-title {
            font-size: 32px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-text {
            font-size: 16px;
            color: #6b7280;
            margin-bottom: 40px;
          }
          .code-container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            margin: 30px 0;
          }
          .code {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 0;
          }
          .expiry-text {
            font-size: 15px;
            color: #6b7280;
            margin: 30px 0 10px 0;
          }
          .disclaimer {
            font-size: 15px;
            color: #6b7280;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #9ca3af;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Secure Authentication System</p>
          </div>

          <div class="content">
            <h2 class="message-title">Password Recovery</h2>
            <p class="message-text">Please use the following code to reset your password:</p>

            <div class="code-container">
              <p class="code">${recoveryCode}</p>
            </div>

            <p class="expiry-text">This code will expire in 10 minutes.</p>
            <p class="disclaimer">If you didn't request this code, please ignore this email.</p>
          </div>

          <div class="footer">
            SafeZone Security System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Recovery code email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending recovery code email:', error);
    throw error;
  }
}

// Send password reset notification
async function sendPasswordResetNotification(email, username) {
  const mailOptions = {
    from: '"SafeZone" <modeblackmng@gmail.com>',
    to: email,
    subject: 'SafeZone - Password Reset Successful',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f3f4f6;
            padding: 40px;
            border-radius: 8px;
            text-align: left;
          }
          .greeting {
            font-size: 16px;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-title {
            font-size: 24px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-text {
            font-size: 16px;
            color: #374151;
            margin-bottom: 15px;
            line-height: 1.6;
          }
          .signature {
            margin-top: 30px;
            font-size: 16px;
            color: #111827;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #9ca3af;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Secure Authentication System</p>
          </div>

          <div class="content">
            <p class="greeting">Hello ${username},</p>

            <p class="message-title">Password Reset Successful</p>

            <p class="message-text">Your SafeZone account password has been successfully reset.</p>

            <p class="message-text">If you did not perform this action, please contact support immediately.</p>

            <p class="message-text">You can now log in with your new password.</p>

            <p class="signature">Best regards,<br>The SafeZone Team</p>
          </div>

          <div class="footer">
            SafeZone Security System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset notification:', error);
    throw error;
  }
}

// Send login failure notification
async function sendLoginFailureNotification(email, username, attempts, location, country, timestamp) {
  const mailOptions = {
    from: '"SafeZone Security" <modeblackmng@gmail.com>',
    to: email,
    subject: `SafeZone - Failed Login Attempt`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f3f4f6;
            padding: 40px;
            border-radius: 8px;
            text-align: left;
          }
          .greeting {
            font-size: 16px;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-title {
            font-size: 24px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 10px;
          }
          .message-text {
            font-size: 16px;
            color: #374151;
            margin-bottom: 30px;
          }
          .details-title {
            font-size: 18px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 15px;
          }
          .detail-item {
            font-size: 16px;
            color: #374151;
            margin: 8px 0;
            line-height: 1.6;
          }
          .instructions {
            margin-top: 30px;
            font-size: 15px;
            color: #374151;
            line-height: 1.8;
          }
          .signature {
            margin-top: 30px;
            font-size: 16px;
            color: #111827;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #9ca3af;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Secure Authentication System</p>
          </div>

          <div class="content">
            <p class="greeting">Hello ${username},</p>

            <p class="message-title">Failed Login Attempt Detected</p>
            <p class="message-text">We detected a failed login attempt on your SafeZone account.</p>

            <p class="details-title">Attempt Details:</p>
            <div class="detail-item">GPS coordinate: ${location || 'Unknown'}</div>
            <div class="detail-item">Country: ${country || 'Unknown'}</div>
            <div class="detail-item">Time: ${new Date(timestamp).toLocaleString()}</div>

            <div class="instructions">
              If this was you, you can safely ignore this email<br>
              If this wasn't you, please secure your account immediately by changing your password<br>
              Consider enabling two-factor authentication if available<br>
              Check your account for any unauthorized access
            </div>

            <p class="signature">Best regards,<br>The SafeZone Security Team</p>
          </div>

          <div class="footer">
            SafeZone Security System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Login failure notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending login failure notification:', error);
    throw error;
  }
}

async function sendCowRecoveryNotification(email, username, cowNames, recoveryId, recoveryCode, agentId, expiresAt) {
  // Support both array and single string for backward compatibility
  const cowNamesArray = Array.isArray(cowNames) ? cowNames : [cowNames];
  const cowCount = cowNamesArray.length;
  const cowListHtml = cowNamesArray.map(name => `<li style="margin: 5px 0;">${name}</li>`).join('');

  const mailOptions = {
    from: '"SafeZone Recovery" <modeblackmng@gmail.com>',
    to: email,
    subject: `SafeZone - Cow Recovery Request Created (${cowCount} ${cowCount === 1 ? 'Cow' : 'Cows'})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f3f4f6;
            padding: 40px;
            border-radius: 8px;
            text-align: left;
          }
          .greeting {
            font-size: 16px;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-title {
            font-size: 24px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 10px;
          }
          .message-text {
            font-size: 16px;
            color: #374151;
            margin-bottom: 30px;
          }
          .details-title {
            font-size: 18px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 15px;
          }
          .detail-item {
            font-size: 16px;
            color: #374151;
            margin: 8px 0;
            line-height: 1.6;
          }
          .cow-list {
            background-color: #ffffff;
            padding: 20px;
            border-radius: 6px;
            margin: 15px 0;
          }
          .cow-list ul {
            margin: 0;
            padding-left: 20px;
            list-style-type: disc;
          }
          .cow-list li {
            font-size: 16px;
            color: #374151;
            margin: 5px 0;
          }
          .recovery-code {
            background-color: #dc2626;
            color: white;
            padding: 15px 30px;
            border-radius: 6px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 3px;
            margin: 20px 0;
            display: inline-block;
          }
          .instructions {
            margin-top: 30px;
            font-size: 15px;
            color: #374151;
            line-height: 1.8;
          }
          .signature {
            margin-top: 30px;
            font-size: 16px;
            color: #111827;
          }
          .footer {
            margin-top: 40px;
            font-size: 14px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Collaborative Cow Recovery System</p>
          </div>

          <div class="content">
            <p class="greeting">Hello ${username},</p>

            <p class="message-title">Cow Recovery Request Created</p>
            <p class="message-text">A recovery request has been created for ${cowCount === 1 ? 'your lost cow' : `${cowCount} lost cows`}.</p>

            <p class="details-title">Lost ${cowCount === 1 ? 'Cow' : 'Cows'}:</p>
            <div class="cow-list">
              <ul>
                ${cowListHtml}
              </ul>
            </div>

            <p class="details-title">Recovery Details:</p>
            <div class="detail-item"><strong>Recovery ID:</strong> ${recoveryId}</div>
            <div class="detail-item"><strong>Total Cows:</strong> ${cowCount}</div>
            <div class="detail-item"><strong>Agent ID:</strong> ${agentId || 'Virtual Agent'}</div>
            <div class="detail-item"><strong>Expires:</strong> ${new Date(expiresAt).toLocaleString()}</div>

            ${recoveryCode ? `
            <div style="text-align: center; margin: 30px 0;">
              <p class="details-title">Recovery Code:</p>
              <div class="recovery-code">${recoveryCode}</div>
            </div>

            <div class="instructions">
              Share this 4-digit code with the person helping you recover your ${cowCount === 1 ? 'cow' : 'cows'}.<br>
              They will need to enter this code on the recovery page to access the tracking information.<br><br>
              The recovery code will expire on ${new Date(expiresAt).toLocaleString()}.<br>
              You can track the recovery progress in real-time through your SafeZone app.
            </div>
            ` : `
            <div class="instructions">
              This is a virtual agent recovery request.<br>
              You can track the recovery progress in real-time through your SafeZone app.<br>
              The recovery request will expire on ${new Date(expiresAt).toLocaleString()}.
            </div>
            `}

            <p class="signature">Best regards,<br>The SafeZone Recovery Team</p>
          </div>

          <div class="footer">
            SafeZone Cow Recovery System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Cow recovery notification sent (${cowCount} cows):`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending cow recovery notification:', error);
    throw error;
  }
}

// Send recovery completion notification
async function sendRecoveryCompletionNotification(email, username, cowNames, recoveryId, totalTime) {
  // Support both array and single string for backward compatibility
  const cowNamesArray = Array.isArray(cowNames) ? cowNames : [cowNames];
  const cowCount = cowNamesArray.length;
  const cowListHtml = cowNamesArray.map(name => `<li style="margin: 5px 0;">${name}</li>`).join('');

  const mailOptions = {
    from: '"SafeZone Recovery" <modeblackmng@gmail.com>',
    to: email,
    subject: `SafeZone - Recovery Completed Successfully (${cowCount} ${cowCount === 1 ? 'Cow' : 'Cows'})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
          }
          .header {
            margin-bottom: 10px;
          }
          .title {
            color: #22c55e;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 40px 0;
          }
          .content {
            background-color: #f0fdf4;
            padding: 40px;
            border-radius: 8px;
            text-align: left;
          }
          .greeting {
            font-size: 16px;
            color: #111827;
            margin-bottom: 20px;
          }
          .message-title {
            font-size: 24px;
            font-weight: bold;
            color: #15803d;
            margin-bottom: 10px;
          }
          .message-text {
            font-size: 16px;
            color: #374151;
            margin-bottom: 30px;
          }
          .details-title {
            font-size: 18px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 15px;
          }
          .detail-item {
            font-size: 16px;
            color: #374151;
            margin: 8px 0;
            line-height: 1.6;
          }
          .cow-list {
            background-color: #ffffff;
            padding: 20px;
            border-radius: 6px;
            margin: 15px 0;
          }
          .cow-list ul {
            margin: 0;
            padding-left: 20px;
            list-style-type: disc;
          }
          .cow-list li {
            font-size: 16px;
            color: #374151;
            margin: 5px 0;
          }
          .success-badge {
            background-color: #22c55e;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0;
            display: inline-block;
          }
          .signature {
            margin-top: 30px;
            font-size: 16px;
            color: #111827;
          }
          .footer {
            margin-top: 40px;
            font-size: 14px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Collaborative Cow Recovery System</p>
          </div>

          <div class="content">
            <p class="greeting">Hello ${username},</p>

            <p class="message-title">Recovery Completed Successfully!</p>
            <p class="message-text">Great news! All ${cowCount === 1 ? 'your cow has' : `${cowCount} cows have`} been successfully recovered and returned to the safe zone.</p>

            <div style="text-align: center;">
              <div class="success-badge">All Cows Safe</div>
            </div>

            <p class="details-title">Recovered ${cowCount === 1 ? 'Cow' : 'Cows'}:</p>
            <div class="cow-list">
              <ul>
                ${cowListHtml}
              </ul>
            </div>

            <p class="details-title">Recovery Summary:</p>
            <div class="detail-item"><strong>Recovery ID:</strong> ${recoveryId}</div>
            <div class="detail-item"><strong>Total Cows Recovered:</strong> ${cowCount}</div>
            ${totalTime ? `<div class="detail-item"><strong>Total Time:</strong> ${totalTime}</div>` : ''}
            <div class="detail-item"><strong>Completed:</strong> ${new Date().toLocaleString()}</div>

            <p class="message-text" style="margin-top: 30px;">
              Thank you for using SafeZone's collaborative recovery system. Your livestock are now safely back inside the fence.
            </p>

            <p class="signature">Best regards,<br>The SafeZone Recovery Team</p>
          </div>

          <div class="footer">
            SafeZone Cow Recovery System
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Recovery completion notification sent (${cowCount} cows):`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending recovery completion notification:', error);
    throw error;
  }
}

// Send zone2 breach alarm notification
async function sendZone2BreachEmail(email, username, cowData) {
  const mailOptions = {
    from: '"SafeZone Alerts" <modeblackmng@gmail.com>',
    to: email,
    subject: `SafeZone ALERT - ${cowData.cowNickname || cowData.cowName} in Warning Zone`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
          }
          .header {
            text-align: center;
            padding: 40px 20px 20px 20px;
            background-color: #ffffff;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 0 0;
            font-weight: 400;
          }
          .content {
            padding: 40px;
            text-align: left;
          }
          .info-item {
            font-size: 24px;
            margin: 20px 0;
            line-height: 1.5;
          }
          .label {
            font-weight: bold;
            color: #111827;
          }
          .value {
            font-weight: 400;
            color: #4b5563;
          }
          .section-title {
            font-size: 32px;
            font-weight: bold;
            color: #111827;
            margin: 40px 0 20px 0;
          }
          .alert-message {
            font-size: 20px;
            color: #4b5563;
            line-height: 1.6;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Intelligent Cow Tracking & Farm Management</p>
          </div>

          <div class="content">
            <div class="info-item"><span class="label">Cow ID:</span> <span class="value">${cowData.cowToken}</span></div>
            <div class="info-item"><span class="label">Alarm Type:</span> <span class="value">warning zone</span></div>
            <div class="info-item"><span class="label">Speed:</span> <span class="value">N/A</span></div>
            <div class="info-item"><span class="label">Tag:</span> <span class="value">roaming</span></div>
            <div class="info-item"><span class="label">Time:</span> <span class="value">${new Date(cowData.timestamp).toLocaleString('en-CA', { hour12: false }).replace(',', ',')}</span></div>
            <div class="info-item"><span class="label">Position:</span> <span class="value">${cowData.latitude}, ${cowData.longitude}</span></div>

            <div class="section-title">Alert Details</div>
            <p class="alert-message">Cow has entered warning zone (0-50m outside fence).</p>
            <p class="alert-message">Attention required for livestock safety.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Zone2 breach email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending zone2 breach email:', error);
    throw error;
  }
}

// Send line2 breach alarm notification
async function sendLine2BreachEmail(email, username, cowData) {
  const mailOptions = {
    from: '"SafeZone Alerts" <modeblackmng@gmail.com>',
    to: email,
    subject: `SafeZone ALERT - ${cowData.cowNickname || cowData.cowName} in DANGER ZONE`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
          }
          .header {
            text-align: center;
            padding: 40px 20px 20px 20px;
            background-color: #ffffff;
          }
          .title {
            color: #dc2626;
            font-size: 48px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #6b7280;
            font-size: 18px;
            margin: 10px 0 0 0;
            font-weight: 400;
          }
          .content {
            padding: 40px;
            text-align: left;
          }
          .info-item {
            font-size: 24px;
            margin: 20px 0;
            line-height: 1.5;
          }
          .label {
            font-weight: bold;
            color: #111827;
          }
          .value {
            font-weight: 400;
            color: #4b5563;
          }
          .section-title {
            font-size: 32px;
            font-weight: bold;
            color: #111827;
            margin: 40px 0 20px 0;
          }
          .alert-message {
            font-size: 20px;
            color: #4b5563;
            line-height: 1.6;
            margin: 20px 0;
          }
          .recovery-link {
            display: inline-block;
            background-color: #dc2626;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
            font-size: 18px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">SafeZone</h1>
            <p class="subtitle">Intelligent Cow Tracking & Farm Management</p>
          </div>

          <div class="content">
            <div class="info-item"><span class="label">Cow ID:</span> <span class="value">${cowData.cowToken}</span></div>
            <div class="info-item"><span class="label">Alarm Type:</span> <span class="value">danger zone</span></div>
            <div class="info-item"><span class="label">Speed:</span> <span class="value">N/A</span></div>
            <div class="info-item"><span class="label">Tag:</span> <span class="value">emergency</span></div>
            <div class="info-item"><span class="label">Time:</span> <span class="value">${new Date(cowData.timestamp).toLocaleString('en-CA', { hour12: false }).replace(',', ',')}</span></div>
            <div class="info-item"><span class="label">Position:</span> <span class="value">${cowData.latitude}, ${cowData.longitude}</span></div>

            <div class="section-title">Alert Details</div>
            <p class="alert-message">URGENT: Cow has crossed into the danger zone (more than 50 meters outside the fence).</p>
            <p class="alert-message">Immediate action required for livestock safety and recovery.</p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/html/page17_collaborative-cow-recovery.html?cow=${cowData.cowToken}" class="recovery-link">
                Start Collaborative Recovery
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Line2 breach email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending line2 breach email:', error);
    throw error;
  }
}

module.exports = {
  sendConfirmationEmail,
  sendRecoveryCodeEmail,
  sendPasswordResetNotification,
  sendLoginFailureNotification,
  sendCowRecoveryNotification,
  sendRecoveryCompletionNotification,
  sendZone2BreachEmail,
  sendLine2BreachEmail
};
