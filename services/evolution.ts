import { EvolutionConfig } from '../types';

/**
 * Simulates or executes a request to the Evolution API.
 * Note: Direct browser-to-API calls often fail due to CORS unless the server is configured strictly.
 * This service attempts the call but fails gracefully if CORS blocks it, logging the intended payload.
 */
export const sendWhatsAppMessage = async (
  config: EvolutionConfig,
  message: string
): Promise<{ success: boolean; error?: string }> => {
  if (!config.baseUrl || !config.apiKey || !config.instanceName || !config.phoneNumber) {
    return { success: false, error: "Configuração da Evolution API incompleta." };
  }

  const cleanUrl = config.baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/message/sendText/${config.instanceName}`;

  const payload = {
    number: config.phoneNumber,
    options: {
      delay: 1200,
      presence: "composing",
      linkPreview: false
    },
    textMessage: {
      text: message
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: `Erro ${response.status}: ${JSON.stringify(errorData)}` };
    }

    return { success: true };
  } catch (error) {
    console.warn("Evolution API Call Failed (Likely CORS or Network):", error);
    // In a real production frontend, this call is usually proxied by a backend.
    // For this demo, we return success false but log the attempt.
    return { success: false, error: "Falha de rede ou bloqueio CORS (Esperado em ambiente puramente Frontend)." };
  }
};
