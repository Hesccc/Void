import React, { useEffect, useState } from 'react';
import type { DashboardSummary, Task } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import {
  HardDrive,
  CheckCircle,
  Clock,
  Activity,
  Play,
  Pause,
  Square,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (tab: 'dashboard' | 'files' | 'tasks' | 'settings' | 'logs') => void;
  onOpenScanModal: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenScanModal }) => {
  const { success, error } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await api.getSummary();
      setSummary(data);
      setActiveTask(data.active_task || null);
    } catch (err: any) {
      if (isManual) error(err.message || '获取数据失败');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    // 活跃任务轮询（每 2.5 秒刷新一次）
    const interval = setInterval(() => {
      fetchSummary();
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const handlePause = async (id: number) => {
    try {
      await api.pauseTask(id);
      success('任务已暂停');
      fetchSummary();
    } catch (err: any) {
      error(err.message || '暂停任务失败');
    }
  };

  const handleResume = async (id: number) => {
    try {
      await api.resumeTask(id);
      success('任务已恢复运行');
      fetchSummary();
    } catch (err: any) {
      error(err.message || '恢复任务失败');
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('确定要终止当前扫描任务吗？')) return;
    try {
      await api.cancelTask(id);
      success('任务已被终止');
      fetchSummary();
    } catch (err: any) {
      error(err.message || '终止任务失败');
    }
  };

  const formatSize = (mb: number) => {
    if (!mb || mb <= 0) return '0 MB';
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">正在加载仪表盘概览...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">控制中心</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            实时监控 PT/BT 冗余占用状态与后台巡检动态
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSummary(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>刷新数据</span>
          </button>
          <button
            onClick={onOpenScanModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>开始新扫描</span>
          </button>
        </div>
      </div>

      {/* Live Active Task Card (If any) */}
      {activeTask && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-zinc-900/90 to-zinc-900/90 p-5 shadow-2xl shadow-indigo-950/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">
                    任务 #{activeTask.id} 正在执行中
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {activeTask.mode === 'global' ? '全局聚合模式' : '普通分立模式'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-800 text-zinc-300">
                    {activeTask.trigger_type === 'cron' ? '定时调度' : '手动触发'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {activeTask.progress_msg || '正在比对做种目录与本地磁盘清单...'}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {activeTask.status === 'running' ? (
                <button
                  onClick={() => handlePause(activeTask.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>暂停</span>
                </button>
              ) : activeTask.status === 'paused' ? (
                <button
                  onClick={() => handleResume(activeTask.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>继续</span>
                </button>
              ) : null}

              <button
                onClick={() => handleCancel(activeTask.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>终止</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>进度: {(activeTask.progress * 100).toFixed(0)}%</span>
              <span>
                已扫描 {activeTask.total_files_scanned || 0} 个文件 · 发现冗余 {activeTask.total_unseeded_found || 0}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(activeTask.progress * 100, 3)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 待清理冗余文件 */}
        <div
          onClick={() => onNavigate('files')}
          className="group cursor-pointer bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 transition-all shadow-lg hover:shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">待清理冗余文件</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{summary?.unseeded_count ?? 0}</span>
              <span className="text-xs font-normal text-zinc-400">个未做种文件</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <span>占用空间: {formatSize(summary?.unseeded_size_mb || 0)}</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Card 2: 历史已清理 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">历史已清理释放</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{summary?.cleaned_count ?? 0}</span>
              <span className="text-xs font-normal text-zinc-400">个文件</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">已物理删除或移入回收站</p>
          </div>
        </div>

        {/* Card 3: 扫描巡检任务 */}
        <div
          onClick={() => onNavigate('tasks')}
          className="group cursor-pointer bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 transition-all shadow-lg hover:shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">任务执行记录</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{summary?.total_tasks ?? 0}</span>
              <span className="text-xs font-normal text-zinc-400">次巡检</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
              <span>查看任务历史</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Card 4: 上次巡检时间 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">最近巡检时间</span>
            <div className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-semibold text-white tracking-tight truncate">
              {summary?.last_scan && summary.last_scan !== '--' ? summary.last_scan : '尚未执行扫描'}
            </div>
            <p className="mt-1 text-xs text-zinc-500">按计划周期定时自动巡检</p>
          </div>
        </div>
      </div>

      {/* Quick Action & Info Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Actions */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-400" />
            <span>快捷维护操作</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => onNavigate('files')}
              className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-950/90 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-zinc-200 group-hover:text-white">
                  审查冗余文件
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                查看当前扫描出的未做种孤儿文件，支持搜索筛选、批量删除或单独剔除。
              </p>
            </div>

            <div
              onClick={onOpenScanModal}
              className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-950/90 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-zinc-200 group-hover:text-white">
                  执行立即扫描
                </span>
                <Play className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400" />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                立即连接 qBittorrent/Transmission 检索全部做种名单并与磁盘进行快速比对。
              </p>
            </div>

            <div
              onClick={() => onNavigate('settings')}
              className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-950/90 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-zinc-200 group-hover:text-white">
                  调整清理规则
                </span>
                <ShieldCheck className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400" />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                切换一键安全档位（保守/安全/彻底），设置大小阈值（如 &gt;50MB）与回收站保护。
              </p>
            </div>

            <div
              onClick={() => onNavigate('logs')}
              className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-950/90 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-zinc-200 group-hover:text-white">
                  查看运行日志
                </span>
                <Activity className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400" />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                实时流式查看系统控制台日志，即时掌握扫描步骤、错误与通知推送详情。
              </p>
            </div>
          </div>
        </div>

        {/* Right: Security & Workflow Guide */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              <span>清理机制与安全保障</span>
            </h3>
            <ul className="space-y-3 text-xs text-zinc-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>
                  <strong>双重校验</strong>：每次扫描前都会向客户端拉取最新的在种哈希和文件列表，绝不删除处于做种状态的文件。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>
                  <strong>小文件保护</strong>：建议开启文件大小过滤（如 &gt;50MB），可自动保护种子元数据、.nfo 海报和外挂字幕。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>
                  <strong>回收站缓冲</strong>：开启后，删除的文件将被安全挪动到指定临时目录，而非直接不可逆抹除。
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
            <span>系统状态: 正常运行中</span>
            <button
              onClick={() => onNavigate('settings')}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              配置管理 &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
