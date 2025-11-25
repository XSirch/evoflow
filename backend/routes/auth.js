import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPool } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = express.Router();

const RegisterSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/auth/register', async (req, res) => {
  try {
    const pool = await getPool();
    const parsed = RegisterSchema.parse(req.body);

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [parsed.email]
    );

    if (existing[0]) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const id = randomUUID();

    const { rows } = await pool.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
      [id, parsed.name, parsed.email, passwordHash]
    );

    const user = rows[0];
    const token = signToken(user);

    return res.status(201).json({
      user,
      token,
    });
  } catch (err) {
    console.error('Register error', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const pool = await getPool();
    const parsed = LoginSchema.parse(req.body);

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [parsed.email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(parsed.password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);

    return res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error('Login error', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to login' });
  }
});

router.get('/auth/me', authRequired, async (req, res) => {
  return res.json({ user: req.user });
});

export default router;

