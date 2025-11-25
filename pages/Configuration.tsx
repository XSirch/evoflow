
import React, { useState, useEffect, useRef } from 'react';
import { Save, Store, BookOpen, Plus, Trash2, Edit2, AlertCircle, Loader2, Upload, RefreshCw, Database, X } from 'lucide-react';
import { StoreConfig, KnowledgeDocument } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { saveStoreConfig, uploadPDF, uploadMenuPDF, deleteMenuPDF, regenerateEmbeddings, getEmbeddingsStatus } from '../services/api';

interface ConfigurationProps {
  config: StoreConfig;
  onSave: (newConfig: StoreConfig) => void;
}

export const Configuration: React.FC<ConfigurationProps> = ({ config, onSave }) => {
  const [formState, setFormState] = useState<StoreConfig>(config);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMenuPdf, setUploadingMenuPdf] = useState(false);
  const [menuPdfMessage, setMenuPdfMessage] = useState('');
  const menuFileInputRef = useRef<HTMLInputElement>(null);
  const [regeneratingEmbeddings, setRegeneratingEmbeddings] = useState(false);
  const [embeddingsMessage, setEmbeddingsMessage] = useState('');
  const [embeddingsStatus, setEmbeddingsStatus] = useState<any>(null);
  const [showEmbeddingsStatus, setShowEmbeddingsStatus] = useState(false);

  // Update form state when config prop changes
  useEffect(() => {
    setFormState(config);
  }, [config]);

  const handleChange = (field: keyof StoreConfig, value: string | any) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await saveStoreConfig(formState);
      onSave(formState); // Update parent state
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
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

  // PDF Upload Handler (Base de Conhecimento)
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tamanho
    if (file.size > 10 * 1024 * 1024) {
      setUploadMessage('❌ Arquivo muito grande! Máximo: 10MB');
      setTimeout(() => setUploadMessage(''), 5000);
      return;
    }

    // Validar tipo
    if (file.type !== 'application/pdf') {
      setUploadMessage('❌ Apenas arquivos PDF são permitidos');
      setTimeout(() => setUploadMessage(''), 5000);
      return;
    }

    setUploadingPdf(true);
    setUploadMessage('');

    try {
      const result = await uploadPDF(file);

      // Adicionar indicação do método de extração
      const methodText = result.extractionMethod === 'ocr'
        ? ' (texto extraído via OCR)'
        : '';
      setUploadMessage(`✅ ${result.message}${methodText}`);

      // Recarregar configuração para pegar o novo documento
      // Forçar reload da página para atualizar a lista
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      setUploadMessage(`❌ ${error.message || 'Erro ao fazer upload do PDF'}`);
    } finally {
      setUploadingPdf(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Limpar mensagem após 5 segundos
      setTimeout(() => setUploadMessage(''), 5000);
    }
  };

  // Menu PDF Upload Handler
  const handleMenuPdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tamanho
    if (file.size > 10 * 1024 * 1024) {
      setMenuPdfMessage('❌ Arquivo muito grande! Máximo: 10MB');
      setTimeout(() => setMenuPdfMessage(''), 5000);
      return;
    }

    // Validar tipo
    if (file.type !== 'application/pdf') {
      setMenuPdfMessage('❌ Apenas arquivos PDF são permitidos');
      setTimeout(() => setMenuPdfMessage(''), 5000);
      return;
    }

    setUploadingMenuPdf(true);
    setMenuPdfMessage('');

    try {
      const result = await uploadMenuPDF(file);
      setMenuPdfMessage(`✅ ${result.message}`);

      // Atualizar formState com a nova URL
      handleChange('menuPdfUrl', result.url);

      // Limpar mensagem após 3 segundos
      setTimeout(() => setMenuPdfMessage(''), 3000);
    } catch (error: any) {
      setMenuPdfMessage(`❌ ${error.message || 'Erro ao fazer upload do PDF'}`);
      setTimeout(() => setMenuPdfMessage(''), 5000);
    } finally {
      setUploadingMenuPdf(false);
      // Reset input
      if (menuFileInputRef.current) {
        menuFileInputRef.current.value = '';
      }
    }
  };

  // Menu PDF Delete Handler
  const handleMenuPdfDelete = async () => {
    if (!confirm('Tem certeza que deseja remover o PDF do cardápio?')) {
      return;
    }

    setUploadingMenuPdf(true);
    setMenuPdfMessage('');

    try {
      await deleteMenuPDF();
      setMenuPdfMessage('✅ PDF removido com sucesso!');

      // Limpar formState
      handleChange('menuPdfUrl', '');

      // Limpar mensagem após 3 segundos
      setTimeout(() => setMenuPdfMessage(''), 3000);
    } catch (error: any) {
      setMenuPdfMessage(`❌ ${error.message || 'Erro ao remover PDF'}`);
      setTimeout(() => setMenuPdfMessage(''), 5000);
    } finally {
      setUploadingMenuPdf(false);
    }
  };

  const handleRegenerateEmbeddings = async () => {
    if (!confirm('Deseja regenerar os embeddings de todos os documentos? Isso pode levar alguns minutos.')) {
      return;
    }

    setRegeneratingEmbeddings(true);
    setEmbeddingsMessage('');

    try {
      const result = await regenerateEmbeddings();
      setEmbeddingsMessage(`✅ ${result.message} (${result.totalChunks} chunks gerados)`);

      // Atualizar status
      await loadEmbeddingsStatus();
    } catch (error: any) {
      setEmbeddingsMessage(`❌ ${error.message || 'Erro ao regenerar embeddings'}`);
    } finally {
      setRegeneratingEmbeddings(false);
      setTimeout(() => setEmbeddingsMessage(''), 10000);
    }
  };

  const loadEmbeddingsStatus = async () => {
    try {
      const status = await getEmbeddingsStatus();
      setEmbeddingsStatus(status);
    } catch (error: any) {
      console.error('Erro ao carregar status dos embeddings:', error);
    }
  };

  const toggleEmbeddingsStatus = async () => {
    if (!showEmbeddingsStatus) {
      await loadEmbeddingsStatus();
    }
    setShowEmbeddingsStatus(!showEmbeddingsStatus);
  };

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto custom-scrollbar">
      <header className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Configuração do Bot</h1>
          <p className="text-slate-400">Defina a personalidade e o conhecimento (RAG) da loja.</p>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg text-sm font-medium border border-red-500/20">
              {error}
            </span>
          )}
          {saved && (
            <span className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in border border-emerald-500/20">
              Alterações salvas!
            </span>
          )}
        </div>
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
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Instagram</label>
                <input
                  type="text"
                  value={formState.instagram || ''}
                  onChange={(e) => handleChange('instagram', e.target.value)}
                  placeholder="@sualojaaqui"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Usado nas mensagens de encerramento</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Cardápio (PDF)</label>
                {formState.menuPdfUrl ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-emerald-400 text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      PDF do cardápio carregado
                    </div>
                    <button
                      type="button"
                      onClick={handleMenuPdfDelete}
                      disabled={uploadingMenuPdf}
                      className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Remover
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white px-4 py-3 rounded-lg transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {uploadingMenuPdf ? 'Enviando...' : 'Fazer Upload do PDF'}
                    <input
                      ref={menuFileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleMenuPdfUpload}
                      disabled={uploadingMenuPdf}
                      className="hidden"
                    />
                  </label>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {menuPdfMessage || 'O bot enviará este PDF quando o cliente pedir o cardápio'}
                </p>
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddDoc}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar Documento
              </button>

              <label className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                {uploadingPdf ? 'Processando...' : 'Upload PDF'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  disabled={uploadingPdf}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleRegenerateEmbeddings}
                disabled={regeneratingEmbeddings}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                title="Regenerar embeddings para busca semântica (RAG)"
              >
                {regeneratingEmbeddings ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Regenerar RAG
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleEmbeddingsStatus}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                title="Ver status dos embeddings"
              >
                <Database className="w-4 h-4" />
                Status RAG
              </button>
            </div>
          </div>

          {/* Upload Message */}
          {uploadMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              uploadMessage.startsWith('✅')
                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {uploadMessage}
            </div>
          )}

          {/* Embeddings Message */}
          {embeddingsMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              embeddingsMessage.startsWith('✅')
                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {embeddingsMessage}
            </div>
          )}

          {/* Embeddings Status */}
          {showEmbeddingsStatus && embeddingsStatus && (
            <div className="mb-4 p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
              <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Status dos Embeddings (RAG)
              </h4>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="bg-slate-800 p-3 rounded-lg">
                  <p className="text-slate-400 text-sm">Total de Documentos</p>
                  <p className="text-white text-2xl font-bold">{embeddingsStatus.totalDocuments}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded-lg">
                  <p className="text-slate-400 text-sm">Documentos Ativos</p>
                  <p className="text-white text-2xl font-bold">{embeddingsStatus.activeDocuments}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded-lg">
                  <p className="text-slate-400 text-sm">Com Embeddings</p>
                  <p className="text-green-500 text-2xl font-bold">{embeddingsStatus.documentsWithEmbeddings}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded-lg">
                  <p className="text-slate-400 text-sm">Total de Chunks</p>
                  <p className="text-blue-500 text-2xl font-bold">{embeddingsStatus.totalChunks}</p>
                </div>
              </div>
              {embeddingsStatus.documentsWithoutEmbeddings.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-yellow-500 text-sm font-medium mb-2">
                    ⚠️ {embeddingsStatus.documentsWithoutEmbeddings.length} documento(s) sem embeddings:
                  </p>
                  <ul className="text-slate-400 text-sm space-y-1">
                    {embeddingsStatus.documentsWithoutEmbeddings.map((doc: any) => (
                      <li key={doc.id}>• {doc.title} {doc.active ? '(ativo)' : '(inativo)'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {uploadingPdf && (
            <div className="mb-4 flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="text-blue-500 font-medium">Processando PDF...</p>
                <p className="text-sm text-slate-400">
                  Extraindo texto e salvando na base de conhecimento.
                  Se o PDF for escaneado, o OCR será aplicado automaticamente (pode levar alguns segundos).
                </p>
              </div>
            </div>
          )}

          {/* Regenerating Embeddings Indicator */}
          {regeneratingEmbeddings && (
            <div className="mb-4 flex items-center gap-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              <div>
                <p className="text-purple-500 font-medium">Regenerando Embeddings...</p>
                <p className="text-sm text-slate-400">
                  Processando todos os documentos ativos e gerando embeddings para busca semântica.
                  Isso pode levar alguns minutos dependendo do tamanho da base de conhecimento.
                </p>
              </div>
            </div>
          )}

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
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-8 py-3 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-900/20"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Configurações
              </>
            )}
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
