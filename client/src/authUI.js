/**
 * Authentication UI Component
 * 
 * Provides login and registration modals with form validation.
 * Follows best practices for secure authentication UI.
 */

import { login, register } from './session.js';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// STATE
// ============================================================================

let authModal = null;
let currentMode = 'login'; // 'login' or 'register'

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create authentication modal
 */
function createAuthModal() {
  if (authModal) return authModal;

  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-modal__backdrop"></div>
    <div class="auth-modal__content">
      <div class="auth-modal__header">
        <h2 id="authModalTitle">Login</h2>
        <button class="auth-modal__close" id="authModalClose" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="auth-modal__body">
        <!-- Login Form -->
        <form id="loginForm" class="auth-form">
          <div class="auth-form__group">
            <label for="loginEmail">Email</label>
            <input 
              type="email" 
              id="loginEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your.email@example.com"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="loginPassword">Password</label>
            <input 
              type="password" 
              id="loginPassword" 
              name="password" 
              required 
              autocomplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          
          <div class="auth-form__error" id="loginError"></div>
          
          <button type="submit" class="auth-form__submit">
            <i class="fas fa-sign-in-alt"></i> Login
          </button>
        </form>
        
        <!-- Register Form -->
        <form id="registerForm" class="auth-form" style="display: none;">
          <div class="auth-form__group">
            <label for="registerDisplayName">Display Name</label>
            <input 
              type="text" 
              id="registerDisplayName" 
              name="displayName" 
              required 
              autocomplete="name"
              placeholder="Your name"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="registerEmail">Email</label>
            <input 
              type="email" 
              id="registerEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your.email@example.com"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="registerPassword">Password</label>
            <input 
              type="password" 
              id="registerPassword" 
              name="password" 
              required 
              autocomplete="new-password"
              placeholder="At least 6 characters"
              minlength="6"
            />
          </div>
          
          <div class="auth-form__error" id="registerError"></div>
          
          <button type="submit" class="auth-form__submit">
            <i class="fas fa-user-plus"></i> Register
          </button>
        </form>
        
        <!-- Mode Toggle -->
        <div class="auth-modal__toggle">
          <span id="authToggleText">Don't have an account?</span>
          <button id="authToggleBtn" class="auth-modal__toggle-btn">Register</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  authModal = modal;
  setupEventListeners();
  return modal;
}

/**
 * Setup event listeners for auth modal
 */
function setupEventListeners() {
  // Close button
  const closeBtn = document.getElementById('authModalClose');
  const backdrop = authModal.querySelector('.auth-modal__backdrop');
  
  const closeModal = () => hide();
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  
  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authModal?.classList.contains('active')) {
      closeModal();
    }
  });

  // Form submissions
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  
  loginForm?.addEventListener('submit', handleLogin);
  registerForm?.addEventListener('submit', handleRegister);
  
  // Mode toggle
  const toggleBtn = document.getElementById('authToggleBtn');
  toggleBtn?.addEventListener('click', toggleMode);
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.loginEmail.value.trim();
  const password = form.loginPassword.value;
  const errorDiv = document.getElementById('loginError');
  
  // Clear previous errors
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
  
  // Validation
  if (!email || !password) {
    showError(errorDiv, 'Please fill in all fields');
    return;
  }
  
  // Disable submit button
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
  
  try {
    const result = await login(email, password);
    if (result.success) {
      hide();
      eventBus.emit(Events.AUTH_SUCCESS, result.user);
    } else {
      showError(errorDiv, result.error || 'Login failed. Please check your credentials.');
    }
  } catch (error) {
    showError(errorDiv, 'An error occurred. Please try again.');
    console.error('Login error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

/**
 * Handle register form submission
 */
async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const displayName = form.registerDisplayName.value.trim();
  const email = form.registerEmail.value.trim();
  const password = form.registerPassword.value;
  const errorDiv = document.getElementById('registerError');
  
  // Clear previous errors
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
  
  // Validation
  if (!displayName || !email || !password) {
    showError(errorDiv, 'Please fill in all fields');
    return;
  }
  
  if (password.length < 6) {
    showError(errorDiv, 'Password must be at least 6 characters');
    return;
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError(errorDiv, 'Please enter a valid email address');
    return;
  }
  
  // Disable submit button
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
  
  try {
    const result = await register(email, password, displayName);
    if (result.success) {
      hide();
      eventBus.emit(Events.AUTH_SUCCESS, result.user);
    } else {
      showError(errorDiv, result.error || 'Registration failed. Please try again.');
    }
  } catch (error) {
    showError(errorDiv, 'An error occurred. Please try again.');
    console.error('Registration error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

/**
 * Show error message
 */
function showError(errorDiv, message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

/**
 * Toggle between login and register modes
 */
function toggleMode() {
  currentMode = currentMode === 'login' ? 'register' : 'login';
  updateMode();
}

/**
 * Update modal to show correct form
 */
function updateMode() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const title = document.getElementById('authModalTitle');
  const toggleText = document.getElementById('authToggleText');
  const toggleBtn = document.getElementById('authToggleBtn');
  
  if (currentMode === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    title.textContent = 'Login';
    toggleText.textContent = "Don't have an account?";
    toggleBtn.textContent = 'Register';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    title.textContent = 'Register';
    toggleText.textContent = 'Already have an account?';
    toggleBtn.textContent = 'Login';
  }
  
  // Clear errors
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('registerError').style.display = 'none';
}

/**
 * Show authentication modal
 */
export function show(mode = 'login') {
  createAuthModal();
  currentMode = mode;
  updateMode();
  authModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // Focus first input
  setTimeout(() => {
    const firstInput = authModal.querySelector('input[type="email"], input[type="text"]');
    firstInput?.focus();
  }, 100);
}

/**
 * Hide authentication modal
 */
export function hide() {
  if (authModal) {
    authModal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Clear forms
    document.getElementById('loginForm')?.reset();
    document.getElementById('registerForm')?.reset();
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerError').style.display = 'none';
  }
}

/**
 * Check if modal is visible
 */
export function isVisible() {
  return authModal?.classList.contains('active') || false;
}
