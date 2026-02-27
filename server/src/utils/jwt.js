import jwt from 'jsonwebtoken';

const SECRET = process.env.SESSION_SECRET || 'dev_secret_do_not_use_in_prod';

export function signToken(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, role: user.role || 'user' },
        SECRET,
        { expiresIn: '7d' }
    );
}

export function verifyToken(token) {
    try { return jwt.verify(token, SECRET); }
    catch { return null; }
}
