import { StoreConfig, Contact } from '../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const buildSystemInstruction = (config: StoreConfig, contact?: Contact): string => {
  const knowledgeContext = config.knowledgeBase
    .filter(doc => doc.active)
    .map(doc => `--- DOCUMENTO: ${doc.title} ---\n${doc.content}`)
    .join('\n\n');

  const permissionStatus = contact ? (contact.permission === 'allowed' ? 'PERMITIDO' : 'NEGADO') : 'DESCONHECIDO';
  const userName = contact ? contact.name : 'Cliente';

  return `
Você é um assistente virtual inteligente para a loja "${config.storeName}".
Seu objetivo é atender clientes via WhatsApp de forma eficiente, cordial e SEMPRE responder em português brasileiro (pt-BR).

IMPORTANTE: todas as respostas devem ser em português brasileiro, mesmo que o usuário escreva em outra língua.

CONTEXTO DO CLIENTE ATUAL:
Nome: ${userName}
Status de Permissão de Envio de Mensagens: ${permissionStatus}

DETALHES DA LOJA:
Descrição: ${config.description}
Horário de Atendimento: ${config.openingHours}

BASE DE CONHECIMENTO (Use estas informações para responder):
${knowledgeContext}

DIRETRIZES DE COMPORTAMENTO:
1. Tom de voz: ${config.tone === 'formal' ? 'Profissional, polido e direto.' : config.tone === 'friendly' ? 'Amigável, acolhedor e prestativo.' : 'Entusiástico, enérgico e vibrante.'}
2. Responda de forma concisa, ideal para leitura rápida no WhatsApp.
3. Utilize APENAS as informações fornecidas na Base de Conhecimento. Se a informação não estiver lá, NÃO invente. Em vez disso, explique educadamente que não possui essa informação.
4. Nunca responda em inglês ou outro idioma. Sempre traduza ou reformule a resposta para português brasileiro.
5. Não exponha seu raciocínio interno, passo a passo ou comentários sobre como está pensando. Forneça apenas a resposta final que o cliente deve ler.

REGRAS DE PERMISSÃO (CRÍTICO – SIGA ANTES DE QUALQUER RESPOSTA):
- Sempre consulte o "Status de Permissão de Envio de Mensagens" do cliente (PERMITIDO, NEGADO ou DESCONHECIDO).
- Se o status for PERMITIDO:
  - Responda normalmente às dúvidas do cliente.
  - Você pode, ocasionalmente, convidar o cliente para receber promoções, se fizer sentido no contexto.
- Se o status for NEGADO:
  - Responda dúvidas e pedidos pontuais normalmente.
  - NÃO envie promoções, disparos em massa nem mensagens de marketing enquanto o status for NEGADO.
  - Em uma das primeiras respostas da conversa, pergunte educadamente se ele gostaria de receber ofertas e novidades pelo WhatsApp.
  - Se o cliente disser que SIM ou algo equivalente, confirme e adicione ao final da resposta a tag EXATA: [SET_PERMISSION:ALLOWED].
  - Se o cliente disser que NÃO, que não quer receber mensagens ou que deseja ser removido, confirme isso e adicione a tag EXATA: [SET_PERMISSION:DENIED].
- Se o status for DESCONHECIDO:
  - Trate como se fosse NEGADO até o cliente autorizar explicitamente.
  - Só comece a enviar promoções depois que o cliente concordar e você usar a tag [SET_PERMISSION:ALLOWED].

- Sempre que o cliente escrever frases como "pare de enviar mensagens", "não quero mais receber", "sair da lista" ou "cancelar mensagens":
  - Responda confirmando a remoção.
  - Adicione a tag EXATA: [SET_PERMISSION:DENIED].
- Sempre que o cliente escrever frases como "quero receber promoções", "pode mandar ofertas", "pode me colocar na lista":
  - Confirme a inscrição.
  - Adicione a tag EXATA: [SET_PERMISSION:ALLOWED].

TRANSBORDO HUMANO ([HUMAN_HANDOVER]):
- Use a tag [HUMAN_HANDOVER] quando:
  1. O cliente pedir explicitamente para falar com um atendente humano, vendedor ou pessoa real.
  2. A pergunta exigir informações que NÃO estão na BASE DE CONHECIMENTO e você não conseguir responder com segurança.
  3. A situação envolver reclamações graves, problemas de cobrança, erros em pedidos ou qualquer tema sensível sem instruções claras na Base de Conhecimento.
- Nesses casos, responda de forma breve explicando que vai acionar um atendente humano e adicione [HUMAN_HANDOVER] ao final da mensagem.

EXEMPLOS DE COMPORTAMENTO (SIGA ESTE ESTILO):

Exemplo 1 – Permissão NEGADA → perguntar se pode enviar promoções:
USUÁRIO: "Quais são os horários de vocês?"
ASSISTENTE (status de permissão: NEGADO):
"Atendemos de terça a domingo, das 18h às 23h.
Aproveitando, você gostaria de receber nossas promoções e novidades pelo WhatsApp de vez em quando?"

Exemplo 2 – Cliente autoriza receber promoções:
USUÁRIO: "Pode me mandar promoções sim."
ASSISTENTE:
"Perfeito, vou te adicionar à nossa lista para receber ofertas e novidades pelo WhatsApp. Qualquer momento você pode pedir para parar de receber. [SET_PERMISSION:ALLOWED]"

Exemplo 3 – Cliente pede para parar de receber:
USUÁRIO: "Pare de mandar mensagem, não quero mais receber nada."
ASSISTENTE:
"Sem problemas, vou remover o seu número da nossa lista de envios. Você não receberá mais mensagens promocionais nossas. [SET_PERMISSION:DENIED]"

Exemplo 4 – Não há informação na Base de Conhecimento / precisa de humano:
USUÁRIO: "Vocês fazem buffet para casamento para 200 pessoas?"
ASSISTENTE (não existe essa informação na BASE DE CONHECIMENTO):
"Essa é uma solicitação mais específica e precisa de um atendente humano para confirmar todos os detalhes. Vou te encaminhar para um responsável que pode te ajudar melhor. [HUMAN_HANDOVER]"
`;
};

export interface BotResponse {
  text: string;
  handover: boolean;
  permissionUpdate?: 'allowed' | 'denied';
}

// Heurística simples para detectar texto criptografado/codificado ou pouco legível
const looksLikeEncryptedOrGarbage = (value: string): boolean => {
  const text = (value || '').trim();
  if (!text) return true;

  // Padrões óbvios de blobs criptografados (por exemplo, Fernet "gAAAAA...")
  if (text.startsWith('gAAAAA')) return true;

  // Muito longo e quase sem espaços -> provavelmente blob/base64
  const length = text.length;
  const spaceCount = (text.match(/\s/g) || []).length;
  if (length > 80 && spaceCount < 3) return true;

  // Razão de caracteres alfanuméricos vs outros
  const alphaNum = (text.match(/[A-Za-z0-9]/g) || []).length;
  const nonAlphaNum = length - alphaNum;
  if (length > 0 && nonAlphaNum / length < 0.05) {
    // Quase tudo alfanumérico, sem pontuação/acentos → suspeito
    return true;
  }

  return false;
};

// Verifica se um texto parece linguagem natural (mínimo de palavras, mistura razoável de caracteres)
const isReadableNaturalLanguage = (value: string): boolean => {
  const text = (value || '').trim();
  if (!text) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  const alpha = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  const nonAlpha = text.length - alpha;
  if (text.length > 0 && nonAlpha / text.length > 0.5) return false;

  return true;
};

export const generateBotResponse = async (
  currentMessage: string,
  history: { role: string; parts: { text: string }[] }[],
  config: StoreConfig,
  contact?: Contact,
  options?: { model?: string }
): Promise<BotResponse> => {
  try {
    const apiKey = OPENROUTER_API_KEY;

    if (!apiKey) {
      console.error('OpenRouter API key not configured.');
      return {
        text: 'A configuração de IA não está completa. Contate o administrador.',
        handover: true,
      };
    }

    const systemInstruction = buildSystemInstruction(config, contact);

    const messagesForOpenRouter = [
      { role: 'system', content: systemInstruction },
      ...history.map((h) => ({
        role: h.role === 'model' ? 'assistant' : h.role === 'user' ? 'user' : 'user',
        content: h.parts.map((p) => p.text).join(' '),
      })),
      { role: 'user', content: currentMessage },
    ];

    const usedModel = options?.model || OPENROUTER_MODEL;

    // Debug: estrutura básica do request (sem logar chave)
    try {
      console.debug('[OpenRouter] Request payload', {
        model: usedModel,
        messagesCount: messagesForOpenRouter.length,
        lastUserMessage: currentMessage,
      });
    } catch {
      // ignore logging error
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(typeof window !== 'undefined' && window.location?.origin
          ? { 'HTTP-Referer': window.location.origin }
          : {}),
        'X-Title': 'EvoFlow Bot Manager',
      },
      body: JSON.stringify({
        model: options?.model || OPENROUTER_MODEL,
        messages: messagesForOpenRouter,
        temperature: 0.5,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API HTTP error:', response.status, errorText);
      return {
        text: 'Ocorreu um erro momentâneo. Por favor, aguarde um instante.',
        handover: true,
      };
    }

    const data: any = await response.json();

    try {
      console.debug('[OpenRouter] Raw response', data);
    } catch {
      // ignore logging error
    }

    const choice = data.choices?.[0];
    const message = choice?.message as any;
    let text = '';

    if (message) {
      const content = message.content as
        | string
        | Array<{ type: string; text?: string; content?: string }>
        | undefined;

      // 1) Conteúdo "padrão" (string ou partes)
      if (typeof content === 'string' && content.trim()) {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .map((part) => part.text ?? (part as any).content ?? '')
          .join(' ');
      }

      // 2) Modelos de raciocínio (GPT-5-mini) podem colocar o texto em `reasoning`
      if (!text && typeof message.reasoning === 'string' && message.reasoning.trim()) {
        if (!looksLikeEncryptedOrGarbage(message.reasoning)) {
          text = message.reasoning;
        }
      }

      // 3) Ou em `reasoning_details` (summary ou content) - ignorando `data` criptografado
      if (!text && Array.isArray(message.reasoning_details)) {
        const summariesOrContents = message.reasoning_details
          .map((d: any) => d?.summary || d?.content || '')
          .filter((s: string) => typeof s === 'string' && s.trim().length > 0)
          .filter((s: string) => !looksLikeEncryptedOrGarbage(s));
        if (summariesOrContents.length) {
          text = summariesOrContents.join(' ');
        }
      }

      // 4) Último recurso: varrer o objeto message inteiro e pegar a maior string legível
      if (!text) {
        const collected: string[] = [];
        const visit = (value: any, key?: string) => {
          if (!value) return;

          // Ignora explicitamente campos de dados criptografados
          if (key === 'data') return;

          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0 && !looksLikeEncryptedOrGarbage(trimmed)) {
              collected.push(trimmed);
            }
          } else if (Array.isArray(value)) {
            value.forEach((v) => visit(v));
          } else if (typeof value === 'object') {
            Object.entries(value).forEach(([k, v]) => visit(v, k));
          }
        };

        visit(message);

        if (collected.length) {
          // pega a maior string (provavelmente o texto da resposta)
          collected.sort((a, b) => b.length - a.length);
          text = collected[0];
        }
      }
    }

    text = (text || '').trim();

    try {
      console.debug('[OpenRouter] Extracted text before tag handling', text);
    } catch {
      // ignore logging error
    }

    let permissionUpdate: 'allowed' | 'denied' | undefined = undefined;

    if (text.includes('[SET_PERMISSION:ALLOWED]')) {
      permissionUpdate = 'allowed';
      text = text.replace('[SET_PERMISSION:ALLOWED]', '').trim();
    } else if (text.includes('[SET_PERMISSION:DENIED]')) {
      permissionUpdate = 'denied';
      text = text.replace('[SET_PERMISSION:DENIED]', '').trim();
    }

    if (text.includes('[HUMAN_HANDOVER]')) {
      return {
        text: config.fallbackMessage || 'Um momento, vou chamar um atendente humano para te ajudar.',
        handover: true,
        permissionUpdate,
      };
    }

    // Validação final: só aceitamos texto que pareça linguagem natural
    if (!isReadableNaturalLanguage(text)) {
      console.warn('[OpenRouter] Discarding non-natural-language text; using fallback message.', text);
      text = 'Desculpe, não consegui gerar uma resposta agora. Tente novamente em instantes.';
    }

    return {
      text,
      handover: false,
      permissionUpdate,
    };
  } catch (error) {
    console.error('OpenRouter API Error:', error);
    return {
      text: 'Ocorreu um erro momentâneo na API. Por favor, aguarde um instante.',
      handover: true,
    };
  }
}

