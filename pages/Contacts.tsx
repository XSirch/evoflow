
import React, { useState } from 'react';
import { Users, UserPlus, Trash2, Send, Search, Loader2, Tag as TagIcon, X } from 'lucide-react';
import { Contact, EvolutionConfig, Tag } from '../types';
import { sendWhatsAppMessage } from '../services/evolution';
import { v4 as uuidv4 } from 'uuid';

interface ContactsProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  tags: Tag[];
  setTags: (tags: Tag[]) => void;
  evolutionConfig: EvolutionConfig;
}

export const Contacts: React.FC<ContactsProps> = ({ contacts, setContacts, tags, setTags, evolutionConfig }) => {
  // Contact Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false); // Toggle for mobile/compact view
  
  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');

  // Broadcast State
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 });
  const [sendLogs, setSendLogs] = useState<string[]>([]);

  // Tag Management State
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('bg-slate-500');

  const COLORS = [
    'bg-slate-500', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
    'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 
    'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-pink-500'
  ];

  // --- Contact Management ---

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) return;

    const newContact: Contact = {
      id: uuidv4(),
      name: newName,
      phoneNumber: newPhone.replace(/\D/g, ''), // Remove formatting chars
      tags: selectedTags,
      permission: 'allowed' // Default permission
    };

    setContacts([...contacts, newContact]);
    setNewName('');
    setNewPhone('');
    setSelectedTags([]);
    // Don't close form immediately to allow adding multiple
  };

  const handleDeleteContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const togglePermission = (id: string) => {
    setContacts(contacts.map(c => {
      if (c.id === id) {
        return { ...c, permission: c.permission === 'allowed' ? 'denied' : 'allowed' };
      }
      return c;
    }));
  };

  const toggleTagForNewContact = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(t => t !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  // --- Tag Management ---

  const handleAddTag = () => {
    if (!newTagName) return;
    const newTag: Tag = {
      id: uuidv4(),
      name: newTagName,
      color: newTagColor
    };
    setTags([...tags, newTag]);
    setNewTagName('');
  };

  const handleDeleteTag = (tagId: string) => {
    setTags(tags.filter(t => t.id !== tagId));
    // Clean up deleted tags from contacts
    setContacts(contacts.map(c => ({
      ...c,
      tags: c.tags.filter(t => t !== tagId)
    })));
  };

  // --- Broadcast Logic ---

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    if (contacts.length === 0) return;
    
    if (!evolutionConfig.baseUrl || !evolutionConfig.apiKey) {
      setSendLogs(prev => [...prev, "ERRO: Configure a Evolution API nas Configurações primeiro."]);
      return;
    }

    setIsSending(true);
    setSendProgress({ current: 0, total: contacts.length, success: 0, failed: 0, skipped: 0 });
    setSendLogs([]);

    const tempConfig = { ...evolutionConfig };

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      setSendProgress(prev => ({ ...prev, current: i + 1 }));

      // Check Permission
      if (contact.permission === 'denied') {
        setSendProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
        setSendLogs(prev => [`[${contact.name}] ⏭️ Pulado: Permissão Negada`, ...prev]);
        continue;
      }
      
      tempConfig.phoneNumber = contact.phoneNumber;

      try {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Delay
        const result = await sendWhatsAppMessage(tempConfig, broadcastMessage);

        if (result.success) {
          setSendProgress(prev => ({ ...prev, success: prev.success + 1 }));
          setSendLogs(prev => [`[${contact.name}] ✓ Enviado com sucesso`, ...prev]);
        } else {
          setSendProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
          setSendLogs(prev => [`[${contact.name}] ✗ Falha: ${result.error}`, ...prev]);
        }
      } catch (error) {
        setSendProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        setSendLogs(prev => [`[${contact.name}] ✗ Erro crítico`, ...prev]);
      }
    }

    setIsSending(false);
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phoneNumber.includes(searchTerm)
  );

  const getTagById = (id: string) => tags.find(t => t.id === id);

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 max-w-[1920px] mx-auto w-full overflow-y-auto lg:overflow-hidden custom-scrollbar">
      <header className="flex-none mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 lg:w-8 lg:h-8 text-emerald-500" />
            Gerenciador de Contatos
          </h1>
        </div>
        <button 
          onClick={() => setIsTagModalOpen(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border border-slate-700 transition-colors shadow-sm"
        >
          <TagIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Tags</span>
        </button>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-2">
        
        {/* Coluna Esquerda: Lista de Contatos */}
        <div className="lg:col-span-8 flex flex-col bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl h-[600px] lg:h-full">
          
          {/* Controls Header */}
          <div className="flex-none p-3 border-b border-slate-700 bg-slate-800/80 backdrop-blur z-10">
            <div className="flex gap-2 items-center mb-3">
               <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 transition-all ${showAddForm ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'}`}
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo</span>
              </button>
            </div>

            {/* Collapsible Add Form */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showAddForm ? 'max-h-[300px] opacity-100 mb-2' : 'max-h-0 opacity-0'}`}>
              <form onSubmit={handleAddContact} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-3">
                 <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Nome"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="WhatsApp (DDD+Número)"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                    <button 
                      type="submit"
                      disabled={!newName || !newPhone}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-sm font-bold"
                    >
                      Adicionar
                    </button>
                 </div>
                 {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">Tags:</span>
                    {tags.map(tag => (
                      <button
                        type="button"
                        key={tag.id}
                        onClick={() => toggleTagForNewContact(tag.id)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                          selectedTags.includes(tag.id)
                            ? `${tag.color} text-white border-transparent`
                            : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                 )}
              </form>
            </div>
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 custom-scrollbar bg-slate-900/30">
            {filteredContacts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
                <Users className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm">Nenhum contato encontrado.</p>
              </div>
            ) : (
              filteredContacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-3 bg-slate-900 border border-slate-700/80 p-3 rounded-xl hover:border-slate-500/50 hover:bg-slate-800 transition-all group shadow-sm">
                  {/* Avatar / Initials */}
                  <div className="flex-shrink-0 relative">
                    <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-300 font-bold border border-slate-700 shadow-inner">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${contact.permission === 'allowed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                       <h3 className="font-semibold text-white truncate text-sm">{contact.name}</h3>
                       <button 
                          onClick={() => togglePermission(contact.id)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tracking-wide uppercase transition-colors ${
                            contact.permission === 'allowed' 
                              ? 'border-emerald-500/30 text-emerald-500 hover:bg-red-500/10 hover:text-red-400'
                              : 'border-red-500/30 text-red-500 hover:bg-emerald-500/10 hover:text-emerald-400'
                          }`}
                        >
                          {contact.permission === 'allowed' ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono">{contact.phoneNumber}</span>
                    </div>

                    {/* Tags */}
                    {contact.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {contact.tags.map(tagId => {
                          const tag = getTagById(tagId);
                          if (!tag) return null;
                          return (
                            <span key={tagId} className={`px-1.5 py-0.5 rounded-[4px] text-[10px] text-white leading-none opacity-90 ${tag.color}`}>
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <button 
                    onClick={() => handleDeleteContact(contact.id)}
                    className="flex-shrink-0 text-slate-600 hover:text-red-400 p-2 rounded-lg hover:bg-slate-900/50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          
          {/* Footer Stats */}
          <div className="flex-none p-2 border-t border-slate-700 bg-slate-800 text-[10px] text-slate-500 flex justify-between px-4 font-mono uppercase tracking-wide">
            <span>Total: <b className="text-white">{contacts.length}</b></span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Permitidos: <b className="text-emerald-400">{contacts.filter(c => c.permission === 'allowed').length}</b></span>
          </div>
        </div>

        {/* Coluna Direita: Disparo em Massa */}
        {/* Usamos h-auto em mobile para não forçar uma altura mínima invisível, e h-full em desktop */}
        <div className="lg:col-span-4 flex flex-col gap-4 lg:h-full h-auto min-h-0 lg:overflow-y-auto no-scrollbar pb-2">
          
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl flex-none">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
              <Send className="w-4 h-4 text-blue-400" />
              Disparo em Massa
            </h3>
            
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Digite a mensagem para enviar a todos os contatos permitidos..."
              rows={5}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none mb-3"
            />

            <button
              onClick={handleBroadcast}
              disabled={isSending || contacts.length === 0 || !broadcastMessage.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 text-sm"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSending ? `Enviando (${sendProgress.current}/${sendProgress.total})` : 'Enviar Campanha'}
            </button>
          </div>

          {/* Logs Panel */}
          {(isSending || sendLogs.length > 0) && (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden min-h-[200px] shadow-inner">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Log de Envio</h4>
                {!isSending && sendLogs.length > 0 && (
                  <button onClick={() => setSendLogs([])} className="text-[10px] text-slate-500 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">Limpar</button>
                )}
              </div>
              
              {sendProgress.total > 0 && (
                <div className="mb-3">
                   <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-1">
                    <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                     <span>{Math.round((sendProgress.current / sendProgress.total) * 100)}%</span>
                     <span className="text-emerald-500">OK: {sendProgress.success}</span>
                     <span className="text-red-500">ERR: {sendProgress.failed}</span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-400 custom-scrollbar pr-1">
                {sendLogs.map((log, idx) => (
                    <div key={idx} className={`truncate ${log.includes('✓') ? 'text-emerald-500' : log.includes('⏭️') ? 'text-yellow-600' : 'text-red-400'}`}>
                        {log}
                    </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tag Modal */}
      {isTagModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wide">
                <TagIcon className="w-4 h-4 text-blue-500" /> Gerenciar Tags
              </h3>
              <button onClick={() => setIsTagModalOpen(false)}><X className="w-5 h-5 text-slate-500 hover:text-white" /></button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nome da tag..."
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <button onClick={handleAddTag} disabled={!newTagName} className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded text-xs font-bold transition-colors">
                    Add
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-5 h-5 rounded-full ${color} transition-transform ${newTagColor === color ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-slate-800' : 'opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                {tags.map(tag => (
                  <div key={tag.id} className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50 hover:border-slate-600">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full text-white font-medium ${tag.color}`}>{tag.name}</span>
                      <button onClick={() => handleDeleteTag(tag.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
