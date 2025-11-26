/**
 * Session Management Module
 * 
 * Manages user authentication state, session persistence, and API authentication.
 * Follows best practices for secure session management.
 */

import { authAPI } from './api.js';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// STATE
// ============================================================================

const sessionState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  listeners: new Set()
};

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Initialize session - check if user is already logged in
 */
export async function initSession() {
  try {
    sessionState.isLoading = true;
    const user = await authAPI.getMe();
    if (user) {
      sessionState.user = user;
      sessionState.isAuthenticated = true;
      notifyListeners();
      return true;
    }
  } catch (error) {
    // Not authenticated or session expired
    sessionState.user = null;
    sessionState.isAuthenticated = false;
  } finally {
    sessionState.isLoading = false;
    notifyListeners();
  }
  return false;
}

/**
 * Login user
 */
export async function login(email, password) {
  try {
    const result = await authAPI.login(email, password);
    if (result.success && result.user) {
      // Fetch full user data including tutorialCompleted
      try {
        const fullUser = await authAPI.getMe();
        sessionState.user = fullUser;
      } catch (error) {
        // Fallback to login response if getMe fails
        console.warn('Failed to fetch full user data, using login response:', error);
        sessionState.user = result.user;
      }

      sessionState.isAuthenticated = true;
      notifyListeners();
      eventBus.emit(Events.USER_LOGGED_IN, sessionState.user);
      return { success: true, user: sessionState.user };
    }
    return { success: false, error: 'Login failed' };
  } catch (error) {
    return { success: false, error: error.message || 'Login failed' };
  }
}

/**
 * Register new user
 */
export async function register(email, password, displayName) {
  try {
    const result = await authAPI.register(email, password, displayName);
    if (result.success && result.user) {
      // Fetch full user data including tutorialCompleted
      try {
        const fullUser = await authAPI.getMe();
        sessionState.user = fullUser;
      } catch (error) {
        // Fallback to register response if getMe fails
        console.warn('Failed to fetch full user data, using register response:', error);
        sessionState.user = result.user;
      }

      sessionState.isAuthenticated = true;
      notifyListeners();
      eventBus.emit(Events.USER_REGISTERED, sessionState.user);
      return { success: true, user: sessionState.user };
    }
    return { success: false, error: 'Registration failed' };
  } catch (error) {
    return { success: false, error: error.message || 'Registration failed' };
  }
}

/**
 * Logout user
 */
export async function logout() {
  try {
    await authAPI.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear session state
    sessionState.user = null;
    sessionState.isAuthenticated = false;

    // Clear sessionStorage items
    try {
      // Don't clear completed scenarios - they're stored server-side
      // We'll reload them on next login
      // sessionStorage.removeItem('forensic_demo_completed_scenarios');

      // Clear console history (check what key is used)
      // The console module uses its own storage key, but we'll clear common ones
      const consoleKeys = Object.keys(sessionStorage).filter(key =>
        key.includes('console') || key.includes('terminal') || key.includes('history')
      );
      consoleKeys.forEach(key => sessionStorage.removeItem(key));

      // Clear points and badges
      const pointsKeys = Object.keys(sessionStorage).filter(key =>
        key.includes('points') || key.includes('badges') || key.includes('score')
      );
      pointsKeys.forEach(key => sessionStorage.removeItem(key));

      console.log('[Session] Cleared sessionStorage on logout');
    } catch (error) {
      console.warn('[Session] Error clearing sessionStorage:', error);
    }

    notifyListeners();
    eventBus.emit(Events.USER_LOGGED_OUT);
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return sessionState.user;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return sessionState.isAuthenticated;
}

/**
 * Check if session is loading
 */
export function isLoading() {
  return sessionState.isLoading;
}

/**
 * Subscribe to session changes
 */
export function onSessionChange(callback) {
  sessionState.listeners.add(callback);
  // Immediately call with current state
  callback(sessionState);

  // Return unsubscribe function
  return () => {
    sessionState.listeners.delete(callback);
  };
}

/**
 * Notify all listeners of session state change
 */
function notifyListeners() {
  const state = {
    user: sessionState.user,
    isAuthenticated: sessionState.isAuthenticated,
    isLoading: sessionState.isLoading
  };
  sessionState.listeners.forEach(callback => {
    try {
      callback(state);
    } catch (error) {
      console.error('Session listener error:', error);
    }
  });
}

// Auto-initialize session on module load
initSession();