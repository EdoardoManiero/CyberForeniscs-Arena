/**
 * Virtual Filesystem (VFS) Manager
 * * Manages per-user, per-scenario virtual filesystem state.
 * VFS structure is stored in database and loaded from scenario definitions.
 */

import { getDb } from '../db/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to scenarios JSON
const SCENARIOS_PATH = join(__dirname, '../../data/scenarios.json');

/**
 * Initialize VFS for a user/scenario
 * Creates default structure and loads scenario-specific content
 */
async function initializeVFS(userId, scenarioCode) {
  const db = getDb();
  
  // Check if VFS state already exists
  const existing = await db.get(`
    SELECT vfs_data FROM user_vfs_state 
    WHERE user_id = ? AND scenario_code = ?
  `, userId, scenarioCode);

  if (existing) {
    return JSON.parse(existing.vfs_data);
  }

  // Create default VFS structure
  const vfs = {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          user: {
            type: 'dir',
            children: {
              'README.txt': {
                type: 'file',
                content: 'Welcome to the Forensic Shell.\nExplore the file system and complete the tasks.'
              }
            }
          }
        }
      },
      evidence: { type: 'dir', children: {} },
      captures: { type: 'dir', children: {} },
      memory: { type: 'dir', children: {} },
      mnt: { type: 'dir', children: {} },
      tmp: { type: 'dir', children: {} },
      var: {
        type: 'dir',
        children: {
          log: { type: 'dir', children: {} }
        }
      }
    }
  };

  // Note: mountContent from tasks is NOT pre-mounted during VFS initialization
  // Content is only mounted when:
  // 1. User interacts with device (via onInteract action in taskManager)
  // 2. User explicitly mounts device via mount command
  // This ensures VFS starts clean and content appears only after user action

  // Save to database
  await db.run(`
    INSERT INTO user_vfs_state (user_id, scenario_code, cwd, vfs_data)
    VALUES (?, ?, ?, ?)
  `, userId, scenarioCode, '/home/user', JSON.stringify(vfs));

  return vfs;
}

/**
 * Mount content at a specific path
 */
function mountContent(vfs, mountPath, content) {
  const pathParts = mountPath.split('/').filter(Boolean);
  let current = vfs;

  // Create directory structure
  for (const part of pathParts) {
    if (!current.children) current.children = {};
    if (!current.children[part]) {
      current.children[part] = { type: 'dir', children: {} };
    }
    current = current.children[part];
  }

  // Add files
  if (content && current.children) {
    for (const [name, data] of Object.entries(content)) {
      current.children[name] = {
        type: 'file',
        content: typeof data === 'string' ? data : JSON.stringify(data)
      };
    }
  }
}

/**
 * Get VFS for user/scenario
 */
export async function getVFS(userId, scenarioCode) {
  const db = getDb();
  
  let state = await db.get(`
    SELECT vfs_data, cwd FROM user_vfs_state 
    WHERE user_id = ? AND scenario_code = ?
  `, userId, scenarioCode);

  if (!state) {
    // Initialize if doesn't exist
    const vfs = await initializeVFS(userId, scenarioCode);
    state = await db.get(`
      SELECT vfs_data, cwd FROM user_vfs_state 
      WHERE user_id = ? AND scenario_code = ?
    `, userId, scenarioCode);
  }

  return {
    vfs: JSON.parse(state.vfs_data),
    cwd: state.cwd
  };
}

/**
 * Update VFS state (cwd and/or vfs structure)
 */
export async function updateVFS(userId, scenarioCode, updates) {
  const db = getDb();
  
  if (updates.cwd !== undefined) {
    await db.run(`
      UPDATE user_vfs_state 
      SET cwd = ?, updated_at = datetime('now')
      WHERE user_id = ? AND scenario_code = ?
    `, updates.cwd, userId, scenarioCode);
  }

  if (updates.vfs !== undefined) {
    await db.run(`
      UPDATE user_vfs_state 
      SET vfs_data = ?, updated_at = datetime('now')
      WHERE user_id = ? AND scenario_code = ?
    `, JSON.stringify(updates.vfs), userId, scenarioCode);
  }
}

/**
 * Resolve path relative to cwd
 */
export function resolvePath(path, cwd) {
  if (path.startsWith('/')) {
    return normalizePath(path);
  }
  const parts = cwd.split('/').filter(Boolean);
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return '/' + parts.join('/');
}

/**
 * Normalize path (remove . and ..)
 */
export function normalizePath(path) {
  const parts = path.split('/').filter(Boolean);
  const stack = [];
  for (const seg of parts) {
    if (seg === '..') stack.pop();
    else if (seg !== '.') stack.push(seg);
  }
  return '/' + stack.join('/');
}

/**
 * Get node at path in VFS
 */
export function getNode(vfs, path) {
  const p = normalizePath(path);
  if (p === '/') return vfs;
  const parts = p.split('/').filter(Boolean);
  let node = vfs;
  for (const part of parts) {
    if (!node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

/**
 * Mount device content to user's VFS
 * @param {number} userId - User ID
 * @param {string} scenarioCode - Scenario code
 * @param {string} mountPoint - Mount point path
 * @param {Object} content - Device content (file name -> content mapping)
 */
export async function mountDeviceContentToVFS(userId, scenarioCode, mountPoint, content) {
  // Get current VFS
  const { vfs } = await getVFS(userId, scenarioCode);
  
  // Mount content
  mountContent(vfs, mountPoint, content);
  
  // Update VFS in database
  await updateVFS(userId, scenarioCode, { vfs });
  
  return vfs;
}