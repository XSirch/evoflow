
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CONFIGURATION = 'CONFIGURATION',
  SIMULATOR = 'SIMULATOR',
  CONTACTS = 'CONTACTS',
  SETTINGS = 'SETTINGS'
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  active: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string; // Tailwind color class (e.g., 'bg-red-500')
}

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string; // Full format with DDI
  tags: string[]; // Array of Tag IDs
  permission: 'allowed' | 'denied';
}

export interface StoreConfig {
  storeName: string;
  description: string;
  openingHours: string;
  tone: 'formal' | 'friendly' | 'enthusiastic';
  knowledgeBase: KnowledgeDocument[];
  fallbackMessage: string; // Message sent when handing over to human
}

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  phoneNumber: string; // Destination number for testing
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system'; // Added system for status messages
  content: string;
  timestamp: Date;
}

export interface DashboardStats {
  totalMessages: number;
  activeChats: number;
  aiResponseTime: number;
  humanHandovers: number; // New stat
}
