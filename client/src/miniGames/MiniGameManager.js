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

        // Clear previous content
        this.container.innerHTML = '';

        // Show overlay FIRST so dimensions are available
        this.overlay.classList.add('active');

        // Initialize game
        this.currentGame.init(this.container, {
            onSuccess: () => this.finishGame(true),
            onFail: () => this.finishGame(false)
        });

        // Update title if game has one
        const titleEl = this.overlay.querySelector('.mini-game-title');
        if (this.currentGame.title) {
            titleEl.textContent = this.currentGame.title;
        }
    }

    finishGame(success) {
        this.overlay.classList.remove('active');
        this.container.innerHTML = '';
        this.currentGame = null;

        if (this.onComplete) {
            this.onComplete(success);
        }
    }

    abortGame() {
        this.finishGame(false);
    }
}

// Singleton instance
export const miniGameManager = new MiniGameManager();
