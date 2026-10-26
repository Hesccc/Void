import React, { useState, useEffect } from 'react';
import type { Task, ScanResult } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  ListOrdered,
  RefreshCw,
  Pause,
  Play,
  Square,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive
} from 'lucide-react';

export const Tasks: React.FC = () => {
  const { success, error } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Results modal
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [taskFiles, setTaskFiles] = useState<ScanResult[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await api.getTasks();
      setTasks(res.tasks || []);
    } catch (err: any) {
      error(err.message || '获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = async (id: number) => {
    try {
      await api.pauseTask(id);
      success('任务已暂停');
      fetchTasks();
    } catch (err: any) {
      error(err.message || '暂停任务失败');
    }
  };

  const handleResume = async (id: number) => {
    try {
      await api.resumeTask(id);
      success('任务已恢复运行');
      fetchTasks();
    } catch (err: any) {
      error(err.message || '恢复任务失败');
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('确定要终止该任务吗？')) return;
    try {
      await api.cancelTask(id);
      success('任务已被终止');
      fetchTasks();
    } catch (err: any) {
      error(err.message || '终止任务失败');
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!window.confirm(`确定要删除任务 #${id} 及其关联的历史记录吗？`)) return;
    try {
      await api.deleteTask(id);
      success(`任务 #${id} 已删除`);
      fetchTasks();
    } catch (err: any) {
      error(err.message || '删除任务失败');
    }
  };

  const openTaskResults = async (task: Task) => {
    setCurrentTask(task);
    setResultsModalOpen(true);
    setLoadingFiles(true);
    try {
      const res = await api.getTaskResults(task.id);
      setTaskFiles(res.files || []);
    } catch (err: any) {
      error(err.message || '获取扫描结果失败');
    } finally {
      setLoadingFiles(false);
    }
  };

  const formatSize = (mb: number) => {
    if (!mb || mb <= 0) return '0 MB';
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            运行中
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            已暂停
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            已完成
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            执行异常
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            已终止
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>任务管理中心</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-zinc-800 text-zinc-300">
              共 {tasks.length} 条记录
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            查看历史巡检任务、各次扫描冗余统计与生命周期控制
          </p>
        </div>

        <button
          onClick={fetchTasks}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {/* Task List / Table */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
        {tasks.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 text-zinc-400 flex items-center justify-center mb-1">
              <ListOrdered className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200">暂无任务记录</h3>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-sm">
              点击顶部的“立即扫描”或等待后台定时计划触发，生成首次磁盘巡检。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/50 text-zinc-400 text-xs font-medium">
                  <th className="py-3 px-4 w-20">任务 ID</th>
                  <th className="py-3 px-4 w-28">状态</th>
                  <th className="py-3 px-4 w-32">模式 / 触发方式</th>
                  <th className="py-3 px-4">进度与描述</th>
                  <th className="py-3 px-4 w-40">统计数据</th>
                  <th className="py-3 px-4 w-44">时间</th>
                  <th className="py-3 px-4 w-28 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {tasks.map((task) => {
                  const isActive = ['pending', 'running', 'paused'].includes(task.status);

                  return (
                    <tr key={task.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-zinc-200">
                        #{task.id}
                      </td>

                      <td className="py-3.5 px-4">{getStatusBadge(task.status)}</td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-zinc-200">
                          {task.mode === 'global' ? '全局聚合' : '普通模式'}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {task.trigger_type === 'cron' ? '定时调度' : '手动触发'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-xs text-zinc-300 truncate max-w-xs xl:max-w-md">
                          {task.progress_msg || (task.status === 'completed' ? '扫描完成' : '--')}
                        </div>
                        {isActive && (
                          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden mt-1.5">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(task.progress * 100, 5)}%` }}
                            />
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono text-zinc-300">
                        <div>扫描: {task.total_files_scanned || 0} 个</div>
                        <div className="text-amber-400 font-semibold mt-0.5">
                          冗余: {task.total_unseeded_found || 0} 个
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-zinc-400">
                        <div className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>{task.completed_at || task.started_at || task.created_at}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Active controls */}
                          {task.status === 'running' && (
                            <button
                              onClick={() => handlePause(task.id)}
                              className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-950/30 transition-colors"
                              title="暂停任务"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}

                          {task.status === 'paused' && (
                            <button
                              onClick={() => handleResume(task.id)}
                              className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-950/30 transition-colors"
                              title="恢复任务"
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          )}

                          {isActive && (
                            <button
                              onClick={() => handleCancel(task.id)}
                              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/30 transition-colors"
                              title="终止任务"
                            >
                              <Square className="w-4 h-4 fill-current" />
                            </button>
                          )}

                          {/* Completed/Historical Actions */}
                          {!isActive && (
                            <>
                              <button
                                onClick={() => openTaskResults(task)}
                                className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-950/30 transition-colors"
                                title="查看本次扫描结果"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                                title="删除任务记录"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Results Detail Modal */}
      <Modal
        isOpen={resultsModalOpen}
        onClose={() => setResultsModalOpen(false)}
        maxWidth="max-w-2xl"
        title={
          <div className="flex items-center gap-2 text-indigo-400">
            <HardDrive className="w-5 h-5" />
            <span>任务 #{currentTask?.id} 扫描结果明细</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span>模式: {currentTask?.mode === 'global' ? '全局聚合模式' : '普通分立模式'}</span>
            <span>触发: {currentTask?.trigger_type === 'cron' ? '定时调度' : '手动'}</span>
            <span>
              冗余文件: <strong className="text-white">{taskFiles.length}</strong> 个
            </span>
          </div>

          {loadingFiles ? (
            <div className="py-12 flex justify-center text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : taskFiles.length === 0 ? (
            <p className="text-center py-8 text-xs text-zinc-500">该任务未发现任何冗余未做种文件。</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {taskFiles.map((f, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 truncate font-mono">{f.file_path}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">来自: {f.service_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-medium text-zinc-200">{formatSize(f.file_size_mb)}</p>
                    <p className="text-[10px] text-zinc-500">{f.deleted ? '已清理' : '待处理'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-zinc-800">
            <button
              onClick={() => setResultsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
