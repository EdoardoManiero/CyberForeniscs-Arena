/**
 * Event Logging Service
 * 
 * Provides functions for logging evaluation events to the database.
 * Used for anonymous tracking of user interactions for research/evaluation purposes.
 */

import { getDb } from '../db/db.js';

/**
 * Log an event to the event_log table
 * @param {Object} params - Event parameters
 * @param {string} params.participantId - Anonymous participant ID (CFA-XXXXXX format)
 * @param {number|null} params.userId - User ID if authenticated (optional)
 * @param {string} params.eventType - Type of event (e.g., 'task_submit', 'command_execute')
 * @param {string|null} params.scenarioCode - Scenario code (optional)
 * @param {string|null} params.taskId - Task ID (optional)
 * @param {Object} params.eventData - Additional event data as JSON object
 */
export async function logEvent({
  participantId,
  userId = null,
  eventType,
  scenarioCode = null,
  taskId = null,
  eventData = {}
}) {
  // Skip logging if no participant ID
  if (!participantId) {
    console.warn('[EventLog] Skipping event log - no participant ID');
    return;
  }

  try {
    const db = getDb();
    await db.run(`
      INSERT INTO event_log (participant_id, user_id, event_type, scenario_code, task_id, event_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `, participantId, userId, eventType, scenarioCode, taskId, JSON.stringify(eventData));
  } catch (error) {
    // Log error but don't throw - event logging should not break main functionality
    console.error('[EventLog] Failed to log event:', error.message);
  }
}

/**
 * Event types for consistent usage across the application
 */
export const EventTypes = {
  // Scenario events
  SCENARIO_START: 'scenario_start',
  SCENARIO_END: 'scenario_end',
  
  // Task events
  TASK_SUBMIT: 'task_submit',
  FLAG_SUBMIT: 'flag_submit',
  
  // Hint events
  HINT_REQUEST: 'hint_request',
  
  // Command events
  COMMAND_EXECUTE: 'command_execute',
  
  // Mini-game events
  MINI_GAME_START: 'mini_game_start',
  MINI_GAME_COMPLETE: 'mini_game_complete',
  MINI_GAME_FAIL: 'mini_game_fail'
};

/**
 * Get events for a specific participant
 * @param {string} participantId - Participant ID to query
 * @returns {Promise<Array>} Array of event records
 */
export async function getParticipantEvents(participantId) {
  const db = getDb();
  return db.all(`
    SELECT * FROM event_log 
    WHERE participant_id = ? 
    ORDER BY created_at ASC
  `, participantId);
}

/**
 * Get aggregated metrics for a participant
 * @param {string} participantId - Participant ID to query
 * @returns {Promise<Object>} Aggregated metrics
 */
export async function getParticipantMetrics(participantId) {
  const db = getDb();
  
  // Get total commands
  const commandCount = await db.get(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN json_extract(event_data, '$.error') = 1 THEN 1 ELSE 0 END) as failed
    FROM event_log 
    WHERE participant_id = ? AND event_type = 'command_execute'
  `, participantId);
  
  // Get task submissions
  const taskSubmissions = await db.get(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN json_extract(event_data, '$.correct') = 1 THEN 1 ELSE 0 END) as correct
    FROM event_log 
    WHERE participant_id = ? AND event_type = 'task_submit'
  `, participantId);
  
  // Get hints used
  const hintsUsed = await db.get(`
    SELECT COUNT(*) as total
    FROM event_log 
    WHERE participant_id = ? AND event_type = 'hint_request'
  `, participantId);
  
  // Get scenario times
  const scenarioTimes = await db.all(`
    SELECT scenario_code, event_type, created_at
    FROM event_log 
    WHERE participant_id = ? AND event_type IN ('scenario_start', 'scenario_end')
    ORDER BY created_at ASC
  `, participantId);
  
  return {
    commands: {
      total: commandCount?.total || 0,
      failed: commandCount?.failed || 0
    },
    tasks: {
      submissions: taskSubmissions?.total || 0,
      correct: taskSubmissions?.correct || 0,
      retries: (taskSubmissions?.total || 0) - (taskSubmissions?.correct || 0)
    },
    hints: hintsUsed?.total || 0,
    scenarioSessions: scenarioTimes
  };
}


