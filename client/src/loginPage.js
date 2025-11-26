/**
 * Login Page Component
 * 
 * Provides a full-screen login and registration interface.
 * Replaces the modal-based authUI.js.
 */

import { login, register } from './session.js';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// STATE
// ============================================================================

let loginPageElement = null;
let currentMode = 'login'; // 'login' or 'register'

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create login page element
 */
function createLoginPage() {
    if (loginPageElement) return loginPageElement;

    const container = document.createElement('div');
    container.id = 'loginPage';
    container.className = 'login-page';
    container.innerHTML = `
    <div class="login-page__content">
      <div class="login-page__header">
        <div class="login-page__brand">
            <i class="fas fa-shield-alt"></i>
            <h1>CyberForensics Arena</h1>
        </div>
        <h2 id="loginPageTitle">Login</h2>
      </div>
      
      <div class="login-page__body">
        <!-- Login Form -->
        <form id="loginPageForm" class="auth-form">
          <div class="auth-form__group">
            <label for="pageLoginEmail">Email</label>
            <input 
              type="email" 
              id="pageLoginEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your.email@example.com"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="pageLoginPassword">Password</label>
            <input 
              type="password" 
              id="pageLoginPassword" 
              name="password" 
              required 
              autocomplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          
          <div class="auth-form__error" id="pageLoginError"></div>
          
          <button type="submit" class="auth-form__submit">
            <i class="fas fa-sign-in-alt"></i> Login
          </button>
        </form>
        
        <!-- Register Form -->
        <form id="registerPageForm" class="auth-form" style="display: none;">
          <div class="auth-form__group">
            <label for="pageRegisterDisplayName">Display Name</label>
            <input 
              type="text" 
              id="pageRegisterDisplayName" 
              name="displayName" 
              required 
              autocomplete="name"
              placeholder="Your name"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="pageRegisterEmail">Email</label>
            <input 
              type="email" 
              id="pageRegisterEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your.email@example.com"
            />
          </div>
          
          <div class="auth-form__group">
            <label for="pageRegisterPassword">Password</label>
            <input 
              type="password" 
              id="pageRegisterPassword" 
              name="password" 
              required 
              autocomplete="new-password"
              placeholder="At least 6 characters"
              minlength="6"
            />
          </div>
          
          <div class="auth-form__error" id="pageRegisterError"></div>
          
          <button type="submit" class="auth-form__submit">
            <i class="fas fa-user-plus"></i> Register
          </button>
        </form>
        
        <!-- Mode Toggle -->
        <div class="login-page__toggle">
          <span id="pageAuthToggleText">Don't have an account?</span>
          <button id="pageAuthToggleBtn" class="login-page__toggle-btn">Register</button>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(container);
    loginPageElement = container;
    setupEventListeners();
    return container;
}

/**
 * Setup event listeners for login page
 */
function setupEventListeners() {
    // Form submissions
    const loginForm = document.getElementById('loginPageForm');
    const registerForm = document.getElementById('registerPageForm');

    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);

    // Mode toggle
    const toggleBtn = document.getElementById('pageAuthToggleBtn');
    toggleBtn?.addEventListener('click', toggleMode);
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.pageLoginEmail.value.trim();
    const password = form.pageLoginPassword.value;
    const errorDiv = document.getElementById('pageLoginError');

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
    const displayName = form.pageRegisterDisplayName.value.trim();
    const email = form.pageRegisterEmail.value.trim();
    const password = form.pageRegisterPassword.value;
    const errorDiv = document.getElementById('pageRegisterError');

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
 * Update page to show correct form
 */
function updateMode() {
    const loginForm = document.getElementById('loginPageForm');
    const registerForm = document.getElementById('registerPageForm');
    const title = document.getElementById('loginPageTitle');
    const toggleText = document.getElementById('pageAuthToggleText');
    const toggleBtn = document.getElementById('pageAuthToggleBtn');

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
    document.getElementById('pageLoginError').style.display = 'none';
    document.getElementById('pageRegisterError').style.display = 'none';
}

/**
 * Show login page
 */
export function show(mode = 'login') {
    createLoginPage();
    currentMode = mode;
    updateMode();
    loginPageElement.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => {
        const firstInput = loginPageElement.querySelector('input[type="email"], input[type="text"]');
        firstInput?.focus();
    }, 100);
}

/**
 * Hide login page
 */
export function hide() {
    if (loginPageElement) {
        loginPageElement.classList.remove('active');
        document.body.style.overflow = '';

        // Clear forms
        document.getElementById('loginPageForm')?.reset();
        document.getElementById('registerPageForm')?.reset();
        document.getElementById('pageLoginError').style.display = 'none';
        document.getElementById('pageRegisterError').style.display = 'none';
    }
}

/**
 * Check if login page is visible
 */
export function isVisible() {
    return loginPageElement?.classList.contains('active') || false;
}
