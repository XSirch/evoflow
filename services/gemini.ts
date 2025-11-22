
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { StoreConfig, Contact } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the system instruction string based on store configuration, knowledge base (RAG),
 * and user permission context.
 */
const buildSystemInstruction = (config: StoreConfig, contact?: Contact): string => {
  // Compile all active knowledge documents into a single context block
  const knowledgeContext = config.knowledgeBase
    .filter(doc => doc.active)
    .map(doc => `--- DOCUMENTO: ${doc.title} ---\n${doc.content}`)
    .join('\n\n');

  const permissionStatus = contact ? (contact.permission === 'allowed' ? 'PERMITIDO' : 'NEGADO') : 'DESCONHECIDO';
  const userName = contact ? contact.name : 'Cliente';

  return `
Você é um assistente virtual inteligente para a loja "${config.storeName}".
Seu objetivo é atender clientes via WhatsApp de forma eficiente e cordial.

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
3. Utilize APENAS as informações fornecidas na Base de Conhecimento. Se a informação não estiver lá, NÃO invente.

REGRAS DE PERMISSÃO (CRÍTICO):
- O cliente tem o status de permissão: ${permissionStatus}.
- Se o status for NEGADO e o cliente perguntar algo, responda educadamente, mas pergunte se pode adicioná-lo à lista de envio para receber novidades.
- Se o cliente pedir para "parar", "sair", "cancelar mensagens" ou "não perturbar":
  1. Confirme que ele será removido.
  2. Adicione ao final da mensagem a tag EXATA: [SET_PERMISSION:DENIED]
- Se o cliente pedir para "receber promoções", "entrar na lista", "pode mandar mensagem":
  1. Confirme que ele foi adicionado.
  2. Adicione ao final da mensagem a tag EXATA: [SET_PERMISSION:ALLOWED]
- Se o cliente não tiver permissão e você perguntar se pode adicionar, e ele disser "Sim", use a tag [SET_PERMISSION:ALLOWED].

TRANSBORDO HUMANO:
- Se a pergunta for complexa ou cliente pedir humano: Responda com a tag [HUMAN_HANDOVER].
`;
};

export interface BotResponse {
  text: string;
  handover: boolean;
  permissionUpdate?: 'allowed' | 'denied';
}

/**
 * Sends a message to Gemini with the current chat history context.
 */
export const generateBotResponse = async (
  currentMessage: string,
  history: { role: string; parts: { text: string }[] }[],
  config: StoreConfig,
  contact?: Contact // Optional context about who is chatting
): Promise<BotResponse> => {
  try {
    // We use the latest flash model for speed and efficiency in chat bots
    const modelId = 'gemini-2.5-flash'; 
    
    const systemInstruction = buildSystemInstruction(config, contact);

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelId,
      contents: [
        ...history, // Previous conversation turns
        { role: 'user', parts: [{ text: currentMessage }] } // Current user message
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.5, // Lower temperature for more factual RAG responses
        maxOutputTokens: 300, 
      },
    });

    let text = response.text?.trim() || "";
    let permissionUpdate: 'allowed' | 'denied' | undefined = undefined;

    // Check for permission tags
    if (text.includes('[SET_PERMISSION:ALLOWED]')) {
      permissionUpdate = 'allowed';
      text = text.replace('[SET_PERMISSION:ALLOWED]', '').trim();
    } else if (text.includes('[SET_PERMISSION:DENIED]')) {
      permissionUpdate = 'denied';
      text = text.replace('[SET_PERMISSION:DENIED]', '').trim();
    }

    // Check for handover tag
    if (text.includes('[HUMAN_HANDOVER]')) {
      return {
        text: config.fallbackMessage || "Um momento, vou chamar um atendente humano para te ajudar.",
        handover: true,
        permissionUpdate
      };
    }

    return { 
      text: text,
      handover: false,
      permissionUpdate
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: "Ocorreu um erro momentâneo. Por favor, aguarde um instante.",
      handover: true // Fail safe to human
    };
  }
};
