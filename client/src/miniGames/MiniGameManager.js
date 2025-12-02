/**
 * MiniGameManager.js
 * Manages the lifecycle of mini-games (start, stop, success, fail).
 */

export class MiniGameManager {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.currentGame = null;
        this.onComplete = null; // Callback when game finishes
        this.isResultLocked = false; // Prevents abort from overriding win/lose
        this.isFinished = false; // Prevents duplicate finishGame calls

        this.initOverlay();
    }

    initOverlay() {
        // Create overlay elements if they don't exist
        if (document.getElementById('mini-game-overlay')) {
            this.overlay = document.getElementById('mini-game-overlay');
            this.container = this.overlay.querySelector('.mini-game-content');
            return;
        }

        this.overlay = document.createElement('div');
        this.overlay.id = 'mini-game-overlay';

        this.overlay.innerHTML = `
            <div class="mini-game-container">
                <div class="mini-game-header">
                    <div class="mini-game-title">HACKING SEQUENCE</div>
                    <div class="mini-game-timer">00:00</div>
                </div>
                <div class="mini-game-content"></div>
                <div class="mini-game-footer">
                    ACCESSING SECURE SYSTEM...
                </div>
                <button class="mini-game-close">ABORT</button>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.container = this.overlay.querySelector('.mini-game-content');

        // Close button handler
        this.overlay.querySelector('.mini-game-close').addEventListener('click', () => {
            this.abortGame();
        });
    }

    /**
     * Start a mini-game
     * @param {Object} gameInstance - Instance of the game class
     * @param {Function} callback - Function to call on completion (success: boolean)
     */
    startGame(gameInstance, callback) {
        this.currentGame = gameInstance;
        this.onComplete = callback;
        this.isResultLocked = false; // Reset lock state for new game
        this.isFinished = false; // Reset finish state for new game

        // Clear previous content
        this.container.innerHTML = '';

        // Re-enable abort button for new game
        const closeBtn = this.overlay.querySelector('.mini-game-close');
        if (closeBtn) {
            closeBtn.disabled = false;
            closeBtn.style.opacity = '1';
            closeBtn.style.pointerEvents = 'auto';
        }

        // Show overlay FIRST so dimensions are available
        this.overlay.classList.add('active');

        // Initialize game
        // lockResult: Call this immediately when game outcome is determined (before animations)
        // This prevents abort from overriding a completed game during success/fail animations
        this.currentGame.init(this.container, {
            onSuccess: () => this.finishGame(true),
            onFail: () => this.finishGame(false),
            lockResult: () => this.lockResult()
        });

        // Update title if game has one
        const titleEl = this.overlay.querySelector('.mini-game-title');
        if (this.currentGame.title) {
            titleEl.textContent = this.currentGame.title;
        }
    }

    finishGame(success) {
        // Prevent race condition: if game already finished (won/lost), ignore further calls
        // This prevents abort from overriding a completed game during the success animation delay
        if (this.isFinished) {
            return;
        }
        this.isFinished = true;

        // Disable abort button immediately to prevent accidental clicks
        const closeBtn = this.overlay.querySelector('.mini-game-close');
        if (closeBtn) {
            closeBtn.disabled = true;
            closeBtn.style.opacity = '0.5';
            closeBtn.style.pointerEvents = 'none';
        }

        this.overlay.classList.remove('active');
        this.container.innerHTML = '';
        this.currentGame = null;

        if (this.onComplete) {
            this.onComplete(success);
        }
    }

    abortGame() {
        // Only allow abort if game result hasn't been locked (win/lose determined)
        if (this.isResultLocked) {
            return;
        }
        this.finishGame(false);
    }

    /**
     * Lock the game result - prevents abort from overriding outcome
     * Games should call this immediately when they determine win/lose,
     * before starting their success/fail animations
     */
    lockResult() {
        this.isResultLocked = true;

        // Disable abort button immediately
        const closeBtn = this.overlay.querySelector('.mini-game-close');
        if (closeBtn) {
            closeBtn.disabled = true;
            closeBtn.style.opacity = '0.5';
            closeBtn.style.pointerEvents = 'none';
        }
    }
}

// Singleton instance
export const miniGameManager = new MiniGameManager();
