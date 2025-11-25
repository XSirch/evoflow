
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, RotateCcw, AlertTriangle, Smartphone, Loader2, UserCheck, UserX, User } from 'lucide-react';
import { StoreConfig, EvolutionConfig, ChatMessage, Contact } from '../types';
import { generateBotResponse } from '../services/openrouter';
import { sendWhatsAppMessage } from '../services/evolution';
import * as api from '../services/api';
import { v4 as uuidv4 } from 'uuid';

interface SimulatorProps {
  storeConfig: StoreConfig;
  evolutionConfig: EvolutionConfig;
  contacts?: Contact[]; // Added optional contact list
  setContacts?: (contacts: Contact[]) => void; // Function to update contacts
}

export const Simulator: React.FC<SimulatorProps> = ({ storeConfig, evolutionConfig, contacts = [], setContacts }) => {
  // State to track which contact we are simulating
  const [selectedContactId, setSelectedContactId] = useState<string>('guest');

  // Modelo da OpenRouter usado no simulador e no bot
  const [selectedModel, setSelectedModel] = useState<string>(
    process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', content: `Olá! Bem-vindo à ${storeConfig.storeName}. Como posso ajudar você hoje?`, timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sendingToEvolution, setSendingToEvolution] = useState(false);
  const [evoStatus, setEvoStatus] = useState<{success?: boolean, error?: string} | null>(null);
  const [isHandoverActive, setIsHandoverActive] = useState(false);
  const [guestPhone, setGuestPhone] = useState('');
  const [createdGuestContactId, setCreatedGuestContactId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Get current contact object
  const currentContact = contacts.find(c => c.id === selectedContactId);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Se estamos simulando como visitante, precisamos garantir que existe um contato
    // vinculado a esse número antes de continuar a conversa.
    let effectiveContact = currentContact;

    if (selectedContactId === 'guest') {
      const normalizedGuestPhone = guestPhone.replace(/\D/g, '');
      if (!normalizedGuestPhone) {
        alert('Informe um número de WhatsApp para o visitante (DDD+Número).');
        return;
      }

      if (!setContacts) {
        alert('Função de atualização de contatos (setContacts) não está disponível.');
        return;
      }

      // Se ainda não criamos um contato para este visitante nesta sessão, criamos agora.
      if (!createdGuestContactId) {
        const newContact: Contact = {
          id: uuidv4(),
          name: 'Cliente Novo',
          phoneNumber: normalizedGuestPhone,
          tags: [],
          permission: 'denied',
        };

        try {
          await api.saveContact(newContact);
          const updatedContacts = [...contacts, newContact];
          setContacts(updatedContacts);
          setCreatedGuestContactId(newContact.id);
          setSelectedContactId(newContact.id);
          effectiveContact = newContact;
        } catch (err) {
          console.error('Erro ao criar contato visitante automaticamente:', err);
          alert('Não foi possível salvar o contato visitante no backend.');
          return;
        }
      } else {
        // Já criamos um contato nesta sessão; usar ele como contato atual
        const existingGuest = contacts.find((c) => c.id === createdGuestContactId);
        if (existingGuest) {
          effectiveContact = existingGuest;
        }
      }
    }

    // Check permission logic for SIMULATOR (In real app, backend blocks this)
    // If contact is denied, we still let them send messages TO the bot, but bot might refuse to send PROMOS.
    // However, here we are simulating a chat session.

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setEvoStatus(null);

    // IF HANDOVER IS ACTIVE: HUMAN IS REPLYING
    if (isHandoverActive) {
      if (evolutionConfig.apiKey && evolutionConfig.baseUrl) {
        setSendingToEvolution(true);
        // Determine target phone number: real contact phone or config default
        const targetPhone = currentContact ? currentContact.phoneNumber : evolutionConfig.phoneNumber;
        const tempConfig = { ...evolutionConfig, phoneNumber: targetPhone };
        
        const result = await sendWhatsAppMessage(tempConfig, input); 
        setSendingToEvolution(false);
        setEvoStatus(result);
      }
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Atendente respondeu manualmente.',
        timestamp: new Date()
      }]);
      return;
    }

    // IF BOT IS ACTIVE
    setIsTyping(true);

    // 1. Gerar resposta da OpenRouter
    const history = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

    const botResult = await generateBotResponse(input, history, storeConfig, currentContact, {
      model: selectedModel,
    });
    
    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      content: botResult.text,
      timestamp: new Date()
    };

    setIsTyping(false);
    setMessages(prev => [...prev, botMsg]);

    // Check for handover trigger
    if (botResult.handover) {
      setIsHandoverActive(true);
    }

    // Check for permission updates from Bot
    if (botResult.permissionUpdate && currentContact && setContacts) {
      const newStatus = botResult.permissionUpdate;
      const updatedContactName = currentContact.name;
      
      // Update global contact state
      const updatedContacts = contacts.map(c => 
        c.id === currentContact.id ? { ...c, permission: newStatus } : c
      );
      setContacts(updatedContacts);

      // Add system message about the change
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: newStatus === 'allowed' 
          ? `✅ ${updatedContactName} permitiu o envio de mensagens.` 
          : `🚫 ${updatedContactName} bloqueou o envio de mensagens.`,
        timestamp: new Date()
      }]);
    }

    // 2. If Evolution Config is present, try to send via API
    if (evolutionConfig.apiKey && evolutionConfig.baseUrl) {
      setSendingToEvolution(true);
      const targetPhone = effectiveContact ? effectiveContact.phoneNumber : evolutionConfig.phoneNumber;
      const tempConfig = { ...evolutionConfig, phoneNumber: targetPhone };

      const result = await sendWhatsAppMessage(tempConfig, botResult.text);
      setSendingToEvolution(false);
      setEvoStatus(result);
    }
  };

  const handleReset = () => {
    setMessages([
      { id: Date.now().toString(), role: 'model', content: `Olá! Bem-vindo à ${storeConfig.storeName}. Como posso ajudar você hoje?`, timestamp: new Date() }
    ]);
    setEvoStatus(null);
    setIsHandoverActive(false);
    setGuestPhone('');
    setCreatedGuestContactId(null);
    if (selectedContactId !== 'guest') {
      setSelectedContactId('guest');
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row p-6 gap-6 overflow-hidden">
      {/* Simulator View */}
      <div className={`flex-1 flex flex-col bg-slate-900 rounded-3xl border shadow-2xl overflow-hidden relative transition-colors duration-500 ${isHandoverActive ? 'border-yellow-500/50 shadow-yellow-900/20' : 'border-slate-800'}`}>
        
        {/* Header */}
        <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isHandoverActive ? 'bg-yellow-500' : 'bg-emerald-500'}`}>
              {isHandoverActive ? <UserCheck className="text-white w-6 h-6" /> : <Bot className="text-white w-6 h-6" />}
            </div>
            <div>
              <h2 className="font-bold text-white">{storeConfig.storeName}</h2>
              <p className={`text-xs flex items-center gap-1 ${isHandoverActive ? 'text-yellow-400 font-bold' : 'text-emerald-400'}`}>
                <span className={`w-2 h-2 rounded-full ${isHandoverActive ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                {isHandoverActive ? 'AGUARDANDO HUMANO' : 'Bot Automático Ativo'}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {/* Seletor de modelo da OpenRouter (vale para simulador e bot) */}
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Modelo OpenRouter</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1 bg-slate-900 text-xs text-white border border-slate-600 rounded-lg px-2 py-1 outline-none focus:border-emerald-500"
              >
                <option value="openai/gpt-4o-mini">openai/gpt-4o-mini (padrão recomendado)</option>
                <option value="openai/gpt-5-mini">openai/gpt-5-mini (raciocínio, experimental)</option>
                <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B Instruct (free)</option>
              </select>
            </div>

            {isHandoverActive && (
               <button onClick={() => setIsHandoverActive(false)} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1">
                 <Bot className="w-3 h-3" /> Retomar Bot
               </button>
            )}
            <button onClick={handleReset} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors" title="Reiniciar Chat">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Context Selector Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 uppercase font-bold">Simulando como:</span>
          <select
            value={selectedContactId}
            onChange={(e) => {
              setSelectedContactId(e.target.value);
              handleReset();
            }}
            className="bg-slate-800 text-sm text-white border border-slate-700 rounded-lg px-2 py-1 outline-none focus:border-blue-500"
          >
            <option value="guest">Visitante (Sem cadastro)</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.permission === 'allowed' ? '(✅)' : '(🚫)'}
              </option>
            ))}
          </select>

          {selectedContactId === 'guest' && (
            <input
              type="text"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="WhatsApp visitante (DDD+Número)"
              className="bg-slate-800 text-sm text-white border border-slate-700 rounded-lg px-2 py-1 outline-none focus:border-emerald-500 flex-1 min-w-[180px]"
            />
          )}

          {currentContact && (
             <div className={`text-xs px-2 py-1 rounded border ${currentContact.permission === 'allowed' ? 'border-emerald-500/30 text-emerald-500' : 'border-red-500/30 text-red-500'}`}>
                {currentContact.permission === 'allowed' ? 'Permite Mensagens' : 'Bloqueia Mensagens'}
             </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900/50 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
          {messages.map((msg) => {
            if (msg.role === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-4">
                   <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-2">
                     <Bot className="w-3 h-3" /> {msg.content}
                   </span>
                </div>
              )
            }

            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-lg ${
                  isUser 
                    ? 'bg-emerald-600 text-white rounded-br-none' 
                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-[10px] opacity-50 block mt-2 text-right">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 border border-slate-700 flex gap-1">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}
           {isHandoverActive && !isTyping && (
             <div className="flex justify-center mt-4 animate-fade-in">
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 px-4 py-2 rounded-lg flex items-center gap-2 text-xs">
                   <AlertTriangle className="w-4 h-4" />
                   O bot parou. O cliente aguarda resposta humana.
                </div>
             </div>
           )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={`p-4 border-t transition-colors ${isHandoverActive ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-slate-800 border-slate-700'}`}>
           {evoStatus && (
            <div className={`mb-2 text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${evoStatus.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
               {evoStatus.success ? (
                 <span>✓ Enviado via Evolution API</span>
               ) : (
                 <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>Erro Evolution API: {evoStatus.error}</span>
                 </>
               )}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isHandoverActive ? "Digite a resposta manual para o cliente..." : "Simular mensagem do cliente..."}
              className={`flex-1 bg-slate-900 border rounded-xl px-4 text-white placeholder-slate-500 focus:ring-1 outline-none transition-colors ${isHandoverActive ? 'border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500' : 'border-slate-600 focus:border-emerald-500 focus:ring-emerald-500'}`}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className={`${isHandoverActive ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-emerald-500 hover:bg-emerald-600'} disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all`}
              title={isHandoverActive ? "Enviar Resposta Manual" : "Enviar Mensagem"}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Debug/Info Panel */}
      <div className="w-full lg:w-80 bg-slate-800 rounded-2xl p-6 border border-slate-700 h-fit">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-slate-400" />
          Status da Integração
        </h3>
        
        <div className="space-y-4">
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
            <span className="text-xs text-slate-500 uppercase font-bold">Evolution API</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-slate-300 truncate max-w-[150px]">
                {evolutionConfig.baseUrl || 'Não configurado'}
              </span>
              <div className={`w-2 h-2 rounded-full ${evolutionConfig.baseUrl ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            </div>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
             <div className="flex justify-between items-center">
               <span className="text-xs text-slate-500 uppercase font-bold">Modo de Operação</span>
               {isHandoverActive ? (
                  <span className="text-[10px] bg-yellow-500 text-slate-900 px-1.5 rounded font-bold">MANUAL</span>
               ) : (
                  <span className="text-[10px] bg-emerald-500 text-slate-900 px-1.5 rounded font-bold">AUTO</span>
               )}
             </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-slate-300">OpenRouter (modelo selecionado)</span>
              <div className={`w-2 h-2 rounded-full ${isHandoverActive ? 'bg-slate-600' : 'bg-emerald-500'}`}></div>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4">
             <span className="text-xs text-slate-500 uppercase font-bold">Teste de Permissões</span>
             <p className="text-xs text-slate-400 mt-1 mb-2">
               Tente falar "pare de enviar mensagens" ou "quero receber ofertas" para ver o bot alterar o status do contato selecionado.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};
