
import React from 'react';
import { LayoutDashboard, Settings, MessageSquareText, SlidersHorizontal, Store, Users } from 'lucide-react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const navItems = [
    { view: AppView.DASHBOARD, label: 'Painel', icon: LayoutDashboard },
    { view: AppView.CONFIGURATION, label: 'Fluxo & Loja', icon: Store },
    { view: AppView.CONTACTS, label: 'Contatos & Disparos', icon: Users },
    { view: AppView.SIMULATOR, label: 'Simulador', icon: MessageSquareText },
    { view: AppView.SETTINGS, label: 'Integração API', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-10">
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
          <SlidersHorizontal className="text-white w-5 h-5" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">EvoFlow</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => onChangeView(item.view)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-6 border-t border-slate-800">
        <div className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <div className="text-xs text-slate-400">
            <p className="font-semibold text-slate-200">Sistema Online</p>
            <p>v1.2.0 Stable</p>
          </div>
        </div>
      </div>
    </div>
  );
};
