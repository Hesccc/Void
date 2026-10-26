import React, { useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { KeyRound, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  forced?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  forced = false,
}) => {
  const { updateUser } = useAuth();
  const { success, error } = useToast();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      error('请输入当前旧密码');
      return;
    }
    if (newPassword.length < 5) {
      error('新密码长度不能少于 5 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      error('两次输入的新密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      success('密码修改成功！');
      updateUser({ must_change_password: false });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err: any) {
      error(err.message || '密码修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={forced ? () => {} : onClose}
      maxWidth="max-w-md"
      title={
        <>
          <KeyRound className="w-5 h-5 text-indigo-400" />
          <span>{forced ? '安全提示：必须修改初始密码' : '修改登录密码'}</span>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {forced && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs leading-relaxed">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <span>检测到当前使用的是默认初始密码，为了保障您的系统和 NAS 磁盘安全，请先设置一个属于您的专属密码。</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">当前旧密码</label>
          <div className="relative">
            <input
              type={showOld ? 'text' : 'password'}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入旧密码"
              required
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">新密码</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码（至少 5 位）"
              required
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">确认新密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="请再次输入新密码"
            required
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80 mt-6">
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {submitting ? '正在提交...' : '确认修改'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
