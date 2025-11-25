import express from 'express';
import { getPool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// GET /api/dashboard/stats - Retorna estatísticas do dashboard
router.get('/dashboard/stats', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;

    // Total de mensagens
    const totalMessagesResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_id = $1`,
      [userId]
    );

    // Conversas ativas (status = 'active' ou 'waiting_human')
    const activeChatsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM conversations 
       WHERE user_id = $1 AND status IN ('active', 'waiting_human')`,
      [userId]
    );

    // Tempo médio de resposta da IA (últimas 24h)
    // Calculando diferença entre mensagem do cliente e resposta do bot
    const aiResponseTimeResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (bot_msg.timestamp - user_msg.timestamp))) as avg_seconds
       FROM messages user_msg
       JOIN messages bot_msg ON bot_msg.conversation_id = user_msg.conversation_id
       JOIN conversations c ON c.id = user_msg.conversation_id
       WHERE c.user_id = $1
         AND user_msg.is_from_customer = true
         AND bot_msg.is_from_customer = false
         AND bot_msg.timestamp > user_msg.timestamp
         AND bot_msg.timestamp >= NOW() - INTERVAL '24 hours'
         AND bot_msg.timestamp - user_msg.timestamp < INTERVAL '1 minute'
       LIMIT 1000`,
      [userId]
    );

    // Transbordos (conversas com status 'waiting_human')
    const humanHandoversResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM conversations 
       WHERE user_id = $1 AND status = 'waiting_human'`,
      [userId]
    );

    const stats = {
      totalMessages: parseInt(totalMessagesResult.rows[0]?.count || 0),
      activeChats: parseInt(activeChatsResult.rows[0]?.count || 0),
      aiResponseTime: parseFloat(aiResponseTimeResult.rows[0]?.avg_seconds || 0).toFixed(1),
      humanHandovers: parseInt(humanHandoversResult.rows[0]?.count || 0)
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/dashboard/conversations - Retorna lista de conversas
router.get('/dashboard/conversations', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const { status } = req.query; // Filtro opcional: 'active', 'waiting_human', 'completed'

    let query = `
      SELECT 
        c.id,
        c.phone_number,
        c.customer_name,
        c.status,
        c.last_message_at,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT is_from_customer FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_from_customer
      FROM conversations c
      WHERE c.user_id = $1
    `;

    const params = [userId];

    if (status && status !== 'all') {
      query += ` AND c.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY c.last_message_at DESC LIMIT 50`;

    const result = await pool.query(query, params);

    const conversations = result.rows.map(row => ({
      id: row.id,
      customerName: row.customer_name || 'Cliente',
      phoneNumber: row.phone_number,
      status: row.status,
      lastMessage: row.last_message || '',
      lastMessageSender: row.last_message_from_customer ? 'user' : 'bot',
      lastMessageAt: row.last_message_at
    }));

    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/dashboard/conversations/:id/messages - Retorna histórico de mensagens
router.get('/dashboard/conversations/:id/messages', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const conversationId = req.params.id;

    // Verificar se a conversa pertence ao usuário
    const convResult = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Buscar mensagens
    const messagesResult = await pool.query(
      `SELECT id, sender, content, timestamp, is_from_customer
       FROM messages
       WHERE conversation_id = $1
       ORDER BY timestamp ASC`,
      [conversationId]
    );

    const messages = messagesResult.rows.map(row => ({
      id: row.id,
      sender: row.is_from_customer ? 'user' : 'bot',
      content: row.content,
      timestamp: new Date(row.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }));

    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// DELETE /api/dashboard/conversations/:id - Deleta uma conversa e suas mensagens
router.delete('/dashboard/conversations/:id', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const { id } = req.params;

    // Verificar se a conversa pertence ao usuário
    const { rows } = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Deletar mensagens (CASCADE já faz isso, mas explicitando)
    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [id]);

    // Deletar conversa
    await pool.query('DELETE FROM conversations WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;

