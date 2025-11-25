import crypto from 'crypto';
import fetch from 'node-fetch';
import { getPool } from '../db.js';

// Configurações
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '800');
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '150');
// Modelo de embedding da OpenAI
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
// Chave da OpenAI para embeddings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Divide um texto em chunks com overlap
 * @param {string} text - Texto a ser dividido
 * @param {number} chunkSize - Tamanho de cada chunk
 * @param {number} overlap - Overlap entre chunks
 * @returns {string[]} Array de chunks
 */
export function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Se chegamos ao final, parar
    if (end >= text.length) {
      break;
    }
    
    // Avançar com overlap
    start += chunkSize - overlap;
  }

  console.log(`[RAG] Texto dividido em ${chunks.length} chunks (tamanho: ${chunkSize}, overlap: ${overlap})`);
  return chunks;
}

/**
 * Gera embedding de um texto usando OpenAI API
 * @param {string} text - Texto para gerar embedding
 * @returns {Promise<number[]>} Array de números representando o embedding
 */
export async function generateEmbedding(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada. Obtenha uma chave em https://platform.openai.com/api-keys');
  }

  try {
    console.log(`[RAG] Gerando embedding para texto de ${text.length} caracteres usando modelo ${EMBEDDING_MODEL}`);

    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      let errorText = await response.text();
      console.error('[RAG] Erro HTTP da OpenAI:', errorText);
      try {
        const errorJson = JSON.parse(errorText);
        errorText = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        // mantém texto bruto
      }
      throw new Error(`OpenAI API error: ${errorText || response.statusText}`);
    }

    const data = await response.json();

    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.error('[RAG] Resposta inválida da OpenAI. Estrutura completa:', JSON.stringify(data, null, 2));
      throw new Error('Resposta de embeddings inválida: estrutura inesperada');
    }

    const embedding = data.data[0].embedding;
    console.log(`[RAG] Embedding gerado com sucesso: ${embedding?.length || 0} dimensões`);
    return embedding;
  } catch (error) {
    console.error('[RAG] Erro ao gerar embedding:', error);
    throw error;
  }
}

/**
 * Processa um documento: divide em chunks e gera embeddings
 * @param {string} documentId - ID do documento
 * @param {string} content - Conteúdo do documento
 * @returns {Promise<number>} Número de chunks processados
 */
export async function processDocumentEmbeddings(documentId, content) {
  console.log(`[RAG] Processando embeddings para documento ${documentId}...`);
  
  const pool = await getPool();
  
  // Deletar embeddings antigos do documento
  await pool.query('DELETE FROM document_embeddings WHERE document_id = $1', [documentId]);
  
  // Dividir em chunks
  const chunks = chunkText(content);
  
  if (chunks.length === 0) {
    console.log(`[RAG] Documento ${documentId} não tem conteúdo suficiente para chunks`);
    return 0;
  }
  
  console.log(`[RAG] Gerando embeddings para ${chunks.length} chunks...`);
  
  // Processar cada chunk
  let processedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);
      
      const embeddingId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO document_embeddings (id, document_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4, $5)',
        [embeddingId, documentId, i, chunk, JSON.stringify(embedding)]
      );
      
      processedCount++;
      console.log(`[RAG] Chunk ${i + 1}/${chunks.length} processado`);
      
      // Pequeno delay para evitar rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[RAG] Erro ao processar chunk ${i}:`, error);
      // Continuar com os próximos chunks mesmo se um falhar
    }
  }
  
  console.log(`[RAG] Documento ${documentId} processado: ${processedCount}/${chunks.length} chunks`);
  return processedCount;
}

/**
 * Busca chunks similares usando busca vetorial
 * @param {string} query - Query do usuário
 * @param {string} userId - ID do usuário (para isolamento entre lojas)
 * @param {number} limit - Número máximo de chunks a retornar
 * @returns {Promise<Array>} Array de chunks com relevância
 */
export async function searchSimilarChunks(query, userId, limit = 5) {
  console.log(`[RAG] Buscando chunks similares para usuário ${userId}: "${query.substring(0, 50)}..."`);

  const startTime = Date.now();

  try {
    // Gerar embedding da query
    const queryEmbedding = await generateEmbedding(query);

    const pool = await getPool();

    // Buscar chunks mais similares (com filtro por usuário para isolamento entre lojas)
    const result = await pool.query(`
      SELECT
        de.chunk_text,
        de.chunk_index,
        kd.title,
        kd.id as document_id,
        de.embedding <=> $1::vector AS distance
      FROM document_embeddings de
      JOIN knowledge_documents kd ON de.document_id = kd.id
      JOIN store_configs sc ON kd.store_config_id = sc.id
      WHERE sc.user_id = $2 AND kd.active = true
      ORDER BY distance
      LIMIT $3
    `, [JSON.stringify(queryEmbedding), userId, limit]);
    
    const elapsed = Date.now() - startTime;
    console.log(`[RAG] Busca concluída em ${elapsed}ms, ${result.rows.length} chunks encontrados`);
    
    return result.rows.map(row => ({
      text: row.chunk_text,
      title: row.title,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      distance: parseFloat(row.distance),
      relevance: (1 - parseFloat(row.distance)).toFixed(3) // Converter distância em score de relevância
    }));
  } catch (error) {
    console.error('[RAG] Erro na busca vetorial:', error);
    throw error;
  }
}

