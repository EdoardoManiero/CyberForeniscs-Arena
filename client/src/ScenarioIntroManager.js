/**
 * ScenarioIntroManager.js - Scenario Introduction System
 * 
 * Displays a modal overlay with scenario introduction and briefing
 * when a player selects a new scenario.
 * 
 * LAYER: UI Layer
 * Coordinates with Task Manager to show scenario details before gameplay
 */

import { TaskHud } from './taskHud.js';
import { eventBus, Events } from './eventBus.js';
export class ScenarioIntroManager {
  static VERSION = '1.0-initial';

  constructor(scene = null) {
    this._isShowing = false;
    this.scene = scene;
  }

  /**
   * Shows scenario introduction modal
   * @param {Object} scenarioData - The scenario data object
   * @returns {Promise<void>} Resolves when user closes the modal
   */
  showIntro(scenarioData) {
    window._disablePointerLock = true;
    
    const canvas = this.scene?._renderingLayer?.canvas || document.getElementById('renderCanvas');
    // Get fresh camera reference from scene, not cached
    const camera = this.scene?.activeCamera;
    
    if (!canvas) {
      console.warn('[ScenarioIntro] Canvas not found, cannot setup pointer lock exit');
    }
    if (!camera) {
      console.warn('[ScenarioIntro] Camera not found, cannot detach controls');
    }
    
    // Ensure canvas is visible so scene is rendered behind modal
    if (canvas) {
      canvas.style.display = 'block';
      // Force a render to ensure scene is visible
      if (this.scene) {
        this.scene.render();
      }
    }
    
    // Detach camera controls FIRST
    if (camera && canvas) {
      try {
        camera.detachControl(canvas);
        // Reset camera's internal pointer lock state
        if (camera._needPointerLock !== undefined) {
          camera._needPointerLock = false;
        }
        console.log('[ScenarioIntro] Camera controls detached');
      } catch (e) {
        console.warn('[ScenarioIntro] Failed to detach camera:', e);
      }
    }
    
    // Force exit pointer lock immediately and aggressively
    try {
      document.exitPointerLock?.();
    } catch (e) {
      console.warn('[ScenarioIntro] Initial exitPointerLock failed:', e);
    }
    
    let lockAttempts = 0;
    const exitLock = () => {
      if (lockAttempts++ < 100) {  // Increased attempts from 50 to 100
        try {
          document.exitPointerLock?.();
        } catch (e) {
          // Silent fail, we're retrying anyway
        }
        setTimeout(exitLock, 5);  // Reduced interval from 10ms to 5ms
      }
    };
    exitLock();
    
    // Disable pointer events on canvas
    if (canvas) {
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'auto';
      
      // Block all mouse events on canvas during modal
      const blockEvent = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      canvas.addEventListener('mousedown', blockEvent, true);
      canvas.addEventListener('mouseup', blockEvent, true);
      canvas.addEventListener('mousemove', blockEvent, true);
      canvas.addEventListener('click', blockEvent, true);
      
      // Store handlers so we can remove them later
      canvas._modalBlockHandlers = {
        mousedown: blockEvent,
        mouseup: blockEvent,
        mousemove: blockEvent,
        click: blockEvent
      };
    }
    
    TaskHud.hide();
    eventBus.emit(Events.CONSOLE_TOGGLE,{open : false});
    
    return new Promise((resolve) => {
      if (!scenarioData || !scenarioData.introduction) {
        console.warn('[ScenarioIntro] No introduction text provided');
        resolve();
        return;
      }

      if (this._isShowing) {
        console.warn('[ScenarioIntro] Intro already showing');
        resolve();
        return;
      }

      this._isShowing = true;

      // Create overlay
      const overlay = this._createOverlay();
      
      // Create card with scenario info
      const card = this._createCard(scenarioData);
      
      // Create close handler
      const onClose = () => {
        this._closeIntro(overlay);
        this._isShowing = false;
        TaskHud.show();
        
        // Remove event blocking from canvas
        if (canvas && canvas._modalBlockHandlers) {
          const handlers = canvas._modalBlockHandlers;
          canvas.removeEventListener('mousedown', handlers.mousedown, true);
          canvas.removeEventListener('mouseup', handlers.mouseup, true);
          canvas.removeEventListener('mousemove', handlers.mousemove, true);
          canvas.removeEventListener('click', handlers.click, true);
          canvas._modalBlockHandlers = null;
        }
        
        if (canvas) canvas.style.pointerEvents = 'auto';
        window._disablePointerLock = false;
        
        // Re-attach camera controls - get fresh reference from scene
        const currentCamera = this.scene?.activeCamera;
        if (currentCamera && canvas) {
          try {
            // Detach first to ensure clean state
            currentCamera.detachControl(canvas);
            // Small delay to ensure everything is settled
            setTimeout(() => {
              if (currentCamera && canvas) {
                // Re-attach controls
                currentCamera.attachControl(canvas, true);
                // Focus canvas to enable keyboard input
                canvas.focus();
                console.log('[ScenarioIntro] Camera controls re-attached and canvas focused');
                
                // Verify controls are attached
                if (!currentCamera._attachedCanvas) {
                  console.warn('[ScenarioIntro] Camera controls not attached, retrying...');
                  currentCamera.attachControl(canvas, true);
                  canvas.focus();
                }
              }
            }, 50);
          } catch (e) {
            console.warn('[ScenarioIntro] Failed to re-attach camera:', e);
          }
        }
        
        resolve();
      };

      // Add close button handler
      const closeBtn = card.querySelector('.scenario-intro-close');
      closeBtn.onclick = onClose;

      // Close on overlay click (outside card)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          onClose();
        }
      });

      // Add to DOM
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Focus card for accessibility
      card.focus();

      console.log(`[ScenarioIntro] Showing introduction for: ${scenarioData.title}`);
    });
  }

  _createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'scenario-intro-overlay';
    
    // Prevent events on overlay background only (not on children like buttons)
    const stopBackgroundEvent = (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    overlay.addEventListener('mousedown', stopBackgroundEvent, true);
    overlay.addEventListener('mouseup', stopBackgroundEvent, true);
    overlay.addEventListener('contextmenu', stopBackgroundEvent, true);
    
    return overlay;
  }

  _createCard(scenarioData) {
    const card = document.createElement('div');
    card.className = 'scenario-intro-card';
    card.tabIndex = 0;

    // Title
    const titleEl = document.createElement('h1');
    titleEl.className = 'scenario-intro-title';
    titleEl.innerHTML = scenarioData.title;

    // Description (if available)
    const descEl = document.createElement('div');
    descEl.className = 'scenario-intro-description';
    descEl.innerHTML = scenarioData.description || '';

    // Divider
    const divider = document.createElement('div');
    divider.className = 'scenario-intro-divider';

    // Introduction text
    const introEl = document.createElement('p');
    introEl.className = 'scenario-intro-text';
    introEl.innerHTML = scenarioData.introduction;

    // Task count if available
    let taskCountEl = null;
    if (scenarioData.tasks && scenarioData.tasks.length > 0) {
      taskCountEl = document.createElement('div');
      taskCountEl.className = 'scenario-intro-task-count';
      taskCountEl.innerHTML = `<strong>Tasks:</strong> ${scenarioData.tasks.length} steps to complete`;
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'scenario-intro-close';
    closeBtn.innerHTML = 'Start Investigation';

    // Assemble card
    card.appendChild(titleEl);
    if (descEl.innerHTML) card.appendChild(descEl);
    card.appendChild(divider);
    card.appendChild(introEl);
    if (taskCountEl) card.appendChild(taskCountEl);
    card.appendChild(closeBtn);

    return card;
  }

  _closeIntro(overlay) {
    overlay.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      overlay.remove();
    }, 300);
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

// Animations are now in style.css - no need to inject them