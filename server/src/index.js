/**
 * CyberForensics Arena - Backend Server
 * * Express server providing secure APIs for:
 * - User authentication (register/login)
 * - Task validation and scoring (server-side only)
 * - Virtual filesystem (VFS) management
 * - Console command execution
 * - Leaderboard
 * * Security: All client input is untrusted. Never expose solutions or accept scores from client.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import compression from 'compression';
import helmet from 'helmet';
import sqlite3 from 'connect-sqlite3';
import passport from './config/passport.js';
import { initDatabase } from './db/db.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { consoleRoutes } from './routes/console.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { scenarioRoutes } from './routes/scenarios.js';
import { deviceRoutes } from './routes/devices.js';

// Load environment variables
dotenv.config();

// Validate required environment variables (fail fast if missing)
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_do_not_use_in_prod';
const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Initialize SQLite Store
const SQLiteStore = sqlite3(session);

if (process.env.NODE_ENV === 'production' && SESSION_SECRET === 'dev_secret_do_not_use_in_prod') {
  console.warn('        WARNING: Using default SESSION_SECRET in production! Please set SESSION_SECRET in .env');
}

// Security & Performance Middleware
app.use(helmet());
app.use(compression());

// Trust proxy (required for secure cookies on Render/Heroku)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true // Allow cookies
}));
app.use(express.json());
app.use(cookieParser());

// Session configuration
app.use(session({
  store: new SQLiteStore({
    dir: './data',
    db: 'sessions.db'
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/console', consoleRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/devices', deviceRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

/**
 * Start the server
 * We must initialize the database before starting the app
 */
async function startServer() {
  try {
    // Initialize database
    await initDatabase();

    // Start server
    app.listen(PORT, () => {
      console.log(`     CyberForensics Arena Server running on port ${PORT}`);
      console.log(`     CORS enabled for: ${CORS_ORIGIN}`);
      console.log(`     Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`     Passport.js session authentication enabled`);
    });

  } catch (error) {
    console.error('    Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
startServer();