/**
 * Validation Service
 *
 * Pure functions for validating task answers.
 * No database access — all logic is deterministic given the task definition.
 *
 *TODO:
  - To add a new task check type, add a new branch in
  - validateAnswer() and register the type in scenarios.json.
 */

/**
 * Parse a command string into command + arguments, respecting quoted strings.
 * @param {string} input - Raw command string (e.g. 'dd if=/dev/sdb of=/forensic/evidence.img')
 * @returns {string[]} Array where [0] is the command and [1..] are its arguments
 */
export function parseCommandArgs(input) {
    const args = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if ((char === '"' || char === "'") && (!inQuote || quoteChar === char)) {
            if (inQuote && quoteChar === char) {
                inQuote = false;
                quoteChar = '';
            } else if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else {
                current += char;
            }
        } else if (char === ' ' && !inQuote) {
            if (current) {
                args.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        args.push(current);
    }

    return args;
}

/**
 * Validate a user answer against a task definition.
 *
 * Supports three check types (determined by task fields):
 *  - interaction : task.checkType === 'interaction' && task.interactionTarget
 *  - flag        : task.checkType === 'flag'        && task.solutionValue
 *  - command     : task.checkCommand is set
 *
 * @param {Object} task   - Task object from scenarios.json
 * @param {string} answer - Raw answer string submitted by the user
 * @returns {{ correct: boolean }} Result object
 */
export function validateAnswer(task, answer) {
    // --- Interaction tasks ---
    if (task.checkType === 'interaction' && task.interactionTarget) {
        if (answer.startsWith('interaction:')) {
            const target = answer.substring('interaction:'.length);
            if (target === task.interactionTarget) return { correct: true };
        }
        return { correct: false };
    }

    // --- Flag / CTF tasks ---
    if (task.checkType === 'flag' && task.solutionValue) {
        const normalizedAnswer = answer.trim().toLowerCase();
        const normalizedSolution = task.solutionValue.trim().toLowerCase();
        return { correct: normalizedAnswer === normalizedSolution };
    }

    // --- Console command tasks ---
    if (task.checkCommand) {
        const parsedArgs = parseCommandArgs(answer);
        if (parsedArgs.length === 0) return { correct: false };

        const cmd = parsedArgs[0];
        const args = parsedArgs.slice(1);

        if (cmd !== task.checkCommand) return { correct: false };

        if (task.checkArgs && task.checkArgs.length > 0) {
            const normalizedArgs = args.map(arg => arg.replace(/\/$/, ''));
            const normalizedExpected = task.checkArgs.map(arg => arg.replace(/\/$/, ''));

            if (normalizedArgs.length !== normalizedExpected.length) return { correct: false };

            for (let i = 0; i < normalizedArgs.length; i++) {
                if (normalizedArgs[i] !== normalizedExpected[i]) return { correct: false };
            }
        } else if (args.length > 0) {
            return { correct: false };
        }

        return { correct: true };
    }

    // Unknown task type — conservatively reject
    return { correct: false };
}


/**
 * Calculate the score awarded for a task submission.
 *
 * @param {Object}  task          - Task object from scenarios.json (has .points)
 * @param {boolean} isCorrect     - Whether the submitted answer is correct
 * @param {number}  wrongAttempts - Number of previous wrong attempts for this task (≥ 0)
 * @returns {number} Points awarded (0 if incorrect)
 */
export function calculateScore(task, isCorrect, wrongAttempts) {
    if (!isCorrect) return 0;

    // Default: full points regardless of previous attempts.
    // Modify this function to implement partial scoring.
    return task.points || 0;
}