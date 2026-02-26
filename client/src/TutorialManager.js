/**
 * TutorialManager.js - Tutorial System
 * 
 * Manages the multi-step tutorial overlay, step progression,
 * and completion gate logic.
 * 
 * ARCHITECTURAL NOTE:
 * - Tutorial is a special hybrid component that coordinates between layers
 * - Receives scene object to access rendering layer internals via scene._renderingLayer
 * - Receives onDone callback for initialization coordination
 * - Emits events for UI layer interactions (console toggle)
 * - Accesses logic layer functions only for scenario data loading
 */

import { loadScenarios } from './taskManager.js';
import { eventBus, Events } from './eventBus.js';
import { authAPI } from './api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const TUTORIAL_CONFIG = {
  VERSION: '2.1-refactored',
  OVERLAY_ID: 'tutorial-overlay',
  TITLE_ID: 't-title',
  TEXT_ID: 't-text',
  SKIP_BTN_ID: 't-skip',
  NEXT_BTN_ID: 't-next',
  CANVAS_ID: 'renderCanvas'
};

// ============================================================================
// TUTORIAL MANAGER CLASS
// ============================================================================

export class TutorialManager {
  static VERSION = TUTORIAL_CONFIG.VERSION;

  constructor({ scene, onDone }) {
    this.scene = scene;
    this.onDone = onDone;
    this.idx = 0;
    this._done = false;
    this._gateOpen = false;
    this._gateBlocker = null;
    this._resetFlags();

    this.steps = this._initializeSteps();
    this.dom = this._initializeDom();

    this._setupEventHandlers();
    this._setupTutorialEventListeners();
    this._showStep(0);

    console.log(`TutorialManager ${TUTORIAL_CONFIG.VERSION} initialized`);
  }

  // ========================================================================
  // STEP DEFINITIONS
  // ========================================================================

  _initializeSteps() {
    return [
      {
        title: 'Forensic Investigator',
        text: 'You have been assigned to a complex digital case. Your task is to explore this environment, interact with the devices and use the Linux console to analyze the evidence. Every choice counts. Are you ready?',
        predicate: () => false,
      },
      {
        title: 'Look Around',
        text: 'Click on the canvas to look around, then press <b>ESC</b> to regain control of your mouse cursor.',
        predicate: () => this._canvasClicked && this._pressedEsc,
      },
      {
        title: 'Move Around',
        text: 'Move with <b>WASD</b> and look around with your mouse.',
        predicate: () => this._moved,
      },
      {
        title: 'Blue Interactables',
        text: 'Interactable objects are <b>highlighted in blue</b>. When you point at them, they turn <b>green</b>. Click on any blue object to continue.',
        predicate: () => this._clickedInteractable,
        onEnter: () => {
          this._clickedInteractable = false;
          this._highlightAllInteractables();
        },
        onExit: () => this._restoreHighlights(),
      },
      {
        title: 'Open Console',
        text: 'Open the console with <b>C</b>.',
        predicate: () => this._consoleOpened,
      },
      {
        title: 'Use Help Command',
        text: 'Type <b>help</b> in the console to see all available commands.',
        predicate: () => this._typedHelp,
        onEnter: () => {
          // Ensure console stays open for this step
          eventBus.emit(Events.CONSOLE_TOGGLE, { open: true });
          // Reposition console below the tutorial modal on small screens
          const consoleEl = document.getElementById('consoleContainer');
          if (consoleEl) {
            // Clear any drag-applied inline position so CSS anchor takes over cleanly
            consoleEl.style.top = '';
            consoleEl.style.left = '';
            consoleEl.style.transform = '';
            consoleEl.classList.add('console-tutorial-anchor');
          }
        },
        onExit: () => {
          // Remove anchor so the console returns to its default centered position
          const consoleEl = document.getElementById('consoleContainer');
          if (consoleEl) {
            consoleEl.classList.remove('console-tutorial-anchor');
          }
        }
      }
    ];
  }

  _initializeDom() {
    const $ = (id) => document.getElementById(id);
    return {
      overlay: $(TUTORIAL_CONFIG.OVERLAY_ID),
      title: $(TUTORIAL_CONFIG.TITLE_ID),
      text: $(TUTORIAL_CONFIG.TEXT_ID),
      btnSkip: $(TUTORIAL_CONFIG.SKIP_BTN_ID),
      btnNext: $(TUTORIAL_CONFIG.NEXT_BTN_ID),
      canvas: document.getElementById(TUTORIAL_CONFIG.CANVAS_ID),
    };
  }

  // ========================================================================
  // EVENT HANDLERS
  // ========================================================================

  _setupEventHandlers() {
    this.dom.overlay.classList.remove('mode-gate');
    this.dom.overlay.classList.add('mode-run');
    document.body.classList.add('tutorial-open');


    this._applyTheme();

    // Set up button handlers for regular tutorial steps
    this.dom.btnSkip.onclick = () => this._finish(true);
    this.dom.btnNext.onclick = () => this._advance();

    setTimeout(() => this.dom.canvas?.focus(), 0);
  }

  // ========================================================================
  // EVENT LISTENERS
  // ========================================================================

  _setupTutorialEventListeners() {
    eventBus.on(Events.TUTORIAL_MOVED, () => this._onMoved());
    eventBus.on(Events.TUTORIAL_INTERACTED, () => this._onInteracted());
    eventBus.on(Events.TUTORIAL_CONSOLE_OPENED, () => this._onConsoleOpened());
    eventBus.on(Events.TUTORIAL_INTERACTABLE_CLICKED, () => this._onClickedInteractable());
    eventBus.on(Events.TUTORIAL_COMMAND_TYPED, (data) => this._onTyped(data?.command));
    eventBus.on(Events.TUTORIAL_ESC_PRESSED, () => this._onPressedEsc());
    eventBus.on(Events.TUTORIAL_CANVAS_CLICKED, () => this._onCanvasClicked());
  }

  _onMoved() {
    if (this._done) return;
    this._moved = true;
    this._check();
  }

  _onInteracted() {
    if (this._done) return;
    this._interacted = true;
    this._check();
  }

  _onConsoleOpened() {
    if (this._done) return;
    this._consoleOpened = true;
    this._check();
  }

  _onClickedInteractable() {
    if (this._done) return;
    console.log('Tutorial: Clicked interactable');
    this._clickedInteractable = true;
    this._check();
  }

  _onTyped(cmd) {
    if (this._done) return;
    if (cmd === 'help') this._typedHelp = true;
    this._check();
  }

  _onPressedEsc() {
    if (this._done) return;
    this._pressedEsc = true;
    this._check();
  }

  _onCanvasClicked() {
    if (this._done) return;
    this._canvasClicked = true;
    this._check();
  }

  _applyTheme() {
    // Styles are now in CSS - just ensure animations are present
    const skipBtn = document.getElementById('t-skip');
    if (skipBtn) {
      skipBtn.className = 'tutorial-btn-secondary';
    }

    const nextBtn = document.getElementById('t-next');
    if (nextBtn) {
      nextBtn.className = 'tutorial-btn-primary';
    }

    // Add animations if not already present
    this._ensureAnimations();
  }

  _styleButton(btn, isPrimary) {
    // Styles are now in CSS - just set the class
    btn.className = isPrimary ? 'tutorial-btn-primary' : 'tutorial-btn-secondary';
  }

  _ensureAnimations() {
    // Animations are now in style.css - no need to inject them
  }

  // ========================================================================
  // STEP MANAGEMENT
  // ========================================================================

  _showStep(i) {
    this.idx = i;
    const step = this.steps[i];

    console.log(`Tutorial: Step ${i} - ${step.title}`);

    this.dom.title.innerHTML = step.title;
    this.dom.text.innerHTML = step.text;
    this.dom.overlay.style.display = 'block';
    this.dom.overlay.classList.remove('mode-gate');
    this.dom.overlay.classList.add('mode-run');

    this.dom.btnSkip.style.display = '';
    this.dom.btnNext.style.display = '';
    this.dom.btnNext.textContent = 'Next';

    // Reapply button styling for this step
    this._styleButton(this.dom.btnSkip, false);
    this._styleButton(this.dom.btnNext, true);

    this.dom.canvas?.focus();

    if (step.onEnter) {
      step.onEnter();
    }
  }

  _advance() {
    // Call onExit for current step
    if (this.idx >= 0 && this.idx < this.steps.length) {
      const currentStep = this.steps[this.idx];
      if (currentStep.onExit) {
        currentStep.onExit();
      }
    }

    if (this.idx < this.steps.length - 1) {
      this._showStep(this.idx + 1);
    } else {
      this._finish(false);
    }
  }

  _check() {
    if (this._done) return;

    const step = this.steps[this.idx];
    if (step?.predicate?.()) {
      this._advance();
    }
  }

  // ========================================================================
  // COMPLETION & GATE
  // ========================================================================

  _finish(skipped = false) {
    this._restoreHighlights();
    // Always clean up the tutorial console anchor (e.g. if skipped or on last step)
    document.getElementById('consoleContainer')?.classList.remove('console-tutorial-anchor');
    this._openGate(skipped);
  }

  _openGate(skipped) {
    if (this._gateOpen) return;

    this._gateOpen = true;
    this._done = true;

    this.dom.overlay.style.display = 'block';
    this.dom.overlay.classList.remove('mode-run');
    this.dom.overlay.classList.add('mode-gate');

    this.dom.title.innerHTML = 'Ready to Start';
    this.dom.text.innerHTML = skipped
      ? 'You skipped the tutorial. Click <b>Close</b> to begin.'
      : 'Great! You\'ve completed the mini-tutorial. Click <b>Close</b> to start.';

    this.dom.btnSkip.style.display = 'none';
    this.dom.btnNext.style.display = '';
    this.dom.btnNext.textContent = 'Close';

    // Reapply button styling for the close button
    this._styleButton(this.dom.btnNext, true);

    this.dom.btnNext.onclick = null;
    this.dom.btnSkip.onclick = null;

    document.exitPointerLock?.();

    const hint = document.getElementById('shortcutHint');
    if (hint) hint.style.opacity = '0';

    this._installInputBlocker();
    this._setupCloseHandler(skipped);
  }

  _installInputBlocker() {
    this._gateBlocker = (e) => {
      const card = this.dom.title.closest('#tutorial-card');
      const inside = card && card.contains(e.target);

      if (e.type === 'contextmenu' && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
      if (e.type.startsWith('key')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!inside) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', this._gateBlocker, true);
    window.addEventListener('keypress', this._gateBlocker, true);
    window.addEventListener('keyup', this._gateBlocker, true);
    window.addEventListener('pointerdown', this._gateBlocker, true);
    window.addEventListener('mousedown', this._gateBlocker, true);
    window.addEventListener('contextmenu', this._gateBlocker, true);
  }

  _setupCloseHandler(skipped) {
    const onClose = (ev) => {
      ev?.stopImmediatePropagation?.();
      ev?.preventDefault?.();

      // Emit event to UI layer to close console
      eventBus.emit(Events.CONSOLE_TOGGLE, { open: false });

      this._closeGate();
      document.body.classList.remove('tutorial-open');
      document.body.classList.remove('tutorial-grayscale');

      try {
        this.scene?.activeCamera?.attachControl(this.dom.canvas, true);
      } catch { }

      this._showResumeOverlay(skipped);
    };

    this.dom.btnNext.addEventListener('click', onClose);
  }

  _showResumeOverlay(skipped) {
    const resume = document.createElement('div');
    resume.id = 'resume-overlay';
    resume.innerHTML = `
      <div>
        Click anywhere to resume
      </div>
    `;
    document.body.appendChild(resume);

    const resumeHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      resume.remove();

      this.dom.canvas?.focus();

      if (!document.pointerLockElement && this.dom.canvas?.requestPointerLock) {
        this.dom.canvas.requestPointerLock();
      }

      window.removeEventListener('click', resumeHandler, true);
      window.removeEventListener('pointerdown', resumeHandler, true);

      try {
        window.showTaskHUD?.();
      } catch { }

      // Mark tutorial as completed on server
      try {
        await authAPI.completeTutorial();
        console.log('[TutorialManager] Tutorial marked as completed on server');
      } catch (error) {
        console.error('[TutorialManager] Failed to mark tutorial as completed:', error);
        // Don't block the flow if this fails
      }

      if (this.onDone) {
        this.onDone(skipped);
      }

      document.body.classList.remove('tutorial-grayscale');
    };

    window.addEventListener('click', resumeHandler, true);
    window.addEventListener('pointerdown', resumeHandler, true);
  }

  _closeGate() {
    if (!this._gateOpen) return;

    this._gateOpen = false;

    if (this._gateBlocker) {
      window.removeEventListener('keydown', this._gateBlocker, true);
      window.removeEventListener('keypress', this._gateBlocker, true);
      window.removeEventListener('keyup', this._gateBlocker, true);
      window.removeEventListener('pointerdown', this._gateBlocker, true);
      window.removeEventListener('mousedown', this._gateBlocker, true);
      window.removeEventListener('contextmenu', this._gateBlocker, true);
      this._gateBlocker = null;
    }

    this.dom.overlay.style.display = 'none';
    this.dom.overlay.classList.remove('mode-gate');
    document.body.classList.remove('tutorial-open');
    document.body.classList.remove('tutorial-grayscale');

    const hint = document.getElementById('shortcutHint');
    if (hint) hint.style.opacity = '1';
  }

  // ========================================================================
  // HIGHLIGHTING - Uses scene rendering layer via scene._renderingLayer
  // ========================================================================

  async _highlightAllInteractables() {
    try {
      console.log('Tutorial: Loading scenarios for highlight...');

      // Get references from rendering layer via scene object
      const renderLayer = this.scene._renderingLayer;
      if (!renderLayer) {
        console.error('Tutorial: Rendering layer not available');
        return;
      }

      const { allInteractableMeshes, highlightLayer, permanentHighlightedMeshes } = renderLayer;

      const scenarioData = await loadScenarios();
      window._tutorialHighlightPause = true;

      if (!scenarioData) {
        console.error('Tutorial: Scenario data loading failed');
        return;
      }

      if (!allInteractableMeshes || !highlightLayer) {
        console.error('Tutorial: Mesh list or highlight layer not found');
        return;
      }

      highlightLayer.removeAllMeshes();
      permanentHighlightedMeshes.length = 0;

      const allObjectNames = new Set();
      for (const scenarioKey in scenarioData) {
        const scenario = scenarioData[scenarioKey];
        if (scenario?.interactableObjects) {
          scenario.interactableObjects.forEach(name => allObjectNames.add(name));
        }
      }

      const targetNames = Array.from(allObjectNames);

      allInteractableMeshes.forEach(mesh => {
        const isMatch = targetNames.some(targetName => this._isMeshMatching(mesh, targetName));
        if (isMatch) {
          permanentHighlightedMeshes.push(mesh);
        }
      });

      console.log(`Tutorial: Highlighted ${permanentHighlightedMeshes.length} objects`);

    } catch (error) {
      console.error('Tutorial: Highlight setup failed:', error);
    }
  }

  _restoreHighlights() {
    console.log('Tutorial: Restoring highlights...');

    const renderLayer = this.scene._renderingLayer;
    if (!renderLayer) return;

    const { highlightLayer, permanentHighlightedMeshes } = renderLayer;

    if (highlightLayer) {
      highlightLayer.removeAllMeshes();
    }

    if (permanentHighlightedMeshes) {
      permanentHighlightedMeshes.length = 0;
    }

    window._tutorialHighlightPause = false;
  }

  /**
   * Helper function to check if a mesh matches a target name
   * Used locally to avoid import from rendering layer
   */
  _isMeshMatching(mesh, targetName) {
    if (!mesh || !targetName) return false;

    const meshName = mesh?.name || '';
    const meshId = mesh?.id || '';

    // Exact match
    if (meshName === targetName || meshId === targetName) return true;

    // Starts with target
    if (meshName.startsWith(targetName + '_') || meshName.startsWith(targetName + '-')) return true;
    if (meshId.startsWith(targetName + '_') || meshId.startsWith(targetName + '-')) return true;

    // Contains target
    if (meshName.includes(targetName) || meshId.includes(targetName)) return true;

    // Metadata tag match
    if (mesh.metadata?.tag === targetName) return true;

    return false;
  }

  // ========================================================================
  // FLAG MANAGEMENT
  // ========================================================================

  _resetFlags() {
    this._moved = false;
    this._interacted = false;
    this._consoleOpened = false;
    this._typedHelp = false;
    this._clickedInteractable = false;
    this._pressedEsc = false;
    this._canvasClicked = false;
  }

  // ========================================================================
  // PUBLIC SIGNALS
  // ========================================================================

  restart() {
    if (this._gateOpen) this._closeGate();

    this._done = false;
    this._resetFlags();
    this.idx = 0;

    try {
      window.hideTaskHUD?.();
    } catch { }

    this.dom.btnSkip.onclick = () => this._finish(true);
    this.dom.btnNext.onclick = () => this._advance();

    this._showStep(0);
    document.body.classList.add('tutorial-open');

    try {
      document.exitPointerLock?.();
    } catch { }

    this.dom.canvas?.focus();
  }

}

console.log('TutorialManager module loaded');

