/**
 * main.js - Application Entry Point
 * 
 * Initializes the 3D scene, console, interactions, and task system.
 * Manages the overall application lifecycle and event handling.
 */

import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { createScene, updateScenarioHighlights, clearScene, clearCanvas } from './scene.js';
import { setupInteractions } from './interaction.js';
import { initConsole, toggleConsoleVisibility } from './console.js';
import { TutorialManager } from './TutorialManager.js';
import { loadScenarios, initTaskSystem, currentTask, switchScenarioWithIntro, setupTaskManager, resetTaskManager, loadCompletedScenarios } from './taskManager.js';
import { TaskHud } from './taskHud.js';
import { PointsBadge } from './pointsBadge.js';
import { initSession, isAuthenticated, isLoading, onSessionChange, getCurrentUser } from './session.js';
import { show as showLoginPage } from './loginPage.js';
import { initNavigation, syncTotalScore } from './navigation.js';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIG = {
  CANVAS_ID: 'renderCanvas',
  INITIAL_SCENARIO: 'file_system_forensic',
  ENGINE_OPTIONS: {
    preserveDrawingBuffer: true,
    stencil: true
  },
  POINTER_LOCK_OPTIONS: {
    unadjustedMovement: true
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const appState = {
  engine: null,
  scene: null,
  canvas: null,
  tutorial: null,
  isInitialized: false,
  isInitializing: false  // Moved here for global access
};

// ============================================================================
// INITIALIZATION
// ============================================================================



/**
 * Initializes the application on DOM content loaded
 */
/**
 * Initializes the application on DOM content loaded
 */
async function initializeApp() {
  const loadingScreen = document.getElementById('appLoading');
  
  try {
    console.log('[Main] Starting initialization...');

    // STEP 1: Initialize navigation (navbar must be visible immediately)
    initNavigation();

    // STEP 2: Get canvas and ensure visibility
    const canvas = document.getElementById(CONFIG.CANVAS_ID);
    if (!canvas) throw new Error(`Canvas element '${CONFIG.CANVAS_ID}' not found`);

    appState.canvas = canvas;
    canvas.style.display = 'block';
    canvas.style.visibility = 'visible';

    // STEP 3: Initialize session (idempotent - safe to call multiple times)
    await initSession();
    console.log('[Main] Session initialized');

    // STEP 4: Hide loading screen now that session is checked
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
    }

    // STEP 5: Check authentication
    if (!isAuthenticated()) {
      showLoginPage('login');

      // Wait for auth success
      await new Promise(resolve => {
        const unsubscribe = onSessionChange((state) => {
          if (state.isAuthenticated && !state.isLoading) {
            unsubscribe();
            resolve();
          }
        });
        eventBus.once(Events.AUTH_SUCCESS, () => {
          unsubscribe();
          resolve();
        });
      });
    }

    // STEP 6: Continue initialization after auth
    // Set flag BEFORE calling initCore to prevent AUTH_SUCCESS handler from also calling it
    appState.isInitializing = true;
    try {
      await initCore();
    } finally {
      appState.isInitializing = false;
    }

  } catch (error) {
    console.error('[Main] Initialization failed:', error);
    // Hide loading screen even on error so user can see the error message
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
    }
    showFatalError(error.message);
  }
}

/**
 * Core initialization after authentication
 */
async function initCore() {
  try {
    console.log('[Main] Initializing core systems...');
    const canvas = appState.canvas;

    // Force layout
    canvas.getBoundingClientRect();

    // Create Engine
    appState.engine = new BABYLON.Engine(canvas, true, CONFIG.ENGINE_OPTIONS);
    appState.engine.resize();

    // Create Scene
    appState.scene = await createScene(appState.engine, canvas);
    appState.scene._currentTask = currentTask;

    // Setup Systems
    setupTaskManager(appState.scene);
    setupInteractions(appState.scene, appState.scene.activeCamera);
    initConsole();
    await PointsBadge.init();
    PointsBadge.show();
    await syncTotalScore();
    installPointerLockSafety(appState.scene, canvas);

    // Load Scenarios
    const scenarios = await loadScenarios();
    if (scenarios) {
      await loadCompletedScenarios();
    }

    // Check Tutorial
    const user = getCurrentUser();
    if (user?.tutorialCompleted) {
      await onTutorialComplete(true);
    } else {
      initializeTutorial();
    }

    // Show Crosshair
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      crosshair.style.display = 'block';
    }

    // Start Render Loop
    appState.engine.runRenderLoop(() => {
      if (appState.scene && !appState.engine.isDisposed) {
        appState.scene.render();
      }
    });

    // Final Resize
    window.addEventListener('resize', () => appState.engine.resize());
    appState.engine.resize();

    // Attempt to focus canvas
    try {
      canvas.focus();
    } catch (e) {
      console.warn('[Main] Failed to focus canvas:', e);
    }

    appState.isInitialized = true;
    console.log('[Main] Application initialized successfully');

  } catch (error) {
    console.error('[Main] Core initialization failed:', error);
    throw error;
  }
}

/**
 * Initializes the tutorial system
 */
function initializeTutorial() {
  appState.tutorial = new TutorialManager({
    scene: appState.scene,
    onDone: onTutorialComplete
  });

  window.tutorial = appState.tutorial;
}

/**
 * Callback when tutorial is completed
 * @param {boolean} skipped - Whether tutorial was skipped (already completed)
 */
async function onTutorialComplete(skipped = false) {
  try {
    if (skipped) {
      console.log('Tutorial was already completed, initializing task system...');
    } else {
      console.log('Tutorial completed. Initializing task system...');
    }

    // Ensure console is closed after tutorial finishes
    toggleConsoleVisibility(false);

    // Ensure camera controls are attached and canvas is focused
    if (appState.scene && appState.scene.activeCamera && appState.canvas) {
      const camera = appState.scene.activeCamera;

      // Ensure camera speed is set correctly
      camera.speed = 0.2; // Match SCENE_CONFIG.CAMERA_SPEED
      console.log('[Main] Camera speed set to:', camera.speed);

      // Detach first to ensure clean state
      camera.detachControl(appState.canvas);
      // Re-attach controls
      camera.attachControl(appState.canvas, true);
      // Re-set speed after attaching controls (attachControl might reset it)
      camera.speed = 0.2;
      // Focus canvas to enable keyboard input
      appState.canvas.focus();
      console.log('[Main] Camera controls attached and canvas focused, speed:', camera.speed);
    }

    const success = initTaskSystem(CONFIG.INITIAL_SCENARIO);

    if (success) {
      console.log(`Started scenario: ${CONFIG.INITIAL_SCENARIO}`);
      updateScenarioHighlights();

      // Mount and show HUD BEFORE showing intro to ensure it's visible
      TaskHud.mount();
      TaskHud.show();

      // Small delay to ensure HUD is fully rendered before showing intro
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show scenario introduction with modal
      // HUD is already visible, intro will appear on top
      await switchScenarioWithIntro(CONFIG.INITIAL_SCENARIO);

      // Ensure camera controls are attached and canvas is focused after scenario intro
      // This is critical for first-time users to enable WASD movement
      // Do this immediately AND after a delay to ensure it works
      if (appState.scene && appState.scene.activeCamera && appState.canvas) {
        const camera = appState.scene.activeCamera;

        // Ensure camera speed is set correctly
        camera.speed = 0.2; // Match SCENE_CONFIG.CAMERA_SPEED

        // Attach immediately
        camera.detachControl(appState.canvas);
        camera.attachControl(appState.canvas, true);
        // Re-set speed after attaching controls (attachControl might reset it)
        camera.speed = 0.2;
        appState.canvas.focus();
        console.log('[Main] Camera controls attached immediately after scenario intro, speed:', camera.speed);

        // Also attach after delay as backup - REMOVED to prevent conflict with ScenarioIntroManager
        // ScenarioIntroManager handles its own control attachment/detachment
        console.log('[Main] Handing over control to ScenarioIntroManager (if applicable)');
      }
    } else {
      console.error('Failed to initialize task system');
    }

  } catch (error) {
    console.error('Error in tutorial completion:', error);
  }
}

/**
 * Sets up window resize handler
 */
function setupResizeHandler() {
  window.addEventListener('resize', () => {
    if (appState.engine) {
      appState.engine.resize();
    }
    if (window.fitAddon) {
      window.fitAddon.fit();
    }
  });
}

/**
 * Installs pointer lock safety handlers
 */
function installPointerLockSafety(scene, canvas) {
  // Remove existing listener if present to prevent accumulation and stale scene references
  if (canvas._pointerLockClickHandler) {
    canvas.removeEventListener('click', canvas._pointerLockClickHandler, true);
    canvas._pointerLockClickHandler = null;
  }

  // Create new listener
  canvas._pointerLockClickHandler = (e) => {
    // Don't re-engage pointer lock if it's disabled (e.g., during scenario intro)
    if (window._disablePointerLock) {
      console.log('[PointerLock] Blocked re-engagement during scenario intro');
      return;
    }

    // Only engage pointer lock if not already locked and modal isn't showing
    if (document.pointerLockElement !== canvas && !window._disablePointerLock) {
      try {
        scene.activeCamera?.attachControl(canvas, true);
        canvas.focus();
        canvas.requestPointerLock?.({ unadjustedMovement: true });
      } catch (error) {
        console.warn('Pointer lock re-attachment failed:', error);
      }
    }
  };

  // Add listener
  canvas.addEventListener('click', canvas._pointerLockClickHandler, true);
  window.__pointerLockSafetyInstalled = true;

  // Global pointer lock change listeners (only add once)
  if (!window.__pointerLockGlobalListenersInstalled) {
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) {
        canvas.focus();
      }
    }, true);

    document.addEventListener('pointerlockerror', (error) => {
      console.warn('Pointer lock error:', error);
    }, true);

    window.__pointerLockGlobalListenersInstalled = true;
  }
}

/**
 * Displays a fatal error message to the user
 */
function showFatalError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(200, 50, 50, 0.95);
    color: white;
    padding: 30px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 500px;
    text-align: center;
    font-family: monospace;
  `;
  errorDiv.innerHTML = `
    <h2>Application Error</h2>
    <p>${message}</p>
    <p style="font-size: 0.9em; margin-top: 20px;">
      Check the browser console for more details.
    </p>
  `;
  document.body.appendChild(errorDiv);
}

// Listen for logout event to clear the canvas
eventBus.on(Events.USER_LOGGED_OUT, () => {
  console.log('[Main] User logged out, clearing canvas...');

  // Stop the render loop to prevent rendering errors
  if (appState.engine) {
    appState.engine.stopRenderLoop();
    console.log('[Main] Render loop stopped');
  }

  // Clear the scene
  if (appState.scene) {
    clearScene(appState.scene);
    // Dispose of the scene
    appState.scene.dispose();
    appState.scene = null;
  }

  // Clear the canvas visually after scene is disposed
  if (appState.engine) {
    clearCanvas(appState.engine);
    // Dispose of the engine
    appState.engine.dispose();
    appState.engine = null;
  }

  // Hide the canvas
  if (appState.canvas) {
    appState.canvas.style.display = 'none';
    console.log('[Main] Canvas hidden');
  }

  // Hide all UI elements
  // Hide task HUD (both the one managed by TaskHud.js and the one in HTML)
  TaskHud.hide();
  TaskHud.reset();
  // Legacy HUD cleanup removed

  // Hide console
  toggleConsoleVisibility(false);

  // Hide tutorial overlay
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  if (tutorialOverlay) {
    tutorialOverlay.style.display = 'none';
  }

  // Hide crosshair
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    crosshair.style.display = 'none';
  }

  // Clear toast container (but keep it visible for next session)
  const toastContainer = document.getElementById('toastContainer');
  if (toastContainer) {
    toastContainer.innerHTML = '';
    // Don't hide it - it will be reused on next login
  }

  console.log('[Main] All UI elements hidden');

  // Reset task manager state
  resetTaskManager();
  console.log('[Main] Task manager reset');

  // Reset points and badges
  PointsBadge.reset();
  console.log('[Main] Points and badges reset');
  PointsBadge.hide();
  // Reset tutorial
  if (appState.tutorial) {
    appState.tutorial = null;
  }

  // Reset pointer lock safety flag
  window.__pointerLockSafetyInstalled = false;

  // Reset initialization state
  appState.isInitialized = false;
  appState.isInitializing = false;

  // Show login page
  showLoginPage('login');
  console.log('[Main] Login page shown');
});

// Listen for auth success to re-initialize scene after logout
// This handler is ONLY for re-initialization after logout, NOT for first login
// First login is handled by initializeApp() which sets appState.isInitializing
eventBus.on(Events.AUTH_SUCCESS, async () => {
  // Only re-initialize if we're not already initialized and not currently initializing
  if (appState.isInitialized || appState.isInitializing) {
    console.log('[Main] Auth success, but already initialized or initializing, skipping re-init...');
    return;
  }

  appState.isInitializing = true;
  console.log('[Main] Auth success after logout, re-initializing scene...');

  try {
    // Ensure navbar is visible
    const nav = document.getElementById('mainNavigation');
    if (nav) {
      nav.style.display = 'block';
      nav.style.visibility = 'visible';
    }

    // Ensure canvas is visible
    let canvas = appState.canvas;
    if (!canvas) {
      canvas = document.getElementById(CONFIG.CANVAS_ID);
      if (canvas) appState.canvas = canvas;
    }

    if (canvas) {
      canvas.style.display = 'block';
      canvas.style.visibility = 'visible';
    }

    // Re-initialize core systems
    await initCore();

    // Ensure toast container is visible
    const toastContainer = document.getElementById('toastContainer');
    if (toastContainer) {
      toastContainer.style.display = 'flex';
    }

  } catch (error) {
    console.error('[Main] Error during scene re-initialization:', error);
  } finally {
    appState.isInitializing = false;
  }
});

window.addEventListener('DOMContentLoaded', initializeApp);

window.addEventListener('beforeunload', () => {
  if (appState.engine) {
    appState.engine.dispose();
  }
});
