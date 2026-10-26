import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  HardDrive,
  ListOrdered,
  Settings,
  Terminal,
  Play,
  LogOut,
  KeyRound,
  User,
  Radio,
  ChevronDown
} from 'lucide-react';

export type TabType = 'dashboard' | 'files' | 'tasks' | 'settings' | 'logs';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onOpenScanModal: () => void;
  onOpenPasswordModal: () => void;
  isTaskRunning: boolean;
  unseededCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenScanModal,
  onOpenPasswordModal,
  isTaskRunning,
  unseededCount = 0,
}) => {
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard' as TabType, label: '控制中心', icon: LayoutDashboard },
    { id: 'files' as TabType, label: '冗余文件', icon: HardDrive, badge: unseededCount > 0 ? unseededCount : undefined },
    { id: 'tasks' as TabType, label: '任务中心', icon: ListOrdered },
    { id: 'settings' as TabType, label: '配置中心', icon: Settings },
    { id: 'logs' as TabType, label: '实时日志', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 p-0.5 shadow-lg shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-shadow flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <span className="font-black text-transparent bg-clip-text bg-gradient-to-tr from-indigo-400 to-violet-200 text-lg tracking-tighter">
                  V
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-white group-hover:text-indigo-200 transition-colors">
                  Void
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 hidden sm:block -mt-0.5">
                PT/BT 冗余文件清理工具
              </p>
            </div>
          </div>

          {/* Desktop Nav Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all relative ${
                    isActive
                      ? 'bg-zinc-800/90 text-white shadow-inner shadow-zinc-700/30'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Status, Scan Button, User Menu */}
        <div className="flex items-center gap-3">
          {/* Active Task Pulse */}
          {isTaskRunning ? (
            <div
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium cursor-pointer animate-pulse"
              title="点击查看运行中任务"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              <span className="hidden sm:inline">扫描进行中</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>就绪</span>
            </div>
          )}

          {/* Start Scan Button */}
          <button
            onClick={onOpenScanModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden xs:inline">立即扫描</span>
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-medium text-xs">
                {user?.username?.charAt(0).toUpperCase() || <User className="w-3.5 h-3.5" />}
              </div>
              <span className="text-xs font-medium max-w-[80px] truncate hidden sm:block">
                {user?.username || '用户'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 z-20 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-zinc-800 text-zinc-400">
                    <p className="font-semibold text-zinc-200 truncate">{user?.username}</p>
                    <p className="text-[11px] text-zinc-500">管理员账号</p>
                  </div>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenPasswordModal();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                    <span>修改密码</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>退出登录</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav Tabs Bar */}
      <div className="md:hidden flex items-center justify-around px-2 py-2 border-t border-zinc-800/60 bg-zinc-950/95 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors relative ${
                isActive ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-0 right-1 px-1 rounded-full text-[9px] bg-rose-500 text-white font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
