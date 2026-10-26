import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './components/Toast';
import { Navbar } from './components/Navbar';
import type { TabType } from './components/Navbar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Files } from './pages/Files';
import { Tasks } from './pages/Tasks';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { Modal } from './components/Modal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { api } from './api';
import { Play, AlertTriangle, Zap, RefreshCw } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'normal' | 'global'>('global');
  const [startingScan, setStartingScan] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [unseededCount, setUnseededCount] = useState<number>(0);

  // Poll for active task state & unseeded count
  const checkStatus = async () => {
    try {
      const summary = await api.getSummary();
      setIsTaskRunning(Boolean(summary.active_task));
      setUnseededCount(summary.unseeded_count || 0);
    } catch {}
  };

  useEffect(() => {
    if (user) {
      checkStatus();
      const interval = setInterval(checkStatus, 3500);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleStartScan = async (force: boolean = false) => {
    setStartingScan(true);
    try {
      const res = await api.createTask(scanMode, force);
      if (res.warning_pending && !force) {
        if (window.confirm(res.message || '当前已有正在执行的扫描任务，是否仍要强制启动新任务？')) {
          await handleStartScan(true);
        }
        return;
      }
      success(`扫描任务 #${res.task_id} 已成功启动！`);
      setScanModalOpen(false);
      setActiveTab('dashboard');
      checkStatus();
    } catch (err: any) {
      error(err.message || '启动扫描任务失败');
    } finally {
      setStartingScan(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium">正在初始化 Void 控制台...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#090a10] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenScanModal={() => setScanModalOpen(true)}
        onOpenPasswordModal={() => setPasswordModalOpen(true)}
        isTaskRunning={isTaskRunning}
        unseededCount={unseededCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenScanModal={() => setScanModalOpen(true)}
          />
        )}
        {activeTab === 'files' && <Files />}
        {activeTab === 'tasks' && <Tasks />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'logs' && <Logs />}
      </main>

      {/* Forced Password Change Modal for new accounts */}
      {user.must_change_password && (
        <ChangePasswordModal
          isOpen={true}
          onClose={() => {}}
          forced={true}
        />
      )}

      {/* Normal Password Change Modal */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        forced={false}
      />

      {/* Trigger Scan Modal */}
      <Modal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2 text-indigo-400">
            <Play className="w-5 h-5 fill-current" />
            <span>立即触发磁盘扫描</span>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            选择扫描模式并启动后台比对线程。扫描过程不会阻塞系统，可随时在控制中心查看实时进度。
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-400">选择扫描模式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScanMode('global')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  scanMode === 'global'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-400 mb-0.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>全局聚合模式</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  跨所有客户端聚合做种清单，避免误删辅种
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScanMode('normal')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  scanMode === 'normal'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-zinc-300 mb-0.5">
                  <span>普通分立模式</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  各客户端独立扫描其下载目录
                </p>
              </button>
            </div>
          </div>

          {isTaskRunning && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>当前已有正在执行的扫描任务，再次提交将强制创建并排队。</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setScanModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleStartScan(false)}
              disabled={startingScan}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{startingScan ? '启动中...' : '开始扫描'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainLayout />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
