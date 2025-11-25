import { EvolutionConfig } from '../types';

/**
 * Testa a conexão com a Evolution API verificando o estado da instância.
 * Retorna sucesso se conseguir conectar e obter informações da instância.
 */
export const testEvolutionConnection = async (
  config: EvolutionConfig
): Promise<{ success: boolean; error?: string; details?: string }> => {
  if (!config.baseUrl || !config.apiKey || !config.instanceName) {
    return {
      success: false,
      error: "Campos obrigatórios não preenchidos",
      details: "Preencha URL Base, API Key e Nome da Instância antes de testar."
    };
  }

  const cleanUrl = config.baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/instance/connectionState/${config.instanceName}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': config.apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: "Erro 401: API Key inválida",
          details: "Verifique se a API Key está correta."
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          error: "Erro 404: Instância não encontrada",
          details: "Verifique se o nome da instância está correto."
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Erro ${response.status}`,
        details: JSON.stringify(errorData)
      };
    }

    const data = await response.json();
    return {
      success: true,
      details: `Conexão estabelecida! Estado: ${data.state || 'conectado'}`
    };
  } catch (error: any) {
    console.warn("Evolution API Connection Test Failed:", error);

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        success: false,
        error: "Erro de conexão: URL inacessível",
        details: "Verifique se a URL está correta e se o servidor está acessível. Pode ser um problema de CORS ou rede."
      };
    }

    return {
      success: false,
      error: "Falha de rede ou bloqueio CORS",
      details: error.message || "Não foi possível conectar à Evolution API."
    };
  }
};

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
    text: message,
    delay: 1200,
    linkPreview: false
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
