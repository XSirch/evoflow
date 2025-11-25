
import React, { useEffect, useState, useRef } from 'react';
import { MessageCircle, Users, Clock, Activity, UserCheck, ChevronRight, X, Bot, User, CheckCircle, AlertCircle, Send, Loader2, Trash2 } from 'lucide-react';
import { DashboardStats } from '../types';
import { sendWhatsAppMessage } from '../services/evolution';
import { getDashboardStats, getDashboardConversations, getConversationMessages, deleteConversation } from '../services/api';

// Interface local para simular dados do Dashboard
interface ChatHistoryItem {
  sender: 'user' | 'bot' | 'system';
  content: string;
  timestamp: string;
}

interface ActiveChat {
  id: string;
  customerName: string;
  phoneNumber: string;
  status: 'active' | 'waiting_human' | 'completed';
  lastMessage: string;
  lastMessageSender: 'user' | 'bot' | 'system';
  unreadCount: number;
  history: ChatHistoryItem[];
}

export const Dashboard: React.FC = () => {
  // Estado dos Cards
  const [stats, setStats] = useState<DashboardStats>({
    totalMessages: 0,
    activeChats: 0,
    aiResponseTime: 0,
    humanHandovers: 0
  });

  // Estado das Conversas Ativas (Mock)
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  
  // Estado de Filtro
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'waiting_human' | 'completed'>('all');

  // Estado do Modal
  const [selectedChat, setSelectedChat] = useState<ActiveChat | null>(null);
  
  // Estados de Resposta Manual
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar config para envio real (hack para Dashboard)
  const evoConfig = JSON.parse(localStorage.getItem('evoConfig') || '{}');

  // Carregar dados reais do backend
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Recarregar conversas quando o filtro mudar
  useEffect(() => {
    loadConversations();
  }, [filterStatus]);

  // Polling para atualizar lista de conversas a cada 5 segundos
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadConversations();
      loadDashboardData();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [filterStatus]);

  const loadDashboardData = async () => {
    try {
      const statsData = await getDashboardStats();
      setStats(statsData);
      await loadConversations();
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const { conversations } = await getDashboardConversations(filterStatus);
      setActiveChats(conversations.map(conv => ({
        id: conv.id,
        customerName: conv.customerName,
        phoneNumber: conv.phoneNumber,
        status: conv.status as 'active' | 'waiting_human' | 'completed',
        lastMessage: conv.lastMessage,
        lastMessageSender: conv.lastMessageSender,
        unreadCount: 0,
        history: []
      })));
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    }
  };

  const loadChatHistory = async (conversationId: string) => {
    try {
      const { messages } = await getConversationMessages(conversationId);
      return messages;
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      return [];
    }
  };

  // Scroll to bottom when chat opens or history changes
  useEffect(() => {
    if (selectedChat && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedChat?.history, selectedChat?.id]);

  // Reset input when opening new chat
  useEffect(() => {
    setReplyText('');
  }, [selectedChat?.id]);

  // Polling para atualizar mensagens em tempo real quando modal está aberto
  useEffect(() => {
    if (!selectedChat) return;

    const pollInterval = setInterval(async () => {
      try {
        const { messages } = await getConversationMessages(selectedChat.id);

        // Atualizar apenas se houver novas mensagens
        if (messages.length !== selectedChat.history.length) {
          const updatedChat = {
            ...selectedChat,
            history: messages
          };
          setSelectedChat(updatedChat);

          // Atualizar também na lista de conversas
          setActiveChats(prev => prev.map(chat =>
            chat.id === selectedChat.id
              ? {
                  ...chat,
                  lastMessage: messages[messages.length - 1]?.content || chat.lastMessage,
                  lastMessageSender: messages[messages.length - 1]?.sender || chat.lastMessageSender
                }
              : chat
          ));
        }
      } catch (error) {
        console.error('Erro ao atualizar mensagens:', error);
      }
    }, 3000); // Atualiza a cada 3 segundos

    return () => clearInterval(pollInterval);
  }, [selectedChat?.id, selectedChat?.history.length]);

  // Lógica de filtragem
  const filteredChats = activeChats.filter(chat => {
    if (filterStatus === 'all') return true;
    return chat.status === filterStatus;
  });

  // --- Actions ---

  const handleOpenChat = async (chat: ActiveChat) => {
    // Carregar histórico real do backend
    const history = await loadChatHistory(chat.id);
    const chatWithHistory = {
      ...chat,
      history: history
    };
    setSelectedChat(chatWithHistory);
  };

  const handleTakeover = () => {
    if (!selectedChat) return;

    const updatedChat: ActiveChat = {
      ...selectedChat,
      status: 'active',
      history: [
        ...selectedChat.history,
        { 
          sender: 'system', 
          content: 'Atendimento humano iniciado (Manual).', 
          timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
        }
      ]
    };

    setActiveChats(prev => prev.map(chat => chat.id === selectedChat.id ? updatedChat : chat));
    setSelectedChat(updatedChat);
  };

  const handleSendMessage = async () => {
    if (!selectedChat || !replyText.trim()) return;

    setIsSending(true);
    const messageContent = replyText;
    const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    // 1. Tentar enviar via API (se configurada)
    if (evoConfig.baseUrl && evoConfig.apiKey) {
       await sendWhatsAppMessage({ ...evoConfig, phoneNumber: selectedChat.phoneNumber }, messageContent);
    }

    // 2. Atualização Otimista
    const newMessage: ChatHistoryItem = {
      sender: 'bot', // Bot/Agent side
      content: messageContent,
      timestamp: timestamp
    };

    const updatedChat: ActiveChat = {
      ...selectedChat,
      lastMessage: messageContent,
      lastMessageSender: 'bot',
      history: [...selectedChat.history, newMessage]
    };

    setActiveChats(prev => prev.map(chat => chat.id === selectedChat.id ? updatedChat : chat));
    setSelectedChat(updatedChat);
    setReplyText('');
    setIsSending(false);
  };

  const handleDeleteConversation = async () => {
    if (!selectedChat) return;

    try {
      await deleteConversation(selectedChat.id);

      // Remover da lista local
      setActiveChats(prev => prev.filter(chat => chat.id !== selectedChat.id));

      // Fechar modal
      setSelectedChat(null);
      setShowDeleteConfirm(false);

      // Recarregar dados
      await loadDashboardData();
    } catch (error) {
      console.error('Erro ao deletar conversa:', error);
      alert('Erro ao deletar conversa. Tente novamente.');
    }
  };

  // --- Components ---

  const StatCard = ({ icon: Icon, label, value, subtext, color }: any) => (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-600 transition-all">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-500/5 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500`}></div>
      <div className="relative z-10">
        <div className={`w-12 h-12 bg-${color}-500/10 rounded-xl flex items-center justify-center mb-4`}>
          <Icon className={`w-6 h-6 text-${color}-500`} />
        </div>
        <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
        <p className="text-slate-400 font-medium">{label}</p>
        <p className="text-xs text-slate-500 mt-2">{subtext}</p>
      </div>
    </div>
  );

  // Botão de Filtro Reutilizável
  const FilterButton = ({ label, value, count, colorClass }: { label: string, value: typeof filterStatus, count: number, colorClass: string }) => (
    <button
      onClick={() => setFilterStatus(value)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        filterStatus === value
          ? `${colorClass} border-transparent shadow-lg`
          : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:border-slate-600'
      }`}
    >
      {label} <span className="ml-1 opacity-75">({count})</span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto animate-fade-in relative">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Painel de Controle</h1>
        <p className="text-slate-400">Visão geral do desempenho do seu bot de atendimento.</p>
      </header>

      {/* Conversas Recentes - MOVIDO PARA O TOPO */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-8 flex flex-col h-[500px]">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-400" />
            Conversas Recentes
          </h3>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="Todas"
              value="all"
              count={activeChats.length}
              colorClass="bg-slate-600 text-white"
            />
            <FilterButton
              label="Em Andamento"
              value="active"
              count={activeChats.filter(c => c.status === 'active').length}
              colorClass="bg-blue-600 text-white"
            />
            <FilterButton
              label="Aguardando Humano"
              value="waiting_human"
              count={activeChats.filter(c => c.status === 'waiting_human').length}
              colorClass="bg-yellow-600 text-white"
            />
            <FilterButton
              label="Finalizadas"
              value="completed"
              count={activeChats.filter(c => c.status === 'completed').length}
              colorClass="bg-emerald-600 text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {filteredChats.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mb-2">
                 <MessageCircle className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-sm">Nenhuma conversa encontrada.</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleOpenChat(chat)}
                className={`group p-4 rounded-xl border transition-all cursor-pointer relative ${
                  chat.status === 'waiting_human'
                    ? 'bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40 hover:bg-yellow-500/10'
                    : chat.status === 'completed'
                    ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700 opacity-75 hover:opacity-100'
                    : 'bg-slate-900 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h4 className="font-bold text-white flex items-center gap-2">
                      {chat.customerName}
                      {chat.status === 'waiting_human' && (
                        <span className="text-[10px] bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> AJUDA
                        </span>
                      )}
                      {chat.status === 'completed' && (
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> FIM
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500">{chat.phoneNumber}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className={`text-sm text-slate-400 line-clamp-1 group-hover:text-slate-300 transition-colors ${chat.unreadCount > 0 ? 'font-semibold text-slate-200' : ''}`}>
                  {chat.lastMessageSender === 'user' ? '👤 ' : '🤖 '}{chat.lastMessage}
                </p>

                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    Ver Histórico <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={MessageCircle}
          label="Mensagens Totais"
          value={stats.totalMessages.toLocaleString()}
          subtext="Total de mensagens processadas"
          color="emerald"
        />
        <StatCard
          icon={Users}
          label="Conversas Ativas"
          value={stats.activeChats}
          subtext="Conversas em andamento"
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Tempo de Resposta (IA)"
          value={`${stats.aiResponseTime}s`}
          subtext="Tempo médio de resposta"
          color="violet"
        />
        <StatCard
          icon={UserCheck}
          label="Transbordos"
          value={stats.humanHandovers}
          subtext="Aguardando atendimento humano"
          color="yellow"
        />
      </div>



      {/* Chat History Modal */}
      {selectedChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl flex flex-col h-[80vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                  <User className="w-6 h-6 text-slate-300" />
                </div>
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    {selectedChat.customerName}
                    {selectedChat.status === 'waiting_human' && <AlertCircle className="w-4 h-4 text-yellow-500" />}
                  </h3>
                  <p className="text-xs text-slate-400">{selectedChat.phoneNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 hover:bg-red-900/30 rounded-full text-slate-400 hover:text-red-400 transition-colors"
                  title="Deletar conversa"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat History Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900 custom-scrollbar">
              {selectedChat.history.map((msg, idx) => {
                if (msg.sender === 'system') {
                  return (
                    <div key={idx} className="flex justify-center my-2">
                      <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700">
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                const isUser = msg.sender === 'user';
                return (
                  <div key={idx} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                     {/* Note: Customer (Left), Bot/Agent (Right) */}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      isUser 
                        ? 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700' // Customer
                        : 'bg-emerald-600 text-white rounded-br-none' // Bot/Agent
                    }`}>
                      <div className="flex items-center gap-2 mb-1 opacity-50 text-[10px]">
                        {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                        <span>{isUser ? 'Cliente' : 'Bot/Loja'}</span>
                      </div>
                      <p>{msg.content}</p>
                      <span className="text-[10px] opacity-50 block mt-1 text-right">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Modal Footer / Input Area */}
            <div className="p-4 border-t border-slate-800 bg-slate-800/30 rounded-b-2xl">
              {selectedChat.status === 'waiting_human' ? (
                <div className="space-y-3">
                   <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 flex items-start gap-3">
                     <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                     <div className="text-xs text-yellow-200">
                       <p className="font-bold">Atenção Necessária</p>
                       <p>O cliente solicitou ajuda humana ou o bot encontrou dificuldades. Assuma o atendimento para responder.</p>
                     </div>
                   </div>
                   <button 
                    onClick={handleTakeover}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-yellow-900/20"
                  >
                    <UserCheck className="w-4 h-4" />
                    Assumir Atendimento Agora
                  </button>
                </div>
              ) : selectedChat.status === 'active' ? (
                 <div className="flex gap-2 items-end">
                   <textarea
                     value={replyText}
                     onChange={(e) => setReplyText(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSendMessage();
                       }
                     }}
                     placeholder="Digite sua resposta..."
                     className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[50px] max-h-[100px]"
                   />
                   <button 
                    onClick={handleSendMessage}
                    disabled={!replyText.trim() || isSending}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-3 rounded-xl transition-all shadow-lg flex-shrink-0 h-[50px] w-[50px] flex items-center justify-center"
                   >
                     {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                   </button>
                 </div>
              ) : (
                <div className="text-center text-xs text-slate-500 flex items-center justify-center gap-2 py-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Conversa finalizada.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedChat && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Deletar Conversa</h3>
                <p className="text-sm text-slate-400">Esta ação não pode ser desfeita</p>
              </div>
            </div>

            <p className="text-slate-300 mb-6">
              Tem certeza que deseja deletar a conversa com <span className="font-bold text-white">{selectedChat.customerName}</span>?
              <br />
              <span className="text-sm text-slate-500">Todo o histórico de mensagens será permanentemente removido.</span>
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConversation}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
