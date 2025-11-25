import express from 'express';
import { getPool } from '../db.js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { searchSimilarChunks } from '../services/rag.js';

const router = express.Router();

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// Limite de tokens por conversa (aproximadamente 40-50 mensagens)
const MAX_TOKENS_PER_CONVERSATION = parseInt(process.env.MAX_TOKENS_PER_CONVERSATION || '30000');

// Tempo de espera (em ms) para agrupar mensagens fragmentadas do mesmo remetente
const MESSAGE_DEBOUNCE_MS = parseInt(process.env.MESSAGE_DEBOUNCE_MS || '5000');

// Configuração de retry para chamadas ao OpenRouter
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 segundos entre tentativas

// Buffer de mensagens para debounce (evita múltiplas respostas para mensagens fragmentadas)
// Key: `${userId}:${phoneNumber}`
// Value: { messages: string[], timeoutId: NodeJS.Timeout, metadata: {...} }
const messageBuffers = new Map();

// Função auxiliar para delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para extrair nome do cliente da mensagem
function extractNameFromMessage(message) {
	  const lowerMessage = message.toLowerCase().trim();

	  // Padrões comuns de apresentação
	  const patterns = [
	    // "meu nome é X" / "me chamo X" / "sou o X" (captura só a primeira ou segunda palavra do nome)
	    /(?:meu nome (?:é|e)|me chamo|sou (?:o|a)?)[\s:]+([a-záàâãéèêíïóôõöúçñ]+(?:\s+[a-záàâãéèêíïóôõöúçñ]+)?)/i,
	    // "oi, meu nome é X" / "olá, sou X"
	    /^(?:oi|olá|ola),?\s+(?:meu nome (?:é|e)|sou)\s+([a-záàâãéèêíïóôõöúçñ]+)/i,
	    // "X aqui" / "X falando"
	    /^([a-záàâãéèêíïóôõöúçñ]+),?\s+(?:aqui|falando)/i,
	    // Respostas curtas após a pergunta de nome: "christiano", "christiano não", "joão sim" → pega só a primeira palavra
	    /^([a-záàâãéèêíïóôõöúçñ]+)(?:\s+(?:sim|não|nao))?$/i
	  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      // Capitalizar primeira letra de cada palavra
      const name = match[1]
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return name;
    }
  }

  return null;
}

// Webhook público da Evolution API para eventos como MESSAGES_UPSERT
// Importante: esta rota NÃO usa authRequired, pois a Evolution não envia JWT.
// A autenticação/validação básica é feita por um token de webhook simples (opcional).

function normalizePhoneFromJid(remoteJid) {
  if (!remoteJid || typeof remoteJid !== 'string') return null;
  const atIndex = remoteJid.indexOf('@');
  const raw = atIndex >= 0 ? remoteJid.slice(0, atIndex) : remoteJid;
  // Manter apenas dígitos
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

// Função para processar mensagens agrupadas após o debounce
async function processBufferedMessages(bufferKey) {
  const buffer = messageBuffers.get(bufferKey);
  if (!buffer) {
    console.log(`[Debounce] Buffer não encontrado para ${bufferKey}`);
    return;
  }

	  // Remover buffer do Map
	  messageBuffers.delete(bufferKey);

		  const { messages, metadata } = buffer;
		  const { userId, phoneNumber, contact, conversation, storeConfig, serverBaseUrl } = metadata;

	  // Concatenar todas as mensagens
	  const fullMessage = messages.join('\n');
  console.log(`[Debounce] Processando ${messages.length} mensagem(ns) agrupada(s) de ${phoneNumber}: "${fullMessage.substring(0, 100)}..."`);
  console.log(`[Debounce] storeConfig.userId: ${storeConfig?.userId}`);
  console.log(`[Debounce] storeConfig.knowledgeBase: ${storeConfig?.knowledgeBase?.length || 0} documentos`);

  try {
    const pool = await getPool();

    // Detectar se o cliente informou o nome
    const detectedName = extractNameFromMessage(fullMessage);
    if (detectedName && detectedName !== 'Cliente' && detectedName !== contact.name) {
      console.log(`[Nome] Cliente informou nome: "${detectedName}". Atualizando contato...`);
      await pool.query(
        'UPDATE contacts SET name = $1 WHERE id = $2',
        [detectedName, contact.id]
      );
      await pool.query(
        'UPDATE conversations SET customer_name = $1 WHERE id = $2',
        [detectedName, conversation.id]
      );
      // Atualizar objeto contact para usar o novo nome
      contact.name = detectedName;
      console.log(`[Nome] Nome atualizado para: "${detectedName}"`);
    }

    // Salvar mensagem completa no banco (se ainda não foi salva)
    const messageId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO messages (id, conversation_id, sender, content, timestamp, is_from_customer)
       VALUES ($1, $2, $3, $4, NOW(), true)`,
      [messageId, conversation.id, 'user', fullMessage]
    );

    // Verificar se conversa está em handover
    if (conversation.status === 'waiting_human') {
      console.log('Conversa em handover, não gerando resposta automática');
      return;
    }

    // Verificar se é primeira mensagem do contato
    const { rows: msgCountRows } = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1 AND is_from_customer = true',
      [conversation.id]
    );
    const isFirstMessage = parseInt(msgCountRows[0]?.count || '0') <= 1;

    // Buscar evolution_configs
    const { rows: evolutionRows } = await pool.query(
      'SELECT * FROM evolution_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!evolutionRows[0]) {
      console.warn('Evolution config não encontrada para user_id:', userId);
      return;
    }

    const evolutionConfigFromDb = {
      baseUrl: evolutionRows[0].base_url,
      apiKey: evolutionRows[0].api_key,
      instanceName: evolutionRows[0].instance_name,
      phoneNumber: evolutionRows[0].phone_number
    };

    // Verificar limite de tokens
    const currentTokens = parseInt(conversation.total_tokens || '0');
    let botResponse;

    if (currentTokens >= MAX_TOKENS_PER_CONVERSATION) {
      console.log(`Limite de tokens atingido (${currentTokens}/${MAX_TOKENS_PER_CONVERSATION}). Ativando handover.`);
      botResponse = {
        text: 'Percebi que nossa conversa está ficando bem longa! Para garantir que você receba o melhor atendimento possível, vou transferir você para um atendente humano que poderá ajudá-lo de forma mais completa. Aguarde um momento, por favor.',
        permissionUpdate: null,
        handover: true,
        tokensUsed: 0
      };
    } else {
      // Gerar resposta do bot
      console.log(`Gerando resposta para mensagem agrupada (primeira mensagem: ${isFirstMessage})`);
      botResponse = await generateBotResponse(storeConfig, contact, fullMessage, [], isFirstMessage);

      // Atualizar contador de tokens
      const newTotalTokens = currentTokens + botResponse.tokensUsed;
      await pool.query(
        'UPDATE conversations SET total_tokens = $1 WHERE id = $2',
        [newTotalTokens, conversation.id]
      );
      console.log(`Tokens usados nesta resposta: ${botResponse.tokensUsed}. Total: ${newTotalTokens}/${MAX_TOKENS_PER_CONVERSATION}`);
    }

    // Atualizar permissão se necessário
    if (botResponse.permissionUpdate) {
      await pool.query(
        'UPDATE contacts SET permission = $1 WHERE id = $2',
        [botResponse.permissionUpdate, contact.id]
      );
      console.log(`Permissão atualizada para ${botResponse.permissionUpdate}`);
    }

    // Atualizar status da conversa se houver handover
    if (botResponse.handover) {
      await pool.query(
        'UPDATE conversations SET status = $1 WHERE id = $2',
        ['waiting_human', conversation.id]
      );
    }

	    // Enviar resposta via Evolution
	    console.log('Enviando resposta:', botResponse.text);
	    const sent = await sendEvolutionMessage(evolutionConfigFromDb, phoneNumber, botResponse.text);

	    // Enviar PDF do cardápio se solicitado pelo bot
	    if (botResponse.sendMenuPdf && storeConfig.menuPdfUrl) {
	      let pdfUrlToSend = storeConfig.menuPdfUrl;
	      // Se a URL salva for relativa (ex: "/api/uploads/..."), prefixar com a URL base do servidor
	      if (pdfUrlToSend && !/^https?:\/\//i.test(pdfUrlToSend)) {
	        if (serverBaseUrl) {
	          pdfUrlToSend = `${serverBaseUrl}${pdfUrlToSend}`;
	        }
	      }
	      console.log('Enviando PDF do cardápio:', pdfUrlToSend);
	      await sendEvolutionPdf(evolutionConfigFromDb, phoneNumber, pdfUrlToSend, 'Cardápio');
	    }

    // Salvar resposta do bot no banco
    if (sent) {
      const botMessageId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender, content, timestamp, is_from_customer)
         VALUES ($1, $2, $3, $4, NOW(), false)`,
        [botMessageId, conversation.id, 'bot', botResponse.text]
      );
    }

    console.log(`[Debounce] Processamento concluído para ${bufferKey}`);
  } catch (error) {
    console.error(`[Debounce] Erro ao processar mensagens agrupadas para ${bufferKey}:`, error);
  }
}

// Função para gerar resposta do bot usando OpenRouter
async function generateBotResponse(storeConfig, contact, userMessage, conversationHistory = [], isFirstMessage = false) {
  // Usar busca vetorial RAG se disponível, caso contrário fallback para contexto completo
  let knowledgeContext = '';
  let ragUsed = false;

  try {
    // Tentar busca vetorial RAG (usando userId para isolamento entre lojas)
    const similarChunks = await searchSimilarChunks(userMessage, storeConfig.userId, 5);

    if (similarChunks && similarChunks.length > 0) {
      knowledgeContext = similarChunks
        .map(chunk => `--- ${chunk.title} (relevância: ${chunk.relevance}) ---\n${chunk.text}`)
        .join('\n\n');

      ragUsed = true;
      console.log(`[RAG] Busca vetorial usada: ${similarChunks.length} chunks encontrados`);
      similarChunks.forEach((chunk, i) => {
        console.log(`[RAG] Chunk ${i + 1}: "${chunk.title}" (relevância: ${chunk.relevance}, distância: ${chunk.distance.toFixed(4)})`);
      });
    } else {
      console.log('[RAG] Nenhum chunk encontrado, usando fallback');
      throw new Error('No chunks found');
    }
  } catch (error) {
    // Fallback para contexto completo se RAG falhar
    console.log('[RAG] Fallback para contexto completo:', error.message);
    knowledgeContext = storeConfig.knowledgeBase
      .filter(doc => doc.active)
      .map(doc => `--- DOCUMENTO: ${doc.title} ---\n${doc.content}`)
      .join('\n\n');

    console.log(`[generateBotResponse] Total de documentos: ${storeConfig.knowledgeBase.length}`);
    console.log(`[generateBotResponse] Documentos ativos: ${storeConfig.knowledgeBase.filter(doc => doc.active).length}`);
  }

  console.log(`[generateBotResponse] Tamanho do contexto: ${knowledgeContext.length} caracteres (RAG: ${ragUsed})`);

  const permissionStatus = contact
    ? (contact.permission === 'allowed' ? 'PERMITIDO' : 'NEGADO')
    : 'DESCONHECIDO';

  let userName = contact ? contact.name : 'Cliente';

  // Tratar nomes genéricos como "Cliente" ou "Cliente Novo" como nome desconhecido
  if (!userName || userName.toLowerCase().startsWith('cliente')) {
    userName = 'Cliente';
  }

  const systemPrompt = `
Você é um assistente virtual inteligente da loja "${storeConfig.storeName}", atuando exclusivamente pelo WhatsApp.
Você DEVE responder sempre em português brasileiro.

Sua missão é atender clientes de forma clara, cordial, natural e eficiente — sem repetição de informações desnecessárias.

	==================================================================
	APRESENTAÇÃO (PRIMEIRA MENSAGEM)
	==================================================================
	${isFirstMessage ? `
	ATENÇÃO: Esta é a PRIMEIRA interação com este cliente.
	
	1. Cumprimente de forma simpática.
	2. Informe que é o assistente virtual da loja.
	3. ${userName === 'Cliente'
	   ? 'Pergunte APENAS o nome do cliente: "Antes de começarmos, posso saber seu nome? 😊". NÃO faça nenhuma outra pergunta nesta mensagem.'
	   : `Use o nome "${userName}" nas próximas interações.`}
	4. Explique brevemente como funciona este canal:
	   • Aqui respondemos dúvidas sobre a loja, cardápio e preços.
	   • Pedidos devem ser feitos pelo APP da loja, central 0800, iFood ou 99Food.
	   • Também ajudamos com solicitações de eventos, e nesses casos um atendente humano assumirá logo depois.
	5. IMPORTANTE: NESTA PRIMEIRA MENSAGEM, se o status de permissão for "NEGADO" ou "DESCONHECIDO", NÃO pergunte ainda sobre ofertas. Essa pergunta deve ser feita somente depois que o cliente informar o nome.
	` : ''}

==================================================================
CONTEXTO DO CLIENTE
==================================================================
Nome: ${userName}
Status de Permissão: ${permissionStatus}

==================================================================
DETALHES DA LOJA
==================================================================
Descrição: ${storeConfig.description}
Horário de Atendimento: ${storeConfig.openingHours}
${storeConfig.instagram ? `Instagram: ${storeConfig.instagram}` : ''}

==================================================================
BASE DE CONHECIMENTO
==================================================================
${knowledgeContext}

	==================================================================
	COMPORTAMENTO
	==================================================================
	• Nunca responda em outro idioma.
	• Seja conciso e natural (comunicação ideal para WhatsApp).
	• Tom de voz: ${storeConfig.tone === 'formal' ? 'Profissional e educado.' : storeConfig.tone === 'friendly' ? 'Amigável e acolhedor.' : 'Enérgico e vibrante.'}
	• Utilize apenas o necessário da Base de Conhecimento.
	• Se uma informação não existir, não invente.
	• Em caso de dúvidas específicas, ofereça ajuda humana.
	• MUITO IMPORTANTE: a apresentação completa com "Olá!" e explicação de como funciona o canal só deve aparecer na PRIMEIRA interação (quando indicado acima). Nas mensagens seguintes, NÃO repita essa saudação completa nem se apresente de novo — responda direto ao que o cliente pediu, como no exemplo "Gostaria de fazer um pedido".

==================================================================
DETECÇÃO DE NOME
==================================================================
Se o cliente informar o nome dele (ex: "Meu nome é João", "Sou a Maria", "Me chamo Pedro"):
• Agradeça e passe a chamá-lo pelo nome em todas as próximas interações.
• Continue o atendimento normalmente.
Se o cliente responder apenas com o nome (ex: "Christiano") ou o nome seguido de uma palavra curta (ex: "Christiano não", "João sim") após você ter pedido o nome, considere APENAS a primeira palavra como o nome e siga o atendimento normalmente.

==================================================================
EVENTOS (INCLUIR ANIMAÇÃO / ENTUSIASMO)
==================================================================
Se o cliente mencionar:
• "evento", "festa", "corporativo", "encomenda grande"
• "preciso de orçamento para X pessoas"
• "quero fazer um aniversário"
• "quero levar X pizzas para um grupo"

→ Demonstre entusiasmo:
"Oba! 😍 Ficamos muito felizes em saber que você quer fazer um evento com a gente! 🎉
Para garantir todos os detalhes certinhos, vou te encaminhar para um atendente humano que cuida dessa parte."

→ E FINALIZAR COM: [HUMAN_HANDOVER]

		==================================================================
		ENVIO DO CARDÁPIO EM PDF
		==================================================================
		${storeConfig.menuPdfUrl ? `
		Se o cliente pedir cardápio ou menu (frases como "Quero ver o cardápio", "Me manda o cardápio", "Quero ver o menu", etc.):
		• SEMPRE informar que vai enviar o PDF com uma frase como: "Aqui está o cardápio em PDF para você visualizar com mais conforto 😉".
		• É OBRIGATÓRIO adicionar a tag [SEND_MENU_PDF] SEMPRE que você disser que está enviando o cardápio em PDF.
		• Nunca afirme que está enviando o cardápio em PDF sem colocar a tag [SEND_MENU_PDF] no final da resposta.
		Exemplo correto de resposta quando o cliente pede o cardápio:
		"Estarei te enviando o cardápio em PDF em alguns segundos para você visualizar com mais conforto 😉 [SEND_MENU_PDF]"
		` : `
		Se o cliente pedir cardápio ou menu:
		• Informar que o cardápio está disponível na Base de Conhecimento acima.
		• Listar os principais itens de forma resumida.
		`}

  ==================================================================
  ENCERRAMENTO AUTOMÁTICO
  ==================================================================
  Sempre que:
  • Todas as dúvidas forem resolvidas, OU
  • O cliente afirmar que terminou
  • NUNCA use encerramento automático logo após o cliente apenas responder "Sim" ou "Não" sobre ofertas;
    nesses casos você deve continuar a conversa (pedir o nome se ainda não tiver e/ou oferecer ajuda com o cardápio).
  
  → Encerrar de forma simpática:
• Manhã/Tarde: "Tenha um excelente dia!"
• Noite: "Tenha uma excelente noite!"
• "Agradecemos o contato 😊"
${storeConfig.instagram ? `• "Siga nosso Instagram para novidades: ${storeConfig.instagram}"` : ''}

==================================================================
REGRAS DE PERMISSÃO
==================================================================
  1. REGRA GERAL:
     • Sempre que o cliente responder à pergunta sobre ofertas ("Sim", "Quero", "Pode enviar", "Não", etc.),
       você DEVE tratar isso explicitamente e NÃO encerrar a conversa apenas com um agradecimento.
     • Depois de tratar a permissão, continue a conversa de forma natural (por exemplo, pedindo o nome
       se ainda não souber e/ou oferecendo ajuda com o cardápio ou dúvidas).

  2. SE PERMITIDO (cliente diz SIM ou equivalente):
     • Confirme que ele passará a receber ofertas.
     • Se o nome no CONTEXTO DO CLIENTE estiver como "Cliente", "Cliente Novo" ou vazio,
       peça o nome: algo como "Ótimo! E qual é o seu nome?".
     • SEMPRE inclua a tag [SET_PERMISSION:ALLOWED] no final da resposta quando detectar essa aceitação.

  3. SE NEGADO ou DESCONHECIDO (cliente diz NÃO ou equivalente):
     • Responda dúvidas, mas NÃO envie promoções.
     ${!isFirstMessage ? '• NÃO pergunte novamente sobre ofertas (já foi perguntado antes).' : ''}
     • Quando o cliente recusar ofertas, confirme que não enviaremos promoções.
     • Se ainda não souber o nome (nome genérico como "Cliente" ou "Cliente Novo"),
       peça o nome mesmo assim e continue o atendimento normalmente.
     • SEMPRE inclua a tag [SET_PERMISSION:DENIED] no final da resposta quando detectar essa recusa.

  4. CANCELAMENTO (após já estar permitido):
     • Frases como "pare de enviar", "não quero receber" →
       → Confirmar remoção + incluir [SET_PERMISSION:DENIED]

  5. ACEITAÇÃO FORA DA PERGUNTA INICIAL:
     • Frases como "pode enviar promoções", "quero ofertas" mesmo fora da primeira mensagem →
       → Confirmar + incluir [SET_PERMISSION:ALLOWED] seguindo as mesmas regras acima (não encerrar a conversa,
         pedir o nome se ainda não tiver e continuar oferecendo ajuda).

==================================================================
TRANSBORDO HUMANO – [HUMAN_HANDOVER]
==================================================================
USE em casos de:
1. Pedido explícito de falar com humano.
2. Reclamações graves, cobranças, problemas com pedidos.
3. Pergunta que não esteja na Base de Conhecimento.
4. Solicitações de eventos.

Mensagem sugerida:
"Certo! Vou te conectar com um atendente humano para te ajudar melhor. [HUMAN_HANDOVER]"
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  // Calcular tamanho aproximado do prompt
  const promptSize = JSON.stringify(messages).length;
  console.log(`[OpenRouter] Enviando requisição: ${promptSize} caracteres, ${messages.length} mensagens`);
  console.log(`[OpenRouter] Modelo: ${OPENROUTER_MODEL}, max_tokens: 800`);

  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: messages,
    max_tokens: 800,
    temperature: 0.7
  };

  console.log(`[OpenRouter] Request body size: ${JSON.stringify(requestBody).length} bytes`);

  // Implementar retry com até MAX_RETRIES tentativas
  let lastError = null;
  let response = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[OpenRouter] Tentativa ${attempt}/${MAX_RETRIES}`);

      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://evoflow.app',
          'X-Title': 'EvoFlow Bot'
        },
        body: JSON.stringify(requestBody)
      });

      // Se a resposta for ok, sair do loop
      if (response.ok) {
        break;
      }

      // Se não for ok, logar e tentar novamente
      const errorText = await response.text();
      console.error(`[OpenRouter] Tentativa ${attempt} falhou: ${response.status} ${response.statusText}`);
      console.error(`[OpenRouter] Error body:`, errorText);
      lastError = new Error(`HTTP ${response.status}: ${errorText}`);

      // Se não for a última tentativa, aguardar antes de tentar novamente
      if (attempt < MAX_RETRIES) {
        console.log(`[OpenRouter] Aguardando ${RETRY_DELAY_MS}ms antes da próxima tentativa...`);
        await sleep(RETRY_DELAY_MS);
      }
    } catch (fetchError) {
      console.error(`[OpenRouter] Tentativa ${attempt} falhou com erro de rede:`, fetchError);
      lastError = fetchError;

      // Se não for a última tentativa, aguardar antes de tentar novamente
      if (attempt < MAX_RETRIES) {
        console.log(`[OpenRouter] Aguardando ${RETRY_DELAY_MS}ms antes da próxima tentativa...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Se todas as tentativas falharam
  if (!response || !response.ok) {
    console.error('[OpenRouter] Todas as tentativas falharam');
    return {
      text: storeConfig.fallbackMessage || 'Desculpe, estou com dificuldades técnicas no momento. Vou transferir você para um atendente humano.',
      permissionUpdate: null,
      handover: true,
      tokensUsed: 0
    };
  }

  try {
    console.log(`[OpenRouter] Response status: ${response.status} ${response.statusText}`);
    console.log(`[OpenRouter] Response headers:`, {
      'content-type': response.headers.get('content-type'),
      'content-length': response.headers.get('content-length'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining')
    });

    const responseText = await response.text();
    console.log(`[OpenRouter] Response body length: ${responseText.length} bytes`);

    if (!responseText || responseText.trim() === '') {
      console.error('[OpenRouter] Empty response body');
      return {
        text: storeConfig.fallbackMessage || 'Desculpe, estou com dificuldades técnicas no momento. Vou transferir você para um atendente humano.',
        permissionUpdate: null,
        handover: true,
        tokensUsed: 0
      };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[OpenRouter] Failed to parse JSON response:', parseError);
      console.error('[OpenRouter] Raw response:', responseText.substring(0, 500));
      return {
        text: storeConfig.fallbackMessage || 'Desculpe, estou com dificuldades técnicas no momento. Vou transferir você para um atendente humano.',
        permissionUpdate: null,
        handover: true,
        tokensUsed: 0
      };
    }

    console.log(`[OpenRouter] Response structure:`, {
      hasChoices: !!data?.choices,
      choicesLength: data?.choices?.length,
      hasMessage: !!data?.choices?.[0]?.message,
      hasContent: !!data?.choices?.[0]?.message?.content,
      contentLength: data?.choices?.[0]?.message?.content?.length || 0
    });

    const rawText = data?.choices?.[0]?.message?.content || '';
    const tokensUsed = data?.usage?.total_tokens || 0;

    // Se não conseguiu extrair resposta, ativa handover
    if (!rawText || rawText.trim() === '') {
      console.error('[OpenRouter] Empty content in response');
      console.error('[OpenRouter] Full response:', JSON.stringify(data, null, 2));
      return {
        text: storeConfig.fallbackMessage || 'Desculpe, estou com dificuldades técnicas no momento. Vou transferir você para um atendente humano.',
        permissionUpdate: null,
        handover: true,
        tokensUsed: 0
      };
    }

    console.log(`[OpenRouter] Success: ${rawText.length} caracteres, ${tokensUsed} tokens`);
    console.log(`[OpenRouter] Response preview: "${rawText.substring(0, 100)}..."`);


	    // Extrair tags especiais
	    let text = rawText;
	    let permissionUpdate = null;
	    let handover = false;
	    let sendMenuPdf = false;

	    if (text.includes('[SET_PERMISSION:ALLOWED]')) {
	      permissionUpdate = 'allowed';
	      text = text.replace(/\[SET_PERMISSION:ALLOWED\]/g, '').trim();
	    }
	    if (text.includes('[SET_PERMISSION:DENIED]')) {
	      permissionUpdate = 'denied';
	      text = text.replace(/\[SET_PERMISSION:DENIED\]/g, '').trim();
	    }
	    if (text.includes('[HUMAN_HANDOVER]')) {
	      handover = true;
	      text = text.replace(/\[HUMAN_HANDOVER\]/g, '').trim();
	    }
	    if (text.includes('[SEND_MENU_PDF]')) {
	      sendMenuPdf = true;
	      text = text.replace(/\[SEND_MENU_PDF\]/g, '').trim();
	    }

	    // Fallback: se o modelo esqueceu a tag [SEND_MENU_PDF], mas:
	    // - o cliente pediu o cardápio/menu
	    // - e a resposta afirma que está enviando o cardápio em PDF
	    // então forçamos o envio do PDF para não frustrar o cliente.
	    if (!sendMenuPdf && storeConfig.menuPdfUrl) {
	      const lowerUser = (userMessage || '').toLowerCase();
	      const lowerText = text.toLowerCase();

	      const customerRequestedMenu =
	        lowerUser.includes('cardápio') ||
	        lowerUser.includes('cardapio') ||
	        lowerUser.includes('menu');

	      const botSaysPdf =
	        lowerText.includes('cardápio em pdf') ||
	        lowerText.includes('cardapio em pdf') ||
	        lowerText.includes('enviando o cardápio em pdf') ||
	        lowerText.includes('estou te enviando o cardápio');

	      if (customerRequestedMenu && botSaysPdf) {
	        console.log('[generateBotResponse] Forçando sendMenuPdf=true por fallback (sem tag [SEND_MENU_PDF])');
	        sendMenuPdf = true;
	      }
	    }

	    return { text, permissionUpdate, handover, sendMenuPdf, tokensUsed };
  } catch (error) {
    console.error('Error generating bot response:', error);
    return {
      text: storeConfig.fallbackMessage || 'Desculpe, estou com dificuldades técnicas no momento. Vou transferir você para um atendente humano.',
      permissionUpdate: null,
      handover: true,
      tokensUsed: 0
    };
  }
}

// Função para enviar mensagem via Evolution API
async function sendEvolutionMessage(evolutionConfig, phoneNumber, message) {
  const cleanUrl = evolutionConfig.baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/message/sendText/${evolutionConfig.instanceName}`;

  const payload = {
    number: phoneNumber,
    text: message,
    delay: 1200,
    linkPreview: false
  };

  console.log('Enviando para Evolution API:', endpoint);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionConfig.apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('Evolution API response:', response.status, responseText);

    if (!response.ok) {
      console.error('Evolution API send error:', response.status, response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending message via Evolution:', error);
    return false;
  }
}

// Função para enviar PDF via Evolution API
async function sendEvolutionPdf(evolutionConfig, phoneNumber, pdfUrl, caption = '') {
  const cleanUrl = evolutionConfig.baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/message/sendMedia/${evolutionConfig.instanceName}`;

  const payload = {
    number: phoneNumber,
    mediatype: 'document',
    mimetype: 'application/pdf',
    media: pdfUrl,
    caption: caption || 'Cardápio',
    fileName: 'cardapio.pdf'
  };

  console.log('Enviando PDF para Evolution API:', endpoint);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionConfig.apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('Evolution API PDF response:', response.status, responseText);

    if (!response.ok) {
      console.error('Evolution API PDF send error:', response.status, response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending PDF via Evolution:', error);
    return false;
  }
}

router.post('/evolution/messages-upsert', async (req, res) => {
  try {
    const pool = await getPool();
    const body = req.body || {};

    console.log('Webhook recebido:', JSON.stringify(body, null, 2));

	    // Descobrir a URL base deste servidor para montar URLs absolutas (ex: PDF do cardápio)
	    const forwardedProto = req.headers['x-forwarded-proto'];
	    const protocol = (typeof forwardedProto === 'string' && forwardedProto.length > 0)
	      ? forwardedProto.split(',')[0]
	      : req.protocol;
	    const host = req.get('host');
	    const serverBaseUrl = host ? `${protocol}://${host}` : '';
	    console.log('[Webhook] serverBaseUrl detectado:', serverBaseUrl);

    // Ignorar mensagens enviadas pelo próprio bot
    const fromMe = body?.data?.key?.fromMe || body?.key?.fromMe || false;
    if (fromMe) {
      console.log('Mensagem enviada pelo bot, ignorando');
      return res.status(200).json({ ignored: true, reason: 'fromMe' });
    }

    // Estrutura da Evolution API v2: body.data contém os dados da mensagem
    // Quando fromMe=false, o remoteJid é o número do cliente que enviou a mensagem
    const remoteJid = body?.data?.key?.remoteJid || body?.key?.remoteJid || body?.remoteJid;
    const senderJid = body?.sender;
    const instanceName = body?.instance || body?.owner || body?.instanceName || null;
    const messageText = body?.data?.message?.conversation ||
                        body?.data?.message?.extendedTextMessage?.text ||
                        body?.message?.conversation ||
                        body?.message?.extendedTextMessage?.text ||
                        body?.text ||
                        null;

    console.log('Debug - sender:', senderJid, 'remoteJid:', remoteJid);

    // Quando fromMe=false, o remoteJid contém o número do cliente
    // Quando fromMe=true, o remoteJid contém o número do destinatário
    const phoneNumber = normalizePhoneFromJid(remoteJid);

    if (!phoneNumber) {
      console.warn('Webhook Evolution: remoteJid inválido ou ausente', remoteJid);
      return res.status(200).json({ ignored: true, reason: 'invalid_jid' });
    }

    console.log('Número do cliente extraído:', phoneNumber);

    if (!messageText || messageText.trim() === '') {
      console.log('Mensagem sem texto, ignorando');
      return res.status(200).json({ ignored: true, reason: 'no_text' });
    }

    // Encontrar user_id a partir da evolution_configs
    let userRow = null;

    if (instanceName) {
      const { rows } = await pool.query(
        'SELECT user_id FROM evolution_configs WHERE instance_name = $1 LIMIT 1',
        [instanceName]
      );
      userRow = rows[0] || null;
    }

    if (!userRow) {
      const { rows } = await pool.query(
        'SELECT user_id FROM evolution_configs ORDER BY id LIMIT 1'
      );
      userRow = rows[0] || null;
    }

    if (!userRow) {
      console.warn('Webhook Evolution: nenhuma evolution_config encontrada, ignorando mensagem');
      return res.status(200).json({ ignored: true, reason: 'no_config' });
    }

    const userId = userRow.user_id;

    // Buscar ou criar contato
    let contact = null;
    const { rows: existingRows } = await pool.query(
      'SELECT id, name, phone_number, permission FROM contacts WHERE user_id = $1 AND phone_number = $2 LIMIT 1',
      [userId, phoneNumber]
    );

    if (existingRows[0]) {
      contact = existingRows[0];
    } else {
      // Criar novo contato
      const pushName = body?.pushName || body?.senderName || null;
      const name = typeof pushName === 'string' && pushName.trim() ? pushName.trim() : 'Cliente Novo';
      const id = crypto.randomUUID();

      await pool.query(
        'INSERT INTO contacts (id, user_id, name, phone_number) VALUES ($1, $2, $3, $4)',
        [id, userId, name, phoneNumber]
      );

      contact = { id, name, phone_number: phoneNumber, permission: 'denied' };
    }

    // Buscar ou criar conversa
    let conversation = null;
    const { rows: convRows } = await pool.query(
      'SELECT id, status, total_tokens FROM conversations WHERE user_id = $1 AND phone_number = $2 LIMIT 1',
      [userId, phoneNumber]
    );

    if (convRows[0]) {
      conversation = convRows[0];
      // Atualizar last_message_at
      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversation.id]
      );
    } else {
      // Criar nova conversa
      const conversationId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO conversations (id, user_id, contact_id, phone_number, customer_name, status, last_message_at, total_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 0)`,
        [conversationId, userId, contact.id, phoneNumber, contact.name, 'active']
      );
      conversation = { id: conversationId, status: 'active', total_tokens: 0 };
    }

	    // **DEBOUNCE: Agrupar mensagens fragmentadas do mesmo remetente**
    const bufferKey = `${userId}:${phoneNumber}`;

    // Buscar configurações da loja (necessário para metadata do buffer)
    const { rows: storeRows } = await pool.query(
      'SELECT * FROM store_configs WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!storeRows[0]) {
      console.warn('Store config não encontrada para user_id:', userId);
      return res.status(200).json({ ignored: true, reason: 'no_store_config' });
    }

    // Buscar documentos da base de conhecimento
    const { rows: knowledgeDocs } = await pool.query(
      'SELECT id, title, content, active FROM knowledge_documents WHERE store_config_id = $1 ORDER BY title',
      [storeRows[0].id]
    );

    const storeConfig = {
      id: storeRows[0].id,
      userId: userId,  // Adicionar userId para isolamento de embeddings
      storeName: storeRows[0].store_name,
      description: storeRows[0].description,
      openingHours: storeRows[0].opening_hours,
      tone: storeRows[0].tone,
      fallbackMessage: storeRows[0].fallback_message,
      instagram: storeRows[0].instagram || '',
      menuPdfUrl: storeRows[0].menu_pdf_url || '',
      knowledgeBase: knowledgeDocs
    };

    console.log(`Base de Conhecimento carregada: ${knowledgeDocs.length} documentos`);

    // **IMPLEMENTAÇÃO DO DEBOUNCE**
    // Verificar se já existe buffer para este remetente
    let buffer = messageBuffers.get(bufferKey);

    if (buffer) {
      // Buffer existe: adicionar mensagem e resetar timeout
      console.log(`[Debounce] Adicionando mensagem ao buffer existente para ${bufferKey}`);
      buffer.messages.push(messageText);

      // Cancelar timeout anterior
      clearTimeout(buffer.timeoutId);

      // Criar novo timeout
      buffer.timeoutId = setTimeout(() => {
        processBufferedMessages(bufferKey);
      }, MESSAGE_DEBOUNCE_MS);

      messageBuffers.set(bufferKey, buffer);
    } else {
	      // Buffer não existe: criar novo
      console.log(`[Debounce] Criando novo buffer para ${bufferKey} (aguardando ${MESSAGE_DEBOUNCE_MS}ms)`);

      const newBuffer = {
        messages: [messageText],
        timeoutId: setTimeout(() => {
          processBufferedMessages(bufferKey);
        }, MESSAGE_DEBOUNCE_MS),
        metadata: {
          userId,
          phoneNumber,
          contact,
		          conversation,
		          storeConfig,
		          serverBaseUrl
        }
      };

      messageBuffers.set(bufferKey, newBuffer);
    }

    // Retornar 200 imediatamente (processamento será feito após debounce)
    return res.status(200).json({
      success: true,
      buffered: true,
      contactId: contact.id,
      conversationId: conversation.id,
      bufferKey: bufferKey
    });
  } catch (err) {
    console.error('Erro no webhook Evolution messages-upsert', err);
    return res.status(500).json({ error: 'Internal error handling Evolution webhook' });
  }
});

export default router;

