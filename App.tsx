
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AuthScreen } from './components/AuthScreen';
import { EvolutionSettings } from './components/EvolutionSettings';
import { Dashboard } from './pages/Dashboard';
import { Configuration } from './pages/Configuration';
import { Simulator } from './pages/Simulator';
import { Contacts } from './pages/Contacts';
import { AppView, StoreConfig, EvolutionConfig, Contact, Tag } from './types';
import * as api from './services/api';

const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: 'Loja Exemplo',
  description: 'Uma loja fictícia para demonstração do bot.',
  openingHours: 'Seg-Sex 08:00 às 18:00',
  tone: 'friendly',
  fallbackMessage: 'Vou chamar um especialista humano para te ajudar com isso. Um momento, por favor.',
  instagram: '@lojaexemplo',
  menuPdfUrl: '',
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Persistent State
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);
  const [evoConfig, setEvoConfig] = useState<EvolutionConfig>(DEFAULT_EVO_CONFIG);
  const [contacts, setContacts] = useState<Contact[]>(DEFAULT_CONTACTS);
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);

  // Check authentication and load data on mount
  useEffect(() => {
    const initializeApp = async () => {
      const token = api.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Verify token is still valid
        await api.getMe();
        setIsAuthenticated(true);

        // Load all data from backend
        const [storeConfigData, evoConfigData, contactsData] = await Promise.all([
          api.getStoreConfig(),
          api.getEvolutionConfig(),
          api.getContactsAndTags(),
        ]);

        setStoreConfig(storeConfigData);
        setEvoConfig(evoConfigData);
        setContacts(contactsData.contacts);
        setTags(contactsData.tags);
      } catch (err) {
        console.error('Failed to load data:', err);
        api.clearToken();
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    // Reload the page to trigger data fetch
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

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
        return <EvolutionSettings config={evoConfig} onSave={setEvoConfig} />;
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
