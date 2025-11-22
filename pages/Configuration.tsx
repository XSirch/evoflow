
import React, { useState } from 'react';
import { Save, Store, BookOpen, Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { StoreConfig, KnowledgeDocument } from '../types';
import { v4 as uuidv4 } from 'uuid'; // Assuming simple ID generation logic or replace with Math.random

interface ConfigurationProps {
  config: StoreConfig;
  onSave: (newConfig: StoreConfig) => void;
}

export const Configuration: React.FC<ConfigurationProps> = ({ config, onSave }) => {
  const [formState, setFormState] = useState<StoreConfig>(config);
  const [saved, setSaved] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleChange = (field: keyof StoreConfig, value: string | any) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formState);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Document Management
  const handleAddDoc = () => {
    setEditingDoc({
      id: Date.now().toString(),
      title: '',
      content: '',
      active: true
    });
    setIsEditModalOpen(true);
  };

  const handleEditDoc = (doc: KnowledgeDocument) => {
    setEditingDoc({ ...doc });
    setIsEditModalOpen(true);
  };

  const handleDeleteDoc = (id: string) => {
    const newDocs = formState.knowledgeBase.filter(d => d.id !== id);
    handleChange('knowledgeBase', newDocs);
  };

  const saveDoc = () => {
    if (!editingDoc) return;
    
    let newDocs = [...formState.knowledgeBase];
    const index = newDocs.findIndex(d => d.id === editingDoc.id);
    
    if (index >= 0) {
      newDocs[index] = editingDoc;
    } else {
      newDocs.push(editingDoc);
    }
    
    handleChange('knowledgeBase', newDocs);
    setIsEditModalOpen(false);
    setEditingDoc(null);
  };

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto custom-scrollbar">
      <header className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Configuração do Bot</h1>
          <p className="text-slate-400">Defina a personalidade e o conhecimento (RAG) da loja.</p>
        </div>
        {saved && (
          <span className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in border border-emerald-500/20">
            Alterações salvas!
          </span>
        )}
      </header>

      <form onSubmit={handleSubmit} className="space-y-8 pb-12">
        
        {/* Basic Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 h-fit">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-500" />
              Identidade da Loja
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nome da Loja</label>
                <input
                  type="text"
                  value={formState.storeName}
                  onChange={(e) => handleChange('storeName', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Descrição Curta</label>
                <textarea
                  value={formState.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Horário de Atendimento</label>
                <input
                  type="text"
                  value={formState.openingHours}
                  onChange={(e) => handleChange('openingHours', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tom de Voz</label>
                <select
                  value={formState.tone}
                  onChange={(e) => handleChange('tone', e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="formal">Formal & Profissional</option>
                  <option value="friendly">Amigável & Prestativo</option>
                  <option value="enthusiastic">Entusiástico & Energético</option>
                </select>
              </div>
            </div>
          </div>

           {/* Fallback & Behavior */}
           <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 h-fit">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Transbordo Humano
            </h3>
            <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-200/80">
                Quando o bot não souber responder ou o cliente pedir um humano, ele irá parar de responder automaticamente e sinalizará no painel.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Mensagem de Transbordo</label>
              <textarea
                value={formState.fallbackMessage}
                onChange={(e) => handleChange('fallbackMessage', e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none resize-none"
                placeholder="Ex: Entendi. Vou chamar um de nossos atendentes para te ajudar agora mesmo."
              />
            </div>
          </div>
        </div>

        {/* Knowledge Base (RAG) */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-500" />
              Base de Conhecimento (RAG)
            </h3>
            <button
              type="button"
              onClick={handleAddDoc}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Documento
            </button>
          </div>

          {formState.knowledgeBase.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl">
              <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhum documento de conhecimento cadastrado.</p>
              <p className="text-sm text-slate-500">Adicione cardápios, políticas ou FAQs para treinar seu bot.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {formState.knowledgeBase.map((doc) => (
                <div key={doc.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 hover:border-blue-500/50 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-white truncate pr-4">{doc.title}</h4>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => handleEditDoc(doc)} className="text-slate-400 hover:text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDeleteDoc(doc.id)} className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-3 mb-3 min-h-[3rem]">
                    {doc.content}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${doc.active ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                    <span className="text-slate-500">{doc.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            type="submit"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-900/20"
          >
            <Save className="w-5 h-5" />
            Salvar Configurações
          </button>
        </div>
      </form>

      {/* Edit Modal */}
      {isEditModalOpen && editingDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl border border-slate-700 shadow-2xl">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Editor de Documento</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Título do Documento</label>
                <input
                  type="text"
                  value={editingDoc.title}
                  onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                  placeholder="Ex: Cardápio de Bebidas"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Conteúdo (Texto)</label>
                <textarea
                  value={editingDoc.content}
                  onChange={(e) => setEditingDoc({ ...editingDoc, content: e.target.value })}
                  rows={10}
                  placeholder="Cole aqui o texto que o bot deve aprender..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="docActive"
                  checked={editingDoc.active}
                  onChange={(e) => setEditingDoc({ ...editingDoc, active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="docActive" className="text-sm text-slate-300 cursor-pointer">Documento Ativo (visível para o bot)</label>
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveDoc}
                disabled={!editingDoc.title || !editingDoc.content}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar Documento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
