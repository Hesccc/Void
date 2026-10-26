import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, ArrowDown, Search, Radio, RefreshCw } from 'lucide-react';

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [connected, setConnected] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('void_token') || '';
    const es = new EventSource(`/api/logs?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      if (event.data) {
        setLogs((prev) => [...prev.slice(-1000), event.data]);
      }
    };

    es.onerror = () => {
      setConnected(false);
      // Wait and reconnect
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          connectSSE();
        }
      }, 3000);
    };
  };

  useEffect(() => {
    connectSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  const filteredLogs = filterText.trim()
    ? logs.filter((l) => l.toLowerCase().includes(filterText.toLowerCase()))
    : logs;

  const renderLogLine = (line: string, index: number) => {
    let colorClass = 'text-zinc-300';
    if (line.includes('ERROR') || line.includes('错误') || line.includes('失败')) {
      colorClass = 'text-rose-400 font-medium';
    } else if (line.includes('WARN') || line.includes('警告')) {
      colorClass = 'text-amber-300';
    } else if (line.includes('INFO')) {
      colorClass = 'text-zinc-300';
    } else if (line.includes('=====')) {
      colorClass = 'text-indigo-400 font-semibold';
    }

    return (
      <div key={index} className={`leading-relaxed whitespace-pre-wrap break-all ${colorClass}`}>
        <span className="text-zinc-600 select-none mr-2 font-mono text-[10px]">
          {(index + 1).toString().padStart(4, '0')}
        </span>
        <span>{line}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Terminal className="w-6 h-6 text-indigo-400" />
            <span>实时日志终端</span>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                connected
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}
            >
              <Radio className={`w-3 h-3 ${connected ? 'animate-pulse text-emerald-400' : 'text-rose-400'}`} />
              <span>{connected ? '流式连接正常' : '已断开，正在重连'}</span>
            </div>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            基于 Server-Sent Events (SSE) 实时捕获并输出系统控制台运行记录
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="过滤日志关键字..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              autoScroll
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="新日志生成时自动滚动到底部"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>{autoScroll ? '自动滚动: 开' : '自动滚动: 关'}</span>
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs transition-colors"
            title="清空当前显示的日志"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清屏</span>
          </button>

          <button
            onClick={connectSSE}
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="重新连接日志流"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Window */}
      <div className="bg-[#0b0c10] border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs flex flex-col h-[calc(100vh-250px)] min-h-[480px]">
        {/* Terminal Titlebar */}
        <div className="bg-zinc-950/80 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            <span className="text-zinc-500 text-[11px] ml-2">Void System Console</span>
          </div>
          <span className="text-[11px] text-zinc-600">
            {filteredLogs.length} 行记录
          </span>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-600 italic py-8 text-center">
              暂无日志输出或暂未匹配到筛选结果...
            </div>
          ) : (
            filteredLogs.map((line, idx) => renderLogLine(line, idx))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
