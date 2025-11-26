/**
 * Leaderboard routes
 * * GET /api/leaderboard - Get leaderboard (users ordered by total score)
 */

import express from 'express';
import { getDb } from '../db/db.js';

const router = express.Router();

/**
 * Get leaderboard
 * GET /api/leaderboard
 * Returns users ordered by total score (task_completions.score_awarded + badge_points_awarded.points_awarded)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();

    // Get users with their total scores (tasks + badges)
    // Use subqueries to avoid double counting with JOINs
    const leaderboard = await db.all(`
      SELECT 
        u.id,
        u.display_name AS displayName,
        COALESCE((
          SELECT SUM(score_awarded) FROM task_completions WHERE user_id = u.id
        ), 0) + COALESCE((
          SELECT SUM(points_awarded) FROM badge_points_awarded WHERE user_id = u.id
        ), 0) AS totalScore,
        COALESCE((
          SELECT COUNT(*) FROM task_completions WHERE user_id = u.id
        ), 0) AS tasksCompleted
      FROM users u
      ORDER BY totalScore DESC, tasksCompleted DESC, u.display_name ASC
      LIMIT 100
    `);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export { router as leaderboardRoutes };