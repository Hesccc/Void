import type { AppConfig, DashboardSummary, ScanResult, ServiceConfig, Task, User } from './types';

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('void_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('void_token', token);
  } else {
    localStorage.removeItem('void_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('void_unauthorized'));
    throw new Error('登录凭证已过期，请重新登录');
  }

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.detail || data?.error || data?.message || `请求失败 (${response.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ token: string; username: string; must_change_password: boolean }> {
    const res = await request<{ token: string; username: string; must_change_password: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(res.token);
    return res;
  },

  async checkAuth(): Promise<User> {
    return request<User>('/auth/check');
  },

  async changePassword(old_password: string, new_password: string): Promise<{ success: boolean; message: string }> {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  // Dashboard
  async getSummary(): Promise<DashboardSummary> {
    return request<DashboardSummary>('/dashboard/summary');
  },

  // Files
  async getUnseededFiles(taskId: string = 'merged'): Promise<{ success: boolean; files: ScanResult[] }> {
    return request<{ success: boolean; files: ScanResult[] }>(`/files/unseeded?task_id=${encodeURIComponent(taskId)}`);
  },

  async deleteFiles(files: string[]): Promise<{ success: boolean; deleted: string[]; failed: string[] }> {
    return request<{ success: boolean; deleted: string[]; failed: string[] }>('/delete', {
      method: 'POST',
      body: JSON.stringify({ files }),
    });
  },

  // Tasks
  async getTasks(): Promise<{ success: boolean; tasks: Task[] }> {
    return request<{ success: boolean; tasks: Task[] }>('/tasks');
  },

  async createTask(mode: 'normal' | 'global', force: boolean = false): Promise<{ success: boolean; task_id?: number; warning_pending?: boolean; message?: string }> {
    return request('/tasks', {
      method: 'POST',
      body: JSON.stringify({ mode, force }),
    });
  },

  async pauseTask(taskId: number): Promise<{ success: boolean }> {
    return request(`/tasks/${taskId}/pause`, { method: 'POST' });
  },

  async resumeTask(taskId: number): Promise<{ success: boolean }> {
    return request(`/tasks/${taskId}/resume`, { method: 'POST' });
  },

  async cancelTask(taskId: number): Promise<{ success: boolean }> {
    return request(`/tasks/${taskId}/cancel`, { method: 'POST' });
  },

  async deleteTask(taskId: number): Promise<{ success: boolean }> {
    return request(`/tasks/${taskId}`, { method: 'DELETE' });
  },

  async getTaskResults(taskId: number): Promise<{ success: boolean; files: ScanResult[] }> {
    return request(`/tasks/${taskId}/results`);
  },

  // Config
  async getConfig(): Promise<AppConfig> {
    return request<AppConfig>('/config');
  },

  async updateConfig(config: AppConfig): Promise<{ success: boolean; message: string }> {
    return request('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async testDownloader(service: ServiceConfig): Promise<{ success: boolean; message?: string; error?: string }> {
    return request('/config/test', {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  async autoDetectMapping(service: ServiceConfig): Promise<{
    success: boolean;
    status?: 'identical' | 'mapped';
    remote?: string;
    local?: string;
    sample?: string;
    message: string;
  }> {
    return request('/config/auto-detect-mapping', {
      method: 'POST',
      body: JSON.stringify({ service }),
    });
  },

  async testNotification(config: Partial<AppConfig>): Promise<{ success: boolean; message: string }> {
    return request('/config/test-notify', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async checkDirectoryPath(path: string): Promise<{
    exists: boolean;
    is_dir: boolean;
    readable: boolean;
    writable: boolean;
    sample_items: string[];
    message: string;
  }> {
    return request('/config/check-path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },
};
