/**
 * Authentication middleware — supports Passport session AND Bearer JWT.
 *
 * Safari's ITP blocks cross-origin SameSite=None cookies, so we also accept
 * an Authorization: Bearer <token> header as a fallback.
 * Firefox/Chrome continue to use the session cookie as before.
 * This is needed since the actual deployment is done render, and safari doesnt accept cookies from third parties
 */

import { verifyToken } from '../utils/jwt.js';
import { getDb } from '../db/db.js';

/** Session OR Bearer-token auth. */
export async function authenticate(req, res, next) {
  // 1. Passport session (Firefox / Chrome)
  if (req.isAuthenticated()) return next();

  // 2. Bearer token fallback (Safari ITP workaround)
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      try {
        const user = await getDb().get(
          'SELECT id, email, display_name, role, tutorial_completed FROM users WHERE id = ?',
          payload.sub
        );
        if (user) {
          req.user = { id: user.id, email: user.email, displayName: user.display_name, role: user.role || 'user', tutorialCompleted: user.tutorial_completed === 1 };
          return next();
        }
      } catch (err) { console.error('[auth] token DB error:', err); }
    }
  }

  return res.status(401).json({ error: 'Authentication required' });
}

/** Optional — never fails, just sets req.user if possible. */
export function optionalAuth(req, res, next) { next(); }

/** Admin check — works for both session and token paths. */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  return next();
}