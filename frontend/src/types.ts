export interface User {
  username: string;
  must_change_password: boolean;
}

export interface Task {
  id: number;
  status: 'pending' | 'running' | 'paused' | 'canceled' | 'failed' | 'completed';
  mode: 'normal' | 'global';
  trigger_type: 'manual' | 'cron';
  progress: number;
  progress_msg: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total_files_scanned: number;
  total_unseeded_found: number;
}

export interface ScanResult {
  id?: number;
  task_id?: number;
  file_path: string;
  file_size_mb: number;
  service_name: string;
  deleted: number; // 0 or 1
}

export interface DashboardSummary {
  total_tasks: number;
  last_scan: string;
  unseeded_count: number;
  unseeded_size_mb: number;
  cleaned_count: number;
  active_task?: Task | null;
}

export interface ServiceConfig {
  name: string;
  type: 'qbittorrent' | 'transmission';
  host: string;
  port: number;
  username: string;
  password?: string;
  path_mapping?: Array<Record<string, string>>;
}

export interface GlobalScanConfig {
  enabled: boolean;
  scan_paths: string[];
}

export interface EmailConfig {
  smtp_host?: string;
  smtp_port?: number;
  username?: string;
  password?: string;
  to?: string;
}

export interface WebhookConfig {
  url?: string;
}

export interface WeComConfig {
  key?: string;
}

export interface AppConfig {
  web_port: number;
  check_interval: number;
  enable_auto_remove: boolean;
  checkfile_size: number;
  enable_recycle_bin: boolean;
  recycle_bin_path: string;
  excluded_paths: string[];
  services: ServiceConfig[];
  notification_type: 'none' | 'wecom' | 'webhook' | 'email';
  email: EmailConfig;
  webhook: WebhookConfig;
  wecom: WeComConfig;
  global_scan: GlobalScanConfig;
}
