/**
 * pointsBadge.js - Points and Badge System Component
 * 
 * Manages the display of user points and earned badges.
 * Uses sessionStorage as cache, but syncs with server on initialization.
 */

import { authAPI } from './api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  POINTS: 'forensic_demo_points',
  BADGES: 'forensic_demo_badges'
};

const UI_CONFIG = {
  ROOT_ID: 'pointsBadgeRoot',
  TOGGLE_BTN_ID: 'pointsBadgeToggle',
  POINTS_DISPLAY_ID: 'pointsDisplay',
  POINTS_DISPLAY_DETAILED_ID: 'pointsDisplayDetailed',
  BADGES_CONTAINER_ID: 'badgesContainer',
  BADGE_ITEM_CLASS: 'badge-item'
};

// ============================================================================
// STATE
// ============================================================================

const state = {
  root: null,
  points: 0,
  badges: [],
  isExpanded: false
};

// ============================================================================
// STORAGE MANAGEMENT
// ============================================================================

/**
 * Loads points from sessionStorage
 */
function loadPoints() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.POINTS);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        state.points = parsed;
        return;
      }
    }
  } catch (error) {
    console.warn('[PointsBadge] Failed to load points from storage:', error);
  }
  state.points = 0;
}

/**
 * Saves points to sessionStorage
 */
function savePoints() {
  try {
    sessionStorage.setItem(STORAGE_KEYS.POINTS, String(state.points));
  } catch (error) {
    console.warn('[PointsBadge] Failed to save points to storage:', error);
  }
}

/**
 * Loads badges from sessionStorage
 */
function loadBadges() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.BADGES);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        state.badges = parsed;
        return;
      }
    }
  } catch (error) {
    console.warn('[PointsBadge] Failed to load badges from storage:', error);
  }
  state.badges = [];
}

/**
 * Saves badges to sessionStorage
 */
function saveBadges() {
  try {
    sessionStorage.setItem(STORAGE_KEYS.BADGES, JSON.stringify(state.badges));
  } catch (error) {
    console.warn('[PointsBadge] Failed to save badges to storage:', error);
  }
}

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Creates the points/badge UI component
 */
function createUI() {
  if (state.root) {
    return;
  }

  const root = document.createElement('div');
  root.id = UI_CONFIG.ROOT_ID;
  root.className = 'points-badge-container';

  root.innerHTML = `
    <button id="${UI_CONFIG.TOGGLE_BTN_ID}" class="points-badge-toggle" title="Toggle Points & Badges">
      <i class="fas fa-trophy"></i>
      <span class="points-badge-toggle-text">Points: <span id="${UI_CONFIG.POINTS_DISPLAY_ID}">0</span></span>
    </button>
    <div class="points-badge-content">
      <div class="points-badge-header">
        <h3><i class="fas fa-star"></i> Points & Achievements</h3>
        <button class="points-badge-close" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="points-badge-body">
        <div class="points-section">
          <div class="points-display-large">
            <span class="points-label">Total Points</span>
            <span id="${UI_CONFIG.POINTS_DISPLAY_DETAILED_ID}" class="points-value">0</span>
          </div>
        </div>
        <div class="badges-section">
          <h4><i class="fas fa-medal"></i> Badges Earned</h4>
          <div id="${UI_CONFIG.BADGES_CONTAINER_ID}" class="badges-list">
            ${state.badges.length === 0 
              ? '<p class="no-badges">No badges earned yet. Complete scenarios to earn badges!</p>' 
              : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  state.root = root;

  // Setup event listeners
  const toggleBtn = root.querySelector(`#${UI_CONFIG.TOGGLE_BTN_ID}`);
  const closeBtn = root.querySelector('.points-badge-close');
  const content = root.querySelector('.points-badge-content');

  toggleBtn.addEventListener('click', () => {
    state.isExpanded = !state.isExpanded;
    updateUI();
  });

  closeBtn.addEventListener('click', () => {
    state.isExpanded = false;
    updateUI();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (state.isExpanded && !root.contains(e.target)) {
      state.isExpanded = false;
      updateUI();
    }
  });

  updateUI();
}

/**
 * Updates the UI to reflect current state
 */
function updateUI() {
  if (!state.root) return;

  const content = state.root.querySelector('.points-badge-content');
  const pointsDisplayToggle = state.root.querySelector(`#${UI_CONFIG.POINTS_DISPLAY_ID}`);
  const pointsDisplayDetailed = state.root.querySelector(`#${UI_CONFIG.POINTS_DISPLAY_DETAILED_ID}`);

  // Update toggle button points
  if (pointsDisplayToggle) {
    pointsDisplayToggle.textContent = state.points;
  }

  // Update detailed panel points
  if (pointsDisplayDetailed) {
    pointsDisplayDetailed.textContent = state.points;
  }

  if (content) {
    if (state.isExpanded) {
      content.classList.add('expanded');
    } else {
      content.classList.remove('expanded');
    }
  }

  updateBadgesDisplay();
}

/**
 * Updates the badges display
 */
function updateBadgesDisplay() {
  if (!state.root) return;

  const container = state.root.querySelector(`#${UI_CONFIG.BADGES_CONTAINER_ID}`);
  if (!container) return;

  if (state.badges.length === 0) {
    container.innerHTML = '<p class="no-badges">No badges earned yet. Complete scenarios to earn badges!</p>';
    return;
  }

  container.innerHTML = state.badges.map(badge => `
    <div class="${UI_CONFIG.BADGE_ITEM_CLASS}">
      <i class="fas fa-medal"></i>
      <span class="badge-name">${escapeHtml(badge)}</span>
    </div>
  `).join('');
}

/**
 * Escapes HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// CALLBACKS
// ============================================================================

let onPointsChangeCallback = null;

/**
 * Set callback to be called when points change
 * @param {Function} callback - Callback function that receives new points value
 */
function setOnPointsChangeCallback(callback) {
  onPointsChangeCallback = callback;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const PointsBadge = {
  /**
   * Initializes the component
   */
  async init() {
    loadPoints();
    // Load badges from sessionStorage first (for immediate display)
    loadBadges();
    createUI();
    
    // Then sync badges from server
    await this.syncBadgesFromServer();
    
    // Make sure it's visible
    this.show();
    
    console.log('[PointsBadge] Initialized');
  },

  /**
   * Syncs badges from server
   * Should be called on initialization and after login
   */
  async syncBadgesFromServer() {
    try {
      const result = await authAPI.getBadges();
      if (result && result.badges && Array.isArray(result.badges)) {
        // Update badges from server (authoritative source)
        state.badges = result.badges;
        saveBadges();
        updateUI();
        console.log(`[PointsBadge] Synced ${result.badges.length} badges from server`);
        return result.badges;
      }
    } catch (error) {
      console.warn('[PointsBadge] Failed to sync badges from server:', error);
      // Keep sessionStorage badges as fallback
    }
    return state.badges;
  },

  /**
   * Adds points to the user's total
   * @param {number} amount - Points to add
   */
  addPoints(amount) {
    if (!Number.isFinite(amount) || amount < 0) {
      console.warn('[PointsBadge] Invalid points amount:', amount);
      return;
    }
    state.points += amount;
    savePoints();
    updateUI();
    console.log(`[PointsBadge] Added ${amount} points. Total: ${state.points}`);
    if (onPointsChangeCallback) {
      onPointsChangeCallback(state.points);
    }
  },

  /**
   * Subtracts points from the user's total
   * @param {number} amount - Points to subtract
   * @returns {boolean} True if points were subtracted, false if insufficient points
   */
  subtractPoints(amount) {
    if (!Number.isFinite(amount) || amount < 0) {
      console.warn('[PointsBadge] Invalid points amount:', amount);
      return false;
    }
    if (state.points < amount) {
      console.warn(`[PointsBadge] Insufficient points. Have: ${state.points}, Need: ${amount}`);
      return false;
    }
    state.points -= amount;
    savePoints();
    updateUI();
    console.log(`[PointsBadge] Subtracted ${amount} points. Total: ${state.points}`);
    if (onPointsChangeCallback) {
      onPointsChangeCallback(state.points);
    }
    return true;
  },

  /**
   * Gets current points
   * @returns {number} Current points
   */
  getPoints() {
    return state.points;
  },

  /**
   * Sets points to a specific value (for syncing with server)
   * @param {number} amount - Points to set
   */
  setPoints(amount) {
    if (!Number.isFinite(amount) || amount < 0) {
      console.warn('[PointsBadge] Invalid points amount:', amount);
      return;
    }
    state.points = amount;
    savePoints();
    updateUI();
    console.log(`[PointsBadge] Set points to: ${state.points}`);
    if (onPointsChangeCallback) {
      onPointsChangeCallback(state.points);
    }
  },

  /**
   * Adds a badge if not already earned
   * @param {string} badgeName - Name of the badge
   */
  addBadge(badgeName) {
    if (!badgeName || typeof badgeName !== 'string') {
      console.warn('[PointsBadge] Invalid badge name:', badgeName);
      return;
    }

    if (state.badges.includes(badgeName)) {
      console.log(`[PointsBadge] Badge already earned: ${badgeName}`);
      return;
    }

    state.badges.push(badgeName);
    saveBadges();
    updateUI();
    console.log(`[PointsBadge] Badge earned: ${badgeName}`);
  },

  /**
   * Gets all earned badges
   * @returns {Array<string>} Array of badge names
   */
  getBadges() {
    return [...state.badges];
  },

  /**
   * Resets all points and badges (for testing/debugging)
   */
  reset() {
    state.points = 0;
    state.badges = [];
    savePoints();
    saveBadges();
    updateUI();
    console.log('[PointsBadge] Reset complete');
  },

  /**
   * Updates the UI display
   */
  update() {
    updateUI();
  },

  /**
   * Set callback for when points change
   * @param {Function} callback - Callback function that receives new points value
   */
  onPointsChange(callback) {
    setOnPointsChangeCallback(callback);
  },

  show() {
    const pointsBadgeRoot = document.getElementById('pointsBadgeRoot'); 
    if (pointsBadgeRoot) {
      pointsBadgeRoot.style.setProperty('display', 'block', 'important');
      pointsBadgeRoot.style.setProperty('visibility', 'visible', 'important');
      console.log('[PointsBadge] Shown');
    }
  },

  hide() {
    const pointsBadgeRoot = document.getElementById('pointsBadgeRoot'); 
    if (pointsBadgeRoot) {
      pointsBadgeRoot.style.setProperty('display', 'none', 'important');
      pointsBadgeRoot.style.setProperty('visibility', 'hidden', 'important');
      console.log('[PointsBadge] Hidden');
    }
  }
};

console.log('[PointsBadge] Module loaded');

