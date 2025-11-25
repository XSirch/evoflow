// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db.js';
import authRoutes from './routes/auth.js';
import configRoutes from './routes/config.js';
import contactsRoutes from './routes/contacts.js';
import evolutionWebhookRoutes from './routes/evolution-webhook.js';
import dashboardRoutes from './routes/dashboard.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', authRoutes);
app.use('/api', configRoutes);
app.use('/api', contactsRoutes);
app.use('/api', dashboardRoutes);
// Webhook da Evolution API (público, sem authRequired)
app.use('/api', evolutionWebhookRoutes);

// Servir arquivos de upload (PDFs de cardápio)
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/api/uploads', express.static(uploadsPath));

// Servir arquivos estáticos do frontend (em produção)
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // Todas as rotas não-API devem retornar o index.html (SPA)
  app.use((req, res, next) => {
    // Se não for uma rota de API, servir o index.html
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

async function start() {
  try {
    console.log('Starting backend server...');
    console.log('Running migrations...');
    await runMigrations();
    console.log('Migrations complete.');
    app.listen(PORT, () => {
      console.log(`✓ Backend listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err);
    process.exit(1);
  }
}

start();

