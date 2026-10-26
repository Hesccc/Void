<script setup>
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  initialConfig: { type: Object, default: () => ({}) },
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
})

const emit = defineEmits(['save', 'close', 'layout'])

const base = computed(() => `plugin/${props.pluginId || 'VoidCleaner'}`)

const currentTab = ref('general')
const saving = ref(false)
const loadingDownloaders = ref(false)
const testingSsh = ref({})
const sshTestResults = ref({})

// 基础配置
const localConfig = ref({
  enabled: true,
  enable_auto_remove: false,
  enable_recycle_bin: true,
  recycle_bin_path: './.trash',
  min_size_mb: 0,
  cron: '0 3 * * *',
  notify_enabled: true,
  notify_only_on_unseeded: true,
  exclude_patterns: '*.nfo\n*.srt\n*.ass\n*.torrent\nlost+found\n.@__thumb\n.recycle\n.qBittorrent\n@eaDir',
  ssh_nodes: [],
  downloader_mappings: []
})

// 系统下载器列表
const systemDownloaders = ref([])

// 对话框：编辑/新增 SSH 节点
const nodeDialog = ref(false)
const isEditingNode = ref(false)
const editingNodeIndex = ref(-1)
const nodeForm = ref({
  id: '',
  name: '',
  host: '',
  port: 22,
  username: '',
  auth_type: 'password',
  password: '',
  private_key: '',
  remote_path: ''
})

function unwrap(response) {
  if (response && Object.prototype.hasOwnProperty.call(response, 'data') && response.success !== undefined) {
    return response.data
  }
  return response?.data ?? response
}

function applyConfig(cfg) {
  if (!cfg) return
  localConfig.value = {
    ...localConfig.value,
    ...cfg,
    exclude_patterns: Array.isArray(cfg.exclude_patterns) ? cfg.exclude_patterns.join('\n') : (cfg.exclude_patterns || localConfig.value.exclude_patterns),
    ssh_nodes: Array.isArray(cfg.ssh_nodes) ? [...cfg.ssh_nodes] : [],
    downloader_mappings: Array.isArray(cfg.downloader_mappings) ? [...cfg.downloader_mappings] : []
  }
}

async function loadSystemDownloaders() {
  loadingDownloaders.value = true
  try {
    const res = unwrap(await props.api.get(`${base.value}/downloaders`))
    if (res && res.downloaders) {
      systemDownloaders.value = res.downloaders

      // 初始化 mapping
      const existingMap = new Map((localConfig.value.downloader_mappings || []).map(m => [m.downloader_name, m]))
      const mergedMappings = []
      systemDownloaders.value.forEach(dl => {
        if (existingMap.has(dl.name)) {
          mergedMappings.push({ ...existingMap.get(dl.name) })
        } else {
          mergedMappings.push({
            downloader_name: dl.name,
            enabled: true,
            mode: 'local',
            ssh_node_id: '',
            download_path: ''
          })
        }
      })
      localConfig.value.downloader_mappings = mergedMappings
    }
  } catch (err) {
    console.error('加载系统下载器失败:', err)
  } finally {
    loadingDownloaders.value = false
  }
}

// 打开添加节点弹窗
function openAddNodeDialog() {
  isEditingNode.value = false
  editingNodeIndex.value = -1
  nodeForm.value = {
    id: `node_${Date.now()}`,
    name: `远程节点 ${localConfig.value.ssh_nodes.length + 1}`,
    host: '',
    port: 22,
    username: 'root',
    auth_type: 'password',
    password: '',
    private_key: '',
    remote_path: '/volume1/downloads'
  }
  nodeDialog.value = true
}

// 打开编辑节点弹窗
function openEditNodeDialog(index) {
  isEditingNode.value = true
  editingNodeIndex.value = index
  nodeForm.value = { ...localConfig.value.ssh_nodes[index] }
  nodeDialog.value = true
}

// 保存节点
function saveNode() {
  if (!nodeForm.value.name || !nodeForm.value.host || !nodeForm.value.username) {
    alert('请填写节点名称、主机 IP 和 SSH 用户名！')
    return
  }
  if (isEditingNode.value && editingNodeIndex.value >= 0) {
    localConfig.value.ssh_nodes.splice(editingNodeIndex.value, 1, { ...nodeForm.value })
  } else {
    localConfig.value.ssh_nodes.push({ ...nodeForm.value })
  }
  nodeDialog.value = false
}

// 删除节点
function deleteNode(index) {
  const node = localConfig.value.ssh_nodes[index]
  if (!confirm(`确定删除 SSH 节点 "${node.name}" 吗？`)) return
  localConfig.value.ssh_nodes.splice(index, 1)

  // 清除对应的映射绑定
  localConfig.value.downloader_mappings.forEach(m => {
    if (m.ssh_node_id === node.id) {
      m.mode = 'local'
      m.ssh_node_id = ''
    }
  })
}

// 测试 SSH 连通性
async function testSshConnection(node, testKey = 'default') {
  testingSsh.value[testKey] = true
  sshTestResults.value[testKey] = null
  try {
    const res = unwrap(await props.api.post(`${base.value}/ssh/test`, node))
    sshTestResults.value[testKey] = res
  } catch (err) {
    sshTestResults.value[testKey] = {
      code: 1,
      msg: `测试异常: ${err?.message || err}`
    }
  } finally {
    testingSsh.value[testKey] = false
  }
}

// 格式化 SSH 节点下拉选项
const sshNodeOptions = computed(() => {
  return [
    { title: '无（未关联）', value: '' },
    ...localConfig.value.ssh_nodes.map(n => ({
      title: `${n.name} (${n.host}:${n.port || 22})`,
      value: n.id
    }))
  ]
})

function saveConfig() {
  saving.value = true
  const payload = {
    ...localConfig.value,
    min_size_mb: Number(localConfig.value.min_size_mb) || 0,
    exclude_patterns: localConfig.value.exclude_patterns.split('\n').map(s => s.trim()).filter(Boolean)
  }
  emit('save', payload)
  window.setTimeout(() => {
    saving.value = false
  }, 600)
}

onMounted(async () => {
  emit('layout', { maxWidth: '75rem' })
  if (props.initialConfig && Object.keys(props.initialConfig).length) {
    applyConfig(props.initialConfig)
  }
  await loadSystemDownloaders()
})
</script>

<template>
  <div class="void-config-wrap">
    <!-- 顶部导航栏：完全自研纯净 Tab 药丸组件，彻底摆脱全局 Vuetify CSS 污染 -->
    <div class="void-tabs-nav-bar">
      <div class="void-nav-container">
        <!-- Tab 1: 基础设置 -->
        <button
          type="button"
          class="void-nav-tab"
          :class="{ 'void-nav-tab--active': currentTab === 'general' }"
          @click="currentTab = 'general'"
        >
          <VIcon icon="mdi-tune" size="18" class="void-tab-icon" />
          <span class="void-tab-title">基础设置</span>
        </button>

        <!-- Tab 2: 下载器与扫描范围 -->
        <button
          type="button"
          class="void-nav-tab"
          :class="{ 'void-nav-tab--active': currentTab === 'downloaders' }"
          @click="currentTab = 'downloaders'"
        >
          <VIcon icon="mdi-download-network" size="18" class="void-tab-icon" />
          <span class="void-tab-title">下载器与扫描范围</span>
          <span
            v-if="localConfig.downloader_mappings.length"
            class="void-tab-badge"
          >
            {{ localConfig.downloader_mappings.filter(m => m.enabled).length }}
          </span>
        </button>

        <!-- Tab 3: SSH 远程服务器 -->
        <button
          type="button"
          class="void-nav-tab"
          :class="{ 'void-nav-tab--active': currentTab === 'ssh' }"
          @click="currentTab = 'ssh'"
        >
          <VIcon icon="mdi-server-network" size="18" class="void-tab-icon" />
          <span class="void-tab-title">SSH 远程服务器</span>
          <span
            v-if="localConfig.ssh_nodes.length"
            class="void-tab-badge void-tab-badge--info"
          >
            {{ localConfig.ssh_nodes.length }}
          </span>
        </button>
      </div>
    </div>

    <div class="pa-4">
      <!-- Tab 1: 基础设置 -->
      <div v-show="currentTab === 'general'">
        <VRow dense>
          <VCol cols="12" md="6">
            <VSwitch v-model="localConfig.enabled" label="启用插件主服务" color="primary" hide-details />
            <div class="text-caption text-medium-emphasis mt-1">控制插件生命周期与后台定时巡检任务</div>
          </VCol>
          <VCol cols="12" md="6">
            <VSwitch v-model="localConfig.enable_auto_remove" label="自动清理未做种文件" color="primary" hide-details />
            <div class="text-caption text-medium-emphasis mt-1">关闭时仅输出审计清单，供用户在工作台手动复核与清理</div>
          </VCol>

          <VCol cols="12" md="6" class="mt-2">
            <VSwitch v-model="localConfig.enable_recycle_bin" label="移入回收站（防误删）" color="primary" hide-details />
          </VCol>
          <VCol cols="12" md="6" class="mt-2">
            <VTextField
              v-model="localConfig.recycle_bin_path"
              label="回收站保存路径"
              placeholder="./.trash"
              density="comfortable"
              hint="相对路径时自动保存在对应下载目录的子文件夹中"
              persistent-hint
            />
          </VCol>

          <VCol cols="12" md="6" class="mt-2">
            <VTextField
              v-model="localConfig.min_size_mb"
              type="number"
              label="文件大小过滤阈值 (MB)"
              density="comfortable"
              hint="仅检测大于此大小的文件，保护字幕、NFO 等微型非媒体文件"
              persistent-hint
            />
          </VCol>
          <VCol cols="12" md="6" class="mt-2">
            <VTextField
              v-model="localConfig.cron"
              label="定时清理周期 (Cron表达式)"
              density="comfortable"
              placeholder="0 3 * * *"
              hint="默认每日凌晨 3:00 自动执行一次"
              persistent-hint
            />
          </VCol>

          <VCol cols="12" class="mt-2">
            <VTextarea
              v-model="localConfig.exclude_patterns"
              label="全局排除路径 / 通配符匹配规则（每行一条）"
              density="comfortable"
              rows="3"
              hint="支持 glob 通配符，匹配的文件或文件夹会被彻底跳过"
              persistent-hint
            />
          </VCol>

          <!-- MP 原生消息通知配置 -->
          <VCol cols="12" class="mt-4">
            <VDivider class="mb-3" />
            <div class="text-subtitle-2 font-weight-bold d-flex align-center gap-2 mb-2">
              <VIcon icon="mdi-bell-ring-outline" size="18" color="primary" />
              <span>MoviePilot 原生消息推送配置</span>
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              巡检或清理完成后，直接调用 MoviePilot 消息中心统一广播至您已配置的渠道（企业微信、Telegram、网页端等）
            </div>
          </VCol>

          <VCol cols="12" md="6">
            <VSwitch
              v-model="localConfig.notify_enabled"
              label="开启清理任务通知推送"
              color="primary"
              hide-details
            />
          </VCol>
          <VCol cols="12" md="6">
            <VSwitch
              v-model="localConfig.notify_only_on_unseeded"
              label="静默免打扰（仅发现冗余或执行清理时推送）"
              color="primary"
              :disabled="!localConfig.notify_enabled"
              hide-details
            />
          </VCol>
        </VRow>
      </div>

      <!-- Tab 2: 下载器与扫描范围 -->
      <div v-show="currentTab === 'downloaders'">
        <VAlert type="info" variant="tonal" density="compact" class="mb-3">
          在此勾选需要核查孤儿文件的下载器。如果是远程机器上的下载器，请切换为「远程 SSH 服务器」并选择对应的节点，Void 将通过 SSH 远程进行无感核验与清理。
        </VAlert>

        <VCard variant="outlined">
          <VTable density="comfortable" hover>
            <thead>
              <tr>
                <th style="width: 70px;" class="text-center">启用</th>
                <th style="width: 180px;">下载器名称</th>
                <th style="width: 170px;">存储模式</th>
                <th style="width: 220px;">关联远程 SSH 节点</th>
                <th>扫描目录路径（留空取默认）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!localConfig.downloader_mappings.length">
                <td colspan="5" class="text-center py-6 text-medium-emphasis">
                  暂未读取到下载器配置，可在 MoviePilot「设置」->「下载器」中添加
                </td>
              </tr>
              <tr v-for="item in localConfig.downloader_mappings" :key="item.downloader_name">
                <td class="text-center">
                  <VCheckboxBtn v-model="item.enabled" color="primary" />
                </td>
                <td class="font-weight-bold">
                  {{ item.downloader_name }}
                </td>
                <td>
                  <VSelect
                    v-model="item.mode"
                    :items="[
                      { title: '本地挂载目录', value: 'local' },
                      { title: '远程 SSH 节点', value: 'ssh' }
                    ]"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </td>
                <td>
                  <VSelect
                    v-if="item.mode === 'ssh'"
                    v-model="item.ssh_node_id"
                    :items="sshNodeOptions"
                    density="compact"
                    variant="outlined"
                    placeholder="请选择绑定的 SSH 节点"
                    hide-details
                  />
                  <span v-else class="text-caption text-medium-emphasis">无需远程 SSH</span>
                </td>
                <td>
                  <VTextField
                    v-model="item.download_path"
                    density="compact"
                    variant="outlined"
                    :placeholder="item.mode === 'ssh' ? '取 SSH 节点默认远程路径' : '取 MP DOWNLOAD_PATH'"
                    hide-details
                  />
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCard>
      </div>

      <!-- Tab 3: SSH 远程服务器节点管理 -->
      <div v-show="currentTab === 'ssh'">
        <div class="d-flex justify-space-between align-center mb-3">
          <div class="text-caption text-medium-emphasis">
            配置可供远程下载器访问的 SSH 服务器凭据，支持密码与密钥认证
          </div>
          <VBtn color="primary" prepend-icon="mdi-plus" size="small" @click="openAddNodeDialog">
            新增 SSH 节点
          </VBtn>
        </div>

        <VRow dense>
          <VCol v-if="!localConfig.ssh_nodes.length" cols="12">
            <VCard variant="outlined" class="text-center py-8 text-medium-emphasis">
              <VIcon icon="mdi-server-network-off" size="40" class="mb-2" /><br />
              暂无已配置的 SSH 远程节点，点击右上角「新增 SSH 节点」进行配置
            </VCard>
          </VCol>

          <VCol v-for="(node, idx) in localConfig.ssh_nodes" :key="node.id || idx" cols="12" md="6">
            <VCard variant="outlined" class="pa-3">
              <div class="d-flex justify-space-between align-center mb-2">
                <div class="d-flex align-center gap-2">
                  <VIcon icon="mdi-server" color="primary" />
                  <span class="font-weight-bold text-subtitle-2">{{ node.name }}</span>
                </div>
                <div>
                  <VBtn
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="mr-1"
                    prepend-icon="mdi-pencil"
                    @click="openEditNodeDialog(idx)"
                  >
                    编辑
                  </VBtn>
                  <VBtn
                    size="x-small"
                    variant="tonal"
                    color="error"
                    prepend-icon="mdi-delete"
                    @click="deleteNode(idx)"
                  >
                    删除
                  </VBtn>
                </div>
              </div>

              <div class="text-body-2 font-monospace text-medium-emphasis mb-1">
                {{ node.username }}@{{ node.host }}:{{ node.port || 22 }}
              </div>
              <div class="text-caption text-medium-emphasis mb-2 font-monospace">
                远程路径：{{ node.remote_path || '未指定' }}
              </div>

              <!-- 连接测试状态 -->
              <div class="d-flex align-center justify-space-between pt-2 border-t">
                <VBtn
                  size="x-small"
                  variant="outlined"
                  color="info"
                  prepend-icon="mdi-lightning-bolt"
                  :loading="testingSsh[node.id]"
                  @click="testSshConnection(node, node.id)"
                >
                  测试连接
                </VBtn>
                <div v-if="sshTestResults[node.id]" class="text-caption">
                  <span v-if="sshTestResults[node.id].code === 0" class="text-success font-weight-bold">
                    ✓ {{ sshTestResults[node.id].msg }}
                  </span>
                  <span v-else class="text-error" :title="sshTestResults[node.id].msg">
                    ✗ {{ sshTestResults[node.id].msg }}
                  </span>
                </div>
              </div>
            </VCard>
          </VCol>
        </VRow>
      </div>
    </div>

    <!-- 底部保存/取消控制条 -->
    <VDivider />
    <div class="d-flex justify-end gap-2 pa-3">
      <VBtn variant="text" @click="emit('close')">取消</VBtn>
      <VBtn color="primary" :loading="saving" prepend-icon="mdi-content-save" @click="saveConfig">
        保存全部配置
      </VBtn>
    </div>

    <!-- 对话框：编辑/添加 SSH 节点 -->
    <VDialog v-model="nodeDialog" max-width="580" persistent>
      <VCard class="pa-4">
        <VCardTitle class="text-h6 font-weight-bold px-0 pt-0">
          {{ isEditingNode ? '编辑远程 SSH 节点' : '新增远程 SSH 节点' }}
        </VCardTitle>

        <VRow dense class="mt-2">
          <VCol cols="12" md="8">
            <VTextField v-model="nodeForm.name" label="节点别名 (用于标识)" placeholder="例如: 群晖 NAS" density="comfortable" />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField v-model="nodeForm.port" type="number" label="SSH 端口" placeholder="22" density="comfortable" />
          </VCol>

          <VCol cols="12" md="8">
            <VTextField v-model="nodeForm.host" label="主机地址 (IP 或域名)" placeholder="例如: 192.168.1.50" density="comfortable" />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField v-model="nodeForm.username" label="SSH 用户名" placeholder="root 或 admin" density="comfortable" />
          </VCol>

          <VCol cols="12">
            <VSelect
              v-model="nodeForm.auth_type"
              :items="[
                { title: '密码认证 (Password)', value: 'password' },
                { title: '私钥认证 (Private Key)', value: 'key' }
              ]"
              label="认证方式"
              density="comfortable"
            />
          </VCol>

          <VCol v-if="nodeForm.auth_type === 'password'" cols="12">
            <VTextField
              v-model="nodeForm.password"
              type="password"
              label="SSH 密码"
              placeholder="输入远程服务器密码"
              density="comfortable"
            />
          </VCol>

          <VCol v-else cols="12">
            <VTextarea
              v-model="nodeForm.private_key"
              label="SSH 私钥文本 (PEM / OpenSSH / RSA)"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
              density="comfortable"
              rows="4"
            />
          </VCol>

          <VCol cols="12">
            <VTextField
              v-model="nodeForm.remote_path"
              label="默认远程下载根目录"
              placeholder="例如: /volume1/downloads"
              density="comfortable"
              hint="该机器上 qBittorrent / Transmission 保存种子的根物理路径"
              persistent-hint
            />
          </VCol>
        </VRow>

        <div v-if="sshTestResults['modal']" class="my-2">
          <VAlert
            :type="sshTestResults['modal'].code === 0 ? 'success' : 'error'"
            variant="tonal"
            density="compact"
          >
            {{ sshTestResults['modal'].msg }}
          </VAlert>
        </div>

        <div class="d-flex justify-space-between align-center mt-4">
          <VBtn
            variant="outlined"
            size="small"
            color="info"
            prepend-icon="mdi-lightning-bolt"
            :loading="testingSsh['modal']"
            @click="testSshConnection(nodeForm, 'modal')"
          >
            测试连通性
          </VBtn>

          <div class="d-flex gap-2">
            <VBtn variant="text" @click="nodeDialog = false">取消</VBtn>
            <VBtn color="primary" @click="saveNode">确定</VBtn>
          </div>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.void-config-wrap {
  max-width: 900px;
  margin: 0 auto;
}

/* 顶部 Tab 导航条容器 */
.void-tabs-nav-bar {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.15);
}

.void-nav-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 纯净无污染的独立 Tab 胶囊项 */
.void-nav-tab {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  height: 38px !important;
  min-height: 38px !important;
  max-height: 38px !important;
  padding: 0 16px !important;
  margin: 0 !important;
  border-radius: 8px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.03) !important;
  color: rgba(255, 255, 255, 0.7) !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
  cursor: pointer !important;
  outline: none !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  user-select: none !important;
  white-space: nowrap !important;
  vertical-align: middle !important;
}

.void-nav-tab:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

/* 激活状态的高亮紫底药丸：外边框尺寸与未激活项完全 1:1 绝对一致 */
.void-nav-tab--active {
  color: #fff !important;
  background: #8b5cf6 !important;
  border-color: #8b5cf6 !important;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4) !important;
}

.void-tab-icon {
  opacity: 0.9 !important;
  font-size: 18px !important;
  width: 18px !important;
  height: 18px !important;
}

.void-tab-title {
  line-height: 1 !important;
}

/* 自研角标 */
.void-tab-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 18px !important;
  min-width: 18px !important;
  padding: 0 5px !important;
  font-size: 0.7rem !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  border-radius: 9999px !important;
  background: rgba(255, 255, 255, 0.25) !important;
  color: #fff !important;
  box-sizing: border-box !important;
}

.void-nav-tab--active .void-tab-badge {
  background: rgba(0, 0, 0, 0.3) !important;
}

.font-monospace {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
