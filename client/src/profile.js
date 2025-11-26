/**
 * User Profile Component
 * 
 * Displays user profile information, stats, and badges.
 */

import { getCurrentUser } from './session.js';
import { leaderboardAPI } from './api.js';

// ============================================================================
// STATE
// ============================================================================

let profileModal = null;

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create profile modal
 */
function createProfileModal() {
  if (profileModal) return profileModal;

  const modal = document.createElement('div');
  modal.id = 'profileModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__content modal__content--medium">
      <div class="modal__header">
        <h2>
          <i class="fas fa-user"></i>
          Profile
        </h2>
        <button class="modal__close" id="profileClose" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="modal__body">
        <div class="profile__loading" id="profileLoading" style="display: none;">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading profile...</span>
        </div>
        
        <div class="profile__content" id="profileContent">
          <!-- Profile content will be populated here -->
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  profileModal = modal;
  setupEventListeners();
  return modal;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const closeBtn = document.getElementById('profileClose');
  const backdrop = profileModal.querySelector('.modal__backdrop');
  
  const closeModal = () => hide();
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  
  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profileModal?.classList.contains('active')) {
      closeModal();
    }
  });
}

/**
 * Load and render profile data
 */
async function loadProfile() {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return;
  }
  
  const loading = document.getElementById('profileLoading');
  const content = document.getElementById('profileContent');
  
  loading.style.display = 'flex';
  content.innerHTML = '';
  
  try {
    // Get leaderboard to find user's rank
    const leaderboard = await leaderboardAPI.getLeaderboard();
    const userRank = leaderboard.findIndex(u => u.id === user.id) + 1;
    const userStats = leaderboard.find(u => u.id === user.id) || { totalScore: 0, tasksCompleted: 0 };
    
    // Render profile
    content.innerHTML = `
      <div class="profile__header">
        <div class="profile__avatar">
          <i class="fas fa-user-circle"></i>
        </div>
        <div class="profile__info">
          <h3>${escapeHtml(user.displayName)}</h3>
          <p class="profile__email">${escapeHtml(user.email)}</p>
        </div>
      </div>
      
      <div class="profile__stats">
        <div class="profile__stat">
          <div class="profile__stat-icon">
            <i class="fas fa-trophy"></i>
          </div>
          <div class="profile__stat-content">
            <div class="profile__stat-value">${userRank || 'N/A'}</div>
            <div class="profile__stat-label">Rank</div>
          </div>
        </div>
        
        <div class="profile__stat">
          <div class="profile__stat-icon">
            <i class="fas fa-star"></i>
          </div>
          <div class="profile__stat-content">
            <div class="profile__stat-value">${userStats.totalScore.toLocaleString()}</div>
            <div class="profile__stat-label">Total Score</div>
          </div>
        </div>
        
        <div class="profile__stat">
          <div class="profile__stat-icon">
            <i class="fas fa-tasks"></i>
          </div>
          <div class="profile__stat-content">
            <div class="profile__stat-value">${userStats.tasksCompleted}</div>
            <div class="profile__stat-label">Tasks Completed</div>
          </div>
        </div>
      </div>
      
      <div class="profile__meta">
        <div class="profile__meta-item">
          <i class="fas fa-calendar"></i>
          <span>Member since: ${formatDate(user.createdAt)}</span>
        </div>
      </div>
    `;
    
    loading.style.display = 'none';
  } catch (error) {
    console.error('Failed to load profile:', error);
    content.innerHTML = `
      <div class="profile__error">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load profile data. Please try again later.</p>
      </div>
    `;
    loading.style.display = 'none';
  }
}

/**
 * Format date
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch (error) {
    return 'Unknown';
  }
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
 * Show profile modal
 */
export async function showProfile() {
  createProfileModal();
  profileModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  await loadProfile();
}

/**
 * Hide profile modal
 */
export function hideProfile() {
  if (profileModal) {
    profileModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Export hide as default
export const hide = hideProfile;
