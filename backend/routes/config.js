import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';
import { createWorker } from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { processDocumentEmbeddings } from '../services/rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
// Compatibilidade pdf-parse v1 e v2:
// - v1: module.exports = function
// - v2: module.exports = { PDFParse, ... }
const pdfParse =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : typeof pdfParseModule.PDFParse === 'function'
      ? pdfParseModule.PDFParse
      : pdfParseModule.default;

const router = express.Router();

// Criar diretório para armazenar PDFs de cardápio
const MENU_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'menus');
if (!fs.existsSync(MENU_UPLOADS_DIR)) {
  fs.mkdirSync(MENU_UPLOADS_DIR, { recursive: true });
}

// Configurar multer para upload de PDFs (base de conhecimento - memória)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  }
});

// Configurar multer para upload de PDF do cardápio (filesystem)
const menuUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MENU_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `menu_${userId}_${timestamp}_${sanitizedName}`);
  }
});

const menuUpload = multer({
  storage: menuUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  }
});

// Schemas that mirror StoreConfig and EvolutionConfig from the frontend
const KnowledgeDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  active: z.boolean(),
});

const StoreConfigSchema = z.object({
  storeName: z.string(),
  description: z.string(),
  openingHours: z.string(),
  tone: z.string(),
  fallbackMessage: z.string(),
  instagram: z.string().optional().default(''),
  menuPdfUrl: z.string().optional().default(''),
  knowledgeBase: z.array(KnowledgeDocumentSchema),
});

const EvolutionConfigSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  instanceName: z.string(),
  phoneNumber: z.string(),
});

router.get('/store-config', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;

    const { rows } = await pool.query(
      'SELECT * FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    const row = rows[0];

    if (!row) {
      return res.json({
        storeName: 'Loja Exemplo',
        description: '',
        openingHours: '',
        tone: 'friendly',
        fallbackMessage: 'Vou chamar um especialista humano para te ajudar com isso. Um momento, por favor.',
        instagram: '',
        menuPdfUrl: '',
        knowledgeBase: [],
      });
    }

    const { rows: docRows } = await pool.query(
      'SELECT id, title, content, active FROM knowledge_documents WHERE store_config_id = $1 ORDER BY title',
      [row.id]
    );

    return res.json({
      storeName: row.store_name,
      description: row.description,
      openingHours: row.opening_hours,
      tone: row.tone,
      fallbackMessage: row.fallback_message,
      instagram: row.instagram || '',
      menuPdfUrl: row.menu_pdf_url || '',
      knowledgeBase: docRows,
    });
  } catch (err) {
    console.error('Error loading store config', err);
    return res.status(500).json({ error: 'Failed to load store config' });
  }
});

router.put('/store-config', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const parsed = StoreConfigSchema.parse(req.body);

    // Upsert store config
    const { rows } = await pool.query(
      `INSERT INTO store_configs (id, user_id, store_name, description, opening_hours, tone, fallback_message, instagram, menu_pdf_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         description = EXCLUDED.description,
         opening_hours = EXCLUDED.opening_hours,
         tone = EXCLUDED.tone,
         fallback_message = EXCLUDED.fallback_message,
         instagram = EXCLUDED.instagram,
         menu_pdf_url = EXCLUDED.menu_pdf_url
       RETURNING id`,
      ['default', userId, parsed.storeName, parsed.description, parsed.openingHours, parsed.tone, parsed.fallbackMessage, parsed.instagram || '', parsed.menuPdfUrl || '']
    );

    const storeConfigId = rows[0].id;

    // Replace knowledge documents for this config
    await pool.query('DELETE FROM knowledge_documents WHERE store_config_id = $1', [storeConfigId]);

    for (const doc of parsed.knowledgeBase) {
      await pool.query(
        `INSERT INTO knowledge_documents (id, store_config_id, title, content, active)
         VALUES ($1, $2, $3, $4, $5)`,
        [doc.id, storeConfigId, doc.title, doc.content, doc.active]
      );

      // Processar embeddings de forma assíncrona para documentos ativos
      if (doc.active && doc.content && doc.content.trim().length > 0) {
        processDocumentEmbeddings(doc.id, doc.content)
          .then(count => {
            console.log(`[RAG] Embeddings gerados para documento ${doc.id}: ${count} chunks`);
          })
          .catch(err => {
            console.error(`[RAG] Erro ao gerar embeddings para documento ${doc.id}:`, err);
          });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving store config', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid store config', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to save store config' });
  }
});

router.get('/evolution-config', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;

    const { rows } = await pool.query(
      'SELECT * FROM evolution_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    const row = rows[0];

    if (!row) {
      return res.json({
        baseUrl: '',
        apiKey: '',
        instanceName: '',
        phoneNumber: '',
      });
    }

    return res.json({
      baseUrl: row.base_url,
      apiKey: row.api_key,
      instanceName: row.instance_name,
      phoneNumber: row.phone_number,
    });
  } catch (err) {
    console.error('Error loading evolution config', err);
    return res.status(500).json({ error: 'Failed to load evolution config' });
  }
});

router.put('/evolution-config', authRequired, async (req, res) => {
  try {
    const pool = await getPool();
    const userId = req.user.id;
    const parsed = EvolutionConfigSchema.parse(req.body);

    await pool.query(
      `INSERT INTO evolution_configs (id, user_id, base_url, api_key, instance_name, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         base_url = EXCLUDED.base_url,
         api_key = EXCLUDED.api_key,
         instance_name = EXCLUDED.instance_name,
         phone_number = EXCLUDED.phone_number`,
      ['default', userId, parsed.baseUrl, parsed.apiKey, parsed.instanceName, parsed.phoneNumber]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving evolution config', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid evolution config', details: err.flatten() });
    }
    return res.status(500).json({ error: 'Failed to save evolution config' });
  }
});


// Função para extrair texto usando pdf-parse (suporta v1 e v2/v3)
async function extractTextFromPdf(pdfBuffer) {
  try {
    if (!pdfParseModule) {
      return '';
    }

    // v1: módulo é uma função que recebe o buffer diretamente
    if (typeof pdfParseModule === 'function') {
      const data = await pdfParseModule(pdfBuffer);
      return data?.text || '';
    }

    // v2/v3: expõe classe PDFParse
    if (typeof pdfParseModule.PDFParse === 'function') {
      const Parser = pdfParseModule.PDFParse;
      const parser = new Parser({ data: pdfBuffer });

      try {
        const result = await parser.getText();
        return result?.text || '';
      } finally {
        try {
          await parser.destroy();
        } catch (destroyError) {
          console.error('Erro ao destruir parser pdf-parse:', destroyError);
        }
      }
    }

    console.warn('pdf-parse em formato não suportado, pulando extração direta');
    return '';
  } catch (err) {
    console.error('Erro ao extrair texto com pdf-parse:', err);
    return '';
  }
}

// Função para extrair texto usando OCR
async function extractTextWithOCR(pdfBuffer) {
  console.log('[OCR] Iniciando extração de texto com OCR...');
  console.log('[OCR] Tamanho do buffer:', pdfBuffer.length, 'bytes');

  let worker = null;

  try {
    // Criar worker do Tesseract com idioma português
    console.log('[OCR] Criando worker do Tesseract...');
    worker = await createWorker('por', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progresso: ${Math.round(m.progress * 100)}%`);
        }
      },
      errorHandler: err => {
        console.error('[OCR] Erro do worker Tesseract:', err);
      }
    });
    console.log('[OCR] Worker criado com sucesso');

    // Configurar conversor de PDF para imagens usando GraphicsMagick
    console.log('[OCR] Configurando conversor PDF para imagem...');
    const options = {
      density: 200,        // DPI (qualidade da imagem)
      saveFilename: 'page',
      savePath: '/tmp',
      format: 'png',       // Formato da imagem
      width: 2000,         // Largura máxima
      height: 2000         // Altura máxima
    };

    const converter = fromBuffer(pdfBuffer, options);
    console.log('[OCR] Conversor configurado');

    // Processar até 10 páginas sem depender do pdf-parse (mais robusto em produção)
    const maxPages = 10;
    let fullText = '';
    let pagesProcessed = 0;

    // Processar cada página
    for (let i = 1; i <= maxPages; i++) {
      console.log(`[OCR] Processando página ${i}/${maxPages}...`);

      try {
        // Converter página para imagem
        const result = await converter(i, { responseType: 'buffer' });

        // Aplicar OCR na imagem
        const { data: { text } } = await worker.recognize(result.buffer || result);

        fullText += `--- Página ${i} ---\n${text}\n\n`;
        pagesProcessed++;
        console.log(`[OCR] Página ${i} processada: ${text.length} caracteres`);
      } catch (pageError) {
        console.error(
          `[OCR] Erro ao processar página ${i}:`,
          pageError?.message || pageError
        );
        if (pagesProcessed === 0) {
          // Se não conseguiu processar nenhuma página, falha geral de OCR
          throw pageError;
        } else {
          // Se já processou alguma, provavelmente acabou as páginas ou há ruído no final
          console.warn('[OCR] Interrompendo OCR após erro em página adicional');
          break;
        }
      }
    }

    // Terminar worker
    if (worker) {
      await worker.terminate();
      console.log('[OCR] Worker terminado');
    }

    console.log(`[OCR] Extração concluída: ${fullText.length} caracteres totais`);
    return fullText;

  } catch (error) {
    console.error('[OCR] Erro durante extração:', error);
    console.error('[OCR] Stack trace:', error.stack);

    // Terminar worker em caso de erro
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error('[OCR] Erro ao terminar worker:', terminateError);
      }
    }

    throw new Error('Falha ao processar PDF com OCR: ' + (error?.message || error));
  }
}

// Endpoint para upload de PDF
router.post('/store-config/knowledge/upload-pdf', authRequired, upload.single('pdf'), async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado' });
    }

    const pdfBuffer = req.file.buffer;
    const originalName = req.file.originalname;

    console.log(`Processando PDF: ${originalName} (${pdfBuffer.length} bytes)`);

    // Extrair texto do PDF
    let extractedText = '';
    let extractionMethod = 'text';

    try {
      extractedText = await extractTextFromPdf(pdfBuffer);
      if (extractedText) {
        console.log(`Texto extraído (pdf-parse): ${extractedText.length} caracteres`);
      }
    } catch (pdfError) {
      console.error('Erro ao extrair texto do PDF:', pdfError);
      // Não retornar erro aqui, tentar OCR
    }

    // Se texto insuficiente, usar OCR
    if (!extractedText || extractedText.trim().length < 50) {
      console.log(`Texto insuficiente (${extractedText?.trim().length || 0} caracteres), aplicando OCR...`);

      try {
        extractionMethod = 'ocr';
        extractedText = await extractTextWithOCR(pdfBuffer);

        // Validar texto extraído por OCR
        if (!extractedText || extractedText.trim().length < 50) {
          return res.status(400).json({
            error: 'Não foi possível extrair texto do PDF. Verifique se o documento está legível e não está corrompido.',
            extractedLength: extractedText?.trim().length || 0,
            extractionMethod: 'ocr'
          });
        }

        console.log(`Texto extraído via OCR: ${extractedText.length} caracteres`);
      } catch (ocrError) {
        console.error('Erro ao processar PDF com OCR:', ocrError);
        return res.status(400).json({
          error: 'Não foi possível extrair texto do PDF. Verifique se o documento está legível.',
          details: ocrError.message
        });
      }
    }

    console.log(`Texto final: ${extractedText.length} caracteres (método: ${extractionMethod})`);

    // Buscar store_config_id
    const pool = await getPool();
    const { rows } = await pool.query(
      'SELECT id FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Configuração da loja não encontrada' });
    }

    const storeConfigId = rows[0].id;
    const docId = crypto.randomUUID();
    const title = originalName.replace('.pdf', '');

    // Salvar no banco
    await pool.query(
      'INSERT INTO knowledge_documents (id, store_config_id, title, content, active) VALUES ($1, $2, $3, $4, true)',
      [docId, storeConfigId, title, extractedText]
    );

    console.log(`Documento salvo: ${title} (ID: ${docId}, método: ${extractionMethod})`);

    // Processar embeddings de forma assíncrona (não bloquear resposta)
    processDocumentEmbeddings(docId, extractedText)
      .then(count => {
        console.log(`[RAG] Embeddings gerados para documento ${docId}: ${count} chunks`);
      })
      .catch(err => {
        console.error(`[RAG] Erro ao gerar embeddings para documento ${docId}:`, err);
      });

    res.json({
      success: true,
      documentId: docId,
      title: title,
      contentLength: extractedText.length,
      extractionMethod: extractionMethod,
      message: `PDF "${title}" carregado com sucesso!`
    });
  } catch (error) {
    console.error('Erro ao fazer upload de PDF:', error);

    if (error.message === 'Apenas arquivos PDF são permitidos') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Falha ao processar PDF. Tente novamente.' });
  }
});

// Endpoint para regenerar embeddings de todos os documentos
router.post('/store-config/knowledge/regenerate-embeddings', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    // Buscar store config do usuário
    const { rows: storeRows } = await pool.query(
      'SELECT id FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!storeRows[0]) {
      return res.status(404).json({ error: 'Configuração da loja não encontrada' });
    }

    const storeConfigId = storeRows[0].id;

    // Buscar todos os documentos ativos
    const { rows: docs } = await pool.query(
      'SELECT id, title, content FROM knowledge_documents WHERE store_config_id = $1 AND active = true',
      [storeConfigId]
    );

    console.log(`[RAG] Regenerando embeddings para ${docs.length} documentos...`);

    // Processar cada documento
    const results = [];
    for (const doc of docs) {
      try {
        const count = await processDocumentEmbeddings(doc.id, doc.content);
        results.push({
          documentId: doc.id,
          title: doc.title,
          chunks: count,
          success: true
        });
      } catch (error) {
        console.error(`[RAG] Erro ao processar documento ${doc.id}:`, error);
        results.push({
          documentId: doc.id,
          title: doc.title,
          chunks: 0,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);

    console.log(`[RAG] Regeneração concluída: ${successCount}/${docs.length} documentos, ${totalChunks} chunks`);

    res.json({
      success: true,
      message: `Embeddings regenerados para ${successCount}/${docs.length} documentos`,
      totalDocuments: docs.length,
      successfulDocuments: successCount,
      totalChunks: totalChunks,
      results: results
    });
  } catch (error) {
    console.error('[RAG] Erro ao regenerar embeddings:', error);
    res.status(500).json({ error: 'Falha ao regenerar embeddings', details: error.message });
  }
});

// Endpoint para verificar status dos embeddings
router.get('/store-config/knowledge/embeddings-status', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    // Buscar store config do usuário
    const { rows: storeRows } = await pool.query(
      'SELECT id FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!storeRows[0]) {
      return res.status(404).json({ error: 'Configuração da loja não encontrada' });
    }

    const storeConfigId = storeRows[0].id;

    // Contar documentos
    const { rows: docCount } = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active = true) as active FROM knowledge_documents WHERE store_config_id = $1',
      [storeConfigId]
    );

    // Contar embeddings
    const { rows: embCount } = await pool.query(`
      SELECT COUNT(*) as total_chunks, COUNT(DISTINCT document_id) as documents_with_embeddings
      FROM document_embeddings de
      JOIN knowledge_documents kd ON de.document_id = kd.id
      WHERE kd.store_config_id = $1
    `, [storeConfigId]);

    // Listar documentos sem embeddings
    const { rows: docsWithoutEmb } = await pool.query(`
      SELECT kd.id, kd.title, kd.active
      FROM knowledge_documents kd
      LEFT JOIN document_embeddings de ON kd.id = de.document_id
      WHERE kd.store_config_id = $1 AND de.id IS NULL
      ORDER BY kd.title
    `, [storeConfigId]);

    res.json({
      totalDocuments: parseInt(docCount[0].total),
      activeDocuments: parseInt(docCount[0].active),
      documentsWithEmbeddings: parseInt(embCount[0].documents_with_embeddings),
      totalChunks: parseInt(embCount[0].total_chunks),
      documentsWithoutEmbeddings: docsWithoutEmb.map(d => ({
        id: d.id,
        title: d.title,
        active: d.active
      }))
    });
  } catch (error) {
    console.error('[RAG] Erro ao verificar status dos embeddings:', error);
    res.status(500).json({ error: 'Falha ao verificar status', details: error.message });
  }
});

// Endpoint para upload do PDF do cardápio
router.post('/store-config/menu-pdf', authRequired, menuUpload.single('pdf'), async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado' });
    }

    const filename = req.file.filename;
	    // Gerar URL ABSOLUTA para o PDF, para que possa ser acessado externamente
	    // (Evolution API exige que "media" seja uma URL completa ou base64)
	    const forwardedProto = req.headers['x-forwarded-proto'];
	    const protocol = (typeof forwardedProto === 'string' && forwardedProto.length > 0)
	      ? forwardedProto.split(',')[0]
	      : req.protocol;
	    const host = req.get('host');
	    const baseUrl = `${protocol}://${host}`;
	    const fileUrl = `${baseUrl}/api/uploads/menus/${filename}`;

    console.log(`PDF do cardápio salvo: ${filename}`);

    // Atualizar menu_pdf_url no banco
    const pool = await getPool();

    // Buscar store_config_id
    const { rows } = await pool.query(
      'SELECT id FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!rows[0]) {
      // Remover arquivo se não encontrar config
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Configuração da loja não encontrada' });
    }

    const storeConfigId = rows[0].id;

    // Atualizar menu_pdf_url
    await pool.query(
      'UPDATE store_configs SET menu_pdf_url = $1 WHERE id = $2',
      [fileUrl, storeConfigId]
    );

    console.log(`menu_pdf_url atualizado para: ${fileUrl}`);

    res.json({
      success: true,
      filename: filename,
      url: fileUrl,
      message: 'PDF do cardápio carregado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao fazer upload do PDF do cardápio:', error);

    // Remover arquivo em caso de erro
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.message === 'Apenas arquivos PDF são permitidos') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Falha ao processar PDF. Tente novamente.' });
  }
});

// Endpoint para deletar PDF do cardápio
router.delete('/store-config/menu-pdf', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    // Buscar menu_pdf_url atual
    const { rows } = await pool.query(
      'SELECT menu_pdf_url FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!rows[0] || !rows[0].menu_pdf_url) {
      return res.status(404).json({ error: 'Nenhum PDF de cardápio encontrado' });
    }

    const menuPdfUrl = rows[0].menu_pdf_url;

    // Extrair filename da URL
    const filename = menuPdfUrl.split('/').pop();
    const filePath = path.join(MENU_UPLOADS_DIR, filename);

    // Remover arquivo do filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Arquivo removido: ${filePath}`);
    }

    // Limpar menu_pdf_url no banco
    await pool.query(
      'UPDATE store_configs SET menu_pdf_url = $1 WHERE user_id = $2',
      ['', userId]
    );

    res.json({
      success: true,
      message: 'PDF do cardápio removido com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao remover PDF do cardápio:', error);
    res.status(500).json({ error: 'Falha ao remover PDF. Tente novamente.' });
  }
});

export default router;

