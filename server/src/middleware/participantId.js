/**
 * Participant ID Middleware
 * 
 * Extracts the anonymous participant ID from request headers.
 * The participant ID is used for evaluation tracking without requiring authentication.
 */

/**
 * Extract participant ID from X-Participant-Id header
 * Attaches participantId to req object for use in route handlers
 */
export function extractParticipantId(req, res, next) {
  // Get participant ID from header (case-insensitive)
  const participantId = req.headers['x-participant-id'] || null;
  
  // Validate format (CFA-XXXXXX where X is alphanumeric)
  if (participantId && /^CFA-[A-Z0-9]{6}$/.test(participantId)) {
    req.participantId = participantId;
  } else if (participantId) {
    // Log invalid format but don't reject - could be legacy or test clients
    console.warn('[ParticipantId] Invalid participant ID format:', participantId);
    req.participantId = participantId; // Still attach it
  } else {
    req.participantId = null;
  }
  
  next();
}







