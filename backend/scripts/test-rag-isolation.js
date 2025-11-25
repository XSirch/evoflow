import { getPool } from '../db.js';
import { searchSimilarChunks } from '../services/rag.js';

/**
 * Script para testar isolamento de embeddings entre usuários
 * 
 * Cenário:
 * - Usuário A tem documentos sobre "Loja de Roupas"
 * - Usuário B tem documentos sobre "Loja de Eletrônicos"
 * - Busca do Usuário A NÃO deve retornar documentos do Usuário B
 */

async function testRAGIsolation() {
  console.log('=== Teste de Isolamento RAG ===\n');

  const pool = await getPool();

  try {
    // 1. Buscar todos os usuários com store configs
    console.log('1. Buscando usuários com configurações...');
    const { rows: users } = await pool.query(`
      SELECT DISTINCT sc.user_id, u.email, sc.id as store_config_id, sc.store_name
      FROM store_configs sc
      JOIN users u ON sc.user_id = u.id
      ORDER BY sc.user_id
    `);

    if (users.length === 0) {
      console.log('❌ Nenhum usuário encontrado com store config');
      return;
    }

    console.log(`✓ Encontrados ${users.length} usuário(s):\n`);
    users.forEach((user, i) => {
      console.log(`  ${i + 1}. ${user.email} (user_id: ${user.user_id}, loja: ${user.store_name})`);
    });
    console.log();

    // 2. Para cada usuário, verificar documentos e embeddings
    console.log('2. Verificando documentos e embeddings por usuário...\n');
    
    for (const user of users) {
      console.log(`--- Usuário: ${user.email} ---`);
      
      // Contar documentos
      const { rows: docCount } = await pool.query(`
        SELECT COUNT(*) as total
        FROM knowledge_documents
        WHERE store_config_id = $1
      `, [user.store_config_id]);

      // Contar embeddings
      const { rows: embCount } = await pool.query(`
        SELECT COUNT(*) as total
        FROM document_embeddings de
        JOIN knowledge_documents kd ON de.document_id = kd.id
        WHERE kd.store_config_id = $1
      `, [user.store_config_id]);

      console.log(`  Documentos: ${docCount[0].total}`);
      console.log(`  Embeddings: ${embCount[0].total}`);

      // Listar títulos dos documentos
      const { rows: docs } = await pool.query(`
        SELECT title, active
        FROM knowledge_documents
        WHERE store_config_id = $1
        ORDER BY title
      `, [user.store_config_id]);

      if (docs.length > 0) {
        console.log('  Documentos:');
        docs.forEach(doc => {
          console.log(`    - ${doc.title} ${doc.active ? '(ativo)' : '(inativo)'}`);
        });
      }
      console.log();
    }

    // 3. Testar busca com isolamento
    if (users.length >= 2) {
      console.log('3. Testando isolamento entre usuários...\n');

      const user1 = users[0];
      const user2 = users[1];

      console.log(`Usuário 1: ${user1.email} (${user1.store_name})`);
      console.log(`Usuário 2: ${user2.email} (${user2.store_name})\n`);

      // Buscar documentos do usuário 1
      const { rows: docs1 } = await pool.query(`
        SELECT title, content
        FROM knowledge_documents
        WHERE store_config_id = $1 AND active = true
        LIMIT 1
      `, [user1.store_config_id]);

      if (docs1.length === 0) {
        console.log('❌ Usuário 1 não tem documentos ativos para testar');
        return;
      }

      const testQuery = docs1[0].content.substring(0, 100);
      console.log(`Query de teste (baseada em documento do Usuário 1):`);
      console.log(`"${testQuery}..."\n`);

      // Buscar usando userId do usuário 1
      console.log('Buscando com userId do Usuário 1...');
      const results1 = await searchSimilarChunks(testQuery, user1.user_id, 3);
      console.log(`✓ Encontrados ${results1.length} chunks`);
      if (results1.length > 0) {
        results1.forEach((chunk, i) => {
          console.log(`  ${i + 1}. "${chunk.title}" (relevância: ${chunk.relevance})`);
        });
      }
      console.log();

      // Buscar usando userId do usuário 2 (NÃO deve retornar nada relevante)
      console.log('Buscando com userId do Usuário 2 (deve retornar documentos diferentes)...');
      const results2 = await searchSimilarChunks(testQuery, user2.user_id, 3);
      console.log(`✓ Encontrados ${results2.length} chunks`);
      if (results2.length > 0) {
        results2.forEach((chunk, i) => {
          console.log(`  ${i + 1}. "${chunk.title}" (relevância: ${chunk.relevance})`);
        });
      }
      console.log();

      // Verificar isolamento
      const hasOverlap = results1.some(r1 => 
        results2.some(r2 => r2.documentId === r1.documentId)
      );

      if (hasOverlap) {
        console.log('❌ FALHA: Documentos compartilhados entre usuários!');
        console.log('   Isolamento NÃO está funcionando corretamente.');
      } else {
        console.log('✅ SUCESSO: Isolamento funcionando!');
        console.log('   Cada usuário vê apenas seus próprios documentos.');
      }

    } else {
      console.log('⚠️  Apenas 1 usuário encontrado. Crie outro usuário para testar isolamento.');
    }

  } catch (error) {
    console.error('❌ Erro durante teste:', error);
    console.error('Stack trace:', error.stack);
  }

  console.log('\n=== Teste Concluído ===');
}

// Executar teste
testRAGIsolation()
  .then(() => {
    console.log('\n✓ Teste finalizado');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Erro:', error);
    process.exit(1);
  });

