const API_BASE_URL = window.location.origin + '/api';
let currentUser = null;
let authToken = null;
let wsConnection = null;
let currentTrendIndex = 0;
let trendInterval = null;
let map = null;
let drawingManager = null;
let drawnItems = null;
let currentFences = [];
let currentCows = [];
let selectedFarmName = null;
let selectedFarmToken = null;
let farmsData = [];
let farmMarkers = [];
let showFarmMarkers = true;
let showFences = true;
let showCowNicknames = false;
let farmEditorMarker = null;

// Make essential variables globally accessible for virtual controller and alarm system
window.currentCows = currentCows;
window.currentFences = currentFences;
window.wsConnection = wsConnection;
window.map = map;

// Helper function to get the correct real-time tracking page based on user type
function getRealTimeTrackingPage() {
    const userType = localStorage.getItem('userType');
    if (userType === 'developer') {
        return '/html/page19_dev-real-time-tracking.html';
    }
    return '/html/page6_real-time-tracking.html';
}

// Update all navigation links based on user type
function updateNavigationLinksForUserType() {
    const userType = localStorage.getItem('userType');
    const realTimeTrackingUrl = getRealTimeTrackingPage();

    // Update all links that point to real-time tracking
    const allLinks = document.querySelectorAll('a[href*="page6_real-time-tracking"]');
    allLinks.forEach(link => {
        link.href = realTimeTrackingUrl;
        // Update text if it's a developer
        if (userType === 'developer' && link.textContent.includes('Real-time Tracking')) {
            link.textContent = 'Dev Real-time Tracking';
        }
    });

    // Also update any onclick handlers or buttons
    const trackingButtons = document.querySelectorAll('button[onclick*="page6_real-time-tracking"]');
    trackingButtons.forEach(btn => {
        const currentOnClick = btn.getAttribute('onclick');
        btn.setAttribute('onclick', currentOnClick.replace('page6_real-time-tracking', userType === 'developer' ? 'page19_dev-real-time-tracking' : 'page6_real-time-tracking'));
    });
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initializePage();
    setupCrossTabSessionManagement();

    // Load notification badge on all pages (except login/signup)
    if (authToken) {
        loadNotificationBadge();
    }

    if (window.location.pathname.includes('page2_dashboard')) {
        initializeDashboard();
    } else if (window.location.pathname.includes('page5_editing-fence')) {
        initializeFenceEditor();
    } else if (window.location.pathname.includes('page6_real-time-tracking') || window.location.pathname.includes('page19_dev-real-time-tracking')) {
        initializeTracking();
    } else if (window.location.pathname.includes('page7_assistive-collaboration')) {
        initializeCollaborative();
    } else if (window.location.pathname.includes('page10_customize-alerts')) {
        initializeAlerts();
    }
});

function checkAuthStatus() {
    authToken = localStorage.getItem('authToken');
    currentUser = localStorage.getItem('safezone_user');

    const publicPages = ['index.html', 'page12_sign-up.html', 'page11_log-out.html', ''];
    const currentPage = window.location.pathname.split('/').pop();

    if (!authToken && !publicPages.includes(currentPage) && !window.location.pathname.includes('page7_assistive-collaboration')) {
        window.location.href = '/html/index.html';
        return;
    }

    if (authToken && (currentPage === 'index.html' || currentPage === 'page12_sign-up.html')) {
        window.location.href = '/html/page2_dashboard.html';
        return;
    }
}

// Cross-tab session management - prevents users from logging each other out
function setupCrossTabSessionManagement() {
    // Store the current session info when page loads
    const currentSessionUser = localStorage.getItem('safezone_user');
    const currentSessionToken = localStorage.getItem('authToken');

    // Skip if on public pages
    const publicPages = ['index.html', 'page12_sign-up.html', 'page11_log-out.html', ''];
    const currentPage = window.location.pathname.split('/').pop();
    if (publicPages.includes(currentPage) || window.location.pathname.includes('page7_assistive-collaboration')) {
        return;
    }

    // Listen for storage changes (when another tab logs in/out)
    window.addEventListener('storage', function(e) {
        // Only handle authToken and safezone_user changes
        if (e.key !== 'authToken' && e.key !== 'safezone_user') {
            return;
        }

        const newUser = localStorage.getItem('safezone_user');
        const newToken = localStorage.getItem('authToken');

        console.log('🔄 Storage change detected:', {
            oldUser: currentSessionUser,
            newUser: newUser,
            changed: currentSessionUser !== newUser
        });

        // If the user or token changed, another user logged in
        if (currentSessionUser !== newUser || currentSessionToken !== newToken) {
            console.log('WARNING: Different user logged in. Current tab user:', currentSessionUser, '→ New user:', newUser);

            // Show notification
            if (confirm(`Another user (${newUser || 'unknown'}) has logged in. You will be redirected to the login page.\n\nClick OK to continue.`)) {
                window.location.href = '/html/index.html';
            } else {
                // User cancelled, force redirect anyway after 3 seconds
                setTimeout(() => {
                    window.location.href = '/html/index.html';
                }, 3000);
            }
        }
    });

    console.log('Cross-tab session management active for user:', currentSessionUser);
}

function initializePage() {
    const menuBtn = document.getElementById('menuBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');

    if (menuBtn && dropdownMenu) {
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        document.addEventListener('click', function() {
            dropdownMenu.classList.remove('show');
        });
    }

    // Update navigation links based on user type
    updateNavigationLinksForUserType();
    
    // Make logo clickable to go to dashboard
    const headerLogo = document.querySelector('.header-logo');
    if (headerLogo && authToken) {
        headerLogo.style.cursor = 'pointer';
        headerLogo.addEventListener('click', () => window.location.href = '/html/page2_dashboard.html');
    }
    
    // Handle navigation buttons
    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
        signupBtn.addEventListener('click', () => window.location.href = '/html/page12_sign-up.html');
    }
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => window.location.href = '/html/index.html');
    }
    
    // Handle header navigation
    const headerBtns = document.querySelectorAll('.header-btn');
    headerBtns.forEach(btn => {
        const nav = btn.getAttribute('data-nav');
        if (nav === 'notifications') {
            btn.addEventListener('click', () => window.location.href = '/html/page3_notification.html');
        } else if (nav === 'profile') {
            btn.addEventListener('click', () => window.location.href = '/html/page9_user-profile.html');
        } else if (btn.innerHTML.includes('🔔')) {
            btn.addEventListener('click', () => window.location.href = '/html/page3_notification.html');
        } else if (btn.innerHTML.includes('👤')) {
            btn.addEventListener('click', () => window.location.href = '/html/page9_user-profile.html');
        }
    });
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsRead);
    }
    
    if (window.location.pathname.includes('page3_notification')) {
        loadNotifications();
    } else if (window.location.pathname.includes('page4_read-a-notification')) {
        loadNotificationDetail();
    } else if (window.location.pathname.includes('page9_user-profile')) {
        initializeProfile();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const errorElement = document.getElementById('errorMessage');
    
    if (!email || !password) {
        showError(errorElement, 'Email and password are required');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                email, 
                password,
                gps: await getCurrentLocation()
            }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('safezone_user', data.farmer_id);
            window.location.href = '/html/page2_dashboard.html';
        } else {
            showError(errorElement, data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorElement, 'Network error. Please try again.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const errorElement = document.getElementById('errorMessage');
    
    if (!email || !password) {
        showError(errorElement, 'Email and password are required');
        return;
    }
    
    if (password.length < 10) {
        showError(errorElement, 'Password must be at least 10 characters long');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('safezone_user', data.farmer_id);
            window.location.href = '/html/page2_dashboard.html';
        } else {
            showError(errorElement, data.error || 'Signup failed');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showError(errorElement, 'Network error. Please try again.');
    }
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.color = '#ef4444';
    }
}

async function getCurrentLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            // Options for geolocation
            // enableHighAccuracy: false - Prefer WiFi/network-based location (faster, works indoors)
            // timeout: 10000 - Maximum 10 seconds to get location
            // maximumAge: 300000 - Accept cached position up to 5 minutes old
            const options = {
                enableHighAccuracy: false,  // Use WiFi/network positioning instead of GPS
                timeout: 10000,              // 10 second timeout
                maximumAge: 300000           // Cache position for 5 minutes
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve(`${position.coords.latitude},${position.coords.longitude}`);
                },
                () => {
                    // Fallback to 0,0 if location fails
                    resolve('0,0');
                },
                options
            );
        } else {
            resolve('0,0');
        }
    });
}

async function initializeDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            createCharts(data);
        }
    } catch (error) {
        console.error('Dashboard initialization error:', error);
    }
    
    initializeTrendSlider();
    connectWebSocket();
}

function createCharts(data) {
    const alarmChart = document.getElementById('alarmChart');
    const cowChart = document.getElementById('cowChart');
    
    if (alarmChart && typeof Chart !== 'undefined') {
        new Chart(alarmChart, {
            type: 'line',
            data: {
                labels: data.alarmStats.map(stat => stat.date),
                datasets: [{
                    label: 'Total Alarms',
                    data: data.alarmStats.map(stat => stat.total_alarms),
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }
    
    if (cowChart && typeof Chart !== 'undefined') {
        new Chart(cowChart, {
            type: 'doughnut',
            data: {
                labels: data.topCows.map(cow => cow.cow_id),
                datasets: [{
                    data: data.topCows.map(cow => cow.breach_count),
                    backgroundColor: [
                        '#dc2626',
                        '#f59e0b',
                        '#10b981',
                        '#3b82f6',
                        '#8b5cf6'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                }
            }
        });
    }
}

function initializeTrendSlider() {
    const trendImages = document.querySelectorAll('.trend-image');
    if (trendImages.length === 0) return;
    
    trendInterval = setInterval(() => {
        trendImages[currentTrendIndex].classList.remove('active');
        currentTrendIndex = (currentTrendIndex + 1) % trendImages.length;
        trendImages[currentTrendIndex].classList.add('active');
    }, 10000);
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    wsConnection = new WebSocket(wsUrl);
    window.wsConnection = wsConnection; // Make globally accessible

    wsConnection.onopen = function() {
        console.log('WebSocket connected');
    };
    
    wsConnection.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            handleRealtimeUpdate(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
    
    wsConnection.onclose = function() {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 5000);
    };
}

function handleRealtimeUpdate(data) {
    if (data.type === 'alarm') {
        updateNotificationBadge();
        if (window.location.pathname.includes('realtime-tracking')) {
            updateAlarmPanel(data);
        }
    } else if (data.type === 'cow_location') {
        if (window.location.pathname.includes('realtime-tracking')) {
            updateCowPosition(data);
        }
    } else if (data.type === 'virtual_cow_position') {
        // Handle virtual cow position updates in real-time
        if (window.location.pathname.includes('realtime-tracking')) {
            updateVirtualCowPosition(data);
        }
    }
}

function updateNotificationBadge() {
    const badges = document.querySelectorAll('.notification-badge');
    badges.forEach(badge => {
        const current = parseInt(badge.textContent) || 0;
        const newCount = current + 1;
        badge.textContent = newCount;
        badge.style.display = newCount > 0 ? 'block' : 'none';
    });
}

// Load notification badge count on all pages
async function loadNotificationBadge() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/notifications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const unreadCount = data.notifications ? data.notifications.filter(n => !n.is_read).length : 0;

            const badges = document.querySelectorAll('.notification-badge');
            badges.forEach(badge => {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'block';
                } else {
                    badge.textContent = '';
                    badge.style.display = 'none';
                }
            });
        }
    } catch (error) {
        console.error('Load notification badge error:', error);
    }
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/notifications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const notificationsList = document.getElementById('notificationsList');

            if (!notificationsList) return;

            // Clear existing notifications
            notificationsList.innerHTML = '';

            if (data.notifications && data.notifications.length > 0) {
                // Render each notification
                data.notifications.forEach(notification => {
                    const notificationDiv = document.createElement('div');
                    notificationDiv.className = `notification-item ${notification.is_read ? 'read' : 'unread'}`;
                    notificationDiv.onclick = () => openNotification(notification.notification_id);

                    // Format the notification title and message based on type
                    let title = 'Notification';
                    let message = notification.message; // Custom message if provided

                    if (notification.message_type === 'login fail attempt') {
                        title = 'Failed Login Attempt';
                        if (!message) {
                            message = 'Multiple failed login attempts detected on your account. Please verify your recent activity.';
                        }
                    } else if (notification.message_type === 'change of password') {
                        title = 'Password Changed';
                        if (!message) {
                            const timestamp = notification.metadata?.timestamp ? new Date(notification.metadata.timestamp).toLocaleString() : 'recently';
                            message = `Your password was changed ${timestamp}.`;
                        }
                    } else if (notification.message_type === 'change of username') {
                        title = 'Username Changed';
                        if (!message) {
                            message = 'Your username has been successfully updated.';
                        }
                    } else if (notification.message_type === 'change of email address') {
                        title = 'Email Changed';
                        if (!message) {
                            const newEmail = notification.metadata?.newEmail || 'your new email';
                            message = `Your email address was changed to ${newEmail}.`;
                        }
                    } else if (notification.message_type === 'cow break line2 alarm') {
                        title = 'Cow Breach Alert';
                        if (!message) {
                            const cowName = notification.metadata?.cowName || 'A cow';
                            const location = notification.metadata?.location || 'unknown location';
                            message = `${cowName} has breached the fence at ${location}.`;
                        }
                    } else if (notification.message_type === 'cow recovery attempt') {
                        title = 'Cow Recovery Attempt';
                        if (!message) {
                            const cowName = notification.metadata?.cowName || 'A cow';
                            const helperName = notification.metadata?.helperName || 'someone';
                            const recoveryId = notification.metadata?.recoveryId;
                            message = `${helperName} is attempting to recover ${cowName}${recoveryId ? ` (${recoveryId})` : ''}.`;
                        }
                    } else if (notification.message_type === 'new cow added registration') {
                        title = 'New Cow Registered';
                        if (!message) {
                            const cowName = notification.metadata?.cowName || 'A cow';
                            const collarId = notification.metadata?.collarId || 'unknown collar';
                            message = `${cowName} (${collarId}) has been registered to your farm.`;
                        }
                    } else if (notification.message_type === 'daily report') {
                        title = 'Daily Report';
                        if (!message) {
                            message = 'Your daily farm report is ready for review.';
                        }
                    }

                    // Format timestamp
                    const timeAgo = getTimeAgo(notification.timestamp);

                    notificationDiv.innerHTML = `
                        <div class="notification-content">
                            <div class="notification-title">${title}</div>
                            <div class="notification-preview">${message || 'No preview available'}</div>
                            <div class="notification-time">${timeAgo}</div>
                        </div>
                    `;

                    notificationsList.appendChild(notificationDiv);
                });

                // Update notification badge count
                const unreadCount = data.notifications.filter(n => !n.is_read).length;
                const badges = document.querySelectorAll('.notification-badge');
                badges.forEach(badge => {
                    badge.textContent = unreadCount;
                    badge.style.display = unreadCount > 0 ? 'block' : 'none';
                });
            } else {
                // No notifications
                notificationsList.innerHTML = '<div class="no-notifications">No notifications yet</div>';

                const badges = document.querySelectorAll('.notification-badge');
                badges.forEach(badge => {
                    badge.textContent = '';
                    badge.style.display = 'none';
                });
            }
        }
    } catch (error) {
        console.error('Load notifications error:', error);
    }
}

// Helper function to format time ago
function getTimeAgo(timestamp) {
    const now = new Date();

    // Try both UTC and local time interpretations
    // Old notifications (before fix) use UTC, new ones use local time
    const localTimestamp = timestamp.replace(' ', 'T');
    const utcTimestamp = timestamp.replace(' ', 'T') + 'Z';

    const notificationTimeLocal = new Date(localTimestamp);
    const notificationTimeUTC = new Date(utcTimestamp);

    const diffMsLocal = now - notificationTimeLocal;
    const diffMsUTC = now - notificationTimeUTC;

    // If local interpretation gives a time in the future (negative diff),
    // or if local diff is > 1 hour while UTC diff is < 1 hour,
    // then it's a UTC timestamp
    let diffMs;
    if (diffMsLocal < 0 || (Math.abs(diffMsLocal - diffMsUTC) > 3600000 && diffMsUTC > 0 && diffMsUTC < diffMsLocal)) {
        // Use UTC interpretation
        diffMs = diffMsUTC;
    } else {
        // Use local interpretation
        diffMs = diffMsLocal;
    }

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        return (diffMs === diffMsUTC ? notificationTimeUTC : notificationTimeLocal).toLocaleDateString();
    }
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/notifications/mark-all-read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Update UI
            const notifications = document.querySelectorAll('.notification-item.unread');
            notifications.forEach(notification => {
                notification.classList.remove('unread');
                notification.classList.add('read');
            });

            // Update badges
            const badges = document.querySelectorAll('.notification-badge');
            badges.forEach(badge => {
                badge.textContent = '0';
                badge.style.display = 'none';
            });
        }
    } catch (error) {
        console.error('Mark all notifications as read error:', error);
    }
}

async function openNotification(id) {
    try {
        // Mark notification as read
        const response = await fetch(`${API_BASE_URL}/dashboard/notifications/${id}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            // Update badge immediately
            const badges = document.querySelectorAll('.notification-badge');
            badges.forEach(badge => {
                const current = parseInt(badge.textContent) || 0;
                const newCount = Math.max(0, current - 1);
                if (newCount > 0) {
                    badge.textContent = newCount;
                    badge.style.display = 'block';
                } else {
                    badge.textContent = '';
                    badge.style.display = 'none';
                }
            });

            // Store notification ID and navigate
            localStorage.setItem('notification_id', id);
            window.location.href = '/html/page4_read-a-notification.html';
        } else {
            console.error('Failed to mark notification as read');
            // Still navigate even if marking as read fails
            localStorage.setItem('notification_id', id);
            window.location.href = '/html/page4_read-a-notification.html';
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
        // Still navigate even if error occurs
        localStorage.setItem('notification_id', id);
        window.location.href = '/html/page4_read-a-notification.html';
    }
}

async function loadNotificationDetail() {
    const notificationId = localStorage.getItem('notification_id');
    if (!notificationId) {
        window.location.href = '/html/page3_notification.html';
        return;
    }

    try {
        // Fetch all notifications
        const response = await fetch(`${API_BASE_URL}/dashboard/notifications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const notification = data.notifications.find(n => n.notification_id === parseInt(notificationId));

            if (notification) {
                // Get notification type title and message
                let title = 'Notification';
                let message = notification.message; // Custom message if provided

                if (notification.message_type === 'login fail attempt') {
                    title = 'Failed Login Attempt';
                    if (!message) {
                        message = 'Multiple failed login attempts detected on your account. Please verify your recent activity. If this wasn\'t you, consider changing your password immediately.';
                    }
                } else if (notification.message_type === 'change of password') {
                    title = 'Password Changed';
                    if (!message) {
                        const timestamp = notification.metadata?.timestamp ? new Date(notification.metadata.timestamp).toLocaleString() : 'recently';
                        message = `Your password was changed ${timestamp}. If you did not make this change, please contact support immediately.`;
                    }
                } else if (notification.message_type === 'change of username') {
                    title = 'Username Changed';
                    if (!message) {
                        message = 'Your username has been successfully updated.';
                    }
                } else if (notification.message_type === 'change of email address') {
                    title = 'Email Changed';
                    if (!message) {
                        const oldEmail = notification.metadata?.oldEmail || 'your old email';
                        const newEmail = notification.metadata?.newEmail || 'your new email';
                        message = `Your email address was changed from ${oldEmail} to ${newEmail}.`;
                    }
                } else if (notification.message_type === 'cow break line2 alarm') {
                    title = 'Cow Breach Alert';
                    if (!message) {
                        const cowName = notification.metadata?.cowName || 'A cow';
                        const location = notification.metadata?.location || 'unknown location';
                        message = `${cowName} has breached the fence at ${location}. Please check the real-time tracking page for current location.`;
                    }
                } else if (notification.message_type === 'cow recovery attempt') {
                    title = 'Cow Recovery Attempt';
                    if (!message) {
                        const cowName = notification.metadata?.cowName || 'A cow';
                        const helperName = notification.metadata?.helperName || 'someone';
                        const recoveryId = notification.metadata?.recoveryId;
                        message = `${helperName} is attempting to recover ${cowName}${recoveryId ? ` (Recovery ID: ${recoveryId})` : ''}. You can track the recovery progress in real-time.`;
                    }
                } else if (notification.message_type === 'new cow added registration') {
                    title = 'New Cow Registered';
                    if (!message) {
                        const cowName = notification.metadata?.cowName || 'A cow';
                        const collarId = notification.metadata?.collarId || 'unknown collar';
                        message = `${cowName} with collar ID ${collarId} has been successfully registered to your farm.`;
                    }
                } else if (notification.message_type === 'daily report') {
                    title = 'Daily Report';
                    if (!message) {
                        message = 'Your daily farm report is ready for review. This report includes statistics on cow locations, fence breaches, and overall farm activity.';
                    }
                }

                // Update title
                document.getElementById('notificationTitle').textContent = title;

                // Format time
                const timeAgo = getTimeAgo(notification.timestamp);
                document.getElementById('notificationTime').textContent = timeAgo;

                // Update status
                const statusElement = document.getElementById('notificationStatus');
                statusElement.textContent = notification.is_read ? 'Read' : 'Unread';
                statusElement.className = notification.is_read ? 'notification-status read' : 'notification-status unread';

                // Update message body
                const bodyElement = document.getElementById('notificationBody');
                bodyElement.innerHTML = `<p>${message || 'No message available'}</p>`;

                // Add action buttons for cow breach notifications
                if (notification.message_type === 'cow break line2 alarm' && notification.cow_token) {
                    bodyElement.innerHTML += `
                        <div class="alert-actions" style="margin-top: 20px;">
                            <button class="btn btn-primary" onclick="window.location.href='page6_real-time-tracking.html'">View on Map</button>
                        </div>
                    `;
                }
            } else {
                document.getElementById('notificationTitle').textContent = 'Notification Not Found';
                document.getElementById('notificationBody').innerHTML = '<p>The notification could not be found.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading notification detail:', error);
        document.getElementById('notificationTitle').textContent = 'Error';
        document.getElementById('notificationBody').innerHTML = '<p>An error occurred while loading the notification.</p>';
    }
}

function generateCollaborativeLink() {
    const cowId = 'C001';
    
    fetch(`${API_BASE_URL}/collaborative/link`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cowId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.link) {
            navigator.clipboard.writeText(data.link);
            alert('Collaborative link copied to clipboard!');
        }
    })
    .catch(error => {
        console.error('Generate link error:', error);
    });
}

let selectedMethod = null;
let selectedCowGPS = null;
let deviceGPS = null;
let currentFarmName = null;
let currentFarmGPS = null;
let currentFarmToken = null;
let updatedFarmGPS = null;

// Define global fence editor functions (needed for both page5 and page14)
window.selectTool = function(tool) {
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const toolBtn = document.getElementById(tool + 'Tool');
    if (toolBtn) toolBtn.classList.add('active');

    if (drawingManager) {
        if (tool === 'polygon') {
            drawingManager._toolbars.draw._modes.polygon.handler.enable();
        } else {
            drawingManager._toolbars.draw._modes.polyline.handler.enable();
        }
    }
};

window.zoomIn = function() {
    if (map) map.zoomIn();
};

window.zoomOut = function() {
    if (map) map.zoomOut();
};

window.autoFocus = function() {
    if (map && currentFences.length > 0) {
        const bounds = currentFences[0].getBounds();
        map.fitBounds(bounds);
    }
};

window.searchLocation = function() {
    const searchInput = document.getElementById('locationSearchInput');
    if (!searchInput) return;

    const input = searchInput.value.trim();
    if (!input) {
        alert('Please enter coordinates (lat, lng)');
        return;
    }

    const coords = input.split(',').map(c => parseFloat(c.trim()));
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        const latitude = coords[0];
        const longitude = coords[1];

        // Navigate map to the location
        map.setView([latitude, longitude], 18);

        // Store the updated GPS coordinates
        updatedFarmGPS = `${latitude},${longitude}`;

        // Remove previous manual marker if exists
        if (window.manualFarmMarker) {
            map.removeLayer(window.manualFarmMarker);
        }

        // Create new marker at the searched location (KEEP original WiFi marker)
        window.manualFarmMarker = L.circleMarker([latitude, longitude], {
            radius: 10,
            fillColor: '#10b981', // Green color to differentiate from WiFi marker
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(map);

        // Add popup to the marker
        window.manualFarmMarker.bindPopup('<strong>Manual Farm Location</strong><br>Coordinates: ' + latitude + ', ' + longitude);
        window.manualFarmMarker.openPopup();

        // Show cancel button if exists
        const cancelBtn = document.getElementById('cancelLocationBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'block';
        }

        // Clear the search input
        searchInput.value = '';
    } else {
        alert('Invalid coordinates. Please use format: lat, lng (e.g., 35.20287, 33.36490)');
    }
};

// Cancel manual location and revert to WiFi positioning
window.cancelManualLocation = function() {
    // Remove manual marker if exists
    if (window.manualFarmMarker) {
        map.removeLayer(window.manualFarmMarker);
        window.manualFarmMarker = null;
    }

    // Remove freehand click listener if active
    if (window.freehandMarkerEnabled) {
        map.off('click', window.freehandClickHandler);
        window.freehandMarkerEnabled = false;
    }

    // Reset updatedFarmGPS to original farm GPS (from WiFi positioning)
    if (farmEditorMarker) {
        const originalLatLng = farmEditorMarker.getLatLng();
        updatedFarmGPS = `${originalLatLng.lat},${originalLatLng.lng}`;

        // Center map on original location
        map.setView(originalLatLng, 18);
        farmEditorMarker.openPopup();
    }

    // Hide cancel button
    const cancelBtn = document.getElementById('cancelLocationBtn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }

    // Update Mark Farm on Map button text
    const freehandBtn = document.querySelector('button[onclick="enableFreehandMarker()"]');
    if (freehandBtn) {
        freehandBtn.textContent = 'Mark Farm on Map';
        freehandBtn.classList.remove('btn-warning');
        freehandBtn.classList.add('btn-info');
    }
};

// Enable freehand marker - user clicks anywhere on map to place farm marker
window.enableFreehandMarker = function() {
    const freehandBtn = document.querySelector('button[onclick="enableFreehandMarker()"]');

    if (window.freehandMarkerEnabled) {
        // Disable freehand mode
        map.off('click', window.freehandClickHandler);
        window.freehandMarkerEnabled = false;

        if (freehandBtn) {
            freehandBtn.textContent = 'Mark Farm on Map';
            freehandBtn.classList.remove('btn-warning');
            freehandBtn.classList.add('btn-info');
        }
    } else {
        // Enable freehand mode
        window.freehandMarkerEnabled = true;

        if (freehandBtn) {
            freehandBtn.textContent = 'Click on Map (Active)';
            freehandBtn.classList.remove('btn-info');
            freehandBtn.classList.add('btn-warning');
        }

        // Create click handler
        window.freehandClickHandler = function(e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            // Remove previous manual marker if exists
            if (window.manualFarmMarker) {
                map.removeLayer(window.manualFarmMarker);
            }

            // Create new marker at clicked location
            window.manualFarmMarker = L.circleMarker([lat, lng], {
                radius: 10,
                fillColor: '#10b981', // Green color
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map);

            // Add popup
            window.manualFarmMarker.bindPopup('<strong>Manual Farm Location</strong><br>Coordinates: ' + lat.toFixed(6) + ', ' + lng.toFixed(6));
            window.manualFarmMarker.openPopup();

            // Update GPS coordinates
            updatedFarmGPS = `${lat},${lng}`;

            // Show cancel button
            const cancelBtn = document.getElementById('cancelLocationBtn');
            if (cancelBtn) {
                cancelBtn.style.display = 'block';
            }

            // Disable freehand mode after placing marker
            map.off('click', window.freehandClickHandler);
            window.freehandMarkerEnabled = false;

            if (freehandBtn) {
                freehandBtn.textContent = 'Mark Farm on Map';
                freehandBtn.classList.remove('btn-warning');
                freehandBtn.classList.add('btn-info');
            }
        };

        // Add click listener to map
        map.on('click', window.freehandClickHandler);
    }
};

window.toggleFarmMarkerInEditor = function(show) {
    if (farmEditorMarker) {
        if (show) {
            farmEditorMarker.addTo(map);
        } else {
            map.removeLayer(farmEditorMarker);
        }
    }
};

window.toggleFenceLinesInEditor = function(show) {
    if (drawnItems) {
        if (show) {
            drawnItems.addTo(map);
        } else {
            map.removeLayer(drawnItems);
        }
    }
};

window.deleteFence = function() {
    if (currentFences.length === 0) {
        alert('No fence to delete');
        return;
    }

    if (confirm('Are you sure you want to delete the current fence?')) {
        currentFences.forEach(fence => {
            drawnItems.removeLayer(fence);
        });
        currentFences = [];
        window.currentFences = currentFences;
        alert('Fence deleted');
    }
};

window.saveFence = async function() {
    const fenceName = document.getElementById('fenceNameInput').value;

    // Check if a fence has been drawn
    if (currentFences.length === 0) {
        alert('Please draw a fence first before saving!');
        return;
    }

    // Check if farm name is set
    if (!currentFarmName) {
        alert('Farm name is not set. Please go back and select or create a farm first.');
        return;
    }

    const nodes = [];
    const latlngs = currentFences[0].getLatLngs()[0];
    latlngs.forEach(point => {
        nodes.push({
            lat: point.lat,
            lng: point.lng
        });
    });

    // Validate that we have at least 3 points for a polygon
    if (nodes.length < 3) {
        alert('A fence must have at least 3 points');
        return;
    }

    console.log('Saving fence:', fenceName, 'for farm:', currentFarmName, 'with', nodes.length, 'nodes');

    // First, update farm GPS if it was changed via search
    if (updatedFarmGPS && currentFarmName) {
        try {
            const updateResponse = await fetch(`${API_BASE_URL}/farms/${currentFarmName}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gps: updatedFarmGPS })
            });

            if (updateResponse.ok) {
                console.log('Farm GPS updated successfully');
                currentFarmGPS = updatedFarmGPS;
            } else {
                console.error('Failed to update farm GPS');
            }
        } catch (error) {
            console.error('Failed to update farm GPS:', error);
        }
    }

    // Then save the fence with the farm token
    try {
        const response = await fetch(`${API_BASE_URL}/farms/fences`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fenceName, nodes, farmToken: currentFarmToken })
        });

        const data = await response.json();

        if (data.success) {
            alert('Fence saved successfully!');
            console.log('Fence saved:', data);
        } else {
            alert('Failed to save fence: ' + (data.error || 'Unknown error'));
            console.error('Save fence failed:', data);
        }
    } catch (error) {
        console.error('Save fence error:', error);
        alert('Failed to save fence. Please check the console for details.');
    }
};

function initializeFenceEditor() {
    // NEW: Check if we're on page5 (separated fence editor page)
    if (window.location.pathname.includes('page5_editing-fence')) {
        // Get farm data from sessionStorage (passed from page15/16/17)
        const farmSetupMethod = sessionStorage.getItem('farmSetupMethod');
        const farmGPS = sessionStorage.getItem('farmGPS');
        const farmName = sessionStorage.getItem('farmName');
        const farmToken = sessionStorage.getItem('farmToken');

        console.log('Page5 fence editor - Farm data:', { farmSetupMethod, farmGPS, farmName, farmToken });

        if (farmGPS) {
            currentFarmName = farmName || 'Unnamed Farm';
            currentFarmGPS = farmGPS;
            currentFarmToken = farmToken;

            // Directly show the fence editor with the GPS location
            const [lat, lng] = farmGPS.split(',').map(Number);
            if (lat && lng) {
                // Wait for Leaflet to load
                if (typeof L !== 'undefined') {
                    showFenceEditor(farmGPS);
                } else {
                    console.log('Waiting for Leaflet to load...');
                    setTimeout(() => {
                        showFenceEditor(farmGPS);
                    }, 500);
                }
            } else {
                alert('Invalid GPS coordinates');
                window.location.href = '/html/page14_farm-and-fence.html';
            }
        } else {
            alert('No farm data found. Please start from the beginning.');
            window.location.href = '/html/page14_farm-and-fence.html';
        }

        // Exit early - no need to run the old page14 logic
        return;
    }

    // OLD page14 logic below (for backwards compatibility)
    const fenceSetup = document.getElementById('fenceSetup');
    const farmNameInput = document.getElementById('farmNameInput');
    const farmSelection = document.getElementById('farmSelection');
    const cowSelection = document.getElementById('cowSelection');
    const fenceEditor = document.getElementById('fenceEditor');

    // Handle option button clicks
    const optionBtns = document.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const method = parseInt(this.getAttribute('data-method'));
            selectLocationMethod(method);
        });
    });

    async function selectLocationMethod(method) {
        selectedMethod = method;
        fenceSetup.classList.add('hidden');

        if (method === 1) {
            // Option 1: Use device's GPS
            await handleDeviceGPS();
        } else if (method === 2) {
            // Option 2: Use cow's GPS
            showCowSelection();
        } else if (method === 3) {
            // Option 3: Select saved farm
            showFarmSelection();
        }
    }
    
    // Handle Device GPS - Option 1
    window.handleDeviceGPS = async function() {
        try {
            const gps = await getCurrentLocation();
            if (!gps) {
                alert('Please turn on your device GPS to continue.');
                document.getElementById('fenceSetup').classList.remove('hidden');
                return;
            }
            deviceGPS = gps;
            showFarmNameInput();
        } catch (error) {
            alert('GPS is not enabled. Please turn on GPS and try again.');
            document.getElementById('fenceSetup').classList.remove('hidden');
        }
    };

    // Confirm farm name and create farm
    window.confirmFarmName = function() {
        const farmName = document.getElementById('farmNameField').value;

        let gpsToUse;
        if (selectedMethod === 1) {
            gpsToUse = deviceGPS;
        } else if (selectedMethod === 2) {
            gpsToUse = selectedCowGPS;
        }

        if (!gpsToUse) {
            alert('GPS coordinates not available');
            return;
        }

        // Create farm in database
        createFarmWithName(farmName, gpsToUse, false);
    };

    // Helper function to create farm
    function createFarmWithName(farmName, gps, allowRename) {
        fetch(`${API_BASE_URL}/farms`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ farmName, gps, allowRename })
        })
        .then(response => {
            if (response.status === 409) {
                // Duplicate name detected
                return response.json().then(data => {
                    // Ask user if they want to use the suggested name
                    const userConfirmed = confirm(
                        `Farm name "${data.originalName}" already exists.\n\n` +
                        `Do you want to save it as "${data.suggestedName}" instead?\n\n` +
                        `Click OK to use "${data.suggestedName}"\n` +
                        `Click Cancel to enter a different name`
                    );

                    if (userConfirmed) {
                        // User accepted the suggested name, retry with allowRename flag
                        createFarmWithName(data.originalName, gps, true);
                    }
                    // If user clicked Cancel, do nothing (stay on farm name input screen)
                    return null;
                });
            }
            return response.json();
        })
        .then(data => {
            if (data && data.success) {
                // Store the farm name and GPS for later updates
                currentFarmName = data.farm_id || farmName;
                currentFarmGPS = gps;

                showFenceEditor(gps);
            } else if (data && data.error && !data.duplicate) {
                // Only show error if it's not a duplicate (duplicate is handled above)
                alert('Failed to create farm: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Create farm error:', error);
            alert('Failed to create farm');
        });
    }

    // Show farm name input screen
    function showFarmNameInput() {
        document.getElementById('farmNameInput').classList.remove('hidden');
    }

    // Back to options
    window.backToOptions = function() {
        document.getElementById('farmSelection').classList.add('hidden');
        document.getElementById('cowSelection').classList.add('hidden');
        document.getElementById('farmNameInput').classList.add('hidden');
        document.getElementById('fenceSetup').classList.remove('hidden');
        selectedMethod = null;
        selectedCowGPS = null;
        deviceGPS = null;
    };
    
    window.selectTool = function(tool) {
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool + 'Tool').classList.add('active');

        if (drawingManager) {
            if (tool === 'polygon') {
                drawingManager._toolbars.draw._modes.polygon.handler.enable();
            } else {
                drawingManager._toolbars.draw._modes.polyline.handler.enable();
            }
        }
    };
    
    window.saveFence = async function() {
        const fenceName = document.getElementById('fenceNameInput').value;

        // Check if a fence has been drawn
        if (currentFences.length === 0) {
            alert('Please draw a fence first before saving!');
            return;
        }

        // Check if farm name is set
        if (!currentFarmName) {
            alert('Farm name is not set. Please go back and select or create a farm first.');
            return;
        }

        const nodes = [];
        const latlngs = currentFences[0].getLatLngs()[0];
        latlngs.forEach(point => {
            nodes.push({
                lat: point.lat,
                lng: point.lng
            });
        });

        // Validate that we have at least 3 points for a polygon
        if (nodes.length < 3) {
            alert('A fence must have at least 3 points');
            return;
        }

        console.log('Saving fence:', fenceName, 'for farm:', currentFarmName, 'with', nodes.length, 'nodes');

        // First, update farm GPS if it was changed via search
        if (updatedFarmGPS && currentFarmName) {
            try {
                const updateResponse = await fetch(`${API_BASE_URL}/farms/${currentFarmName}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ gps: updatedFarmGPS })
                });

                if (updateResponse.ok) {
                    console.log('Farm GPS updated successfully');
                    currentFarmGPS = updatedFarmGPS;
                } else {
                    console.error('Failed to update farm GPS');
                }
            } catch (error) {
                console.error('Failed to update farm GPS:', error);
            }
        }

        // Then save the fence with the actual farm name
        try {
            const response = await fetch(`${API_BASE_URL}/farms/fences`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fenceName, nodes, farmId: currentFarmName })
            });

            const data = await response.json();

            if (data.success) {
                alert('Fence saved successfully!');
                console.log('Fence saved:', data);
            } else {
                alert('Failed to save fence: ' + (data.error || 'Unknown error'));
                console.error('Save fence failed:', data);
            }
        } catch (error) {
            console.error('Save fence error:', error);
            alert('Failed to save fence. Please check the console for details.');
        }
    };
    
    window.deleteFence = function() {
        if (currentFences.length > 0) {
            currentFences.forEach(fence => {
                if (map) {
                    map.removeLayer(fence);
                }
            });
            // Also clear drawnItems
            if (drawnItems) {
                drawnItems.clearLayers();
            }
            currentFences = [];
            window.currentFences = currentFences;
            alert('Fence deleted successfully!');
        } else {
            alert('No fence to delete');
        }
    };
    
    window.zoomIn = function() {
        if (map) map.setZoom(map.getZoom() + 1);
    };
    
    window.zoomOut = function() {
        if (map) map.setZoom(map.getZoom() - 1);
    };
    
    window.autoFocus = function() {
        if (map && currentFences.length > 0) {
            const bounds = currentFences[0].getBounds();
            map.fitBounds(bounds);
        }
    };

    // Search for location by coordinates
    window.searchLocation = function() {
        const input = document.getElementById('locationSearchInput').value.trim();

        if (!input) {
            alert('Please enter coordinates');
            return;
        }

        // Parse input - accept formats like "35.20287, 33.36490" or "35.20287,33.36490"
        const parts = input.split(',').map(p => p.trim());

        if (parts.length !== 2) {
            alert('Please enter coordinates in format: latitude, longitude (e.g., 35.20287, 33.36490)');
            return;
        }

        const latitude = parseFloat(parts[0]);
        const longitude = parseFloat(parts[1]);

        // Validate coordinates
        if (isNaN(latitude) || isNaN(longitude)) {
            alert('Please enter valid numeric coordinates');
            return;
        }

        if (latitude < -90 || latitude > 90) {
            alert('Latitude must be between -90 and 90');
            return;
        }

        if (longitude < -180 || longitude > 180) {
            alert('Longitude must be between -180 and 180');
            return;
        }

        // Navigate map to the location
        if (map) {
            // Auto-focus on the new coordinates
            map.setView([latitude, longitude], 18);

            // Store the updated GPS coordinates
            updatedFarmGPS = `${latitude},${longitude}`;

            // Remove previous manual marker if exists
            if (window.manualFarmMarker) {
                map.removeLayer(window.manualFarmMarker);
            }

            // Create new marker at the searched location (KEEP original WiFi marker)
            window.manualFarmMarker = L.circleMarker([latitude, longitude], {
                radius: 10,
                fillColor: '#10b981', // Green color to differentiate from WiFi marker
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map);

            // Add popup to the marker
            window.manualFarmMarker.bindPopup('<strong>Manual Farm Location</strong><br>Coordinates: ' + latitude + ', ' + longitude);
            window.manualFarmMarker.openPopup();

            // Show cancel button if exists
            const cancelBtn = document.getElementById('cancelLocationBtn');
            if (cancelBtn) {
                cancelBtn.style.display = 'block';
            }

            // Clear the search input
            document.getElementById('locationSearchInput').value = '';
        }
    };

    // Cancel manual location and revert to WiFi positioning
    window.cancelManualLocation = function() {
        // Remove manual marker if exists
        if (window.manualFarmMarker) {
            map.removeLayer(window.manualFarmMarker);
            window.manualFarmMarker = null;
        }

        // Remove freehand click listener if active
        if (window.freehandMarkerEnabled) {
            map.off('click', window.freehandClickHandler);
            window.freehandMarkerEnabled = false;
        }

        // Reset updatedFarmGPS to original farm GPS (from WiFi positioning)
        if (farmEditorMarker) {
            const originalLatLng = farmEditorMarker.getLatLng();
            updatedFarmGPS = `${originalLatLng.lat},${originalLatLng.lng}`;

            // Center map on original location
            map.setView(originalLatLng, 18);
            farmEditorMarker.openPopup();
        }

        // Hide cancel button
        const cancelBtn = document.getElementById('cancelLocationBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }

        // Update Mark Farm on Map button text
        const freehandBtn = document.querySelector('button[onclick="enableFreehandMarker()"]');
        if (freehandBtn) {
            freehandBtn.textContent = 'Mark Farm on Map';
            freehandBtn.classList.remove('btn-warning');
            freehandBtn.classList.add('btn-info');
        }
    };

    // Enable freehand marker - user clicks anywhere on map to place farm marker
    window.enableFreehandMarker = function() {
        const freehandBtn = document.querySelector('button[onclick="enableFreehandMarker()"]');

        if (window.freehandMarkerEnabled) {
            // Disable freehand mode
            map.off('click', window.freehandClickHandler);
            window.freehandMarkerEnabled = false;

            if (freehandBtn) {
                freehandBtn.textContent = 'Mark Farm on Map';
                freehandBtn.classList.remove('btn-warning');
                freehandBtn.classList.add('btn-info');
            }
        } else {
            // Enable freehand mode
            window.freehandMarkerEnabled = true;

            if (freehandBtn) {
                freehandBtn.textContent = 'Click on Map (Active)';
                freehandBtn.classList.remove('btn-info');
                freehandBtn.classList.add('btn-warning');
            }

            // Create click handler
            window.freehandClickHandler = function(e) {
                const lat = e.latlng.lat;
                const lng = e.latlng.lng;

                // Remove previous manual marker if exists
                if (window.manualFarmMarker) {
                    map.removeLayer(window.manualFarmMarker);
                }

                // Create new marker at clicked location
                window.manualFarmMarker = L.circleMarker([lat, lng], {
                    radius: 10,
                    fillColor: '#10b981', // Green color
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                }).addTo(map);

                // Add popup
                window.manualFarmMarker.bindPopup('<strong>Manual Farm Location</strong><br>Coordinates: ' + lat.toFixed(6) + ', ' + lng.toFixed(6));
                window.manualFarmMarker.openPopup();

                // Update GPS coordinates
                updatedFarmGPS = `${lat},${lng}`;

                // Show cancel button
                const cancelBtn = document.getElementById('cancelLocationBtn');
                if (cancelBtn) {
                    cancelBtn.style.display = 'block';
                }

                // Disable freehand mode after placing marker
                map.off('click', window.freehandClickHandler);
                window.freehandMarkerEnabled = false;

                if (freehandBtn) {
                    freehandBtn.textContent = 'Mark Farm on Map';
                    freehandBtn.classList.remove('btn-warning');
                    freehandBtn.classList.add('btn-info');
                }
            };

            // Add click listener to map
            map.on('click', window.freehandClickHandler);
        }
    };

    window.toggleFarmMarkerInEditor = function(show) {
        if (farmEditorMarker) {
            if (show) {
                farmEditorMarker.setStyle({ opacity: 1, fillOpacity: 0.9 });
            } else {
                farmEditorMarker.setStyle({ opacity: 0, fillOpacity: 0 });
            }
        }
    };

    window.toggleFenceLinesInEditor = function(show) {
        if (currentFences && currentFences.length > 0) {
            currentFences.forEach(fence => {
                if (show) {
                    fence.setStyle({ opacity: 0.8, fillOpacity: 0.1 });
                } else {
                    fence.setStyle({ opacity: 0, fillOpacity: 0 });
                }
            });
        }
    };
}

function showFarmInput() {
    document.getElementById('farmSelection').classList.remove('hidden');
}

function showCowSelection() {
    document.getElementById('cowSelection').classList.remove('hidden');
    loadCowList();
}

function showFarmSelection() {
    document.getElementById('farmSelection').classList.remove('hidden');
    loadFarmList();
}

function showFenceSelection() {
    document.getElementById('fenceSelection').classList.remove('hidden');
    loadExistingFenceList();
}

async function loadCowList() {
    try {
        const response = await fetch(`${API_BASE_URL}/cows`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const cowList = document.getElementById('cowList');
            cowList.innerHTML = data.cows.map(cow => 
                `<div class="cow-item" onclick="selectCow('${cow.cow_id}')">${cow.cow_id}</div>`
            ).join('');
        }
    } catch (error) {
        console.error('Load cow list error:', error);
    }
}

async function loadFarmList() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const farmList = document.getElementById('farmList');

            if (data.farms && data.farms.length > 0) {
                farmList.innerHTML = data.farms.map(farm =>
                    `<div class="farm-item" onclick="selectFarm('${farm.farm_name}', '${farm.farm_gps}')">${farm.farm_name}</div>`
                ).join('');
            } else {
                farmList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No farms registered yet</p>';
            }
        }
    } catch (error) {
        console.error('Load farm list error:', error);
    }
}

function selectCow(cowId) {
    showFenceEditor('35.1234,33.5678');
}

function selectFarm(farmName, farmGps) {
    // Store the farm name and GPS for later updates
    currentFarmName = farmName;
    currentFarmGPS = farmGps;

    if (farmGps && farmGps !== 'null' && farmGps !== 'undefined') {
        showFenceEditor(farmGps);
    } else {
        showFenceEditor('35.1234,33.5678');
    }
}

async function loadExistingFenceList() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms/fences`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const fenceList = document.getElementById('existingFenceList');
            fenceList.innerHTML = data.fences.map(fence => 
                `<div class="fence-item" data-fence-id="${fence.fence_id}" data-fence-nodes='${fence.fence_nodes}'>
                    <div class="fence-name" onclick="selectExistingFence('${fence.fence_id}', '${fence.fence_nodes}')">
                        <strong>${fence.fence_id}</strong>
                    </div>
                    <div class="fence-details">
                        <small>Area: ${fence.area_size} m² | Farm: 
                            <span class="farm-link" onclick="selectExistingFence('${fence.fence_id}', '${fence.fence_nodes}')">${fence.farm_id || 'Unknown'}</span>
                        </small>
                    </div>
                </div>`
            ).join('');
        }
    } catch (error) {
        console.error('Load fence list error:', error);
    }
}


function selectExistingFence(fenceId, fenceNodes) {
    document.getElementById('fenceSelection').classList.add('hidden');
    document.getElementById('fenceEditor').classList.remove('hidden');

    // Pre-populate fence name
    document.getElementById('fenceNameInput').value = fenceId;

    // Initialize map and load existing fence
    initializeMap(35.1234, 33.5678);

    // Load existing fence nodes
    if (fenceNodes) {
        try {
            const nodes = JSON.parse(fenceNodes);
            const latlngs = nodes.map(node => [node.lat, node.lng]);

            const polygon = L.polygon(latlngs, {
                color: '#dc2626',
                weight: 2,
                opacity: 0.8,
                fillColor: '#dc2626',
                fillOpacity: 0.1
            });

            // Add to drawnItems instead of directly to map
            if (drawnItems) {
                drawnItems.addLayer(polygon);
            } else {
                polygon.addTo(map);
            }

            // Make polygon editable
            polygon.editing.enable();

            // Add metadata to fence polygon for zone calculations
            polygon.selected = true;

            currentFences = [polygon];
            window.currentFences = currentFences;

            // Auto-focus on the fence
            map.fitBounds(polygon.getBounds());
        } catch (error) {
            console.error('Error loading fence nodes:', error);
        }
    }
}

function showFenceEditor(gps) {
    // Only try to show/hide elements if they exist (old page14 logic)
    const farmSelection = document.getElementById('farmSelection');
    const cowSelection = document.getElementById('cowSelection');
    const fenceEditor = document.getElementById('fenceEditor');

    if (farmSelection) farmSelection.classList.add('hidden');
    if (cowSelection) cowSelection.classList.add('hidden');
    if (fenceEditor) fenceEditor.classList.remove('hidden');

    const [lat, lng] = gps.split(',').map(Number);
    initializeMap(lat, lng);
}

function initializeMap(lat, lng) {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded yet');
        alert('Map library is still loading. Please try again in a moment.');
        return;
    }

    // Initialize Leaflet map
    map = L.map(mapElement).setView([lat, lng], 18);

    // Add dark tile layer to match the theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    }).addTo(map);

    // Add a small red marker at the farm's GPS location
    farmEditorMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#dc2626',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map);

    // Add popup to the marker
    farmEditorMarker.bindPopup('<strong>Farm GPS Location</strong><br>Center point for fence drawing');

    // Optionally open the popup initially
    farmEditorMarker.openPopup();

    // Initialize Leaflet.draw control
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawingManager = new L.Control.Draw({
        draw: {
            polygon: {
                shapeOptions: {
                    color: '#dc2626',
                    weight: 2,
                    opacity: 0.8,
                    fillColor: '#dc2626',
                    fillOpacity: 0.2
                },
                allowIntersection: false,
                showArea: true
            },
            polyline: {
                shapeOptions: {
                    color: '#dc2626',
                    weight: 2,
                    opacity: 0.8
                }
            },
            circle: false,
            rectangle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            edit: true,
            remove: true
        }
    });

    map.addControl(drawingManager);

    // Handle drawing complete event
    map.on(L.Draw.Event.CREATED, function(event) {
        const layer = event.layer;

        // Remove previous fences
        currentFences.forEach(fence => map.removeLayer(fence));
        drawnItems.clearLayers();

        // Add new fence
        drawnItems.addLayer(layer);

        // Add metadata to fence polygon for zone calculations
        layer.selected = true;

        currentFences = [layer];
        window.currentFences = currentFences;
    });
}

async function initializeTracking() {
    const trackingMapElement = document.getElementById('trackingMap');
    if (!trackingMapElement) return;

    // Initialize Leaflet map
    map = L.map(trackingMapElement).setView([35.1234, 33.5678], 15);
    window.map = map; // Make globally accessible

    // Add dark tile layer to match the theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    }).addTo(map);

    // Load farms and initialize farm selection
    await loadFarmSelection();

    await loadCowsOnMap();
    await loadVirtualCowsOnMap();  // Load virtual cows for dev page
    await loadFencesOnMap();

    // Initialize WebSocket for real-time updates
    connectWebSocket();

    // Load farm markers after farms data is loaded
    setTimeout(() => {
        loadFarmMarkers();

        // Auto-focus on the selected farm after everything is loaded
        setTimeout(() => {
            autoFocusOnSelectedFarm();
        }, 200);
    }, 500);
    
    window.autoFocusFence = function() {
        if (map && currentFences.length > 0) {
            const bounds = L.latLngBounds([]);
            currentFences.forEach(fence => {
                bounds.extend(fence.getBounds());
            });
            map.fitBounds(bounds);
        }
    };

    window.autoFocusAll = function() {
        if (map) {
            const bounds = L.latLngBounds([]);

            currentFences.forEach(fence => {
                bounds.extend(fence.getBounds());
            });

            currentCows.forEach(cow => {
                bounds.extend(cow.getLatLng());
            });

            if (bounds.isValid()) {
                map.fitBounds(bounds);
            }
        }
    };
    
    window.toggleDropdown = function(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        dropdown.classList.toggle('show');
    };
    
    window.selectFence = function(fenceId) {
        console.log('Selected fence:', fenceId);
        window.autoFocusFence();
    };
    
    window.toggleCowVisibility = function(cowId, checkbox) {
        const cow = currentCows.find(c => c.cowId === cowId);
        if (cow) {
            cow.setVisible(checkbox.checked);
        }
    };
    
    window.toggleAlarm = function(cowId, checkbox) {
        if (checkbox.checked) {
            showAlarmPanel();
            addCowToAlarmPanel(cowId);
        } else {
            removeCowFromAlarmPanel(cowId);
        }
    };
    
    window.toggleMarker = function(cowId, checkbox) {
        const cow = currentCows.find(c => c.cowId === cowId);
        if (cow) {
            const color = checkbox.checked ? '#dc2626' : '#10b981';
            const icon = L.divIcon({
                html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                className: 'cow-marker',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            cow.setIcon(icon);
        }
    };
    
    window.closeCowDetails = function() {
        document.getElementById('cowDetailsModal').classList.remove('show');
    };
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-content').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });
}

async function loadFarmSelection() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const farmRadioGroup = document.getElementById('farmRadioGroup');
            const currentFarmNameEl = document.getElementById('currentFarmName');

            if (data.farms && data.farms.length > 0) {
                // Store farms data for later use
                farmsData = data.farms;

                // Get last selected farm from localStorage
                const pageName = window.location.pathname.includes('page19') ? 'page19' :
                                 window.location.pathname.includes('page6') ? 'page6' : 'tracking';
                const lastSelectedFarm = localStorage.getItem(`lastSelectedFarm_${pageName}`) || 'all';

                console.log(`Restoring last selected farm for ${pageName}: ${lastSelectedFarm}`);

                // Create "All Farms" option
                const allFarmsHtml = `
                    <label class="radio-container">
                        <input type="radio" name="farmSelection" value="all" ${lastSelectedFarm === 'all' ? 'checked' : ''} onchange="selectFarmForTracking('all')">
                        <span class="radio-label">All Farms</span>
                    </label>
                `;

                // Create radio button for each farm
                const farmsHtml = data.farms.map(farm => `
                    <label class="radio-container">
                        <input type="radio" name="farmSelection" value="${farm.farm_name}" ${lastSelectedFarm === farm.farm_name ? 'checked' : ''} onchange="selectFarmForTracking('${farm.farm_name}')">
                        <span class="radio-label">${farm.farm_name}</span>
                    </label>
                `).join('');

                farmRadioGroup.innerHTML = allFarmsHtml + farmsHtml;

                // Set initial selection and load data for that farm
                selectedFarmName = lastSelectedFarm;
                window.selectedFarmName = lastSelectedFarm; // Expose as window property for page19
                if (lastSelectedFarm === 'all') {
                    currentFarmNameEl.textContent = 'Viewing: All Farms';
                    selectedFarmToken = null;
                    window.selectedFarmToken = null; // Expose as window property for page19
                } else {
                    currentFarmNameEl.textContent = `Viewing: ${lastSelectedFarm}`;
                    const farm = farmsData.find(f => f.farm_name === lastSelectedFarm);
                    selectedFarmToken = farm ? farm.farm_token : null;
                    window.selectedFarmToken = selectedFarmToken; // Expose as window property for page19
                }

                // IMPORTANT: Don't reload map data here - it will be loaded after this function
                // in the initialization sequence (loadCowsOnMap, loadVirtualCowsOnMap, loadFencesOnMap)
            } else {
                farmRadioGroup.innerHTML = '<p style="color: #999;">No farms registered yet</p>';
                currentFarmNameEl.textContent = 'No farms available';
            }
        }
    } catch (error) {
        console.error('Load farm selection error:', error);
        document.getElementById('currentFarmName').textContent = 'Error loading farms';
    }
}

window.selectFarmForTracking = async function(farmName) {
    selectedFarmName = farmName;
    window.selectedFarmName = farmName; // Expose as window property for page19
    const currentFarmNameEl = document.getElementById('currentFarmName');

    if (farmName === 'all') {
        currentFarmNameEl.textContent = 'Viewing: All Farms';
        selectedFarmToken = null;
        window.selectedFarmToken = null; // Expose as window property for page19
    } else {
        currentFarmNameEl.textContent = `Viewing: ${farmName}`;
        // Find and store the farm token
        const farm = farmsData.find(f => f.farm_name === farmName);
        selectedFarmToken = farm ? farm.farm_token : null;
        window.selectedFarmToken = selectedFarmToken; // Expose as window property for page19
    }

    console.log(`🔄 Farm selection updated: farmName='${farmName}', token='${selectedFarmToken}'`);

    // Save farm selection to localStorage for persistence
    try {
        const pageName = window.location.pathname.includes('page19') ? 'page19' :
                         window.location.pathname.includes('page6') ? 'page6' : 'tracking';
        localStorage.setItem(`lastSelectedFarm_${pageName}`, farmName);
        console.log(`Saved farm selection: ${farmName} for ${pageName}`);
    } catch (error) {
        console.error('Error saving farm selection:', error);
    }

    // Clear existing markers and fences
    currentCows.forEach(cow => map.removeLayer(cow));
    currentFences.forEach(fence => map.removeLayer(fence));
    farmMarkers.forEach(marker => map.removeLayer(marker));
    currentCows = [];
    window.currentCows = currentCows; // Update global reference
    currentFences = [];
    window.currentFences = currentFences;
    farmMarkers = [];

    // Reload with filter
    loadCowsOnMap();
    loadVirtualCowsOnMap();  // Load virtual cows for dev page
    await loadFencesOnMap();
    loadFarmMarkers();

    // Reload cow list/dropdown on page19 and page6 to filter by selected farm
    if (window.location.pathname.includes('page19')) {
        console.log('🔄 [selectFarmForTracking] Calling loadVirtualCows() for page19');
        console.log('   Current window.selectedFarmToken:', window.selectedFarmToken);
        console.log('   Current window.selectedFarmName:', window.selectedFarmName);
        // Call loadVirtualCows if it exists (defined in page19)
        if (typeof window.loadVirtualCows === 'function') {
            window.loadVirtualCows();
        } else {
            console.warn('⚠️ window.loadVirtualCows function not found!');
        }
    } else if (window.location.pathname.includes('page6')) {
        // Call updateCowListDropdown if it exists (defined in page6)
        if (typeof window.updateCowListDropdown === 'function') {
            window.updateCowListDropdown();
        }
    }

    // Auto-focus on farm
    if (farmName !== 'all') {
        const farm = farmsData.find(f => f.farm_name === farmName);
        if (farm && farm.farm_gps) {
            const [lat, lng] = farm.farm_gps.split(',').map(Number);

            // Check if this farm has fences
            if (currentFences.length > 0) {
                // Auto-focus on fence bounds
                const bounds = L.latLngBounds([]);
                currentFences.forEach(fence => {
                    bounds.extend(fence.getBounds());
                });
                map.fitBounds(bounds, { padding: [50, 50] });
            } else {
                // No fence, focus on farm GPS
                map.setView([lat, lng], 18);
            }
        }
    } else {
        // All farms - fit all fences
        if (currentFences.length > 0) {
            const bounds = L.latLngBounds([]);
            currentFences.forEach(fence => {
                bounds.extend(fence.getBounds());
            });
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
};

// Auto-focus on the currently selected farm
function autoFocusOnSelectedFarm() {
    if (!map) return;

    if (selectedFarmName === 'all') {
        // All farms - fit all fences
        if (currentFences.length > 0) {
            const bounds = L.latLngBounds([]);
            currentFences.forEach(fence => {
                bounds.extend(fence.getBounds());
            });
            map.fitBounds(bounds, { padding: [50, 50] });
            console.log('Auto-focused on all farms');
        }
    } else {
        // Specific farm - focus on that farm
        const farm = farmsData.find(f => f.farm_name === selectedFarmName);
        if (farm && farm.farm_gps) {
            const [lat, lng] = farm.farm_gps.split(',').map(Number);

            // Check if this farm has fences
            const farmFences = currentFences.filter(fence => {
                // Check if fence belongs to this farm (we can check if it's within the bounds)
                return true; // Already filtered by selectedFarmToken when loading
            });

            if (farmFences.length > 0) {
                // Auto-focus on fence bounds
                const bounds = L.latLngBounds([]);
                farmFences.forEach(fence => {
                    bounds.extend(fence.getBounds());
                });
                map.fitBounds(bounds, { padding: [50, 50] });
                console.log(`Auto-focused on ${selectedFarmName} fences`);
            } else {
                // No fence, focus on farm GPS
                map.setView([lat, lng], 18);
                console.log(`Auto-focused on ${selectedFarmName} GPS`);
            }
        }
    }
}

async function loadCowsOnMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/cows`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();

            // Check if cows array exists
            if (data && data.cows && Array.isArray(data.cows)) {
                // Filter cows based on selected farm (include unassigned cows)
                const cowsToShow = selectedFarmToken
                    ? data.cows.filter(c => c.farm_token === selectedFarmToken || !c.farm_token || c.farm_token === '')
                    : data.cows;

                cowsToShow.forEach(cow => {
                    if (cow.real_time_coordinate) {
                    const [lat, lng] = cow.real_time_coordinate.split(',').map(Number);

                    // Create custom icon
                    const icon = L.divIcon({
                        html: '<div style="background-color: #10b981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                        className: 'cow-marker',
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    });

                    const marker = L.marker([lat, lng], {
                        icon: icon,
                        title: cow.cow_id
                    }).addTo(map);

                    // Add permanent label above the marker
                    const cowLabel = cow.cow_nickname || cow.cow_name || cow.cow_id;
                    marker.bindTooltip(cowLabel, {
                        permanent: true,
                        direction: 'top',
                        className: 'cow-name-label',
                        offset: [0, -8]
                    });

                    marker.cowId = cow.cow_id;
                    marker.cowData = {
                        ...cow,
                        isVirtual: cow.cow_type === 'virtual'  // Check cow_type from API
                    };

                    marker.on('click', function() {
                        showCowDetails(cow);
                    });

                    currentCows.push(marker);
                    window.currentCows = currentCows; // Update global reference
                    }
                });
            } else {
                console.warn('No cows data received or invalid format');
            }
        }
    } catch (error) {
        console.error('Load cows error:', error);
    }
}

async function loadVirtualCowsOnMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/dev/virtual-cows`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();

            // Check if virtualCows array exists
            if (data && data.virtualCows && Array.isArray(data.virtualCows)) {
                // Filter virtual cows based on selected farm
                const virtualCowsToShow = selectedFarmToken
                    ? data.virtualCows.filter(c => c.farm_token === selectedFarmToken || !c.farm_token || c.farm_token === '')
                    : data.virtualCows;

                virtualCowsToShow.forEach(cow => {
                    // Only show cows that have GPS coordinates
                    if (cow.gps_latitude && cow.gps_longitude) {
                        const lat = parseFloat(cow.gps_latitude);
                        const lng = parseFloat(cow.gps_longitude);

                        // Skip if coordinates are 0,0 (not set)
                        if (lat === 0 && lng === 0) return;

                        // Check if this cow already exists (by cow_token or collar_id)
                        const existingMarker = currentCows.find(m =>
                            m.cowData && (
                                m.cowData.cow_token === cow.cow_token ||
                                m.cowData.collar_id === cow.collar_id
                            )
                        );

                        if (existingMarker) {
                            // Update existing marker to be virtual
                            existingMarker.cowData.isVirtual = true;
                            console.log(`Updated existing cow ${cow.cow_nickname || cow.collar_id} to virtual`);
                            return;
                        }

                        // Create custom icon for virtual cows (different color)
                        const icon = L.divIcon({
                            html: '<div style="background-color: #f59e0b; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            className: 'virtual-cow-marker',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        });

                        const marker = L.marker([lat, lng], {
                            icon: icon,
                            title: cow.cow_nickname || cow.cow_name
                        }).addTo(map);

                        // Add permanent label above the marker
                        const cowLabel = cow.cow_nickname || cow.cow_name || cow.collar_id;
                        marker.bindTooltip(cowLabel, {
                            permanent: true,
                            direction: 'top',
                            className: 'cow-name-label',
                            offset: [0, -8]
                        });

                        marker.cowId = cow.collar_id;
                        marker.cowData = {
                            ...cow,
                            real_time_coordinate: `${lat},${lng}`,
                            isVirtual: true  // Flag to identify virtual cows
                        };

                        marker.on('click', function() {
                            showCowDetails(cow);
                        });

                        currentCows.push(marker);
                        window.currentCows = currentCows; // Update global reference
                        console.log(`Loaded virtual cow: ${cow.cow_nickname} at ${lat}, ${lng}`);
                    }
                });
            } else {
                console.warn('No virtual cows data received or invalid format');
            }
        }
    } catch (error) {
        console.error('Load virtual cows error:', error);
    }
}

async function loadFencesOnMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms/fences`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();

            // Check if fences exists and is an array
            if (data && data.fences && Array.isArray(data.fences)) {
                // Filter fences based on selected farm
                const fencesToShow = selectedFarmToken
                    ? data.fences.filter(f => f.farm_token === selectedFarmToken)
                    : data.fences;

                fencesToShow.forEach((fence, index) => {
                    if (fence.fence_nodes) {
                        const nodes = JSON.parse(fence.fence_nodes);
                        const latlngs = nodes.map(node => [node.lat, node.lng]);

                        const polygon = L.polygon(latlngs, {
                            color: '#dc2626',
                            weight: 2,
                            opacity: 0.8,
                            fillColor: '#dc2626',
                            fillOpacity: 0.1
                        }).addTo(map);

                        // Apply visibility setting
                        if (!showFences) {
                            polygon.setStyle({ opacity: 0, fillOpacity: 0 });
                        }

                        // Add metadata to fence polygon for zone calculations
                        polygon.selected = true; // Mark fence as selected for zone calculations
                        polygon.farmToken = fence.farm_token;
                        polygon.fenceId = fence.fence_id;
                        polygon.fenceName = fence.fence_name;

                        currentFences.push(polygon);
                        window.currentFences = currentFences;
                    }
                });
            } else {
                console.warn('No fences data received');
            }
        }
    } catch (error) {
        console.error('Load fences error:', error);
    }
}

function loadFarmMarkers() {
    // Filter farms based on selection
    const farmsToShow = selectedFarmName === 'all'
        ? farmsData
        : farmsData.filter(f => f.farm_name === selectedFarmName);

    farmsToShow.forEach(farm => {
        if (farm.farm_gps) {
            const [lat, lng] = farm.farm_gps.split(',').map(Number);

            // Create a small red circle marker
            const farmMarker = L.circleMarker([lat, lng], {
                radius: 6,
                fillColor: '#dc2626',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            // Add popup with farm name
            farmMarker.bindPopup(`<strong>${farm.farm_name}</strong><br>Farm GPS Location`);

            // Apply visibility setting
            if (!showFarmMarkers) {
                farmMarker.setStyle({ opacity: 0, fillOpacity: 0 });
            }

            farmMarkers.push(farmMarker);
        }
    });
}

window.toggleFarmMarkersVisibility = function(show) {
    showFarmMarkers = show;
    farmMarkers.forEach(marker => {
        if (show) {
            marker.setStyle({ opacity: 1, fillOpacity: 0.8 });
        } else {
            marker.setStyle({ opacity: 0, fillOpacity: 0 });
        }
    });
};

window.toggleFencesVisibility = function(show) {
    showFences = show;
    currentFences.forEach(fence => {
        if (show) {
            fence.setStyle({ opacity: 0.8, fillOpacity: 0.1 });
        } else {
            fence.setStyle({ opacity: 0, fillOpacity: 0 });
        }
    });
};

window.toggleCowNameDisplayMode = function(showNicknames) {
    showCowNicknames = showNicknames;

    // Update cow list in the dropdown
    const cowDropdown = document.getElementById('cowDropdown');
    if (cowDropdown) {
        const cowItems = cowDropdown.querySelectorAll('.cow-item .cow-id');
        cowItems.forEach((cowItem, index) => {
            if (currentCows[index]) {
                const cow = currentCows[index];
                const displayName = showNicknames && cow.cow_nickname
                    ? cow.cow_nickname
                    : cow.cow_name;
                cowItem.textContent = displayName;
            }
        });
    }

    // Update markers/labels on the map if they exist
    // Note: This would need to be implemented based on how cow markers are displayed on the map
    console.log('Cow display mode changed to:', showNicknames ? 'nicknames' : 'names');
};

function showCowDetails(cow) {
    const modal = document.getElementById('cowDetailsModal');
    document.getElementById('cowId').textContent = cow.cow_id;
    document.getElementById('cowTag').textContent = cow.tag || 'Unknown';
    document.getElementById('cowSpeed').textContent = cow.speed || '0';
    
    const collaborativeBtn = document.getElementById('collaborativeBtn');
    if (collaborativeBtn) {
        collaborativeBtn.style.display = 'block';
    }
    
    modal.classList.add('show');
}

function showAlarmPanel() {
    const alarmPanel = document.getElementById('alarmPanel');
    if (alarmPanel) {
        alarmPanel.style.display = 'block';
    }
}

function addCowToAlarmPanel(cowId) {
    const alarmList = document.getElementById('alarmList');
    const noAlarms = alarmList.querySelector('.no-alarms');
    
    if (noAlarms) {
        noAlarms.remove();
    }
    
    const alarmItem = document.createElement('div');
    alarmItem.className = 'alarm-item';
    alarmItem.innerHTML = `
        <div class="alarm-cow-id">${cowId}</div>
        <div class="alarm-details">
            <div>Speed: <span id="speed-${cowId}">0 km/h</span></div>
            <div>Tag: <span id="tag-${cowId}">Grazing</span></div>
            <div>Time: <span id="time-${cowId}">${new Date().toLocaleTimeString()}</span></div>
            <div>Type: <span id="type-${cowId}">Normal</span></div>
        </div>
    `;
    
    alarmList.appendChild(alarmItem);
}

function removeCowFromAlarmPanel(cowId) {
    const alarmItem = document.querySelector(`#alarm-${cowId}`);
    if (alarmItem) {
        alarmItem.remove();
    }
    
    const alarmList = document.getElementById('alarmList');
    if (!alarmList.children.length) {
        alarmList.innerHTML = '<p class="no-alarms">No active alarms</p>';
    }
}

function updateAlarmPanel(data) {
    const speedElement = document.getElementById(`speed-${data.cowId}`);
    const tagElement = document.getElementById(`tag-${data.cowId}`);
    const timeElement = document.getElementById(`time-${data.cowId}`);
    const typeElement = document.getElementById(`type-${data.cowId}`);
    
    if (speedElement) speedElement.textContent = `${data.speed || 0} km/h`;
    if (tagElement) tagElement.textContent = data.tag || 'Unknown';
    if (timeElement) timeElement.textContent = new Date().toLocaleTimeString();
    if (typeElement) typeElement.textContent = data.alarmType || 'Normal';
}

function updateCowPosition(data) {
    const cow = currentCows.find(c => c.cowId === data.cowId);
    if (cow && data.position) {
        const [lat, lng] = data.position.split(',').map(Number);
        cow.setLatLng([lat, lng]);
    }
}

function updateVirtualCowPosition(data) {
    // Check for duplicate markers first
    const allMatchingMarkers = currentCows.filter(c => c.cowData && c.cowData.cow_token === data.cow_token);

    if (allMatchingMarkers.length > 1) {
        console.warn(`WARNING: Found ${allMatchingMarkers.length} markers for ${data.cow_token} - removing duplicates`);
        // Remove all but the first marker
        for (let i = 1; i < allMatchingMarkers.length; i++) {
            if (map) {
                map.removeLayer(allMatchingMarkers[i]);
            }
            const index = currentCows.indexOf(allMatchingMarkers[i]);
            if (index > -1) {
                currentCows.splice(index, 1);
            }
        }
        window.currentCows = currentCows;
    }

    // Find cow marker by cow_token
    const cowMarker = currentCows.find(c => c.cowData && c.cowData.cow_token === data.cow_token);

    if (cowMarker && data.latitude !== undefined && data.longitude !== undefined) {
        const oldLat = cowMarker.getLatLng().lat;
        const oldLng = cowMarker.getLatLng().lng;

        // Only update if position actually changed (avoid redundant updates)
        if (Math.abs(oldLat - data.latitude) < 0.0000001 && Math.abs(oldLng - data.longitude) < 0.0000001) {
            return; // Position hasn't changed, skip update
        }

        // Update marker position
        cowMarker.setLatLng([data.latitude, data.longitude]);

        // Update stored cow data
        if (cowMarker.cowData) {
            cowMarker.cowData.gps_latitude = data.latitude;
            cowMarker.cowData.gps_longitude = data.longitude;
            cowMarker.cowData.real_time_coordinate = `${data.latitude},${data.longitude}`;

            // Update zone if provided
            if (data.zone) {
                cowMarker.cowData.state_fence = data.zone;
            }

            // Update cumulative time tracking fields from database
            if (data.time_inside !== undefined) {
                cowMarker.cowData.time_inside = data.time_inside;
            }
            if (data.time_outside !== undefined) {
                cowMarker.cowData.time_outside = data.time_outside;
            }

            // Update actual time tracking fields from database
            if (data.actual_time_inside_fence !== undefined) {
                cowMarker.cowData.actual_time_inside_fence = data.actual_time_inside_fence;
            }
            if (data.actual_time_outside_fence !== undefined) {
                cowMarker.cowData.actual_time_outside_fence = data.actual_time_outside_fence;
            }
            if (data.zone_changed_at !== undefined) {
                cowMarker.cowData.zone_changed_at = data.zone_changed_at;
            }
        }

        console.log(`Virtual cow moved via WebSocket: ${data.cow_nickname || data.cow_name || data.cow_token} - Zone: ${data.zone || 'unknown'}`);
    } else if (!cowMarker) {
        console.warn(`WARNING: Could not find marker for cow_token: ${data.cow_token}`);
    }
}

function initializeCollaborative() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkId = window.location.pathname.split('/').pop();
    
    window.acceptRequest = function() {
        document.getElementById('requestSection').classList.add('hidden');
        document.getElementById('recoveryInterface').classList.remove('hidden');

        initializeCollaborativeMap();

        // Auto-focus on fence initially
        setTimeout(() => {
            autoFocusFence();
            console.log('Initial auto-focus on fence completed');
        }, 500);

        startRecoveryProcess();
    };
    
    window.denyRequest = function() {
        // Stop GPS tracking if it was started
        stopEmployeeGPSTracking();

        document.getElementById('requestSection').classList.add('hidden');
        document.getElementById('disconnectedScreen').classList.remove('hidden');
    };
    
    window.confirmCowFound = function() {
        document.getElementById('foundCowBtn').classList.add('hidden');
        document.getElementById('completedBtn').classList.remove('hidden');
        updateRecoveryStatus('Cow found! Leading back to fence...');
    };
    
    window.completeRecovery = function() {
        // Reset auto-focus mode when recovery completes
        autoFocusMode = 'none';
        console.log('Auto-focus disabled - recovery completed');

        // Stop GPS tracking
        stopEmployeeGPSTracking();

        document.getElementById('recoveryInterface').classList.add('hidden');
        document.getElementById('completionScreen').classList.remove('hidden');
    };
}

let autoFocusMode = 'none'; // Auto-focus mode: 'none', 'fence', 'all', 'employee'
let employeeMarker = null; // Store employee marker reference
let cowMarker = null; // Store cow marker reference

// Speed tracking variables
let employeeSpeed = 0; // Current speed in km/h
let lastEmployeePosition = null; // {lat, lng, timestamp}
let geolocationWatchId = null; // ID for geolocation watch

function initializeCollaborativeMap() {
    const mapElement = document.getElementById('collaborativeMap');
    if (!mapElement) return;

    // Initialize Leaflet map
    map = L.map(mapElement).setView([35.1234, 33.5678], 16);

    // Add dark tile layer to match the theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    }).addTo(map);

    // Create custom icons for cow and employee
    const cowIcon = L.divIcon({
        html: '<div style="background-color: #dc2626; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
        className: 'cow-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const employeeIcon = L.divIcon({
        html: '<div style="background-color: #10b981; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
        className: 'employee-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    cowMarker = L.marker([35.1244, 33.5688], {
        icon: cowIcon,
        title: 'Lost Cow'
    }).addTo(map);

    // Add permanent label above cow marker (like page19)
    cowMarker.bindTooltip('Lost Cow', {
        permanent: true,
        direction: 'top',
        className: 'cow-name-label',
        offset: [0, -8]
    });

    employeeMarker = L.marker([35.1234, 33.5678], {
        icon: employeeIcon,
        title: 'Your Position'
    }).addTo(map);

    // Add permanent label above employee marker (like page19)
    employeeMarker.bindTooltip('agent1', {
        permanent: true,
        direction: 'top',
        className: 'cow-name-label',
        offset: [0, -8]
    });

    // Initialize routing with Leaflet Routing Machine
    L.Routing.control({
        waypoints: [
            L.latLng(35.1234, 33.5678),
            L.latLng(35.1244, 33.5688)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        lineOptions: {
            styles: [{
                color: '#f59e0b',
                weight: 3,
                opacity: 0.8
            }]
        },
        createMarker: function() { return null; }, // Suppress default markers
        show: false // Hide instructions panel
    }).addTo(map);

    // Start tracking employee GPS position and speed
    startEmployeeGPSTracking();
}

// Start real-time GPS tracking for employee
function startEmployeeGPSTracking() {
    if (!navigator.geolocation) {
        console.error('Geolocation is not supported by this browser.');
        return;
    }

    console.log('Starting employee GPS tracking...');

    geolocationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const currentLat = position.coords.latitude;
            const currentLng = position.coords.longitude;
            const currentTime = Date.now();

            // Update employee marker position
            if (employeeMarker) {
                employeeMarker.setLatLng([currentLat, currentLng]);
            }

            // Calculate speed if we have a previous position
            if (lastEmployeePosition) {
                const timeDiff = (currentTime - lastEmployeePosition.timestamp) / 1000; // seconds

                if (timeDiff > 0) {
                    // Calculate distance in kilometers using Haversine formula
                    const distance = calculateDistanceInKmCollaborative(
                        lastEmployeePosition.lat,
                        lastEmployeePosition.lng,
                        currentLat,
                        currentLng
                    );

                    // Speed = distance / time (in km/h)
                    const speed = (distance / timeDiff) * 3600; // Convert to km/h

                    // Apply smoothing filter (moving average)
                    employeeSpeed = (employeeSpeed * 0.7) + (speed * 0.3);

                    // Cap speed at reasonable maximum (30 km/h for running)
                    if (employeeSpeed > 30) {
                        employeeSpeed = 30;
                    }

                    console.log(`Employee speed: ${employeeSpeed.toFixed(1)} km/h`);
                }
            }

            // Store current position as last position
            lastEmployeePosition = {
                lat: currentLat,
                lng: currentLng,
                timestamp: currentTime
            };
        },
        (error) => {
            console.error('GPS tracking error:', error.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

// Stop GPS tracking when recovery ends
function stopEmployeeGPSTracking() {
    if (geolocationWatchId) {
        navigator.geolocation.clearWatch(geolocationWatchId);
        geolocationWatchId = null;
        console.log('Employee GPS tracking stopped.');
    }
}

// Calculate real distance in kilometers using Haversine formula (for page7)
function calculateDistanceInKmCollaborative(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate distance from point to nearest fence boundary (for page7)
function getDistanceToFenceCollaborative(lat, lng) {
    if (!fenceCoordinates || fenceCoordinates.length === 0) return null;

    let minDistance = Infinity;
    for (let i = 0; i < fenceCoordinates.length; i++) {
        const p1 = fenceCoordinates[i];
        const dist = calculateDistanceInKmCollaborative(lat, lng, p1.lat, p1.lng);
        minDistance = Math.min(minDistance, dist);
    }

    return minDistance;
}

// Determine which zone a point is in (for page7)
function getZoneForPointCollaborative(lat, lng) {
    if (!fenceCoordinates || fenceCoordinates.length === 0) return 'unknown';

    // Check if inside fence (zone1)
    const point = {lat, lng};
    const isInside = isPointInPolygon(point, fenceCoordinates);
    if (isInside) return 'zone1';

    // Calculate distance to fence boundary
    const minDistance = getDistanceToFenceCollaborative(lat, lng);
    if (minDistance === null) return 'unknown';

    // Zone2 is 0-50m, Zone3 is >50m
    return minDistance <= 0.05 ? 'zone2' : 'zone3';
}

// Update collaborative recovery details panel
function updateCollaborativeDetails() {
    // Update agent (employee) details
    const agentDetailsDiv = document.getElementById('agentDetails');
    if (agentDetailsDiv && employeeMarker) {
        const employeePos = employeeMarker.getLatLng();
        const employeeZone = getZoneForPointCollaborative(employeePos.lat, employeePos.lng);
        const zoneText = employeeZone === 'zone1' ? 'Zone1' :
                        employeeZone === 'zone2' ? 'Zone2' :
                        employeeZone === 'zone3' ? 'Zone3' : 'Unknown';

        // Use real GPS-tracked speed
        const speedDisplay = employeeSpeed.toFixed(1);

        // Calculate distance to fence
        let fenceDistanceText = '-';
        if (employeeZone !== 'zone1') {
            const fenceDist = getDistanceToFenceCollaborative(employeePos.lat, employeePos.lng);
            if (fenceDist !== null) {
                fenceDistanceText = fenceDist < 1 ?
                    `${(fenceDist * 1000).toFixed(0)}m` :
                    `${fenceDist.toFixed(1)}km`;
            }
        }

        agentDetailsDiv.innerHTML = `
            <div style="padding-left: 1rem; margin-bottom: 0.3rem; font-size: 11px; color: white;">
                <span style="font-weight: 500;">agent1</span>
                <span style="color: #95a5a6; margin: 0 0.5rem;">•</span>
                <span>${speedDisplay}km/h</span>
                <span style="color: #95a5a6; margin: 0 0.5rem;">•</span>
                <span>${zoneText}</span>
                <span style="color: #95a5a6; margin: 0 0.5rem;">•</span>
                <span>${fenceDistanceText}</span>
            </div>
        `;
    }

    // Update cow details
    const cowDetailsDiv = document.getElementById('cowDetails');
    if (cowDetailsDiv && cowMarker) {
        const cowPos = cowMarker.getLatLng();
        const cowZone = getZoneForPointCollaborative(cowPos.lat, cowPos.lng);
        const zoneText = cowZone === 'zone1' ? 'Zone1' :
                        cowZone === 'zone2' ? 'Zone2' :
                        cowZone === 'zone3' ? 'Zone3' : 'Unknown';
        const zoneColor = cowZone === 'zone2' ? '#f59e0b' :
                         cowZone === 'zone3' ? '#ef4444' : '#10b981';

        // Calculate distance from employee (agent) to cow
        let distanceText = '-';
        if (employeeMarker) {
            const employeePos = employeeMarker.getLatLng();
            const distance = calculateDistanceInKmCollaborative(
                employeePos.lat, employeePos.lng,
                cowPos.lat, cowPos.lng
            );
            distanceText = distance < 1 ?
                `${(distance * 1000).toFixed(0)}m` :
                `${distance.toFixed(1)}km`;
        }

        cowDetailsDiv.innerHTML = `
            <div style="padding-left: 1rem; margin-bottom: 0.3rem; font-size: 11px; color: white;">
                <span style="font-weight: 500;">Lost Cow</span>
                <span style="color: #95a5a6; margin: 0 0.5rem;">•</span>
                <span>${distanceText}</span>
                <span style="color: #95a5a6; margin: 0 0.5rem;">•</span>
                <span style="color: ${zoneColor};">${zoneText}</span>
            </div>
        `;
    }
}

function startRecoveryProcess() {
    updateRecoveryDistance();
    updateRecoveryTime();
    updateCollaborativeDetails(); // Initial update

    // Switch to auto-focus all when employee starts moving (unless user changed it)
    if (autoFocusMode === 'fence') {
        autoFocusAll();
    }

    setInterval(() => {
        updateRecoveryDistance();
        updateRecoveryTime();
        updateCollaborativeDetails(); // Update details panel

        // Apply auto-focus based on current mode
        if (autoFocusMode === 'all') {
            // Auto-focus all: follow employee while keeping all elements in view
            autoFocusAll();
        } else if (autoFocusMode === 'employee') {
            // Center on employee only: follow employee closely
            if (employeeMarker && map) {
                const employeePos = employeeMarker.getLatLng();
                map.setView([employeePos.lat, employeePos.lng], 16, {
                    animate: true,
                    duration: 0.5
                });
            }
        }
        // If mode is 'fence' or 'none', don't auto-follow
    }, 5000);

    setTimeout(() => {
        document.getElementById('foundCowBtn').classList.remove('hidden');
        updateRecoveryStatus('You are close to the cow. Did you find it?');
    }, 30000);
}

function updateRecoveryDistance() {
    const distance = Math.floor(Math.random() * 50) + 100;
    document.getElementById('recoveryDistance').textContent = `${distance}m`;
}

function updateRecoveryTime() {
    const now = new Date();
    document.getElementById('recoveryTime').textContent = now.toLocaleTimeString();
}

function updateRecoveryStatus(message) {
    const statusMessages = document.getElementById('statusMessages');
    const messageElement = document.createElement('div');
    messageElement.className = 'status-message';
    messageElement.textContent = message;
    statusMessages.appendChild(messageElement);
    statusMessages.scrollTop = statusMessages.scrollHeight;
}

// Auto-focus functions for page7 collaborative recovery
window.autoFocusFence = function() {
    // Page7 doesn't load fence data currently, so just focus on the area
    if (map) {
        // Set mode to fence (user manually selected)
        autoFocusMode = 'fence';

        map.setView([35.1234, 33.5678], 15);
        console.log('Auto-focus mode: fence');
    }
};

window.autoFocusAll = function() {
    if (map) {
        // Set mode to all (user manually selected or auto-triggered)
        autoFocusMode = 'all';

        // Fit bounds to include both cow and employee positions
        const bounds = L.latLngBounds([]);
        if (cowMarker) bounds.extend(cowMarker.getLatLng());
        if (employeeMarker) bounds.extend(employeeMarker.getLatLng());

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 18  // Prevent over-zooming when elements are very close
            });
            console.log('Auto-focus mode: all');
        }
    }
};

window.centerOnCow = function() {
    if (map && cowMarker) {
        // Set mode to employee (user manually selected)
        autoFocusMode = 'employee';

        const cowPos = cowMarker.getLatLng();
        map.setView([cowPos.lat, cowPos.lng], 17);
        console.log('Auto-focus mode: employee (centered on cow)');
    }
};

function initializeAlerts() {
    checkESP32Connection();
    
    // Add event listeners for test buttons
    const testBoundaryBtn = document.getElementById('testBoundaryBtn');
    if (testBoundaryBtn) {
        testBoundaryBtn.addEventListener('click', testBoundaryAlert);
    }
    
    const testDeterrentBtn = document.getElementById('testDeterrentBtn');
    if (testDeterrentBtn) {
        testDeterrentBtn.addEventListener('click', testDeterrentSystem);
    }
    
    const testGmailBtn = document.getElementById('testGmailBtn');
    if (testGmailBtn) {
        testGmailBtn.addEventListener('click', testGmailAlert);
    }
    
    const testDatabaseBtn = document.getElementById('testDatabaseBtn');
    if (testDatabaseBtn) {
        testDatabaseBtn.addEventListener('click', testDatabaseConnection);
    }
    
    window.saveBoundarySetting = function() {
        const distance = document.getElementById('boundaryDistance').value;
        console.log('Saving boundary distance:', distance);
        alert('Boundary distance setting saved: ' + distance + 'm');
    };
    
    window.saveDeterrentSettings = function() {
        const time1 = document.getElementById('deterrentTime1').value;
        const time2 = document.getElementById('deterrentTime2').value;
        const time3 = document.getElementById('deterrentTime3').value;
        const duration = document.getElementById('buzzerDuration').value;
        
        console.log('Saving deterrent settings:', { time1, time2, time3, duration });
        alert('Deterrent settings saved successfully!');
    };
    
    window.saveGmailSettings = function() {
        const receiver = document.getElementById('gmailReceiver').value;
        const enabled = document.getElementById('enableGmailAlerts').checked;
        const dailyReports = document.getElementById('dailyReports').checked;
        const frequency = document.getElementById('alertFrequency').value;
        
        console.log('Saving Gmail settings:', { receiver, enabled, dailyReports, frequency });
        alert('Gmail settings saved successfully!');
    };
}

function testBoundaryAlert() {
    alert('Boundary alert test triggered! This would normally send an ESP32 command to test the boundary detection system.');
}

function testDeterrentSystem() {
    alert('Deterrent system test initiated! This would normally activate LEDs and buzzer on the ESP32 device for testing.');
}

function testGmailAlert() {
    const receiver = document.getElementById('gmailReceiver').value;
    const testBtn = document.getElementById('testGmailBtn');
    
    testBtn.disabled = true;
    testBtn.textContent = 'Sending...';
    
    fetch(`${API_BASE_URL}/test-email`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiver })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`Test email sent successfully to ${receiver}!\n\nMessage ID: ${data.messageId || 'N/A'}\n\nPlease check your inbox (and spam folder).`);
        } else {
            alert(`Failed to send test email.\n\nError: ${data.error || 'Unknown error'}`);
        }
    })
    .catch(error => {
        console.error('Test email error:', error);
        alert(`Network error while sending test email.\n\nPlease check your connection and try again.`);
    })
    .finally(() => {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Gmail Alert';
    });
}

function testDatabaseConnection() {
    const testBtn = document.getElementById('testDatabaseBtn');
    
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    fetch(`${API_BASE_URL}/database/test`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const info = data.database;
            alert(`Database Connection Successful!\n\n` +
                  `Database Info:\n` +
                  `• Version: ${info.version.split(' ')[0]}\n` +
                  `• Current Time: ${new Date(info.current_time).toLocaleString()}\n` +
                  `• Tables Found: ${info.tables.length}\n` +
                  `• Tables: ${info.tables.join(', ')}\n` +
                  `• Users: ${info.user_count} registered`);
        } else {
            alert(`Database Connection Failed!\n\nError: ${data.error}\nDetails: ${data.details || 'No additional details'}`);
        }
    })
    .catch(error => {
        console.error('Database test error:', error);
        alert(`Network error while testing database connection.\n\nPlease check your connection and try again.`);
    })
    .finally(() => {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Database Connection';
    });
}

function checkESP32Connection() {
    const statusLight = document.getElementById('statusLight');
    const statusText = document.getElementById('statusText');
    const inputs = document.querySelectorAll('#boundaryDistance, #deterrentTime1, #deterrentTime2, #deterrentTime3, #buzzerDuration');
    const buttons = document.querySelectorAll('#saveBoundaryBtn, #saveDeterrentBtn');
    
    const connected = Math.random() > 0.5;
    
    if (connected) {
        statusLight.classList.add('connected');
        statusText.textContent = 'ESP32 devices connected';
        
        inputs.forEach(input => {
            input.disabled = false;
            input.nextElementSibling.textContent = 'Live settings';
        });
        
        buttons.forEach(button => {
            button.disabled = false;
        });
    } else {
        statusLight.classList.add('disconnected');
        statusText.textContent = 'ESP32 devices offline - using default settings';
        
        inputs.forEach(input => {
            input.disabled = true;
        });
        
        buttons.forEach(button => {
            button.disabled = true;
        });
    }
}

async function loadProfileData() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();

            // Update profile information
            const currentUsernameElement = document.getElementById('currentUsername');
            const currentUserIdElement = document.getElementById('currentUserId');
            const accountTimestampElement = document.getElementById('accountTimestamp');

            if (currentUsernameElement) {
                currentUsernameElement.textContent = data.farmer_name;
            }

            if (currentUserIdElement) {
                currentUserIdElement.textContent = data.email;
            }

            if (accountTimestampElement) {
                // Format timestamp nicely
                const date = new Date(data.timestamp);
                accountTimestampElement.textContent = date.toLocaleString();
            }
        } else {
            console.error('Failed to load profile data');
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

// Store cows globally for toggle functionality
let userCows = [];
let showNickname = false;

async function loadUserCows() {
    try {
        const response = await fetch(`${API_BASE_URL}/cows`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const cowList = document.getElementById('cowManagementList');
        if (!cowList) return;

        if (response.ok) {
            userCows = await response.json();

            if (userCows.length === 0) {
                cowList.innerHTML = '<p class="empty-message">No cows added yet. Click "Add New Cow" to get started.</p>';
            } else {
                renderCowList();
            }
        } else {
            cowList.innerHTML = '<p class="empty-message">No cows found.</p>';
        }
    } catch (error) {
        console.error('Error loading cows:', error);
        const cowList = document.getElementById('cowManagementList');
        if (cowList) cowList.innerHTML = '<p class="empty-message">Error loading cows.</p>';
    }
}

function renderCowList() {
    const cowList = document.getElementById('cowManagementList');
    if (!cowList || userCows.length === 0) return;

    cowList.innerHTML = userCows.map(cow => {
        const displayName = showNickname && cow.cow_nickname ? cow.cow_nickname : cow.cow_name;
        const detailText = `Collar: ${cow.collar_id}${cow.cow_nickname ? ` | Nickname: ${cow.cow_nickname}` : ''}`;

        return `
            <div class="cow-item">
                <div class="cow-item-info">
                    <div class="cow-item-name">${displayName}</div>
                    <div class="cow-item-detail">${detailText}</div>
                </div>
                <div class="cow-item-actions">
                    <button class="btn btn-small btn-secondary" onclick="editCowNickname('${cow.collar_id}', '${cow.cow_nickname || ''}')">Edit Nickname</button>
                </div>
            </div>
        `;
    }).join('');
}

window.toggleCowNameDisplay = function() {
    const toggle = document.getElementById('cowNameToggle');
    const label = document.getElementById('cowToggleLabel');

    showNickname = toggle.checked;
    label.textContent = showNickname ? 'Nickname' : 'Cow Name';

    renderCowList();
}

window.editCowNickname = function(collarId, currentNickname) {
    const newNickname = prompt(`Edit nickname for ${collarId}:`, currentNickname);

    if (newNickname !== null) {
        updateCowNickname(collarId, newNickname.trim());
    }
}

async function updateCowNickname(collarId, nickname) {
    try {
        const response = await fetch(`${API_BASE_URL}/cows/${collarId}/nickname`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname: nickname || null })
        });

        if (response.ok) {
            alert('Cow nickname updated successfully!');
            await loadUserCows();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to update nickname');
        }
    } catch (error) {
        console.error('Update nickname error:', error);
        alert('Network error. Please try again.');
    }
}

async function loadUserFences() {
    try {
        const response = await fetch(`${API_BASE_URL}/fences`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const fenceList = document.getElementById('fenceManagementList');
        if (!fenceList) return;

        if (response.ok) {
            const fences = await response.json();

            if (fences.length === 0) {
                fenceList.innerHTML = '<p class="empty-message">No fences created yet. Create fences in the Farm and Fence page.</p>';
            } else {
                fenceList.innerHTML = fences.map(fence => `
                    <div class="fence-item">
                        <span class="fence-id">${fence.fence_name}</span>
                        <button class="btn btn-small btn-secondary" onclick="editFenceId('${fence.fence_token}')">Edit</button>
                    </div>
                `).join('');
            }
        } else {
            fenceList.innerHTML = '<p class="empty-message">No fences found.</p>';
        }
    } catch (error) {
        console.error('Error loading fences:', error);
        const fenceList = document.getElementById('fenceManagementList');
        if (fenceList) fenceList.innerHTML = '<p class="empty-message">Error loading fences.</p>';
    }
}

async function loadUserFarms() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const farmList = document.getElementById('farmManagementList');
        if (!farmList) return;

        if (response.ok) {
            const farms = await response.json();

            if (farms.length === 0) {
                farmList.innerHTML = '<p class="empty-message">No farms created yet. Click "Add New Farm" to get started.</p>';
            } else {
                farmList.innerHTML = farms.map(farm => `
                    <div class="farm-item">
                        <span class="farm-id">${farm.farm_name}</span>
                        <button class="btn btn-small btn-secondary" onclick="editFarmId('${farm.farm_token}')">Edit</button>
                    </div>
                `).join('');
            }
        } else {
            farmList.innerHTML = '<p class="empty-message">No farms found.</p>';
        }
    } catch (error) {
        console.error('Error loading farms:', error);
        const farmList = document.getElementById('farmManagementList');
        if (farmList) farmList.innerHTML = '<p class="empty-message">Error loading farms.</p>';
    }
}

async function initializeProfile() {
    // Load user profile data
    await loadProfileData();

    // Load user's cows, fences, and farms
    await loadUserCows();
    await loadUserFences();
    await loadUserFarms();

    const updateUsernameForm = document.getElementById('updateUsernameForm');
    const updateUserIdForm = document.getElementById('updateUserIdForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const editModal = document.getElementById('editModal');

    if (updateUsernameForm) {
        updateUsernameForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const newUsername = document.getElementById('newUsername').value;

            if (!newUsername || newUsername.length < 3) {
                alert('Username must be at least 3 characters long');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        farmer_name: newUsername
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Username updated successfully!');
                    await loadProfileData();
                    updateUsernameForm.reset();
                } else {
                    alert(data.error || 'Failed to update username');
                }
            } catch (error) {
                console.error('Update username error:', error);
                alert('Network error. Please try again.');
            }
        });
    }

    if (updateUserIdForm) {
        updateUserIdForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const newUserId = document.getElementById('newUserId').value;

            if (!newUserId) {
                alert('Please enter a new email address');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        email: newUserId,
                        currentPassword: prompt('Enter your current password to confirm:')
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Email updated successfully! Please check your new email for confirmation code.');
                    await loadProfileData();
                } else {
                    alert(data.error || 'Failed to update email');
                }
            } catch (error) {
                console.error('Update email error:', error);
                alert('Network error. Please try again.');
            }
        });
    }

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                alert('New passwords do not match!');
                return;
            }

            if (newPassword.length < 8) {
                alert('Password must be at least 8 characters long!');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        password: newPassword,
                        currentPassword: currentPassword
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Password changed successfully!');
                    changePasswordForm.reset();
                } else {
                    alert(data.error || 'Failed to change password');
                }
            } catch (error) {
                console.error('Change password error:', error);
                alert('Network error. Please try again.');
            }
        });
    }
    
    window.editCowId = function(cowId) {
        showEditModal('Edit Cow ID', 'Cow ID:', cowId);
    };
    
    window.editFenceId = function(fenceId) {
        showEditModal('Edit Fence ID', 'Fence Name:', fenceId);
    };
    
    window.editFarmId = function(farmId) {
        showEditModal('Edit Farm ID', 'Farm Name:', farmId);
    };
    
    window.addNewCow = function() {
        showEditModal('Add New Cow', 'Cow ID:', '');
    };
    
    window.addNewFarm = function() {
        showEditModal('Add New Farm', 'Farm Name:', '');
    };
    
    window.closeModal = function() {
        editModal.classList.remove('show');
    };
    
    window.logout = function() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('safezone_user');
        window.location.href = '/html/page11_log-out.html';
    };
    
    if (editModal) {
        const editForm = document.getElementById('editForm');
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newValue = document.getElementById('editInput').value;
            console.log('Saving new value:', newValue);
            alert('Changes saved successfully!');
            editModal.classList.remove('show');
        });
    }
}

function showEditModal(title, label, currentValue) {
    const modal = document.getElementById('editModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('editLabel').textContent = label;
    document.getElementById('editInput').value = currentValue;
    modal.classList.add('show');
}

function downloadFarmData(farmId) {
    console.log('Downloading farm data for:', farmId);
    alert('Farm data download will be available via MEGA link in your email.');
}

function downloadFenceData(fenceId) {
    console.log('Downloading fence data for:', fenceId);
    alert('Fence data download will be available via MEGA link in your email.');
}

function downloadCowData(cowId) {
    console.log('Downloading cow data for:', cowId);
    alert('Cow data download will be available via MEGA link in your email.');
}

window.addEventListener('beforeunload', function() {
    if (trendInterval) {
        clearInterval(trendInterval);
    }
    if (wsConnection) {
        wsConnection.close();
    }
});