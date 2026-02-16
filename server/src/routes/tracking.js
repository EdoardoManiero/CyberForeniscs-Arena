/**
 * Tracking Routes
 * 
 * Lightweight endpoints for anonymous evaluation tracking.
 * These endpoints do NOT require authentication.
 * 
 * POST /api/tracking/scenario-start - Log scenario start
 * POST /api/tracking/scenario-end - Log scenario end
 */

import express from 'express';
import { logEvent, EventTypes } from '../services/eventLog.js';

const router = express.Router();

/**
 * Log scenario start
 * POST /api/tracking/scenario-start
 * Body: { scenarioCode }
 */
router.post('/scenario-start', async (req, res) => {
  try {
    const { scenarioCode } = req.body;
    const participantId = req.participantId;
    const userId = req.user?.id || req.user?.userId || null;

    if (!scenarioCode) {
      return res.status(400).json({ error: 'scenarioCode is required' });
    }

    await logEvent({
      participantId,
      userId,
      eventType: EventTypes.SCENARIO_START,
      scenarioCode,
      eventData: {
        timestamp: new Date().toISOString()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracking] Scenario start error:', error);
    res.status(500).json({ error: 'Failed to log scenario start' });
  }
});

/**
 * Log scenario end
 * POST /api/tracking/scenario-end
 * Body: { scenarioCode, completedTasks, totalTasks, totalScore }
 */
router.post('/scenario-end', async (req, res) => {
  try {
    const { scenarioCode, completedTasks, totalTasks, totalScore } = req.body;
    const participantId = req.participantId;
    const userId = req.user?.id || req.user?.userId || null;

    if (!scenarioCode) {
      return res.status(400).json({ error: 'scenarioCode is required' });
    }

    await logEvent({
      participantId,
      userId,
      eventType: EventTypes.SCENARIO_END,
      scenarioCode,
      eventData: {
        completedTasks: completedTasks || 0,
        totalTasks: totalTasks || 0,
        totalScore: totalScore || 0,
        timestamp: new Date().toISOString()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracking] Scenario end error:', error);
    res.status(500).json({ error: 'Failed to log scenario end' });
  }
});

/**
 * Log mini-game event
 * POST /api/tracking/mini-game
 * Body: { scenarioCode, gameType, eventType, success }
 */
router.post('/mini-game', async (req, res) => {
  try {
    const { scenarioCode, gameType, eventType, success } = req.body;
    const participantId = req.participantId;
    const userId = req.user?.id || req.user?.userId || null;

    if (!gameType || !eventType) {
      return res.status(400).json({ error: 'gameType and eventType are required' });
    }

    // Map event type to our event types
    let logEventType;
    switch (eventType) {
      case 'start':
        logEventType = EventTypes.MINI_GAME_START;
        break;
      case 'complete':
        logEventType = EventTypes.MINI_GAME_COMPLETE;
        break;
      case 'fail':
        logEventType = EventTypes.MINI_GAME_FAIL;
        break;
      default:
        logEventType = eventType;
    }

    await logEvent({
      participantId,
      userId,
      eventType: logEventType,
      scenarioCode,
      eventData: {
        gameType,
        success: success || false,
        timestamp: new Date().toISOString()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracking] Mini-game event error:', error);
    res.status(500).json({ error: 'Failed to log mini-game event' });
  }
});

/**
 * Log command execution (for client-side commands like lsblk, mount)
 * POST /api/tracking/command
 * Body: { scenarioCode, command, hasError }
 */
router.post('/command', async (req, res) => {
  try {
    const { scenarioCode, command, hasError } = req.body;
    const participantId = req.participantId;
    const userId = req.user?.id || req.user?.userId || null;

    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    await logEvent({
      participantId,
      userId,
      eventType: EventTypes.COMMAND_EXECUTE,
      scenarioCode,
      eventData: {
        command,
        hasError: hasError || false,
        source: 'client', // Mark as client-side command
        timestamp: new Date().toISOString()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Tracking] Command log error:', error);
    res.status(500).json({ error: 'Failed to log command' });
  }
});

export { router as trackingRoutes };

