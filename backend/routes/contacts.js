import express from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

const ContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  phoneNumber: z.string(),
  tags: z.array(z.string()),
  permission: z.enum(['allowed', 'denied']),
});

router.get('/contacts', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;

    const { rows: contactRows } = await pool.query(
      'SELECT * FROM contacts WHERE user_id = $1 ORDER BY name',
      [userId]
    );

    const { rows: tagRows } = await pool.query(
      'SELECT * FROM tags WHERE user_id = $1 ORDER BY name',
      [userId]
    );

    const { rows: ctRows } = await pool.query(
      'SELECT contact_id, tag_id FROM contact_tags WHERE contact_id = ANY ($1)',
      [contactRows.map((c) => c.id)]
    );

    const tagsById = new Map(tagRows.map((t) => [t.id, t]));
    const tagsByContact = new Map();
    for (const ct of ctRows) {
      if (!tagsByContact.has(ct.contact_id)) tagsByContact.set(ct.contact_id, []);
      tagsByContact.get(ct.contact_id).push(ct.tag_id);
    }

    const contacts = contactRows.map((c) => ({
      id: c.id,
      name: c.name,
      phoneNumber: c.phone_number,
      permission: c.permission,
      tags: tagsByContact.get(c.id) || [],
    }));

    const tags = tagRows.map((t) => ({ id: t.id, name: t.name, color: t.color }));

    return res.json({ contacts, tags });
  } catch (err) {
    console.error('Error loading contacts', err);
    return res.status(500).json({ error: 'Failed to load contacts' });
  }
});

router.post('/contacts', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const parsed = ContactSchema.parse(req.body);

    await pool.query(
      `INSERT INTO contacts (id, user_id, name, phone_number, permission)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone_number = EXCLUDED.phone_number,
         permission = EXCLUDED.permission`,
      [parsed.id, userId, parsed.name, parsed.phoneNumber, parsed.permission]
    );

    await pool.query('DELETE FROM contact_tags WHERE contact_id = $1', [parsed.id]);

    for (const tagId of parsed.tags) {
      await pool.query(
        'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [parsed.id, tagId]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving contact', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid contact', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to save contact' });
  }
});

router.delete('/contacts/:id', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const id = req.params.id;

    await pool.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [id, userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting contact', err);
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
});

const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

router.post('/tags', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const parsed = TagSchema.parse(req.body);

    await pool.query(
      `INSERT INTO tags (id, user_id, name, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         color = EXCLUDED.color`,
      [parsed.id, userId, parsed.name, parsed.color]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving tag', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tag', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to save tag' });
  }
});

router.delete('/tags/:id', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const id = req.params.id;

    await pool.query('DELETE FROM tags WHERE id = $1 AND user_id = $2', [id, userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting tag', err);
    return res.status(500).json({ error: 'Failed to delete tag' });
  }
});

router.patch('/contacts/:id/permission', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const id = req.params.id;
    const { permission } = z
      .object({ permission: z.enum(['allowed', 'denied']) })
      .parse(req.body);

    await pool.query(
      'UPDATE contacts SET permission = $1 WHERE id = $2 AND user_id = $3',
      [permission, id, userId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Error updating permission', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid permission', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to update permission' });
  }
});

export default router;

