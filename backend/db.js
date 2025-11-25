import pg from 'pg';

const { Pool } = pg;

let pool = null;
let poolInitialized = false;

async function createPool(connectionString) {
  const newPool = new Pool({ connectionString });
  // Test connection
  await newPool.query('SELECT 1');
  return newPool;
}

async function initializePool() {
  if (poolInitialized) return pool;

  const primaryUrl = process.env.DATABASE_URL;
  const fallbackUrl = process.env.DATABASE_URL_FALLBACK;

  if (!primaryUrl && !fallbackUrl) {
    throw new Error('Neither DATABASE_URL nor DATABASE_URL_FALLBACK is set. Backend will not be able to connect to Postgres.');
  }

  if (primaryUrl) {
    try {
      console.log('Attempting to connect to primary database...');
      pool = await createPool(primaryUrl);
      console.log('✓ Connected to primary database successfully');
      poolInitialized = true;
      return pool;
    } catch (err) {
      console.warn('⚠ Failed to connect to primary database:', err.message);
      if (fallbackUrl) {
        console.log('Attempting to connect to fallback database...');
      }
    }
  }

  if (fallbackUrl) {
    try {
      pool = await createPool(fallbackUrl);
      console.log('✓ Connected to fallback database successfully');
      poolInitialized = true;
      return pool;
    } catch (err) {
      console.error('✗ Failed to connect to fallback database:', err.message);
      throw new Error('Unable to connect to any database');
    }
  }

  throw new Error('No database connection string available');
}

async function getPool() {
  if (!poolInitialized) {
    await initializePool();
  }
  return pool;
}

export { getPool };

export async function runMigrations() {
  const pool = await getPool();

  // Habilitar extensão pgvector
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  console.log('✓ pgvector extension enabled');

  // Simple schema focused on the current EvoFlow frontend needs
  // IDs are stored as text and generated in the application layer.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      opening_hours TEXT DEFAULT '',
      tone TEXT DEFAULT 'friendly',
      fallback_message TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      menu_pdf_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      store_config_id TEXT NOT NULL REFERENCES store_configs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS evolution_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      instance_name TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'denied'
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      phone_number TEXT NOT NULL,
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total_tokens INTEGER NOT NULL DEFAULT 0
    );

    -- Adicionar coluna total_tokens se não existir (para bancos existentes)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'total_tokens'
      ) THEN
        ALTER TABLE conversations ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$;

    -- Adicionar colunas instagram e menu_pdf_url se não existirem
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'store_configs' AND column_name = 'instagram'
      ) THEN
        ALTER TABLE store_configs ADD COLUMN instagram TEXT DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'store_configs' AND column_name = 'menu_pdf_url'
      ) THEN
        ALTER TABLE store_configs ADD COLUMN menu_pdf_url TEXT DEFAULT '';
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_from_customer BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);

    -- Tabela de embeddings para RAG semântico
    CREATE TABLE IF NOT EXISTS document_embeddings (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding vector(1536) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id
      ON document_embeddings(document_id);

    -- Índice HNSW para busca vetorial rápida (cosine distance)
    CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding
      ON document_embeddings USING hnsw (embedding vector_cosine_ops);
  `);

  console.log('Database migrations ran successfully');
}

