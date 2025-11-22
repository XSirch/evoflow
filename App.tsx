
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Configuration } from './pages/Configuration';
import { Simulator } from './pages/Simulator';
import { Contacts } from './pages/Contacts';
import { AppView, StoreConfig, EvolutionConfig, Contact, Tag } from './types';
import { Settings as SettingsIcon, ShieldAlert, Save } from 'lucide-react';

const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: 'Loja Exemplo',
  description: 'Uma loja fictícia para demonstração do bot.',
  openingHours: 'Seg-Sex 08:00 às 18:00',
  tone: 'friendly',
  fallbackMessage: 'Vou chamar um especialista humano para te ajudar com isso. Um momento, por favor.',
  knowledgeBase: [
    {
      id: '1',
      title: 'Cardápio / Produtos',
      content: '- Produto A (R$ 50,00): Descrição do produto A.\n- Produto B (R$ 100,00): Descrição do produto B.\n- Serviço X (R$ 200,00): Manutenção completa.',
      active: true
    },
    {
      id: '2',
      title: 'Políticas de Loja',
      content: 'Aceitamos PIX e Cartão de Crédito em até 3x sem juros. Entregas são feitas em até 2 dias úteis para a região central.',
      active: true
    }
  ]
};

const DEFAULT_EVO_CONFIG: EvolutionConfig = {
  baseUrl: '',
  apiKey: '',
  instanceName: 'minha_instancia',
  phoneNumber: ''
};

const DEFAULT_TAGS: Tag[] = [
  { id: '1', name: 'VIP', color: 'bg-purple-500' },
  { id: '2', name: 'Novo Cliente', color: 'bg-blue-500' },
  { id: '3', name: 'Devedor', color: 'bg-red-500' }
];

const DEFAULT_CONTACTS: Contact[] = [
  { id: '1', name: 'Cliente VIP', phoneNumber: '5511999998888', tags: ['1'], permission: 'allowed' },
  { id: '2', name: 'João Teste', phoneNumber: '5511977776666', tags: ['2'], permission: 'denied' }
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  
  // Persistent State
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => {
    const saved = localStorage.getItem('storeConfig');
    return saved ? JSON.parse(saved) : DEFAULT_STORE_CONFIG;
  });

  const [evoConfig, setEvoConfig] = useState<EvolutionConfig>(() => {
    const saved = localStorage.getItem('evoConfig');
    return saved ? JSON.parse(saved) : DEFAULT_EVO_CONFIG;
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('contacts');
    return saved ? JSON.parse(saved) : DEFAULT_CONTACTS;
  });

  const [tags, setTags] = useState<Tag[]>(() => {
    const saved = localStorage.getItem('tags');
    return saved ? JSON.parse(saved) : DEFAULT_TAGS;
  });

  useEffect(() => {
    localStorage.setItem('storeConfig', JSON.stringify(storeConfig));
  }, [storeConfig]);

  useEffect(() => {
    localStorage.setItem('evoConfig', JSON.stringify(evoConfig));
  }, [evoConfig]);

  useEffect(() => {
    localStorage.setItem('contacts', JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem('tags', JSON.stringify(tags));
  }, [tags]);

  const renderContent = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.CONFIGURATION:
        return <Configuration config={storeConfig} onSave={setStoreConfig} />;
      case AppView.CONTACTS:
        return <Contacts contacts={contacts} setContacts={setContacts} tags={tags} setTags={setTags} evolutionConfig={evoConfig} />;
      case AppView.SIMULATOR:
        return <Simulator storeConfig={storeConfig} evolutionConfig={evoConfig} contacts={contacts} setContacts={setContacts} />;
      case AppView.SETTINGS:
        return (
          <div className="h-full overflow-y-auto p-8 max-w-4xl mx-auto">
            <header className="mb-8 pb-6 border-b border-slate-800">
              <h1 className="text-3xl font-bold text-white mb-2">Integração Evolution API</h1>
              <p className="text-slate-400">Configure a conexão com sua instância do WhatsApp.</p>
            </header>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-6">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-200">
                  <p className="font-bold mb-1">Atenção de Segurança</p>
                  <p className="opacity-80">Suas credenciais são salvas apenas no armazenamento local do seu navegador. Certifique-se de que sua instância da Evolution API permite conexões (CORS) se estiver testando diretamente deste painel.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">URL Base da API</label>
                    <input 
                      type="text" 
                      value={evoConfig.baseUrl}
                      onChange={(e) => setEvoConfig({...evoConfig, baseUrl: e.target.value})}
                      placeholder="https://api.evolution-api.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nome da Instância</label>
                    <input 
                      type="text" 
                      value={evoConfig.instanceName}
                      onChange={(e) => setEvoConfig({...evoConfig, instanceName: e.target.value})}
                      placeholder="MinhaInstancia"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">API Key Global</label>
                  <input 
                    type="password" 
                    value={evoConfig.apiKey}
                    onChange={(e) => setEvoConfig({...evoConfig, apiKey: e.target.value})}
                    placeholder="Digite sua chave de API..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                   <label className="block text-sm font-medium text-slate-300 mb-2">Número WhatsApp para Teste (com DDI)</label>
                    <input 
                      type="text" 
                      value={evoConfig.phoneNumber}
                      onChange={(e) => setEvoConfig({...evoConfig, phoneNumber: e.target.value})}
                      placeholder="5511999999999"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                   <p className="text-xs text-slate-500 mt-2">Usado pelo Simulador para testar o envio real via Evolution API.</p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end mb-8">
               <button 
                disabled={true} // Auto-save is active, visual button only
                className="flex items-center gap-2 bg-slate-700 text-slate-400 px-6 py-2 rounded-lg cursor-default"
               >
                 <Save className="w-4 h-4" />
                 Salvo Automaticamente
               </button>
            </div>
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      {/* 
        Changed to h-screen and overflow-hidden to allow children to handle their own scrolling.
        This fixes issues where "h-screen" children would be taller than the viewport.
      */}
      <main className="flex-1 ml-64 h-full flex flex-col overflow-hidden relative">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
