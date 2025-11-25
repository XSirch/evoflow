import jwt from 'jsonwebtoken';
import { getPool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export async function authRequired(req, res, next) {
  try {
    const pool = await getPool();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.sub;

    const { rows } = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
