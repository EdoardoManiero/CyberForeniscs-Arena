/**
 * Authentication routes using Passport.js sessions
 * Following professor's lab implementation pattern
 * 
 * POST /api/auth/register - Register new user
 * POST /api/auth/login - Login user (uses Passport Local Strategy)
 * POST /api/auth/logout - Logout user
 * GET /api/auth/me - Get current user info
 */

import express from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { getDb } from '../db/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * Register new user
 * POST /api/auth/register
 * Body: { email, password, displayName }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    // Validation
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and displayName are required' });
    }

    // Email format validation (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password strength (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if user already exists
    const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.run(`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (?, ?, ?)
    `, email, passwordHash, displayName);

    const newUserId = result.lastID;

    // Create user object for session
    const user = {
      id: newUserId,
      email,
      displayName,
      tutorialCompleted: false
    };

    // Auto-login user after registration using Passport
    req.login(user, (err) => {
      if (err) {
        console.error('Auto-login error after registration:', err);
        return res.status(500).json({ error: 'Registration successful but login failed' });
      }

      // Log login time to console only
      console.log(`User ${email} (ID: ${newUserId}) logged in (after registration) at ${new Date().toISOString()}`);

      res.status(201).json({
        success: true,
        user: {
          id: newUserId,
          email,
          displayName,
          tutorialCompleted: false
        }
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Login user using Passport Local Strategy
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Login failed' });
    }
    
    if (!user) {
      // Generic error message to prevent user enumeration
      return res.status(401).json({ error: info?.message || 'Invalid email or password' });
    }

    // Establish session using req.login()
    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error('Session creation error:', loginErr);
        return res.status(500).json({ error: 'Login failed' });
      }

      // Log login time to console only
      console.log(`User ${user.email} (ID: ${user.id}) logged in at ${new Date().toISOString()}`);

      // Return user data
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          tutorialCompleted: user.tutorialCompleted
        }
      });
    });
  })(req, res, next);
});

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

/**
 * Get current user info
 * GET /api/auth/me
 * req.user is set by Passport deserializeUser
 */
router.get('/me', authenticate, async (req, res) => {
  // req.user is already set by Passport from session
  // But we'll fetch fresh data from database to ensure it's up to date
  const db = getDb();
  const user = await db.get('SELECT id, email, display_name, tutorial_completed, created_at FROM users WHERE id = ?', req.user.id || req.user.userId);
  
  if (!user) {
    // This case might happen if session is valid but user was deleted
    req.logout(() => {
      return res.status(404).json({ error: 'User not found' });
    });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    tutorialCompleted: user.tutorial_completed === 1,
    createdAt: user.created_at
  });
});

/**
 * Mark tutorial as completed
 * POST /api/auth/tutorial/complete
 */
router.post('/tutorial/complete', authenticate, async (req, res) => {
  try {
    const db = getDb();
    
    await db.run(`
      UPDATE users 
      SET tutorial_completed = 1 
      WHERE id = ?
    `, req.user.id || req.user.userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Tutorial completion error:', error);
    res.status(500).json({ error: 'Failed to mark tutorial as completed' });
  }
});

/**
 * Check if tutorial is completed
 * GET /api/auth/tutorial/status
 */
router.get('/tutorial/status', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT tutorial_completed FROM users WHERE id = ?', req.user.id || req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      completed: user.tutorial_completed === 1 
    });
  } catch (error) {
    console.error('Tutorial status error:', error);
    res.status(500).json({ error: 'Failed to get tutorial status' });
  }
});

/**
 * Get user's badges
 * GET /api/auth/badges
 */
router.get('/badges', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id || req.user.userId;

    // Get all badges earned by the user
    const badges = await db.all(`
      SELECT b.code
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = ?
      ORDER BY ub.awarded_at ASC
    `, userId);

    const badgeCodes = badges.map(b => b.code);

    res.json({ 
      badges: badgeCodes 
    });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

export { router as authRoutes };