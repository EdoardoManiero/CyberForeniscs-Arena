/**
 * Leaderboard Component
 * 
 * Displays user rankings based on total scores.
 */

import { leaderboardAPI } from './api.js';

// ============================================================================
// STATE
// ============================================================================

let leaderboardModal = null;
let leaderboardData = null;

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create leaderboard modal
 */
function createLeaderboardModal() {
  if (leaderboardModal) return leaderboardModal;

  const modal = document.createElement('div');
  modal.id = 'leaderboardModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__content modal__content--large">
      <div class="modal__header">
        <h2>
          <i class="fas fa-trophy"></i>
          Leaderboard
        </h2>
        <button class="modal__close" id="leaderboardClose" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="modal__body">
        <div class="leaderboard__loading" id="leaderboardLoading">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading leaderboard...</span>
        </div>
        
        <div class="leaderboard__error" id="leaderboardError" style="display: none;"></div>
        
        <div class="leaderboard__table" id="leaderboardTable" style="display: none;">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Tasks Completed</th>
              </tr>
            </thead>
            <tbody id="leaderboardBody">
              <!-- Rows will be populated here -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  leaderboardModal = modal;
  setupEventListeners();
  return modal;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const closeBtn = document.getElementById('leaderboardClose');
  const backdrop = leaderboardModal.querySelector('.modal__backdrop');
  
  const closeModal = () => hide();
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  
  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && leaderboardModal?.classList.contains('active')) {
      closeModal();
    }
  });
}

/**
 * Load leaderboard data
 */
async function loadLeaderboard() {
  const loading = document.getElementById('leaderboardLoading');
  const error = document.getElementById('leaderboardError');
  const table = document.getElementById('leaderboardTable');
  const body = document.getElementById('leaderboardBody');
  
  loading.style.display = 'flex';
  error.style.display = 'none';
  table.style.display = 'none';
  
  try {
    const data = await leaderboardAPI.getLeaderboard();
    leaderboardData = data;
    renderLeaderboard(data);
    
    loading.style.display = 'none';
    table.style.display = 'block';
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
    error.textContent = 'Failed to load leaderboard. Please try again later.';
    error.style.display = 'block';
    loading.style.display = 'none';
  }
}

/**
 * Render leaderboard data
 */
function renderLeaderboard(data) {
  const body = document.getElementById('leaderboardBody');
  if (!body) return;
  
  body.innerHTML = '';
  
  if (!data || data.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">No players yet. Be the first!</td></tr>';
    return;
  }
  
  data.forEach((entry, index) => {
    const row = document.createElement('tr');
    const rank = index + 1;
    
    // Add medal emoji for top 3
    let rankDisplay = rank;
    if (rank === 1) rankDisplay = '     1';
    else if (rank === 2) rankDisplay = '     2';
    else if (rank === 3) rankDisplay = '     3';
    
    row.innerHTML = `
      <td class="leaderboard__rank">${rankDisplay}</td>
      <td class="leaderboard__name">${escapeHtml(entry.displayName)}</td>
      <td class="leaderboard__score">
        <i class="fas fa-star"></i>
        ${entry.totalScore.toLocaleString()}
      </td>
      <td class="leaderboard__tasks">${entry.tasksCompleted}</td>
    `;
    
    body.appendChild(row);
  });
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show leaderboard modal
 */
export async function showLeaderboard() {
  createLeaderboardModal();
  leaderboardModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  await loadLeaderboard();
}

/**
 * Hide leaderboard modal
 */
export function hideLeaderboard() {
  if (leaderboardModal) {
    leaderboardModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Export hide as default
export const hide = hideLeaderboard;