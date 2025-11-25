import { StoreConfig, EvolutionConfig, Contact, Tag } from '../types';

// Em produção, usa URL relativa (mesmo domínio/porta do backend)
// Em desenvolvimento, usa localhost:4000
const API_BASE_URL = import.meta.env.VITE_API_BASE ||
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:4000/api');

// Token management
export function getToken(): string | null {
  return localStorage.getItem('authToken');
}

export function setToken(token: string): void {
  localStorage.setItem('authToken', token);
}

export function clearToken(): void {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
}

export function getUser(): { id: string; name: string; email: string } | null {
  const saved = localStorage.getItem('authUser');
  return saved ? JSON.parse(saved) : null;
}

export function setUser(user: { id: string; name: string; email: string }): void {
  localStorage.setItem('authUser', JSON.stringify(user));
}

// Generic fetch wrapper with auth
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token expired or invalid
    clearToken();
    throw new Error('Unauthorized - please login again');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth API
export async function register(name: string, email: string, password: string): Promise<{ user: any; token: string }> {
  const result = await apiFetch<{ user: any; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  setToken(result.token);
  setUser(result.user);
  return result;
}

export async function login(email: string, password: string): Promise<{ user: any; token: string }> {
  const result = await apiFetch<{ user: any; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  setUser(result.user);
  return result;
}

export async function getMe(): Promise<{ user: any }> {
  return apiFetch<{ user: any }>('/auth/me');
}

// Store Config API
export async function getStoreConfig(): Promise<StoreConfig> {
  return apiFetch<StoreConfig>('/store-config');
}

export async function saveStoreConfig(config: StoreConfig): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/store-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function uploadPDF(file: File): Promise<{
  success: boolean;
  documentId: string;
  title: string;
  contentLength: number;
  extractionMethod: 'text' | 'ocr';
  message: string;
}> {
  const token = getToken();
  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch(`${API_BASE_URL}/store-config/knowledge/upload-pdf`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao fazer upload' }));
    throw new Error(errorData.error || 'Falha ao fazer upload do PDF');
  }

  return response.json();
}

export async function uploadMenuPDF(file: File): Promise<{
  success: boolean;
  filename: string;
  url: string;
  message: string;
}> {
  const token = getToken();
  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch(`${API_BASE_URL}/store-config/menu-pdf`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao fazer upload' }));
    throw new Error(errorData.error || 'Falha ao fazer upload do PDF do cardápio');
  }

  return response.json();
}

export async function deleteMenuPDF(): Promise<{
  success: boolean;
  message: string;
}> {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}/store-config/menu-pdf`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao remover' }));
    throw new Error(errorData.error || 'Falha ao remover PDF do cardápio');
  }

  return response.json();
}

// RAG Embeddings Management
export async function regenerateEmbeddings(): Promise<{
  success: boolean;
  message: string;
  totalDocuments: number;
  successfulDocuments: number;
  totalChunks: number;
  results: Array<{
    documentId: string;
    title: string;
    chunks: number;
    success: boolean;
    error?: string;
  }>;
}> {
  const token = getToken();
  if (!token) throw new Error('Não autenticado');

  const response = await fetch(`${API_BASE_URL}/store-config/knowledge/regenerate-embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao regenerar embeddings' }));
    throw new Error(errorData.error || 'Erro ao regenerar embeddings');
  }

  return response.json();
}

export async function getEmbeddingsStatus(): Promise<{
  totalDocuments: number;
  activeDocuments: number;
  documentsWithEmbeddings: number;
  totalChunks: number;
  documentsWithoutEmbeddings: Array<{
    id: string;
    title: string;
    active: boolean;
  }>;
}> {
  const token = getToken();
  if (!token) throw new Error('Não autenticado');

  const response = await fetch(`${API_BASE_URL}/store-config/knowledge/embeddings-status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao verificar status' }));
    throw new Error(errorData.error || 'Erro ao verificar status dos embeddings');
  }

  return response.json();
}

// Evolution Config API
export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  return apiFetch<EvolutionConfig>('/evolution-config');
}

export async function saveEvolutionConfig(config: EvolutionConfig): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/evolution-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// Contacts & Tags API
export async function getContactsAndTags(): Promise<{ contacts: Contact[]; tags: Tag[] }> {
  return apiFetch<{ contacts: Contact[]; tags: Tag[] }>('/contacts');
}

export async function saveContact(contact: Contact): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/contacts', {
    method: 'POST',
    body: JSON.stringify(contact),
  });
}

export async function deleteContact(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/contacts/${id}`, {
    method: 'DELETE',
  });
}

export async function updateContactPermission(id: string, permission: 'allowed' | 'denied'): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/contacts/${id}/permission`, {
    method: 'PATCH',
    body: JSON.stringify({ permission }),
  });
}

export async function saveTag(tag: Tag): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/tags', {
    method: 'POST',
    body: JSON.stringify(tag),
  });
}

export async function deleteTag(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/tags/${id}`, {
    method: 'DELETE',
  });
}

// Dashboard API
export async function getDashboardStats(): Promise<{
  totalMessages: number;
  activeChats: number;
  aiResponseTime: number;
  humanHandovers: number;
}> {
  return apiFetch('/dashboard/stats');
}

export async function getDashboardConversations(status?: string): Promise<{
  conversations: Array<{
    id: string;
    customerName: string;
    phoneNumber: string;
    status: string;
    lastMessage: string;
    lastMessageSender: 'user' | 'bot';
    lastMessageAt: string;
  }>;
}> {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return apiFetch(`/dashboard/conversations${query}`);
}

export async function getConversationMessages(conversationId: string): Promise<{
  messages: Array<{
    id: string;
    sender: 'user' | 'bot' | 'system';
    content: string;
    timestamp: string;
  }>;
}> {
  return apiFetch(`/dashboard/conversations/${conversationId}/messages`);
}

export async function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  return apiFetch(`/dashboard/conversations/${conversationId}`, {
    method: 'DELETE'
  });
}
