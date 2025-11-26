/**
 * Scenarios routes
 * 
 * GET /api/scenarios - Get all scenarios and tasks (public metadata only)
 * 
 * NOTE: Never returns solution_value or internal scoring logic.
 */

import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to scenarios JSON (server-side, not public)
// From server/src/routes/scenarios.js -> go up to server/ -> data/scenarios.json
const SCENARIOS_PATH = join(__dirname, '../../data/scenarios.json');

/**
 * Get all scenarios and tasks (full data excluding solutions and hints)
 * GET /api/scenarios
 * 
 * Returns full scenario data needed by client (onInteract, mountContent, customCommands, etc.)
 * but excludes solution-related fields and hints (hints are fetched separately via /api/tasks/:taskId/hint)
 */
router.get('/', (req, res) => {
  try {
    // Read scenarios from server-side file
    console.log('Loading scenarios from:', SCENARIOS_PATH);

    // Check if file exists
    if (!existsSync(SCENARIOS_PATH)) {
      throw new Error(`Scenarios file not found at: ${SCENARIOS_PATH}`);
    }

    const scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8'));

    // Return full scenario data but filter out solution-related fields
    const publicScenarios = Object.keys(scenariosData)
      .filter(key => !key.startsWith('_'))
      .map(key => {
        const scenario = scenariosData[key];

        // Build scenario object with all needed fields
        const publicScenario = {
          id: key,
          title: scenario.title || key,
          description: scenario.description || '',
          introduction: scenario.introduction || '',
          badge: scenario.badge || null,
          interactableObjects: scenario.interactableObjects || [],
          customCommands: scenario.customCommands || [],
          tasks: (scenario.tasks || []).map(task => {
            // Build task object with all needed fields
            // NOTE: We exclude hints - they should be fetched separately when user requests them
            // - hintCost is included so UI can show the button with cost
            // - checkCommand/checkArgs are needed for console task detection
            const publicTask = {
              id: task.id,
              title: task.title || '',
              details: task.details || '',
              points: task.points || 0,
              checkType: task.checkType || null,
              interactionTarget: task.interactionTarget || null,
              // Include onInteract (needed for device mounting)
              onInteract: task.onInteract || null,
              // Include hintCost so UI can show hint button, but NOT the hint itself
              hintCost: task.hintCost || 0,
              // Include checkCommand/checkArgs (needed for console task detection)
              checkCommand: task.checkCommand || null,
              checkArgs: task.checkArgs || null,
            };

            return publicTask;
          })
        };

        return publicScenario;
      });

    // Return as object keyed by scenario ID (matching original structure)
    const result = {};
    publicScenarios.forEach(scenario => {
      result[scenario.id] = scenario;
    });

    res.json(result);
  } catch (error) {
    console.error('Error loading scenarios:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      path: SCENARIOS_PATH,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load scenarios',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Save scenarios
 * POST /api/scenarios
 * Body: { scenarios: { ... } }
 */
router.post('/', express.json(), (req, res) => {
  try {
    const { scenarios } = req.body;

    if (!scenarios || typeof scenarios !== 'object') {
      return res.status(400).json({ error: 'Invalid scenarios data' });
    }

    // Validate basic structure (optional but good practice)
    // For now, we trust the editor but ensure it's valid JSON structure

    // Write to file
    writeFileSync(SCENARIOS_PATH, JSON.stringify(scenarios, null, 2), 'utf-8');
    console.log('Scenarios saved to:', SCENARIOS_PATH);
    res.json({ success: true, message: 'Scenarios saved successfully' });

  } catch (error) {
    console.error('Error saving scenarios:', error);
    res.status(500).json({ error: 'Failed to save scenarios' });
  }
});

export { router as scenarioRoutes };
