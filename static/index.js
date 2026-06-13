
// --- 认证管理 ---
let authToken = localStorage.getItem('void_auth_token') || '';

async function authFetch(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    if (authToken) {
        options.headers['Authorization'] = 'Bearer ' + authToken;
    }
    
    const response = await fetch(url, options);
    if (response.status === 401) {
        showLoginOverlay();
        throw new Error('Unauthorized');
    }
    return response;
}

function showLoginOverlay() {
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('change-pwd-modal').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
}

function hideLoginOverlay() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
}

function showChangePwdModal() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('change-pwd-modal').style.display = 'flex';
}

async function checkAuth() {
    if (!authToken) {
        showLoginOverlay();
        return false;
    }
    try {
        const response = await fetch('/api/auth/check', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (response.status === 401) {
            showLoginOverlay();
            return false;
        }
        const res = await response.json();
        if (res.must_change_password) {
            showChangePwdModal();
            return false;
        }
        return true;
    } catch(err) {
        console.error(err);
        showLoginOverlay();
        return false;
    }
}

// 登录表单提交
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login-submit');
    btn.disabled = true;
    btn.innerText = '登录中...';
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('login-user').value,
                password: document.getElementById('login-pwd').value
            })
        });
        
        if (res.status === 401) {
            showToast('❌ 用户名或密码错误', 3000);
            btn.disabled = false;
            btn.innerText = '进入系统';
            return;
        }
        
        const data = await res.json();
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('void_auth_token', authToken);
            
            if (data.must_change_password) {
                showChangePwdModal();
            } else {
                hideLoginOverlay();
                await initApp();
            }
        }
    } catch(err) {
        showToast('❌ 登录请求失败', 3000);
    }
    
    btn.disabled = false;
    btn.innerText = '进入系统';
});

// 退出登录
document.getElementById('nav-logout').addEventListener('click', async () => {
    if(authToken) {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
    }
    authToken = '';
    localStorage.removeItem('void_auth_token');
    showLoginOverlay();
    
    // 清除数据
    document.getElementById('files-tbody').innerHTML = '';
    document.getElementById('tasks-tbody').innerHTML = '';
    if(logEventSource) {
        logEventSource.close();
    }
});

// 修改密码表单
document.getElementById('change-pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPwd = document.getElementById('chg-old-pwd').value;
    const newPwd = document.getElementById('chg-new-pwd').value;
    const confirmPwd = document.getElementById('chg-confirm-pwd').value;
    
    if (newPwd !== confirmPwd) {
        showToast('❌ 两次输入的新密码不一致', 3000);
        return;
    }
    
    const btn = document.getElementById('btn-chg-pwd-submit');
    btn.disabled = true;
    btn.innerText = '修改中...';
    
    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                old_password: oldPwd,
                new_password: newPwd
            })
        });
        
        if (res.status === 400 || res.status === 401) {
            const errData = await res.json();
            showToast('❌ ' + (errData.detail || '旧密码错误'), 3000);
        } else if (res.ok) {
            showToast('✅ 密码修改成功！', 3000);
            document.getElementById('change-pwd-modal').style.display = 'none';
            hideLoginOverlay();
            await initApp();
            
            // 清除密码输入框
            document.getElementById('chg-old-pwd').value = '';
            document.getElementById('chg-new-pwd').value = '';
            document.getElementById('chg-confirm-pwd').value = '';
        } else {
            showToast('❌ 修改失败', 3000);
        }
    } catch(err) {
        showToast('❌ 请求失败', 3000);
    }
    
    btn.disabled = false;
    btn.innerText = '保存新密码并进入';
});

// --- 原有逻辑 ---
// Tab 导航控制
        const navItems = document.querySelectorAll('.nav-item');
        const tabPanels = document.querySelectorAll('.tab-panel');

        function switchTab(tabId) {
            navItems.forEach(item => {
                if (item.getAttribute('data-tab') === tabId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            tabPanels.forEach(panel => {
                if (panel.id === tabId) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });

            // 切换 Tab 时主动拉取/刷新数据
            if (tabId === 'logs') {
                const term = document.getElementById('log-terminal');
                term.scrollTop = term.scrollHeight;
            } else if (tabId === 'unseeded-files') {
                loadUnseededFiles();
            } else if (tabId === 'tasks') {
                loadTasks();
            } else if (tabId === 'dashboard') {
                fetchDashboardSummary();
            }
        }

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                switchTab(item.getAttribute('data-tab'));
            });
        });

        // Toast 全局提示
        let toastTimeout;
        function showToast(text, duration = 3000, showLoading = false) {
            const toast = document.getElementById('toast-notify');
            const toastText = document.getElementById('toast-text');
            const spinner = document.getElementById('toast-spinner');

            toastText.innerText = text;
            spinner.style.display = showLoading ? 'block' : 'none';

            toast.classList.add('show');

            clearTimeout(toastTimeout);
            if (duration > 0) {
                toastTimeout = setTimeout(() => {
                    toast.classList.remove('show');
                }, duration);
            }
        }

        function hideToast() {
            document.getElementById('toast-notify').classList.remove('show');
        }

        // 自定义确认对话框 (Promise-based Confirm dialog)
        let confirmResolver = null;
        function showConfirmDialog(title, message) {
            document.getElementById('confirm-modal-title').innerText = title;
            document.getElementById('confirm-modal-msg').innerText = message;
            document.getElementById('confirm-modal').style.display = 'flex';
            return new Promise((resolve) => {
                confirmResolver = resolve;
            });
        }

        document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
            document.getElementById('confirm-modal').style.display = 'none';
            if (confirmResolver) confirmResolver(false);
        });

        document.getElementById('btn-confirm-ok').addEventListener('click', () => {
            document.getElementById('confirm-modal').style.display = 'none';
            if (confirmResolver) confirmResolver(true);
        });

        // 密码可见切换辅助函数
        function togglePasswordVisibility(inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                } else {
                    input.type = 'password';
                }
            }
        }

        // --- 全局状态及 API 调用 ---
        let globalConfig = {};

        async function fetchConfig() {
            try {
                const response = await authFetch('/api/config');
                globalConfig = await response.json();
                renderDashboard();
                renderSettingsForm();
            } catch (err) {
                showToast("拉取配置文件失败: " + err, 5000);
            }
        }

        async function fetchDashboardSummary() {
            try {
                const response = await authFetch('/api/dashboard/summary');
                const res = await response.json();
                if (res.success) {
                    document.getElementById('stat-unseeded-count').innerHTML = `${res.unseeded_count} <span class="card-unit">个</span>`;
                    
                    const size_mb = res.unseeded_size_mb;
                    const size_str = size_mb < 1024 ? `${size_mb.toFixed(2)} MB` : `${(size_mb / 1024).toFixed(2)} GB`;
                    document.getElementById('stat-unseeded-size').innerHTML = size_str;
                    
                    document.getElementById('stat-cleaned-count').innerHTML = `${res.cleaned_count} <span class="card-unit">个</span>`;
                    document.getElementById('stat-last-scan').innerText = res.last_scan;
                }
            } catch (err) {
                console.error("加载仪表盘统计失败:", err);
            }
        }

        function renderDashboard() {
            document.getElementById('stat-auto-remove').innerText = globalConfig.enable_auto_remove ? "已开启" : "未开启";
            document.getElementById('stat-recycle-bin').innerText = globalConfig.enable_recycle_bin ? "已开启" : "已禁用";

            // 动态设置状态显示
            const isGlobal = globalConfig.global_scan && globalConfig.global_scan.enabled;
            const statusText = isGlobal ? "正在运行 (全局扫描模式)" : "正在运行 (普通模式)";
            document.querySelector('#sys-status-badge span').innerText = statusText;

            // 客户端及规则统计
            const servicesCount = globalConfig.services ? globalConfig.services.length : 0;
            const pathsCount = (globalConfig.global_scan && globalConfig.global_scan.scan_paths) ? globalConfig.global_scan.scan_paths.length : 0;
            const rulesCount = globalConfig.excluded_paths ? globalConfig.excluded_paths.length : 0;

            document.getElementById('stat-services-count').innerText = servicesCount;
            document.getElementById('stat-paths-count').innerText = pathsCount;
            document.getElementById('stat-rules-count').innerText = rulesCount;

            fetchDashboardSummary();
        }

        // 渲染设置表单
        function renderSettingsForm() {
            document.getElementById('cfg-interval').value = globalConfig.check_interval;
            document.getElementById('cfg-checksize').value = globalConfig.checkfile_size;
            document.getElementById('cfg-webport').value = globalConfig.web_port || 8000;
            document.getElementById('cfg-autoremove').checked = globalConfig.enable_auto_remove;
            document.getElementById('cfg-recyclebin').checked = globalConfig.enable_recycle_bin;

            const recyclePathGroup = document.getElementById('recyclebin-path-group');
            recyclePathGroup.style.display = globalConfig.enable_recycle_bin ? 'flex' : 'none';
            document.getElementById('cfg-recyclepath').value = globalConfig.recycle_bin_path || "./.trash";

            // 全局扫描配置
            const globalScanEnabled = globalConfig.global_scan && globalConfig.global_scan.enabled;
            document.getElementById('cfg-globalscan').checked = globalScanEnabled;

            const globalScanGroup = document.getElementById('globalscan-paths-group');
            globalScanGroup.style.display = globalScanEnabled ? 'flex' : 'none';
            if (globalConfig.global_scan && globalConfig.global_scan.scan_paths) {
                document.getElementById('cfg-globalscanpaths').value = globalConfig.global_scan.scan_paths.join('\n');
            } else {
                document.getElementById('cfg-globalscanpaths').value = '';
            }

            // 通知类型
            const notifType = globalConfig.notification_type || 'none';
            document.getElementById('cfg-notiftype').value = notifType;
            toggleNotificationCards(notifType);

            // 填写具体通知子项
            if (globalConfig.webhook) {
                document.getElementById('cfg-webhk-url').value = globalConfig.webhook.url || '';
            }
            if (globalConfig.wecom) {
                document.getElementById('cfg-wecom-key').value = globalConfig.wecom.key || '';
            }
            if (globalConfig.email) {
                document.getElementById('cfg-mail-host').value = globalConfig.email.smtp_host || '';
                document.getElementById('cfg-mail-port').value = globalConfig.email.smtp_port || '';
                document.getElementById('cfg-mail-user').value = globalConfig.email.username || '';
                document.getElementById('cfg-mail-pwd').value = globalConfig.email.password || '';
                document.getElementById('cfg-mail-to').value = globalConfig.email.to || '';
            }

            // 排除目录文本
            if (globalConfig.excluded_paths) {
                document.getElementById('cfg-excluded').value = globalConfig.excluded_paths.join('\n');
            }

            // 渲染服务列表
            const container = document.getElementById('services-list-container');
            container.innerHTML = '';
            const services = globalConfig.services || [];
            services.forEach((service, index) => {
                addServiceCard(service, index);
            });
        }

        function toggleNotificationCards(type) {
            document.querySelectorAll('.notification-card').forEach(card => card.style.display = 'none');
            const targetCard = document.getElementById(`notif-card-${type}`);
            if (targetCard) targetCard.style.display = 'block';
        }

        document.getElementById('cfg-notiftype').addEventListener('change', (e) => {
            toggleNotificationCards(e.target.value);
        });

        document.getElementById('cfg-recyclebin').addEventListener('change', (e) => {
            document.getElementById('recyclebin-path-group').style.display = e.target.checked ? 'flex' : 'none';
        });

        document.getElementById('cfg-globalscan').addEventListener('change', (e) => {
            document.getElementById('globalscan-paths-group').style.display = e.target.checked ? 'flex' : 'none';
        });

        // 动态管理服务列表
        function addServiceCard(service = {}, index = null) {
            const container = document.getElementById('services-list-container');
            const cardId = index !== null ? index : container.children.length;

            const card = document.createElement('div');
            card.className = 'service-item-card';
            card.dataset.id = cardId;

            // 路径映射文本拼装
            let mappingText = '';
            if (service.path_mapping && service.path_mapping.length > 0) {
                service.path_mapping.forEach(m => {
                    if (m.remote !== undefined && m.local !== undefined) {
                        mappingText += `${m.local}:${m.remote}\n`;
                    } else {
                        // 键值对映射
                        for (let k in m) {
                            mappingText += `${k}:${m[k]}\n`;
                        }
                    }
                });
            }

            card.innerHTML = `
                <span class="delete-service-btn" onclick="removeServiceCard(this)">🗑️ 删除</span>
                <div class="form-row">
                    <div class="form-group">
                        <label>下载服务名称</label>
                        <input type="text" class="svc-name" value="${service.name || '新服务'}" placeholder="例如: NAS下载器">
                    </div>
                    <div class="form-group">
                        <label>客户端类型</label>
                        <select class="svc-type">
                            <option value="qbittorrent" ${service.type === 'qbittorrent' ? 'selected' : ''}>qBittorrent</option>
                            <option value="transmission" ${service.type === 'transmission' ? 'selected' : ''}>Transmission</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>服务主机 Host / IP</label>
                        <input type="text" class="svc-host" value="${service.host || '127.0.0.1'}">
                    </div>
                    <div class="form-group">
                        <label>端口 Port</label>
                        <input type="number" class="svc-port" value="${service.port || 8080}">
                    </div>
                </div>
                <div class="form-row" style="margin-top:15px;">
                    <div class="form-group">
                        <label>用户名</label>
                        <input type="text" class="svc-username" value="${service.username || 'admin'}">
                    </div>
                    <div class="form-group">
                        <label>登录密码</label>
                        <div class="password-container">
                            <input type="password" class="svc-password" id="svc-pwd-${cardId}" value="${service.password || ''}">
                            <button class="password-toggle" type="button" onclick="togglePasswordVisibility('svc-pwd-${cardId}')">
                                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="form-group full-width">
                        <label>路径映射关系 (每行一条，格式为：本地物理路径:下载客户端保存路径)</label>
                        <textarea class="svc-mapping" rows="2" placeholder="W:\\downloads:/video/downloads">${mappingText.trim()}</textarea>
                    </div>
                </div>
                <div style="margin-top:15px; display:flex; gap:12px; justify-content: flex-end; align-items: center;">
                    <span id="test-bubble-${cardId}" class="test-result-bubble" style="display:none;"></span>
                    <button class="btn btn-secondary" style="padding: 6px 16px; font-size:12px;" onclick="testServiceConnection(${cardId})">测试连接</button>
                </div>
            `;
            container.appendChild(card);
        }

        function removeServiceCard(btn) {
            btn.parentElement.remove();
        }

        document.getElementById('btn-add-service').addEventListener('click', () => addServiceCard());

        // 获取单个服务配置的值
        function getServiceData(card) {
            // 解析路径映射文本为列表的字典结构
            const mappingVal = card.querySelector('.svc-mapping').value.trim();
            const path_mapping = [];
            if (mappingVal) {
                mappingVal.split('\n').forEach(line => {
                    const colonIndex = line.lastIndexOf(':');
                    if (colonIndex !== -1) {
                        const local = line.substring(0, colonIndex).trim();
                        const remote = line.substring(colonIndex + 1).trim();
                        if (local && remote) {
                            const obj = {};
                            obj[local] = remote;
                            path_mapping.push(obj);
                        }
                    }
                });
            }

            return {
                name: card.querySelector('.svc-name').value,
                type: card.querySelector('.svc-type').value,
                host: card.querySelector('.svc-host').value,
                port: parseInt(card.querySelector('.svc-port').value),
                username: card.querySelector('.svc-username').value,
                password: card.querySelector('.svc-password').value,
                path_mapping: path_mapping
            };
        }

        // 测试服务连接
        async function testServiceConnection(cardId) {
            const card = document.querySelector(`.service-item-card[data-id="${cardId}"]`);
            if (!card) return;

            const serviceData = getServiceData(card);
            const bubble = document.getElementById(`test-bubble-${cardId}`);
            if (bubble) {
                bubble.style.display = 'inline-flex';
                bubble.className = 'test-result-bubble';
                bubble.style.background = 'rgba(255,255,255,0.05)';
                bubble.style.borderColor = 'var(--glass-border)';
                bubble.style.color = 'var(--text-muted)';
                bubble.innerHTML = '<div class="loader-spinner" style="width:12px; height:12px; border-width:1px;"></div> 正在测试...';
            }

            try {
                const response = await authFetch('/api/config/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serviceData)
                });
                const res = await response.json();
                if (res.success) {
                    if (bubble) {
                        bubble.className = 'test-result-bubble success';
                        bubble.innerHTML = '⚡ 连接成功';
                    }
                    showToast(`✅ ${serviceData.name} 连接测试成功！`);
                } else {
                    if (bubble) {
                        bubble.className = 'test-result-bubble failed';
                        bubble.innerHTML = '❌ 连接失败';
                    }
                    showToast(`❌ ${serviceData.name} 连接测试失败: ${res.error}`, 6000);
                }
            } catch (err) {
                if (bubble) {
                    bubble.className = 'test-result-bubble failed';
                    bubble.innerHTML = '⚠️ 网络异常';
                }
                showToast(`❌ 网络异常: ${err}`, 5000);
            }
        }

        // 保存配置
        document.getElementById('btn-save-config').addEventListener('click', async () => {
            const interval = parseInt(document.getElementById('cfg-interval').value);
            const checksize = parseInt(document.getElementById('cfg-checksize').value) || 0;
            const webport = parseInt(document.getElementById('cfg-webport').value) || 8000;
            const autoremove = document.getElementById('cfg-autoremove').checked;
            const recyclebin = document.getElementById('cfg-recyclebin').checked;
            const recyclepath = document.getElementById('cfg-recyclepath').value.trim();
            const notiftype = document.getElementById('cfg-notiftype').value;

            // 组装通知配置
            const email = {
                smtp_host: document.getElementById('cfg-mail-host').value,
                smtp_port: parseInt(document.getElementById('cfg-mail-port').value) || 465,
                username: document.getElementById('cfg-mail-user').value,
                password: document.getElementById('cfg-mail-pwd').value,
                to: document.getElementById('cfg-mail-to').value
            };
            const webhook = { url: document.getElementById('cfg-webhk-url').value };
            const wecom = { key: document.getElementById('cfg-wecom-key').value };

            // 组装排除路径
            const excluded_paths = document.getElementById('cfg-excluded').value.trim().split('\n').map(p => p.trim()).filter(Boolean);

            // 组装服务列表
            const serviceCards = document.querySelectorAll('.service-item-card');
            const services = [];
            serviceCards.forEach(card => {
                services.push(getServiceData(card));
            });

            // 组装全局扫描模式的值
            const global_scan = {
                enabled: document.getElementById('cfg-globalscan').checked,
                scan_paths: document.getElementById('cfg-globalscanpaths').value.trim().split('\n').map(p => p.trim()).filter(Boolean)
            };

            const payload = {
                check_interval: interval,
                enable_auto_remove: autoremove,
                notification_type: notiftype,
                checkfile_size: checksize,
                excluded_paths: excluded_paths,
                email: email,
                webhook: webhook,
                wecom: wecom,
                services: services,
                global_scan: global_scan,
                web_port: webport,
                enable_recycle_bin: recyclebin,
                recycle_bin_path: recyclepath
            };

            showToast("正在保存配置...", 0, true);
            try {
                const response = await authFetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const res = await response.json();
                if (res.success) {
                    showToast("✅ 配置保存成功！正在重启/重载配置...");
                    await fetchConfig();
                } else {
                    showToast(`❌ 保存配置失败: ${res.detail}`, 5000);
                }
            } catch (err) {
                showToast(`❌ 连接失败: ${err}`, 5000);
            }
        });


        // --- 冗余文件与扫描任务管理 ---
        let detectedFiles = [];
        let activeRefreshTimer = null;
        let pendingScanMode = null;

        // 启动扫描任务
        async function startScanTask(mode, force = false) {
            if (!mode) {
                // 未指定模式时，读取当前配置的默认模式
                const isGlobal = globalConfig.global_scan && globalConfig.global_scan.enabled;
                mode = isGlobal ? 'global' : 'normal';
            }
            showToast("正在请求启动扫描任务...", 0, true);
            try {
                const response = await authFetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode, force: force })
                });
                const res = await response.json();
                hideToast();

                if (res.warning_pending) {
                    showConflictWarning(mode, res.message);
                } else if (res.success) {
                    showToast("🚀 扫描任务已启动！");
                    switchTab('tasks');
                    loadTasks();
                } else {
                    showToast("❌ 启动扫描失败: " + res.detail, 5000);
                }
            } catch (err) {
                showToast("❌ 网络请求异常: " + err, 5000);
            }
        }

        // 显示冲突警告
        function showConflictWarning(mode, message) {
            pendingScanMode = mode;
            document.getElementById('warning-modal-msg').innerText = message;
            document.getElementById('warning-modal').style.display = 'flex';
        }

        // 隐藏冲突警告
        function hideConflictWarning() {
            pendingScanMode = null;
            document.getElementById('warning-modal').style.display = 'none';
        }

        // 获取任务历史
        async function loadTasks() {
            try {
                const response = await authFetch('/api/tasks');
                const res = await response.json();
                if (res.success) {
                    const tasks = res.tasks || [];
                    renderTasksTable(tasks);
                    populateTaskFilter(tasks);

                    // 在控制中心渲染活动任务卡片 (Active Task Live Card)
                    const activeTask = tasks.find(t => ['pending', 'running', 'paused'].includes(t.status));
                    const activeTaskContainer = document.getElementById('active-task-container');

                    if (activeTask) {
                        const modeStr = activeTask.mode === 'global' ? '全局扫描' : '普通扫描';
                        const triggerStr = activeTask.trigger_type === 'cron' ? '自动定时' : '手动触发';

                        let statusText = '';
                        let statusClass = '';
                        let progressColor = 'var(--accent-primary)';

                        if (activeTask.status === 'pending') {
                            statusText = '排队中';
                            statusClass = 'pending';
                            progressColor = '#4b5563';
                        } else if (activeTask.status === 'running') {
                            statusText = `进行中 (${activeTask.progress.toFixed(1)}%)`;
                            statusClass = 'running';
                        } else if (activeTask.status === 'paused') {
                            statusText = `已暂停 (${activeTask.progress.toFixed(1)}%)`;
                            statusClass = 'paused';
                            progressColor = 'var(--warning)';
                        }

                        let actionButtonsHtml = '';
                        if (activeTask.status === 'running') {
                            actionButtonsHtml = `
                                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="pauseTask(${activeTask.id})">⏸️ 暂停</button>
                                <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="cancelTask(${activeTask.id})">⏹️ 终止</button>
                            `;
                        } else if (activeTask.status === 'paused') {
                            actionButtonsHtml = `
                                <button class="btn btn-primary" style="padding:6px 12px; font-size:12px;" onclick="resumeTask(${activeTask.id})">▶️ 继续</button>
                                <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="cancelTask(${activeTask.id})">⏹️ 终止</button>
                            `;
                        }

                        const runningClass = activeTask.status === 'running' ? 'running' : '';

                        activeTaskContainer.innerHTML = `
                            <div class="active-task-card">
                                <div class="active-task-header">
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <h3 style="font-size: 16px; font-weight:700;">活动扫描任务 #${activeTask.id}</h3>
                                        <span class="status-pill ${statusClass}">
                                            <span class="dot"></span>
                                            <span>${statusText}</span>
                                        </span>
                                    </div>
                                    <div class="active-task-actions">
                                        ${actionButtonsHtml}
                                    </div>
                                </div>
                                <div class="active-task-body">
                                    <div class="active-task-meta">
                                        <span style="color:var(--text-muted);">模式: <strong style="color:var(--text-main);">${modeStr}</strong></span>
                                        <span style="color:var(--text-muted);">|</span>
                                        <span style="color:var(--text-muted);">触发: <strong style="color:var(--text-main);">${triggerStr}</strong></span>
                                        <span style="color:var(--text-muted);">|</span>
                                        <span style="color:var(--text-muted);">创建时间: <strong style="color:var(--text-main);">${activeTask.created_at}</strong></span>
                                    </div>
                                    <div class="active-task-progress-container">
                                        <div class="progress-bar-fill ${runningClass}" style="width: ${activeTask.progress}%; background: ${progressColor};"></div>
                                    </div>
                                    <div style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${activeTask.progress_msg || '任务正在准备中...'}</div>
                                </div>
                            </div>
                        `;
                    } else {
                        activeTaskContainer.innerHTML = `
                            <div style="font-size:13px; color:var(--text-muted); text-align:center; padding:16px; border:1px dashed var(--glass-border); border-radius:14px; margin-bottom:30px; background:rgba(255,255,255,0.01); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; gap:8px;">
                                <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--success); box-shadow:0 0 6px var(--success);"></span>
                                扫描队列空闲，当前无活跃的扫描任务
                            </div>
                        `;
                    }

                    // 若存在排队中、执行中或暂停中的任务，开启定时轮询
                    const hasActive = tasks.some(t => ['pending', 'running', 'paused'].includes(t.status));
                    clearTimeout(activeRefreshTimer);
                    if (hasActive) {
                        activeRefreshTimer = setTimeout(loadTasks, 1000);

                        // 如果用户正在冗余文件列表查看该活动任务，也对其扫描结果进行同步刷新
                        const currentFilter = document.getElementById('select-task-filter').value;
                        if (currentFilter !== 'merged' && tasks.some(t => t.id === parseInt(currentFilter) && t.status === 'running')) {
                            loadUnseededFiles();
                        }
                    } else {
                        // 任务运行完毕或无活动任务，刷新数据清理看板指标
                        fetchDashboardSummary();
                    }
                }
            } catch (err) {
                console.error("加载任务列表失败:", err);
            }
        }

        // 渲染任务 management 表格
        function renderTasksTable(tasks) {
            // 更新任务看板指标
            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(t => t.status === 'completed').length;
            const finishedTasks = tasks.filter(t => ['completed', 'failed', 'canceled'].includes(t.status));
            const successRate = finishedTasks.length > 0 ? ((completedTasks / finishedTasks.length) * 100).toFixed(1) : '100.0';

            document.getElementById('task-stat-total').innerHTML = `${totalTasks} <span class="card-unit">次</span>`;
            document.getElementById('task-stat-success-rate').innerHTML = `${successRate} <span class="card-unit">%</span>`;

            const lastFinished = finishedTasks[0];
            const resultEl = document.getElementById('task-stat-last-result');
            if (resultEl) {
                if (lastFinished) {
                    let statusText = '';
                    let color = 'var(--text-main)';
                    if (lastFinished.status === 'completed') {
                        statusText = '成功';
                        color = 'var(--success)';
                    } else if (lastFinished.status === 'failed') {
                        statusText = '失败';
                        color = 'var(--error)';
                    } else if (lastFinished.status === 'canceled') {
                        statusText = '已终止';
                        color = 'var(--text-muted)';
                    }
                    const timeStr = lastFinished.completed_at ? lastFinished.completed_at.substring(5, 16) : '--';
                    resultEl.innerHTML = `<span style="color:${color}; font-weight:700;">#${lastFinished.id} ${statusText}</span><span style="font-size:12px; font-weight:normal; color:var(--text-muted); margin-left:8px;">(${timeStr})</span>`;
                } else {
                    resultEl.innerText = '暂无历史';
                }
            }

            const activeTask = tasks.find(t => ['pending', 'running', 'paused'].includes(t.status));
            const badgeEl = document.getElementById('task-stat-system-badge');
            if (badgeEl) {
                const dotEl = badgeEl.querySelector('.status-dot');
                const textEl = badgeEl.querySelector('span');
                if (activeTask) {
                    badgeEl.classList.add('status-active');
                    if (activeTask.status === 'running') {
                        textEl.innerText = '正在扫描';
                        dotEl.style.background = 'var(--success)';
                        dotEl.style.boxShadow = '0 0 10px var(--success)';
                    } else if (activeTask.status === 'paused') {
                        textEl.innerText = '扫描已暂停';
                        dotEl.style.background = 'var(--warning)';
                        dotEl.style.boxShadow = '0 0 10px var(--warning)';
                    } else { // pending
                        textEl.innerText = '排队等待中';
                        dotEl.style.background = 'var(--accent-primary)';
                        dotEl.style.boxShadow = '0 0 10px var(--accent-primary)';
                    }
                } else {
                    badgeEl.classList.remove('status-active');
                    textEl.innerText = '队列空闲';
                    dotEl.style.background = 'var(--text-muted)';
                    dotEl.style.boxShadow = 'none';
                }
            }

            const tbody = document.getElementById('tasks-tbody');
            tbody.innerHTML = '';

            if (tasks.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                            暂无任务运行历史。
                        </td>
                    </tr>
                `;
                return;
            }

            tasks.forEach(task => {
                const row = document.createElement('tr');
                const modeStr = task.mode === 'global' ? '全局扫描' : '普通扫描';
                const triggerStr = task.trigger_type === 'cron' ? '自动定时' : '手动触发';

                let statusHtml = '';
                let progressColor = 'var(--accent-primary)';
                let runningClass = '';

                if (task.status === 'pending') {
                    statusHtml = `
                        <span class="status-pill pending">
                            <span class="dot"></span>
                            <span>排队中</span>
                        </span>`;
                    progressColor = '#4b5563';
                } else if (task.status === 'running') {
                    statusHtml = `
                        <span class="status-pill running">
                            <span class="dot"></span>
                            <span>进行中 (${task.progress.toFixed(1)}%)</span>
                        </span>`;
                    runningClass = 'running';
                } else if (task.status === 'paused') {
                    statusHtml = `
                        <span class="status-pill paused">
                            <span class="dot"></span>
                            <span>已暂停 (${task.progress.toFixed(1)}%)</span>
                        </span>`;
                    progressColor = 'var(--warning)';
                } else if (task.status === 'canceled') {
                    statusHtml = `
                        <span class="status-pill canceled">
                            <span class="dot"></span>
                            <span>已终止</span>
                        </span>`;
                    progressColor = '#6b7280';
                } else if (task.status === 'completed') {
                    statusHtml = `
                        <span class="status-pill completed">
                            <span class="dot"></span>
                            <span>已完成</span>
                        </span>`;
                    progressColor = 'var(--success)';
                } else if (task.status === 'failed') {
                    statusHtml = `
                        <span class="status-pill failed">
                            <span class="dot"></span>
                            <span>已失败</span>
                        </span>`;
                    progressColor = 'var(--error)';
                }

                const progressHtml = `
                    <div style="display:flex; flex-direction:column; gap:6px; min-width: 140px;">
                        <div style="margin-bottom: 2px;">${statusHtml}</div>
                        <div style="width:100%; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); border-radius:10px; height:8px; overflow:hidden;">
                            <div class="progress-bar-fill ${runningClass}" style="width:${task.progress}%; background:${progressColor}; height:100%;"></div>
                        </div>
                    </div>
                `;

                const msg = task.progress_msg || '--';

                const timeHtml = `
                    <div style="font-size:12px; line-height:1.4;">
                        <div>创: ${task.created_at || '--'}</div>
                        ${task.started_at ? `<div>启: ${task.started_at}</div>` : ''}
                        ${task.completed_at ? `<div>终: ${task.completed_at}</div>` : ''}
                    </div>
                `;

                let actionHtml = '';
                if (task.status === 'running') {
                    actionHtml = `
                        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="pauseTask(${task.id})">暂停</button>
                        <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="cancelTask(${task.id})">终止</button>
                    `;
                } else if (task.status === 'paused') {
                    actionHtml = `
                        <button class="btn btn-primary" style="padding:6px 12px; font-size:12px;" onclick="resumeTask(${task.id})">继续</button>
                        <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="cancelTask(${task.id})">终止</button>
                    `;
                } else {
                    actionHtml = `
                        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px; border-color:var(--accent-primary);" onclick="viewTaskResults(${task.id})">结果</button>
                        <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="deleteTaskRecord(${task.id})">删除</button>
                    `;
                }

                row.innerHTML = `
                    <td>#${task.id}</td>
                    <td><span class="status-badge" style="padding:3px 8px; font-size:12px;">${modeStr}</span></td>
                    <td>${triggerStr}</td>
                    <td>${progressHtml}</td>
                    <td class="task-detail-cell" style="font-size:13px; color:var(--text-muted); max-width: 250px;" title="${msg}">${msg}</td>
                    <td>${timeHtml}</td>
                    <td style="text-align: center;"><div style="display:flex; gap:8px; justify-content:center;">${actionHtml}</div></td>
                `;
                tbody.appendChild(row);
            });
        }

        // 填充冗余文件选项卡的历史下拉菜单
        function populateTaskFilter(tasks) {
            const selectFilter = document.getElementById('select-task-filter');
            const currentVal = selectFilter.value;

            selectFilter.innerHTML = '<option value="merged">合并显示所有未清理文件（去重）</option>';

            tasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                const modeStr = task.mode === 'global' ? '全局' : '普通';

                let statusStr = '';
                if (task.status === 'completed') statusStr = '已完成';
                else if (task.status === 'canceled') statusStr = '已终止';
                else if (task.status === 'failed') statusStr = '已失败';
                else if (task.status === 'running') statusStr = '进行中';
                else if (task.status === 'paused') statusStr = '已暂停';
                else statusStr = task.status;

                const countStr = task.total_unseeded_found !== null ? ` | 冗余: ${task.total_unseeded_found}` : '';
                opt.innerText = `#${task.id} (${modeStr}模式) - ${task.created_at} (${statusStr}${countStr})`;
                selectFilter.appendChild(opt);
            });

            selectFilter.value = currentVal;
            if (selectFilter.value !== currentVal) {
                selectFilter.value = "merged";
            }
        }

        // 查看特定任务的冗余文件结果
        function viewTaskResults(taskId) {
            document.getElementById('select-task-filter').value = taskId;
            switchTab('unseeded-files');
            loadUnseededFiles();
        }

        // 控制任务：暂停/继续/终止
        async function pauseTask(taskId) {
            showToast("正在请求暂停任务...", 1500, true);
            try {
                const response = await authFetch(`/api/tasks/${taskId}/pause`, { method: 'POST' });
                const res = await response.json();
                if (res.success) {
                    showToast("⏸️ 任务已暂停");
                    loadTasks();
                } else {
                    showToast("❌ 暂停失败: " + res.detail, 4000);
                }
            } catch (err) {
                showToast("❌ 网络异常: " + err, 4000);
            }
        }

        async function resumeTask(taskId) {
            showToast("正在恢复任务...", 1500, true);
            try {
                const response = await authFetch(`/api/tasks/${taskId}/resume`, { method: 'POST' });
                const res = await response.json();
                if (res.success) {
                    showToast("▶️ 任务已继续开始扫描");
                    loadTasks();
                } else {
                    showToast("❌ 恢复失败: " + res.detail, 4000);
                }
            } catch (err) {
                showToast("❌ 网络异常: " + err, 4000);
            }
        }

        async function cancelTask(taskId) {
            const confirmed = await showConfirmDialog("⏹️ 终止扫描任务", "确定要终止当前正在运行的扫描任务吗？");
            if (!confirmed) return;

            showToast("正在请求终止任务...", 1500, true);
            try {
                const response = await authFetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
                const res = await response.json();
                if (res.success) {
                    showToast("⏹️ 任务终止指令已下发并安全终止");
                    loadTasks();
                } else {
                    showToast("❌ 终止失败: " + res.detail, 4000);
                }
            } catch (err) {
                showToast("❌ 网络异常: " + err, 4000);
            }
        }

        async function deleteTaskRecord(taskId) {
            const confirmed = await showConfirmDialog("🗑️ 删除任务记录", `确定要删除扫描任务 #${taskId} 的历史记录吗？\n（仅清理历史报告，不会删除实际物理文件）`);
            if (!confirmed) return;

            showToast("正在删除任务记录...", 1500, true);
            try {
                const response = await authFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
                const res = await response.json();
                if (res.success) {
                    showToast("✅ 任务记录及关联结果删除成功");

                    // 如果冗余文件下拉过滤当前选择的是该任务，将其置回合并显示并刷新
                    const selectFilter = document.getElementById('select-task-filter');
                    if (selectFilter.value === String(taskId)) {
                        selectFilter.value = 'merged';
                        loadUnseededFiles();
                    }

                    loadTasks();
                } else {
                    showToast("❌ 删除失败: " + res.detail, 4000);
                }
            } catch (err) {
                showToast("❌ 网络异常: " + err, 4000);
            }
        }

        // --- 冗余文件列表分页与加载 ---
        let currentPage = 1;
        const pageSize = 100;

        // 从数据库拉取未做种文件列表 (基于下拉菜单过滤器)
        async function loadUnseededFiles() {
            const filterVal = document.getElementById('select-task-filter').value;
            const tbody = document.getElementById('files-tbody');

            // 如果列表是空的，才显示加载动画，防止刷新时光栅跳动
            if (tbody.children.length <= 1 && tbody.innerText.includes('历史任务')) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px 0;">
                            <div class="loader-spinner" style="width: 30px; height: 30px; margin: 0 auto 15px;"></div>
                            正在加载未做种冗余文件数据...
                        </td>
                    </tr>
                `;
            }

            try {
                const response = await authFetch(`/api/files/unseeded?task_id=${filterVal}`);
                const res = await response.json();
                if (res.success) {
                    detectedFiles = res.files || [];
                    currentPage = 1; // 切换过滤记录或重新加载时，重置回第一页
                    renderFilesTable(detectedFiles);
                } else {
                    showToast("❌ 获取未做种文件失败: " + res.detail, 5000);
                }
            } catch (err) {
                showToast("❌ 物理访问网络异常: " + err, 5000);
            }
        }

        // 渲染页面数据 (基于当前页码与 pageSize 分片渲染)
        function renderPage() {
            const tbody = document.getElementById('files-tbody');
            tbody.innerHTML = '';
            document.getElementById('check-all').checked = false;
            updateDeleteBtnState();

            const totalItems = detectedFiles.length;
            if (totalItems === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                            ✅ 磁盘干净，未发现任何未做种冗余文件！
                        </td>
                    </tr>
                `;
                document.getElementById('pagination-controls').innerHTML = '';
                return;
            }

            // 对大数组进行切片处理
            const pageFiles = detectedFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

            pageFiles.forEach((file) => {
                const row = document.createElement('tr');

                // 大小格式化
                const size_mb = file.file_size_mb;
                const size_str = size_mb < 1024 ? `${size_mb.toFixed(2)} MB` : `${(size_mb / 1024).toFixed(2)} GB`;

                const isDeleted = file.deleted === 1;
                const pathStyle = isDeleted ? 'style="text-decoration: line-through; color: var(--text-muted); opacity: 0.6;"' : '';
                const chkHtml = isDeleted ? '' : `<input type="checkbox" class="file-chk" data-path="${encodeURIComponent(file.file_path)}">`;
                const actionHtml = isDeleted
                    ? '<span style="color: var(--success); font-weight:600; opacity:0.8;">已清理</span>'
                    : `<span style="color: var(--error); cursor: pointer; font-weight:600;" onclick="deleteSingleFile('${encodeURIComponent(file.file_path)}')">物理删除</span>`;

                // 拆分文件名和父路径，进行美化排版
                const filePath = file.file_path;
                const lastSlash = filePath.lastIndexOf('\\');
                const lastSlashLinux = filePath.lastIndexOf('/');
                const slashIdx = lastSlash > lastSlashLinux ? lastSlash : lastSlashLinux;

                let fileName = filePath;
                let dirPath = '';
                if (slashIdx !== -1) {
                    fileName = filePath.substring(slashIdx + 1);
                    dirPath = filePath.substring(0, slashIdx);
                }

                // 智能匹配客户端标签颜色
                const svcName = file.service_name || '';
                let badgeClass = 'global';
                if (svcName.toLowerCase().includes('qb')) {
                    badgeClass = 'qb';
                } else if (svcName.toLowerCase().includes('tr') || svcName.toLowerCase().includes('trans')) {
                    badgeClass = 'tr';
                }

                row.innerHTML = `
                    <td>${chkHtml}</td>
                    <td ${pathStyle}>
                        <div class="file-info-cell" title="${filePath}">
                            <div class="file-name-bold" ${pathStyle}>${fileName}</div>
                            <div class="file-path-dimmed" ${pathStyle}>${dirPath || '/'}</div>
                        </div>
                    </td>
                    <td ${pathStyle}><span class="status-badge" style="padding:4px 10px; font-size:12px; font-weight:500;">${size_str}</span></td>
                    <td><span class="client-badge ${badgeClass}">${svcName}</span></td>
                    <td style="text-align: center;">${actionHtml}</td>
                `;
                tbody.appendChild(row);
            });

            // 挂载 checkbox 事件监听
            document.querySelectorAll('.file-chk').forEach(chk => {
                chk.addEventListener('change', updateDeleteBtnState);
            });

            renderPaginationControls(totalItems);
        }

        // 渲染未做种文件分页栏
        function renderPaginationControls(totalItems) {
            const container = document.getElementById('pagination-controls');
            container.innerHTML = '';

            // 如果总数不超过单页显示上限，隐藏分页控制条
            if (totalItems <= pageSize) {
                return;
            }

            const totalPages = Math.ceil(totalItems / pageSize);

            const prevBtn = document.createElement('button');
            prevBtn.className = 'btn btn-secondary';
            prevBtn.style.padding = '6px 14px';
            prevBtn.style.fontSize = '13px';
            prevBtn.innerText = '上一页';
            prevBtn.disabled = currentPage === 1;
            prevBtn.onclick = () => {
                currentPage--;
                renderPage();
                document.querySelector('.main-content').scrollTop = 0; // 点击翻页后回到顶部
            };

            const infoSpan = document.createElement('span');
            infoSpan.style.color = 'var(--text-muted)';
            infoSpan.style.fontSize = '14px';
            infoSpan.innerText = `第 ${currentPage} / ${totalPages} 页 (共 ${totalItems} 个文件)`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-secondary';
            nextBtn.style.padding = '6px 14px';
            nextBtn.style.fontSize = '13px';
            nextBtn.innerText = '下一页';
            nextBtn.disabled = currentPage === totalPages;
            nextBtn.onclick = () => {
                currentPage++;
                renderPage();
                document.querySelector('.main-content').scrollTop = 0; // 点击翻页后回到顶部
            };

            container.appendChild(prevBtn);
            container.appendChild(infoSpan);
            container.appendChild(nextBtn);
        }

        // 外部暴露的渲染入口
        function renderFilesTable(files) {
            detectedFiles = files;
            renderPage();
        }

        // Checkbox 全选控制
        document.getElementById('check-all').addEventListener('change', (e) => {
            document.querySelectorAll('.file-chk').forEach(chk => {
                chk.checked = e.target.checked;
            });
            updateDeleteBtnState();
        });

        function updateDeleteBtnState() {
            const chks = document.querySelectorAll('.file-chk:checked');
            const delBtn = document.getElementById('btn-delete-selected');
            delBtn.disabled = chks.length === 0;
            if (chks.length > 0) {
                delBtn.innerText = `删除选中项 (${chks.length})`;
            } else {
                delBtn.innerText = `删除选中项`;
            }
        }

        // 删除特定文件
        async function deleteFiles(filePaths) {
            const confirmMsg = `确定要清理这 ${filePaths.length} 个文件吗？\n${globalConfig.enable_recycle_bin ? '文件将被移入安全回收站暂存。' : '🚨 警告：文件将被物理删除且无法找回！'}`;
            const confirmed = await showConfirmDialog("🗑️ 物理清理确认", confirmMsg);
            if (!confirmed) return;

            showToast("正在删除文件...", 0, true);
            try {
                const response = await authFetch('/api/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: filePaths })
                });
                const res = await response.json();
                if (res.success) {
                    showToast(`✅ 成功清理了 ${res.deleted.length} 个文件`);
                    // 重新从数据库拉取最新的文件结果，以正确渲染“已清理”删除划线状态
                    loadUnseededFiles();
                } else {
                    showToast("❌ 删除失败: " + res.detail, 5000);
                }
            } catch (err) {
                showToast("❌ 请求删除异常: " + err, 5000);
            }
        }

        function deleteSingleFile(encodedPath) {
            const file_path = decodeURIComponent(encodedPath);
            deleteFiles([file_path]);
        }

        document.getElementById('btn-delete-selected').addEventListener('click', () => {
            const chks = document.querySelectorAll('.file-chk:checked');
            const filePaths = Array.from(chks).map(chk => decodeURIComponent(chk.dataset.path));
            deleteFiles(filePaths);
        });

        // --- SSE 实时流日志终端 ---
        let logEventSource = null;
        function initLogsStream() {
            const term = document.getElementById('log-terminal');
            const statusDot = document.getElementById('log-status-dot');
            const statusText = document.getElementById('log-status-text');
            const levelFilter = document.getElementById('log-level-filter');
            const autoScrollCheckbox = document.getElementById('log-auto-scroll');

            if (logEventSource) logEventSource.close();

            logEventSource = new EventSource('/api/logs?token=' + authToken);
            statusDot.className = 'log-dot online';
            statusText.innerText = '连接状态: 监听中';

            eventSourceOnMessage = (event) => {
                const text = event.data;

                // 判断日志级别以实现筛选
                let currentLevel = 'INFO';
                if (text.includes(' - ERROR - ')) currentLevel = 'ERROR';
                else if (text.includes(' - WARNING - ')) currentLevel = 'WARNING';
                else if (text.includes(' - INFO - ')) currentLevel = 'INFO';
                else currentLevel = 'ALL';

                const filterVal = levelFilter.value;
                let shouldShow = false;
                if (filterVal === 'ALL') {
                    shouldShow = true;
                } else if (filterVal === 'ERROR' && currentLevel === 'ERROR') {
                    shouldShow = true;
                } else if (filterVal === 'WARNING' && (currentLevel === 'WARNING' || currentLevel === 'ERROR')) {
                    shouldShow = true;
                } else if (filterVal === 'INFO' && currentLevel === 'INFO') {
                    shouldShow = true;
                }

                const line = document.createElement('div');
                line.className = 'terminal-line';
                line.dataset.level = currentLevel;

                if (currentLevel === 'ERROR') {
                    line.style.color = '#f87171'; // 亮红
                } else if (currentLevel === 'WARNING') {
                    line.style.color = '#fbbf24'; // 亮黄
                } else if (currentLevel === 'INFO') {
                    line.style.color = '#34d399'; // 绿
                } else {
                    line.style.color = '#9ca3af'; // 灰
                }

                line.innerText = text;

                if (!shouldShow) {
                    line.style.display = 'none';
                }

                term.appendChild(line);

                // 仅在滚动条处于最底部附近时自动滚，以便用户自己查看历史
                if (autoScrollCheckbox.checked) {
                    term.scrollTop = term.scrollHeight;
                }
            };

            logEventSource.onmessage = eventSourceOnMessage;

            logEventSource.onerror = (err) => {
                console.error("EventSource log stream failed: ", err);
                statusDot.className = 'log-dot';
                statusText.innerText = '连接状态: 已断开';
            };

            levelFilter.addEventListener('change', () => {
                const filterVal = levelFilter.value;
                const lines = term.querySelectorAll('.terminal-line');
                lines.forEach(line => {
                    const currentLevel = line.dataset.level;
                    let shouldShow = false;
                    if (filterVal === 'ALL') {
                        shouldShow = true;
                    } else if (filterVal === 'ERROR' && currentLevel === 'ERROR') {
                        shouldShow = true;
                    } else if (filterVal === 'WARNING' && (currentLevel === 'WARNING' || currentLevel === 'ERROR')) {
                        shouldShow = true;
                    } else if (filterVal === 'INFO' && currentLevel === 'INFO') {
                        shouldShow = true;
                    }
                    line.style.display = shouldShow ? 'block' : 'none';
                });

                if (autoScrollCheckbox.checked) {
                    term.scrollTop = term.scrollHeight;
                }
            });
        }

        document.getElementById('btn-clear-terminal').addEventListener('click', () => {
            document.getElementById('log-terminal').innerHTML = '<div class="terminal-line" style="color:var(--text-muted)">[已手动清屏]</div>';
        });

        // 提取初始化主逻辑
        async function initApp() {
            await fetchConfig();
            initLogsStream();
            loadTasks();
            loadUnseededFiles();
        }

        // 页面初始化
        window.addEventListener('DOMContentLoaded', async () => {
            const isAuthed = await checkAuth();
            if (isAuthed) {
                hideLoginOverlay();
                await initApp();
            }

            // 配置子 Tab 切换监听绑定
            document.querySelectorAll('.config-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const subtabId = btn.getAttribute('data-subtab');
                    document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.config-tab-panel').forEach(p => p.classList.remove('active'));

                    btn.classList.add('active');
                    document.getElementById(subtabId).classList.add('active');
                });
            });

            // 下拉菜单过滤监听
            document.getElementById('select-task-filter').addEventListener('change', loadUnseededFiles);

            // 警告模态弹窗事件绑定
            document.getElementById('btn-warning-cancel').addEventListener('click', hideConflictWarning);
            document.getElementById('btn-warning-force').addEventListener('click', () => {
                hideConflictWarning();
                if (pendingScanMode) {
                    startScanTask(pendingScanMode, true);
                }
            });

            // 新建扫描任务绑定
            document.getElementById('btn-create-normal-scan').addEventListener('click', () => startScanTask('normal'));
            document.getElementById('btn-create-global-scan').addEventListener('click', () => startScanTask('global'));
            document.getElementById('btn-manual-scan').addEventListener('click', () => startScanTask(null));
        });

// --- 账号修改密码子页面逻辑 ---
document.getElementById('account-chg-pwd-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPwd = document.getElementById('account-old-pwd').value;
    const newPwd = document.getElementById('account-new-pwd').value;
    const confirmPwd = document.getElementById('account-confirm-pwd').value;
    
    if (newPwd !== confirmPwd) {
        showToast('❌ 两次输入的新密码不一致', 3000);
        return;
    }
    
    const btn = document.getElementById('btn-account-chg-submit');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '修改中...';
    
    try {
        const res = await authFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_password: oldPwd,
                new_password: newPwd
            })
        });
        
        if (res.status === 400 || res.status === 401) {
            const errData = await res.json();
            showToast('❌ ' + (errData.detail || '旧密码错误'), 3000);
        } else if (res.ok) {
            showToast('✅ 密码修改成功！', 3000);
            document.getElementById('account-old-pwd').value = '';
            document.getElementById('account-new-pwd').value = '';
            document.getElementById('account-confirm-pwd').value = '';
        } else {
            showToast('❌ 修改失败', 3000);
        }
    } catch(err) {
        showToast('❌ 请求失败: ' + err.message, 3000);
    }
    
    btn.disabled = false;
    btn.innerText = originalText;
});
