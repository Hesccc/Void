import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { error } = useToast();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      error('请完整输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      error(err.message || '登录失败，请检查用户名或密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl shadow-black/80">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 p-0.5 shadow-xl shadow-indigo-600/30 flex items-center justify-center mb-4">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                <span className="font-black text-transparent bg-clip-text bg-gradient-to-tr from-indigo-400 to-violet-200 text-2xl tracking-tighter">
                  V
                </span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Void 管理系统</h1>
            <p className="text-sm text-zinc-400 mt-1.5">PT / BT 冗余文件清理与智能磁盘维护</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">管理员账号</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">登录密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required
                  className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <span>{loading ? '正在验证凭证...' : '立即登录'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Tips footer */}
          <div className="mt-8 pt-6 border-t border-zinc-800/80 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-400/80" />
            <span>默认初始账号密码: admin / void@123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
