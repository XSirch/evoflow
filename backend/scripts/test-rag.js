import { chunkText, generateEmbedding, processDocumentEmbeddings, searchSimilarChunks } from '../services/rag.js';
import crypto from 'crypto';

async function testRAG() {
  console.log('=== Teste do Sistema RAG ===\n');

  // Teste 1: Chunking
  console.log('1. Testando chunking de texto...');
  const sampleText = `
    Nossa loja funciona de segunda a sexta das 9h às 18h.
    Aos sábados, abrimos das 9h às 13h.
    Domingos e feriados estamos fechados.
    
    Oferecemos diversos produtos de qualidade.
    Temos entrega para toda a cidade.
    Aceitamos cartão de crédito, débito e PIX.
    
    Entre em contato pelo WhatsApp (11) 99999-9999.
    Ou visite nossa loja na Rua Exemplo, 123.
  `.trim();

  const chunks = chunkText(sampleText, 100, 20);
  console.log(`✓ Texto dividido em ${chunks.length} chunks`);
  chunks.forEach((chunk, i) => {
    console.log(`  Chunk ${i + 1}: "${chunk.substring(0, 50)}..." (${chunk.length} chars)`);
  });
  console.log();

  // Teste 2: Geração de Embedding
  console.log('2. Testando geração de embedding...');
  try {
    const embedding = await generateEmbedding('Qual o horário de funcionamento?');
    console.log(`✓ Embedding gerado: ${embedding.length} dimensões`);
    console.log(`  Primeiros 5 valores: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log();
  } catch (error) {
    console.error(`✗ Erro ao gerar embedding: ${error.message}`);
    console.log('  Verifique se OPENAI_EMBEDDINGS_API_KEY está configurada\n');
    return;
  }

  // Teste 3: Processamento de Documento
  console.log('3. Testando processamento de documento...');
  const testDocId = crypto.randomUUID();
  try {
    const count = await processDocumentEmbeddings(testDocId, sampleText);
    console.log(`✓ Documento processado: ${count} chunks com embeddings`);
    console.log();
  } catch (error) {
    console.error(`✗ Erro ao processar documento: ${error.message}\n`);
    return;
  }

  // Teste 4: Busca Semântica
  console.log('4. Testando busca semântica...');
  
  const queries = [
    'Qual o horário de funcionamento?',
    'Vocês aceitam cartão?',
    'Como faço para entrar em contato?'
  ];

  for (const query of queries) {
    try {
      console.log(`\n  Query: "${query}"`);
      
      // Nota: Este teste requer um storeConfigId válido
      // Em produção, você precisaria buscar do banco de dados
      // Para teste, vamos apenas gerar o embedding e mostrar
      const queryEmbedding = await generateEmbedding(query);
      console.log(`  ✓ Embedding da query gerado (${queryEmbedding.length} dimensões)`);
      
      // Para testar busca completa, você precisaria:
      // const results = await searchSimilarChunks(query, 'store-config-id', 3);
      // console.log(`  ✓ Encontrados ${results.length} chunks relevantes`);
      
    } catch (error) {
      console.error(`  ✗ Erro: ${error.message}`);
    }
  }

  console.log('\n=== Teste Concluído ===');
  console.log('\nPróximos passos:');
  console.log('1. Faça upload de um PDF na interface web');
  console.log('2. Verifique os logs do backend para confirmar geração de embeddings');
  console.log('3. Envie uma mensagem no WhatsApp e veja os logs de busca RAG');
  console.log('4. Use o botão "Status RAG" para verificar embeddings gerados');
}

// Executar teste
testRAG()
  .then(() => {
    console.log('\n✓ Teste finalizado com sucesso');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Erro durante teste:', error);
    process.exit(1);
  });

