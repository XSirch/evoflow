import React, { useState, useEffect } from 'react';
import { Save, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { EvolutionConfig } from '../types';
import { saveEvolutionConfig } from '../services/api';
import { testEvolutionConnection } from '../services/evolution';

interface EvolutionSettingsProps {
  config: EvolutionConfig;
  onSave: (newConfig: EvolutionConfig) => void;
}

export const EvolutionSettings: React.FC<EvolutionSettingsProps> = ({ config, onSave }) => {
  const [formState, setFormState] = useState<EvolutionConfig>(config);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; details?: string } | null>(null);

  useEffect(() => {
    setFormState(config);
  }, [config]);

  const handleChange = (field: keyof EvolutionConfig, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setSaved(false);
    setTestResult(null); // Limpa resultado do teste ao alterar campos
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await saveEvolutionConfig(formState);
      onSave(formState);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const result = await testEvolutionConnection(formState);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: 'Erro inesperado',
        details: err.message || 'Não foi possível testar a conexão.'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8 max-w-4xl mx-auto">
      <header className="mb-8 pb-6 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Integração Evolution API</h1>
          <p className="text-slate-400">Configure a conexão com sua instância do WhatsApp.</p>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg text-sm font-medium border border-red-500/20">
              {error}
            </span>
          )}
          {saved && (
            <span className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in border border-emerald-500/20">
              Salvo!
            </span>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-6">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-bold mb-1">Atenção de Segurança</p>
              <p className="opacity-80">Suas credenciais agora são armazenadas de forma segura no backend. Certifique-se de que sua instância da Evolution API permite conexões (CORS) se estiver testando diretamente deste painel.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">URL Base da API</label>
                <input 
                  type="text" 
                  value={formState.baseUrl}
                  onChange={(e) => handleChange('baseUrl', e.target.value)}
                  placeholder="https://api.evolution-api.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nome da Instância</label>
                <input 
                  type="text" 
                  value={formState.instanceName}
                  onChange={(e) => handleChange('instanceName', e.target.value)}
                  placeholder="MinhaInstancia"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">API Key Global</label>
              <input 
                type="password" 
                value={formState.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder="Digite sua chave de API..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Número WhatsApp para Teste (com DDI)</label>
              <input
                type="text"
                value={formState.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                placeholder="5511999999999"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-2">Usado pelo Simulador para testar o envio real via Evolution API.</p>
            </div>
          </div>

          {/* Botão de Teste de Conexão */}
          <div className="pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !formState.baseUrl || !formState.apiKey || !formState.instanceName}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testando Conexão...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Testar Conexão
                </>
              )}
            </button>
            {!formState.baseUrl || !formState.apiKey || !formState.instanceName ? (
              <p className="text-xs text-slate-500 mt-2">Preencha os campos obrigatórios para testar a conexão.</p>
            ) : null}
          </div>

          {/* Resultado do Teste */}
          {testResult && (
            <div className={`mt-4 p-4 rounded-lg border ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-semibold ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {testResult.success ? 'Conexão bem-sucedida!' : testResult.error || 'Falha na conexão'}
                  </p>
                  {testResult.details && (
                    <p className={`text-sm mt-1 ${testResult.success ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                      {testResult.details}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end mb-8">
          <button 
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2 rounded-lg font-bold transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

