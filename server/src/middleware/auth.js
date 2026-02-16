/**
 * Authentication middleware using Passport.js sessions
 * 
 * Verifies user authentication from session.
 * Adds user info to req.user if authenticated.
 * Following professor's lab implementation pattern.
 */

/**
 * Middleware to verify user is authenticated via session
 * Uses Passport's session-based authentication
 */
export function authenticate(req, res, next) {
  if (req.isAuthenticated()) {
    // req.user is set by Passport deserializeUser
    return next();
  }
  
  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * Optional authentication - doesn't fail if no session
 * Sets req.user if authenticated, but continues even if not
 */
export function optionalAuth(req, res, next) {
  // req.user is automatically set by Passport if session exists
  // Just continue regardless
  next();
}

/**
 * Middleware to verify user has admin role
 * Must be used after authenticate middleware
 * Returns 403 Forbidden if user is not an admin
 */
export function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  return next();
}