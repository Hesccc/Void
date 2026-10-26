import React, { useState, useEffect, useMemo } from 'react';
import type { ScanResult, Task } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  Search,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  HardDrive,
  Filter,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';

export const Files: React.FC = () => {
  const { success, error, info } = useToast();
  const [files, setFiles] = useState<ScanResult[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('merged');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const [filesRes, tasksRes] = await Promise.all([
        api.getUnseededFiles(selectedTaskId),
        api.getTasks(),
      ]);
      setFiles(filesRes.files || []);
      setTasks(tasksRes.tasks || []);
      setSelectedPaths(new Set());
    } catch (err: any) {
      error(err.message || '获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [selectedTaskId]);

  // Extract unique service names
  const availableServices = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      if (f.service_name) set.add(f.service_name);
    });
    return Array.from(set);
  }, [files]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (serviceFilter !== 'all' && f.service_name !== serviceFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return f.file_path.toLowerCase().includes(q);
      }
      return true;
    });
  }, [files, searchQuery, serviceFilter]);

  const totalFilteredSize = useMemo(() => {
    return filteredFiles
      .filter((f) => !f.deleted)
      .reduce((sum, f) => sum + (f.file_size_mb || 0), 0);
  }, [filteredFiles]);

  const selectedSize = useMemo(() => {
    return files
      .filter((f) => selectedPaths.has(f.file_path))
      .reduce((sum, f) => sum + (f.file_size_mb || 0), 0);
  }, [files, selectedPaths]);

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    info('文件路径已复制到剪贴板');
    setTimeout(() => {
      setCopiedPath(null);
    }, 2000);
  };

  const handleSelectAll = () => {
    const undeleted = filteredFiles.filter((f) => !f.deleted).map((f) => f.file_path);
    if (selectedPaths.size === undeleted.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(undeleted));
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const openDeleteModal = (targetFiles: string[]) => {
    if (targetFiles.length === 0) return;
    setFilesToDelete(targetFiles);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.deleteFiles(filesToDelete);
      success(`成功清理 ${res.deleted.length} 个文件！`);
      setDeleteModalOpen(false);
      setFilesToDelete([]);
      setSelectedPaths(new Set());
      fetchFiles();
    } catch (err: any) {
      error(err.message || '删除文件失败');
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (mb: number) => {
    if (!mb || mb <= 0) return '0 MB';
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>冗余文件管理</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
              共 {files.filter((f) => !f.deleted).length} 个待处理
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            审查并清理未在任何下载客户端中做种的孤儿文件
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>刷新</span>
          </button>

          {selectedPaths.size > 0 && (
            <button
              onClick={() => openDeleteModal(Array.from(selectedPaths))}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                批量清理 ({selectedPaths.size} 个 · {formatSize(selectedSize)})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="按文件名或目录路径搜索..."
            className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* View / Task filter */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[160px]">
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full appearance-none bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 pr-8"
            >
              <option value="merged">合并去重视图 (所有未删)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  任务 #{t.id} ({t.completed_at || t.created_at})
                </option>
              ))}
            </select>
            <Filter className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Service filter */}
          {availableServices.length > 1 && (
            <div className="relative min-w-[130px]">
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full appearance-none bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 pr-8"
              >
                <option value="all">全部客户端</option>
                {availableServices.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm">正在检索未做种文件...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1">
              <HardDrive className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200">未发现任何冗余文件</h3>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-sm">
              本地下载目录非常整洁，所有文件均在下载客户端中正常做种，无需清理。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/50 text-zinc-400 text-xs font-medium">
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedPaths.size > 0 &&
                        selectedPaths.size === filteredFiles.filter((f) => !f.deleted).length
                      }
                      onChange={handleSelectAll}
                      className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">文件名称与路径</th>
                  <th className="py-3 px-4 w-32">客户端/模式</th>
                  <th className="py-3 px-4 w-28 text-right">文件大小</th>
                  <th className="py-3 px-4 w-24 text-center">状态</th>
                  <th className="py-3 px-4 w-20 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredFiles.map((file, idx) => {
                  const isDeleted = Boolean(file.deleted);
                  const isSelected = selectedPaths.has(file.file_path);
                  const fileName = getFileName(file.file_path);

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-zinc-800/30 transition-colors ${
                        isDeleted ? 'opacity-40 line-through' : ''
                      } ${isSelected ? 'bg-indigo-950/20' : ''}`}
                    >
                      <td className="py-3 px-4 text-center">
                        {!isDeleted && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(file.file_path)}
                            className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-md xl:max-w-xl">
                        <div className="font-medium text-zinc-100 truncate flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span title={fileName}>{fileName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 truncate font-mono">
                          <span title={file.file_path} className="truncate">
                            {file.file_path}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(file.file_path)}
                            className="text-zinc-500 hover:text-zinc-300 shrink-0 p-0.5"
                            title="复制路径"
                          >
                            {copiedPath === file.file_path ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                          {file.service_name || '默认'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {formatSize(file.file_size_mb)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isDeleted ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-zinc-800 text-zinc-500">
                            已删除
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            未做种
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {!isDeleted && (
                          <button
                            onClick={() => openDeleteModal([file.file_path])}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                            title="清理该文件"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info bar */}
        {!loading && filteredFiles.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800/80 bg-zinc-950/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              当前过滤显示 {filteredFiles.length} 项 (共计 {formatSize(totalFilteredSize)})
            </span>
            <span>已选 {selectedPaths.size} 项</span>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <span>确认清理冗余文件？</span>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            您即将从磁盘中清理以下 <strong className="text-white font-semibold">{filesToDelete.length}</strong> 个未做种文件。
          </p>

          <div className="max-h-40 overflow-y-auto bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-400 space-y-1">
            {filesToDelete.map((f, i) => (
              <div key={i} className="truncate">
                • {f}
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs leading-relaxed">
            提示：若在配置中心启用了“回收站保护”，文件将被安全移至回收站目录；若未启用，将直接物理删除释放磁盘空间。
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
            >
              {deleting ? '正在清理...' : '确认清理'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
