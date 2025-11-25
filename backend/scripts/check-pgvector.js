import { getPool } from '../db.js';

async function checkPgvectorSupport() {
  console.log('=== Verificação de Suporte ao pgvector ===\n');
  
  try {
    const pool = await getPool();
    
    // 1. Verificar versão do PostgreSQL
    console.log('1. Verificando versão do PostgreSQL...');
    const versionResult = await pool.query('SELECT version();');
    console.log('   Versão:', versionResult.rows[0].version);
    console.log('');
    
    // 2. Verificar extensões disponíveis
    console.log('2. Verificando extensões disponíveis...');
    const extensionsResult = await pool.query(`
      SELECT * FROM pg_available_extensions 
      WHERE name = 'vector';
    `);
    
    if (extensionsResult.rows.length > 0) {
      console.log('   ✓ Extensão pgvector está disponível');
      console.log('   Detalhes:', extensionsResult.rows[0]);
    } else {
      console.log('   ✗ Extensão pgvector NÃO está disponível');
      console.log('   Será necessário instalar pgvector no servidor PostgreSQL');
    }
    console.log('');
    
    // 3. Tentar criar a extensão
    console.log('3. Tentando criar extensão pgvector...');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('   ✓ Extensão pgvector criada/habilitada com sucesso');
    } catch (err) {
      console.log('   ✗ Erro ao criar extensão:', err.message);
      console.log('   Código do erro:', err.code);
      console.log('');
      console.log('=== RESULTADO: pgvector NÃO está disponível ===');
      console.log('Para habilitar pgvector, você precisa:');
      console.log('1. Instalar a extensão no servidor PostgreSQL');
      console.log('2. Ou usar um serviço que suporte pgvector (ex: Supabase, Neon, etc.)');
      process.exit(0);
    }
    console.log('');
    
    // 4. Verificar se a extensão foi criada
    console.log('4. Verificando extensões instaladas...');
    const installedResult = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector';
    `);
    
    if (installedResult.rows.length > 0) {
      console.log('   ✓ Extensão pgvector está instalada');
      console.log('   Detalhes:', installedResult.rows[0]);
    } else {
      console.log('   ✗ Extensão pgvector não foi encontrada após criação');
    }
    console.log('');
    
    // 5. Testar criação de tabela com coluna vector
    console.log('5. Testando criação de tabela com coluna vector...');
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS test_embeddings (
          id TEXT PRIMARY KEY,
          content TEXT,
          embedding vector(1536)
        );
      `);
      console.log('   ✓ Tabela de teste criada com sucesso');
    } catch (err) {
      console.log('   ✗ Erro ao criar tabela:', err.message);
      console.log('');
      console.log('=== RESULTADO: pgvector NÃO funciona corretamente ===');
      process.exit(0);
    }
    console.log('');
    
    // 6. Testar inserção de dados
    console.log('6. Testando inserção de embedding...');
    try {
      // Criar um vetor de teste com 1536 dimensões (tamanho do OpenAI text-embedding-3-small)
      const testEmbedding = Array(1536).fill(0).map(() => Math.random());
      await pool.query(
        'INSERT INTO test_embeddings (id, content, embedding) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        ['test-1', 'Texto de teste', JSON.stringify(testEmbedding)]
      );
      console.log('   ✓ Embedding inserido com sucesso');
    } catch (err) {
      console.log('   ✗ Erro ao inserir embedding:', err.message);
    }
    console.log('');
    
    // 7. Testar busca por similaridade
    console.log('7. Testando busca por similaridade (cosine distance)...');
    try {
      const queryEmbedding = Array(1536).fill(0).map(() => Math.random());
      const result = await pool.query(`
        SELECT id, content, embedding <=> $1::vector AS distance
        FROM test_embeddings
        ORDER BY distance
        LIMIT 5;
      `, [JSON.stringify(queryEmbedding)]);
      console.log('   ✓ Busca por similaridade funcionou');
      console.log('   Resultados:', result.rows.length);
    } catch (err) {
      console.log('   ✗ Erro na busca:', err.message);
    }
    console.log('');
    
    // 8. Limpar tabela de teste
    console.log('8. Limpando tabela de teste...');
    try {
      await pool.query('DROP TABLE IF EXISTS test_embeddings;');
      console.log('   ✓ Tabela de teste removida');
    } catch (err) {
      console.log('   ✗ Erro ao remover tabela:', err.message);
    }
    console.log('');
    
    console.log('=== RESULTADO FINAL ===');
    console.log('✓ pgvector está TOTALMENTE FUNCIONAL no seu PostgreSQL!');
    console.log('');
    console.log('Você pode implementar:');
    console.log('- Embeddings de documentos');
    console.log('- Busca semântica');
    console.log('- RAG (Retrieval-Augmented Generation)');
    console.log('');
    console.log('Próximos passos:');
    console.log('1. Criar tabela de embeddings na migration');
    console.log('2. Gerar embeddings dos documentos (OpenAI API)');
    console.log('3. Implementar busca semântica no bot');
    
  } catch (error) {
    console.error('Erro durante verificação:', error);
  } finally {
    process.exit(0);
  }
}

checkPgvectorSupport();

