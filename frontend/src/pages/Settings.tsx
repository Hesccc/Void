import React, { useState, useEffect } from 'react';
import type { AppConfig, ServiceConfig } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  Settings as SettingsIcon,
  Save,
  Server,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  FolderCheck,
  Send,
  Zap,
  Shield,
  Clock,
  Bell,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  Check
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { success, error, info } = useToast();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'mode' | 'services' | 'rules' | 'schedule' | 'notify'>('mode');

  // Service modal
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceConfig>({
    name: 'qBittorrent-1',
    type: 'qbittorrent',
    host: '127.0.0.1',
    port: 8080,
    username: 'admin',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testingService, setTestingService] = useState(false);
  const [serviceTestResult, setServiceTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Path check state
  const [checkingPath, setCheckingPath] = useState(false);
  const [pathCheckResult, setPathCheckResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Notification test
  const [testingNotify, setTestingNotify] = useState(false);

  // Auto sniffing mapping state
  const [sniffingMapping, setSniffingMapping] = useState(false);
  const [sniffResult, setSniffResult] = useState<{ ok: boolean; msg: string; sample?: string } | null>(null);

  // Quick Exclude tags
  const COMMON_EXCLUDE_TAGS = [
    '*.nfo',
    '*.srt',
    '*.ass',
    '*.torrent',
    'lost+found',
    '.@__thumb',
    '.recycle',
    '.qBittorrent',
    '@eaDir',
  ];

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await api.getConfig();
      setConfig(data);
    } catch (err: any) {
      error(err.message || '获取配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.updateConfig(config);
      success('配置已成功保存并立即生效！');
    } catch (err: any) {
      error(err.message || '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  // Helper to apply safety presets
  const applySafetyPreset = (preset: 'conservative' | 'balanced' | 'aggressive') => {
    if (!config) return;
    if (preset === 'conservative') {
      setConfig({
        ...config,
        enable_auto_remove: false,
        checkfile_size: 100,
        enable_recycle_bin: true,
        excluded_paths: Array.from(new Set([...config.excluded_paths, '.recycle', 'lost+found', '.@__thumb'])),
      });
      info('已应用【保守审计档】：仅扫描报告 + 过滤 <100MB 小文件');
    } else if (preset === 'balanced') {
      setConfig({
        ...config,
        enable_auto_remove: true,
        enable_recycle_bin: true,
        recycle_bin_path: './.trash',
        checkfile_size: 50,
      });
      info('已应用【安全维护档】：自动清理 + 开启回收站保护 + 过滤 <50MB');
    } else if (preset === 'aggressive') {
      setConfig({
        ...config,
        enable_auto_remove: true,
        enable_recycle_bin: false,
        checkfile_size: 0,
      });
      info('已应用【激进彻底档】：直接物理删除 + 全尺寸扫描');
    }
  };

  // Test connection for downloader
  const handleTestService = async (svc: ServiceConfig) => {
    setTestingService(true);
    setServiceTestResult(null);
    try {
      const res = await api.testDownloader(svc);
      if (res.success) {
        setServiceTestResult({ ok: true, msg: res.message || '连接成功！认证通过' });
        success('下载器连通性测试成功');
      } else {
        setServiceTestResult({ ok: false, msg: res.error || '无法连接到该下载器' });
        error(`连接测试失败: ${res.error}`);
      }
    } catch (err: any) {
      setServiceTestResult({ ok: false, msg: err.message });
      error(`测试异常: ${err.message}`);
    } finally {
      setTestingService(false);
    }
  };

  // Auto sniff and detect path mapping
  const handleAutoDetectMapping = async (svc: ServiceConfig) => {
    setSniffingMapping(true);
    setSniffResult(null);
    try {
      const res = await api.autoDetectMapping(svc);
      if (res.success) {
        if (res.status === 'identical') {
          setServiceForm((prev) => ({ ...prev, path_mapping: [] }));
          setSniffResult({ ok: true, msg: res.message, sample: res.sample });
          success('检测为零映射对齐！路径完全一致');
        } else if (res.status === 'mapped' && res.local && res.remote) {
          const mapping = [{ [res.local]: res.remote }];
          setServiceForm((prev) => ({ ...prev, path_mapping: mapping }));
          setSniffResult({ ok: true, msg: res.message, sample: res.sample });
          success(`已推导出映射规则: ${res.remote} ➔ ${res.local}`);
        }
      } else {
        setSniffResult({ ok: false, msg: res.message });
        error(res.message);
      }
    } catch (err: any) {
      setSniffResult({ ok: false, msg: err.message });
      error(`自动推导异常: ${err.message}`);
    } finally {
      setSniffingMapping(false);
    }
  };

  // Check path existence
  const handleCheckPath = async (p: string) => {
    if (!p) return;
    setCheckingPath(true);
    setPathCheckResult(null);
    try {
      const res = await api.checkDirectoryPath(p);
      if (res.exists && res.is_dir) {
        setPathCheckResult({
          ok: true,
          msg: `路径有效！(可读: ${res.readable ? '是' : '否'}, 可写: ${res.writable ? '是' : '否'}, 样例文件数: ${res.sample_items.length})`,
        });
        success('目录有效存在');
      } else {
        setPathCheckResult({ ok: false, msg: '该目录在系统/容器内不存在或无法访问，请核对挂载路径' });
        error('路径不存在或无权限');
      }
    } catch (err: any) {
      setPathCheckResult({ ok: false, msg: err.message });
    } finally {
      setCheckingPath(false);
    }
  };

  // Test Notification
  const handleTestNotify = async () => {
    if (!config) return;
    setTestingNotify(true);
    try {
      const res = await api.testNotification(config);
      if (res.success) {
        success(res.message || '测试通知已成功发出！请检查手机客户端');
      } else {
        error(`通知测试失败: ${res.message}`);
      }
    } catch (err: any) {
      error(`测试失败: ${err.message}`);
    } finally {
      setTestingNotify(false);
    }
  };

  // Smart URL parser for downloader host/port
  const handleUrlPaste = (val: string) => {
    try {
      if (val.startsWith('http://') || val.startsWith('https://')) {
        const u = new URL(val);
        setServiceForm((prev) => ({
          ...prev,
          host: u.hostname,
          port: u.port ? parseInt(u.port) : u.protocol === 'https:' ? 443 : 80,
        }));
        info('已自动从 URL 中解析出主机与端口');
        return;
      }
    } catch {}
    setServiceForm((prev) => ({ ...prev, host: val }));
  };

  const openAddService = () => {
    setEditingServiceIndex(null);
    setServiceForm({
      name: `下载器-${(config?.services.length || 0) + 1}`,
      type: 'qbittorrent',
      host: '127.0.0.1',
      port: 8080,
      username: 'admin',
      password: '',
      path_mapping: [],
    });
    setServiceTestResult(null);
    setSniffResult(null);
    setServiceModalOpen(true);
  };

  const openEditService = (index: number) => {
    if (!config) return;
    setEditingServiceIndex(index);
    setServiceForm({ ...config.services[index] });
    setServiceTestResult(null);
    setSniffResult(null);
    setServiceModalOpen(true);
  };

  const saveServiceModal = () => {
    if (!config) return;
    if (!serviceForm.name.trim()) {
      error('请输入下载器名称');
      return;
    }
    const updated = [...config.services];
    if (editingServiceIndex !== null) {
      updated[editingServiceIndex] = serviceForm;
    } else {
      updated.push(serviceForm);
    }
    setConfig({ ...config, services: updated });
    setServiceModalOpen(false);
    success('下载器已更新（请点击底部“保存配置”生效）');
  };

  const removeService = (index: number) => {
    if (!config) return;
    if (!window.confirm(`确定要移除 ${config.services[index].name} 吗？`)) return;
    const updated = config.services.filter((_, i) => i !== index);
    setConfig({ ...config, services: updated });
    success('已移除该下载器');
  };

  const toggleExcludeTag = (tag: string) => {
    if (!config) return;
    const current = config.excluded_paths || [];
    if (current.includes(tag)) {
      setConfig({ ...config, excluded_paths: current.filter((t) => t !== tag) });
    } else {
      setConfig({ ...config, excluded_paths: [...current, tag] });
    }
  };

  if (loading || !config) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-500">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm">正在加载配置选项...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-indigo-400" />
            <span>配置中心</span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            可视化引导配置扫描目录、下载客户端、安全预设与消息推送
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 active:scale-95 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? '正在保存...' : '保存配置'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3 overflow-x-auto text-xs sm:text-sm">
        {[
          { id: 'mode', label: '1. 扫描模式与路径', icon: Zap },
          { id: 'services', label: '2. 下载器连接', icon: Server, count: config.services.length },
          { id: 'rules', label: '3. 安全与清理规则', icon: Shield },
          { id: 'schedule', label: '4. 执行频率', icon: Clock },
          { id: 'notify', label: '5. 推送通知', icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-700 text-zinc-300">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---------------- Tab 1: Mode & Paths ---------------- */}
      {activeTab === 'mode' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Global Aggregation Mode (Recommended) */}
            <div
              onClick={() =>
                setConfig({
                  ...config,
                  global_scan: { ...config.global_scan, enabled: true },
                })
              }
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                config.global_scan.enabled
                  ? 'bg-indigo-950/20 border-indigo-500/60 shadow-xl shadow-indigo-950/30'
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-white">全局聚合扫描模式</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    强烈推荐 (PT最佳)
                  </span>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    config.global_scan.enabled
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-zinc-600'
                  }`}
                >
                  {config.global_scan.enabled && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                <strong>专为 PT 辅种与共享存储设计</strong>：Void 会跨所有已连接的 qB / TR 下载器汇总所有正在做种的全部文件列表，统一核对共享目录。
              </p>
              <p className="text-xs text-indigo-300/90 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-500/20">
                ✨ <strong>免配置复杂路径映射</strong>：只要所有下载器下载到同个存储路径（如 /data），只需填写下方的扫描目录即可，彻底避免误删辅种文件！
              </p>
            </div>

            {/* Standalone / Normal Mode */}
            <div
              onClick={() =>
                setConfig({
                  ...config,
                  global_scan: { ...config.global_scan, enabled: false },
                })
              }
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                !config.global_scan.enabled
                  ? 'bg-zinc-800/40 border-zinc-500 shadow-xl'
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-base text-white">分立模式 (独立扫描)</span>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    !config.global_scan.enabled
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-zinc-600'
                  }`}
                >
                  {!config.global_scan.enabled && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                每个下载器各自只扫描与其关联的特定存储目录。适用于各下载器完全独立占用不同磁盘的情况。
              </p>
            </div>
          </div>

          {/* Directory Settings based on mode */}
          {config.global_scan.enabled ? (
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">全局扫描目标目录</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    程序扫描并比对冗余文件的本地/容器目录（通常为 Docker 映射的 <code className="text-indigo-400">/data</code>）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCheckPath(config.global_scan.scan_paths[0] || '/data')}
                  disabled={checkingPath}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
                >
                  <FolderCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{checkingPath ? '正在验证...' : '⚡ 验证目录是否存在'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.global_scan.scan_paths[0] || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      global_scan: {
                        ...config.global_scan,
                        scan_paths: [e.target.value],
                      },
                    })
                  }
                  placeholder="/data"
                  className="flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {pathCheckResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    pathCheckResult.ok
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {pathCheckResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{pathCheckResult.msg}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400">
              在分立模式下，各个下载器内部的下载目录将被独立扫描。如果 Docker 路径不一致，请在第 2 步的各个下载器卡片中补充对应路径映射。
            </div>
          )}
        </div>
      )}

      {/* ---------------- Tab 2: Downloaders (Services) ---------------- */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">已连接的下载客户端</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Void 会在扫描时自动通过 API 获取客户端内的实时做种文件列表
              </p>
            </div>
            <button
              onClick={openAddService}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>添加下载器</span>
            </button>
          </div>

          {config.services.length === 0 ? (
            <div className="p-12 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <Server className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-300">尚未配置任何下载客户端</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                请至少添加一个 qBittorrent 或 Transmission 客户端，以便读取正在做种的种子清单。
              </p>
              <button
                onClick={openAddService}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                + 添加首个下载器
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config.services.map((svc, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
                        {svc.type === 'qbittorrent' ? 'qB' : 'TR'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{svc.name}</span>
                          <span className="text-[10px] px-2 py-0.2 rounded-full font-mono bg-zinc-800 text-zinc-300">
                            {svc.type === 'qbittorrent' ? 'qBittorrent' : 'Transmission'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                          {svc.host}:{svc.port} ({svc.username || '无账号'})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditService(idx)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeService(idx)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">
                        {svc.password ? '已设密码' : '无密码'}
                      </span>
                      {svc.path_mapping && svc.path_mapping.length > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          已配置映射
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          零映射对齐
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleTestService(svc)}
                      disabled={testingService}
                      className="flex items-center gap-1 px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>测试连接</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Tab 3: Safety & Cleaning Rules ---------------- */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* One-click Safety Presets */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center gap-2 text-white text-sm font-semibold">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>一键安全档位推荐（点按即套用）</span>
            </div>
            <p className="text-xs text-zinc-400">
              新手或对清理感到担心的用户，推荐选择前两档，避免误删风险：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <button
                type="button"
                onClick={() => applySafetyPreset('conservative')}
                className="p-3.5 rounded-xl border border-zinc-800 hover:border-emerald-500/50 bg-zinc-950/50 hover:bg-emerald-950/10 text-left transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>🛡️ 保守审计档 (推荐)</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  仅生成报告不自动删除；自动忽略 &lt;100MB 种子/字幕；安全最高。
                </p>
              </button>

              <button
                type="button"
                onClick={() => applySafetyPreset('balanced')}
                className="p-3.5 rounded-xl border border-zinc-800 hover:border-indigo-500/50 bg-zinc-950/50 hover:bg-indigo-950/10 text-left transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>⚖️ 安全维护档 (日常)</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  自动清理但启用回收站暂存；忽略 &lt;50MB 小文件；兼顾省心与安全。
                </p>
              </button>

              <button
                type="button"
                onClick={() => applySafetyPreset('aggressive')}
                className="p-3.5 rounded-xl border border-zinc-800 hover:border-rose-500/50 bg-zinc-950/50 hover:bg-rose-950/10 text-left transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>⚡ 激进彻底档</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  直接物理清空，不留回收站，扫描所有文件大小；适合老手彻底腾空间。
                </p>
              </button>
            </div>
          </div>

          {/* Granular Rules */}
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-6">
            {/* Auto delete toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
              <div>
                <h4 className="text-sm font-semibold text-white">自动删除未做种文件</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  开启后定时任务将自动执行清理；关闭则只发送扫描通知，保留文件待手动确认
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enable_auto_remove}
                  onChange={(e) => setConfig({ ...config, enable_auto_remove: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Recycle Bin toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
              <div>
                <h4 className="text-sm font-semibold text-white">回收站保护 (防误删)</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  清理时先将文件移动到指定临时回收站目录，确认无误后再清空，给数据加一道保险
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enable_recycle_bin}
                  onChange={(e) => setConfig({ ...config, enable_recycle_bin: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {config.enable_recycle_bin && (
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
                <label className="block text-xs font-medium text-zinc-400">回收站存放路径</label>
                <input
                  type="text"
                  value={config.recycle_bin_path || './.trash'}
                  onChange={(e) => setConfig({ ...config, recycle_bin_path: e.target.value })}
                  placeholder="./.trash"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Min file size threshold */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-white">文件大小过滤阈值 (MB)</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    仅清理大于或等于此大小的未做种文件。设为 50MB 可自动保护字幕(.srt)、种子和海报元数据；设为 0 表示不限制。
                  </p>
                </div>
                <div className="font-mono text-sm font-bold text-indigo-400 bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800">
                  {config.checkfile_size} MB
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="10"
                value={config.checkfile_size}
                onChange={(e) => setConfig({ ...config, checkfile_size: parseInt(e.target.value) || 0 })}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Excluded paths & Tags */}
            <div className="space-y-3 pt-4 border-t border-zinc-800/80">
              <div>
                <h4 className="text-sm font-semibold text-white">排除路径与文件规则</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  匹配以下规则的文件或目录将被完全跳过（支持通配符如 *.nfo, lost+found）
                </p>
              </div>

              {/* Quick tags */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-zinc-500 mr-1">快捷添加标签:</span>
                {COMMON_EXCLUDE_TAGS.map((tag) => {
                  const hasTag = config.excluded_paths.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleExcludeTag(tag)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono transition-all ${
                        hasTag
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                      }`}
                    >
                      {hasTag ? `✓ ${tag}` : `+ ${tag}`}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={3}
                value={config.excluded_paths.join('\n')}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    excluded_paths: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="一行一个排除模式，例如：&#10;*.nfo&#10;*.srt&#10;/data/important_backup"
                className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Tab 4: Schedule ---------------- */}
      {activeTab === 'schedule' && (
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-white">自动巡检执行频率</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Void 会在后台定时唤醒并比对做种目录，无需人工干预
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: '每 30 分钟', val: 30 },
              { label: '每 1 小时', val: 60 },
              { label: '每 6 小时', val: 360 },
              { label: '每 12 小时', val: 720 },
              { label: '每天 1 次', val: 1440 },
            ].map((item) => {
              const active = config.check_interval === item.val;
              return (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setConfig({ ...config, check_interval: item.val })}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-lg shadow-indigo-600/25'
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs text-zinc-400">或者输入自定义分钟数:</span>
            <input
              type="number"
              min="5"
              value={config.check_interval}
              onChange={(e) =>
                setConfig({ ...config, check_interval: Math.max(5, parseInt(e.target.value) || 60) })
              }
              className="w-32 bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-xs text-zinc-500">分钟执行一次</span>
          </div>
        </div>
      )}

      {/* ---------------- Tab 5: Notifications ---------------- */}
      {activeTab === 'notify' && (
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">任务报告推送通知</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                巡检完成或发现异常时，发送清理报告到您的移动端设备
              </p>
            </div>
            {config.notification_type !== 'none' && (
              <button
                type="button"
                onClick={handleTestNotify}
                disabled={testingNotify}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
              >
                <Send className="w-3 h-3" />
                <span>{testingNotify ? '正在测试...' : '🚀 发送测试通知'}</span>
              </button>
            )}
          </div>

          {/* Type Select */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'none', label: '不发送通知' },
              { id: 'wecom', label: '企业微信机器人' },
              { id: 'webhook', label: '通用 Webhook' },
              { id: 'email', label: '邮件 SMTP' },
            ].map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setConfig({ ...config, notification_type: ch.id as any })}
                className={`p-3 rounded-xl border text-xs font-medium transition-all ${
                  config.notification_type === ch.id
                    ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-md'
                    : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {/* WeCom Details */}
          {config.notification_type === 'wecom' && (
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                企业微信机器人 Webhook Key (或完整 URL)
              </label>
              <input
                type="text"
                value={config.wecom?.key || ''}
                onChange={(e) => {
                  let k = e.target.value.trim();
                  if (k.includes('key=')) {
                    k = k.split('key=')[1].split('&')[0];
                  }
                  setConfig({ ...config, wecom: { ...config.wecom, key: k } });
                }}
                placeholder="例如: 437e9174-xxxx-4b4b-xxxx-852d0f1fa1ea"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-zinc-500">
                在企业微信群聊中添加“群机器人”并复制其 Webhook 链接中的 key。支持直接粘贴完整链接，程序会自动提取 key。
              </p>
            </div>
          )}

          {/* Webhook Details */}
          {config.notification_type === 'webhook' && (
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Webhook POST URL</label>
              <input
                type="text"
                value={config.webhook?.url || ''}
                onChange={(e) =>
                  setConfig({ ...config, webhook: { ...config.webhook, url: e.target.value } })
                }
                placeholder="https://example.com/webhook"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-zinc-500">
                兼容 Discord、Slack、Telegram bot 代理、MoviePilot 等任意接收 JSON POST 请求的通知网关。
              </p>
            </div>
          )}

          {/* Email Details */}
          {config.notification_type === 'email' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">SMTP 服务器</label>
                <input
                  type="text"
                  value={config.email?.smtp_host || ''}
                  onChange={(e) =>
                    setConfig({ ...config, email: { ...config.email, smtp_host: e.target.value } })
                  }
                  placeholder="smtp.qq.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">SMTP 端口 (SSL通常为465)</label>
                <input
                  type="number"
                  value={config.email?.smtp_port || 465}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      email: { ...config.email, smtp_port: parseInt(e.target.value) || 465 },
                    })
                  }
                  placeholder="465"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">发件邮箱账号</label>
                <input
                  type="text"
                  value={config.email?.username || ''}
                  onChange={(e) =>
                    setConfig({ ...config, email: { ...config.email, username: e.target.value } })
                  }
                  placeholder="sender@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">邮箱授权码 / 密码</label>
                <input
                  type="password"
                  value={config.email?.password || ''}
                  onChange={(e) =>
                    setConfig({ ...config, email: { ...config.email, password: e.target.value } })
                  }
                  placeholder="授权码"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1">收件邮箱</label>
                <input
                  type="text"
                  value={config.email?.to || ''}
                  onChange={(e) =>
                    setConfig({ ...config, email: { ...config.email, to: e.target.value } })
                  }
                  placeholder="receiver@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Downloader Modal */}
      <Modal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2 text-indigo-400">
            <Server className="w-5 h-5" />
            <span>{editingServiceIndex !== null ? '编辑下载客户端' : '添加下载客户端'}</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">下载器类型</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setServiceForm({
                    ...serviceForm,
                    type: 'qbittorrent',
                    port: serviceForm.port === 9091 ? 8080 : serviceForm.port,
                  })
                }
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  serviceForm.type === 'qbittorrent'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                qBittorrent
              </button>
              <button
                type="button"
                onClick={() =>
                  setServiceForm({
                    ...serviceForm,
                    type: 'transmission',
                    port: serviceForm.port === 8080 ? 9091 : serviceForm.port,
                  })
                }
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  serviceForm.type === 'transmission'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                Transmission
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">客户端别名</label>
            <input
              type="text"
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              placeholder="例如: 主力QB"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              IP 或 Host 地址 (支持直接粘贴完整链接)
            </label>
            <input
              type="text"
              value={serviceForm.host}
              onChange={(e) => handleUrlPaste(e.target.value)}
              placeholder="127.0.0.1 或 http://192.168.1.100:8080"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">端口号</label>
            <input
              type="number"
              value={serviceForm.port}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, port: parseInt(e.target.value) || 8080 })
              }
              placeholder="8080"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">登录账号</label>
              <input
                type="text"
                value={serviceForm.username}
                onChange={(e) => setServiceForm({ ...serviceForm, username: e.target.value })}
                placeholder="admin"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">登录密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={serviceForm.password || ''}
                  onChange={(e) => setServiceForm({ ...serviceForm, password: e.target.value })}
                  placeholder="留空表示无密码"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 pr-8 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Docker 路径映射与自动嗅探 */}
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Docker 路径映射 (智能自动推导)
                </label>
                <p className="text-[11px] text-zinc-500">
                  若容器内路径与客户端显示不一致，可点击自动嗅探对齐
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAutoDetectMapping(serviceForm)}
                disabled={sniffingMapping}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span>{sniffingMapping ? '正在嗅探...' : '⚡ 一键自动推导映射'}</span>
              </button>
            </div>

            {sniffResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  sniffResult.ok
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}
              >
                {sniffResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{sniffResult.msg}</p>
                  {sniffResult.sample && (
                    <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                      匹配样本: {sniffResult.sample}
                    </p>
                  )}
                </div>
              </div>
            )}

            {serviceForm.path_mapping && serviceForm.path_mapping.length > 0 ? (
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center justify-between">
                <span>
                  当前映射: {JSON.stringify(serviceForm.path_mapping[0])}
                </span>
                <button
                  type="button"
                  onClick={() => setServiceForm({ ...serviceForm, path_mapping: [] })}
                  className="text-rose-400 hover:text-rose-300 text-xs"
                >
                  清除映射
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">
                当前状态: 零映射对齐（默认两端路径直接镜像一致，推荐做法）
              </p>
            )}
          </div>

          {serviceTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                serviceTestResult.ok
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              }`}
            >
              {serviceTestResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="break-all">{serviceTestResult.msg}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => handleTestService(serviceForm)}
              disabled={testingService}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{testingService ? '正在测试...' : '测试连通性'}</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveServiceModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                保存下载器
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
