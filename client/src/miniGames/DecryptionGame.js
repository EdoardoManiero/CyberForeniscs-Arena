/**
 * DecryptionGame.js
 * Memory Dump Analyzer (Hex Signature Search)
 * User must find a specific hex sequence in a memory dump.
 */

export class DecryptionGame {
    constructor() {
        this.title = "MEMORY DUMP ANALYZER";
        this.container = null;
        this.callbacks = null;
        this.memorySize = 1024; // Increased from 256
        this.bytesPerRow = 16;
        this.targetSignature = ['4D', '5A', '90', '00']; // PE Header example
        this.memoryBuffer = [];
        this.targetIndex = -1;
        this.timeLeft = 90; // Decreased from 120
        this.timerInterval = null;
        this.hintAvailable = false;
        this.isActive = false;
    }

    init(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.timeLeft = 90;
        this.hintAvailable = false;
        this.isActive = false;

        this.generateMemory();
        this.renderIntro();
    }

    generateMemory() {
        this.memoryBuffer = [];
        const hexChars = '0123456789ABCDEF';

        // Generate random memory
        for (let i = 0; i < this.memorySize; i++) {
            let byte = hexChars[Math.floor(Math.random() * 16)] + hexChars[Math.floor(Math.random() * 16)];
            this.memoryBuffer.push(byte);
        }

        // Insert Decoys (Near matches)
        // e.g. 4D 5A 90 FF (Last byte wrong) or 4D 5A FF 00 (3rd byte wrong)
        const numDecoys = 8;
        for (let d = 0; d < numDecoys; d++) {
            const decoyIdx = Math.floor(Math.random() * (this.memorySize - 4));
            // Copy target sig
            const decoySig = [...this.targetSignature];
            // Change one byte randomly
            const changeIdx = Math.floor(Math.random() * 4);
            decoySig[changeIdx] = hexChars[Math.floor(Math.random() * 16)] + hexChars[Math.floor(Math.random() * 16)];

            // Ensure we don't accidentally create the real sig
            if (decoySig[changeIdx] === this.targetSignature[changeIdx]) {
                decoySig[changeIdx] = 'FF';
            }

            for (let i = 0; i < 4; i++) {
                if (decoyIdx + i < this.memorySize) {
                    this.memoryBuffer[decoyIdx + i] = decoySig[i];
                }
            }
        }

        // Insert Target (Ensure it overwrites any decoy if collision)
        this.targetIndex = Math.floor(Math.random() * (this.memorySize - this.targetSignature.length));
        for (let i = 0; i < this.targetSignature.length; i++) {
            this.memoryBuffer[this.targetIndex + i] = this.targetSignature[i];
        }
    }

    renderIntro() {
        this.container.innerHTML = `
            <div class="intro-screen">
                <h2>MEMORY FORENSIC TASK</h2>
                <div class="intro-content">
                    <p><strong>OBJECTIVE:</strong> Locate the malware signature in the memory dump.</p>
                    <p><strong>INTELLIGENCE:</strong> Attackers are using <strong>Reflective DLL Injection</strong>. Look for the PE Header signature:</p>
                    <p style="text-align:center; font-size: 1.2em; margin: 10px 0;"><span style="color:#f00; font-family:monospace; background: #220000; padding: 5px;">4D 5A 90 00</span></p>
                    <p><strong>WARNING:</strong> The memory dump contains <strong>corrupted fragments (decoys)</strong> that look similar. Verify the ENTIRE sequence before selecting.</p>
                    <p><strong>INSTRUCTIONS:</strong> Click the <strong>first byte (4D)</strong> of the correct sequence.</p>
                </div>
                <button class="btn-start">START SCAN (90s)</button>
            </div>
        `;

        this.container.querySelector('.btn-start').addEventListener('click', () => {
            this.isActive = true;
            this.renderGame();
            this.startTimer();
        });
    }

    renderGame() {
        this.container.innerHTML = `
            <div class="hex-game-container">
                <div class="hex-sidebar">
                    <div class="target-panel">
                        <h3>TARGET SIGNATURE</h3>
                        <div class="sig-display">${this.targetSignature.join(' ')}</div>
                        <div class="sig-desc" style="color:#888; font-size:12px; margin-top:5px;">Windows PE Header</div>
                    </div>
                    <div class="status-panel">
                        <p>STATUS: <span class="blink">SCANNING</span></p>
                        <p>OFFSET: <span id="hover-offset">0x0000</span></p>
                    </div>
                    <button id="btn-hint" class="btn-hint" disabled style="margin-top:20px; padding:10px; background:#333; color:#555; border:1px solid #555; cursor:not-allowed;">HINT (Wait...)</button>
                </div>
                <div class="hex-view" id="hexView">
                    <!-- Hex rows generated here -->
                </div>
            </div>
        `;

        this.renderHexView();

        // Hint Timer
        setTimeout(() => {
            if (this.isActive) this.enableHint();
        }, 15000);
    }

    enableHint() {
        const btn = this.container.querySelector('#btn-hint');
        if (btn) {
            btn.textContent = "ACTIVATE HINT";
            btn.disabled = false;
            btn.style.background = "#004400";
            btn.style.color = "#0f0";
            btn.style.borderColor = "#0f0";
            btn.style.cursor = "pointer";
            btn.addEventListener('click', () => this.showHint());
        }
    }

    showHint() {
        if (!this.isActive) return;

        // Find the row containing the target
        const rowIdx = Math.floor(this.targetIndex / this.bytesPerRow);
        const rows = this.container.querySelectorAll('.hex-row');
        if (rows[rowIdx]) {
            rows[rowIdx].style.backgroundColor = "#003300";
            rows[rowIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Disable button
        const btn = this.container.querySelector('#btn-hint');
        if (btn) {
            btn.textContent = "HINT ACTIVE";
            btn.disabled = true;
            btn.style.background = "#333";
            btn.style.color = "#888";
            btn.style.borderColor = "#555";
        }

        // Penalty
        this.timeLeft = Math.max(5, this.timeLeft - 15);
        this.updateTimerDisplay();
    }

    renderHexView() {
        const hexView = this.container.querySelector('#hexView');
        hexView.innerHTML = '';

        const rows = Math.ceil(this.memorySize / this.bytesPerRow);

        for (let r = 0; r < rows; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'hex-row';

            // Offset
            const offsetEl = document.createElement('div');
            offsetEl.className = 'hex-offset';
            offsetEl.textContent = '0x' + (r * this.bytesPerRow).toString(16).padStart(4, '0').toUpperCase();
            rowEl.appendChild(offsetEl);

            // Bytes
            const bytesEl = document.createElement('div');
            bytesEl.className = 'hex-bytes';

            // ASCII Container
            const asciiEl = document.createElement('div');
            asciiEl.className = 'hex-ascii';

            for (let b = 0; b < this.bytesPerRow; b++) {
                const globalIndex = r * this.bytesPerRow + b;
                if (globalIndex >= this.memorySize) break;

                const byteVal = this.memoryBuffer[globalIndex];

                // Hex Byte
                const byteEl = document.createElement('span');
                byteEl.className = 'hex-byte';
                byteEl.textContent = byteVal;
                byteEl.dataset.index = globalIndex;

                byteEl.addEventListener('mouseover', () => {
                    const offsetDisplay = this.container.querySelector('#hover-offset');
                    if (offsetDisplay) offsetDisplay.textContent = '0x' + globalIndex.toString(16).padStart(4, '0').toUpperCase();

                    // Highlight corresponding ASCII
                    const asciiSpan = this.container.querySelector(`.hex-ascii-char[data-index="${globalIndex}"]`);
                    if (asciiSpan) asciiSpan.classList.add('hover');
                });

                byteEl.addEventListener('mouseout', () => {
                    const asciiSpan = this.container.querySelector(`.hex-ascii-char[data-index="${globalIndex}"]`);
                    if (asciiSpan) asciiSpan.classList.remove('hover');
                });

                byteEl.addEventListener('click', () => this.handleByteClick(globalIndex));
                bytesEl.appendChild(byteEl);

                // ASCII Char
                const val = parseInt(byteVal, 16);
                const char = (val >= 32 && val <= 126) ? String.fromCharCode(val) : '.';

                const charEl = document.createElement('span');
                charEl.className = 'hex-ascii-char';
                charEl.textContent = char;
                charEl.dataset.index = globalIndex;
                asciiEl.appendChild(charEl);
            }
            rowEl.appendChild(bytesEl);
            rowEl.appendChild(asciiEl);

            hexView.appendChild(rowEl);
        }
    }

    handleByteClick(index) {
        if (!this.isActive) return;

        // Check if user clicked the start of the sequence
        if (index === this.targetIndex) {
            this.win();
        } else {
            // Penalty or visual feedback
            const byteEl = this.container.querySelector(`.hex-byte[data-index="${index}"]`);
            if (byteEl) {
                byteEl.classList.add('error');
                setTimeout(() => byteEl.classList.remove('error'), 500);
            }

            // Check if it was a decoy (partial match)
            // Logic: if it matches the first byte but not the rest
            if (this.memoryBuffer[index] === this.targetSignature[0]) {
                // It was a trap!
                this.timeLeft -= 10; // Higher penalty for falling for decoy
            } else {
                this.timeLeft -= 5;
            }

            this.updateTimerDisplay();
        }
    }

    startTimer() {
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            if (!this.isActive) return;
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                this.lose();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const timerEl = document.querySelector('.mini-game-timer');
        if (timerEl) {
            const minutes = Math.floor(this.timeLeft / 60);
            const seconds = this.timeLeft % 60;
            timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (this.timeLeft <= 10) timerEl.style.color = '#f00';
            else timerEl.style.color = '#0f0';
        }
    }

    win() {
        this.isActive = false;
        clearInterval(this.timerInterval);

        // Lock result immediately to prevent abort during animation
        if (this.callbacks && this.callbacks.lockResult) {
            this.callbacks.lockResult();
        }

        // Highlight the sequence in both Hex and ASCII
        for (let i = 0; i < this.targetSignature.length; i++) {
            const idx = this.targetIndex + i;
            const hexEl = this.container.querySelector(`.hex-byte[data-index="${idx}"]`);
            const asciiEl = this.container.querySelector(`.hex-ascii-char[data-index="${idx}"]`);

            if (hexEl) hexEl.classList.add('found');
            if (asciiEl) asciiEl.classList.add('found');
        }

        // Scroll to it
        const rowIdx = Math.floor(this.targetIndex / this.bytesPerRow);
        const rows = this.container.querySelectorAll('.hex-row');
        if (rows[rowIdx]) {
            rows[rowIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        setTimeout(() => {
            this.container.innerHTML = `
                <div class="success-message">
                    <h2>MALWARE ISOLATED</h2>
                    <p>Signature Match Confirmed.</p>
                    <p>Memory Offset: 0x${this.targetIndex.toString(16).toUpperCase()}</p>
                    <p>Decoded: <strong>MZ..</strong> (Windows Executable Detected)</p>
                </div>
            `;
            setTimeout(() => {
                if (this.callbacks) this.callbacks.onSuccess();
            }, 3000);
        }, 1500);
    }

    lose() {
        this.isActive = false;
        clearInterval(this.timerInterval);

        // Lock result immediately to prevent abort during animation
        if (this.callbacks && this.callbacks.lockResult) {
            this.callbacks.lockResult();
        }

        this.container.innerHTML = '<div class="success-message" style="color:#f00; border-color:#f00;"><h2>SCAN FAILED</h2><p>Signature not found in time.</p></div>';
        setTimeout(() => {
            if (this.callbacks) this.callbacks.onFail();
        }, 2000);
    }
}
