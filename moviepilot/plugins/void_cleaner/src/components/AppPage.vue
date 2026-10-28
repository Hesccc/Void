<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
  navKey: { type: String, default: 'main' },
  hideTitle: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'switch'])

const base = computed(() => `plugin/${props.pluginId || 'VoidCleaner'}`)

const loading = ref(false)
const scanning = ref(false)
const deleting = ref(false)
const clearingHistory = ref(false)
const message = ref('')
const error = ref('')
const searchQuery = ref('')
const sortOrder = ref('size_desc')
const itemsPerPage = ref(15)
const currentPage = ref(1)
const selectedNodeFilter = ref('all')

const status = ref({
  status: 'idle',
  last_scan_time: '--',
  last_message: '尚未执行扫描',
  total_files_scanned: 0,
  unseeded_count: 0,
  unseeded_size_mb: 0.0,
  cleaned_count: 0,
  unseeded_files: []
})
const selectedPaths = ref(new Set())
let timer = null

function unwrap(response) {
  if (response && Object.prototype.hasOwnProperty.call(response, 'data') && response.success !== undefined) {
    return response.data
  }
  return response?.data ?? response
}

function errorText(err) {
  if (!err) return '未知错误'
  return err.message || String(err)
}

function formatSize(mb) {
  const num = Number(mb) || 0
  if (num < 1024) return `${num.toFixed(1)} MB`
  return `${(num / 1024).toFixed(2)} GB`
}

function getFileName(p) {
  if (!p) return ''
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

function getFileDir(p) {
  if (!p) return ''
  const parts = p.split(/[/\\]/)
  if (parts.length <= 1) return ''
  parts.pop()
  return parts.join('/')
}

const rawFiles = computed(() => status.value.unseeded_files || [])

// 节点筛选下拉项
const nodeFilterOptions = computed(() => {
  const nodes = new Map()
  nodes.set('all', { title: '全部节点与下载器', value: 'all' })
  rawFiles.value.forEach(f => {
    const key = f.node_id || f.storage_type || 'local'
    const name = f.node_name || (f.storage_type === 'ssh' ? '远程 SSH' : '本地挂载')
    if (!nodes.has(key)) {
      nodes.set(key, { title: `${name} (${f.storage_type === 'ssh' ? 'SSH' : 'Local'})`, value: key })
    }
  })
  return Array.from(nodes.values())
})

// 搜索、节点过滤与排序
const filteredFiles = computed(() => {
  let list = rawFiles.value

  // 节点过滤
  if (selectedNodeFilter.value !== 'all') {
    list = list.filter(item => {
      const key = item.node_id || item.storage_type || 'local'
      return key === selectedNodeFilter.value
    })
  }

  // 搜索关键字
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(item => (item.path || '').toLowerCase().includes(q))
  }

  // 排序
  const copy = [...list]
  if (sortOrder.value === 'size_desc') {
    copy.sort((a, b) => (b.size_mb || 0) - (a.size_mb || 0))
  } else if (sortOrder.value === 'size_asc') {
    copy.sort((a, b) => (a.size_mb || 0) - (b.size_mb || 0))
  } else if (sortOrder.value === 'time_desc') {
    copy.sort((a, b) => (b.time || '').localeCompare(a.time || ''))
  } else if (sortOrder.value === 'path_asc') {
    copy.sort((a, b) => (a.path || '').localeCompare(b.path || ''))
  }
  return copy
})

// 分页列表
const pageCount = computed(() => Math.ceil(filteredFiles.value.length / itemsPerPage.value) || 1)
const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredFiles.value.slice(start, start + itemsPerPage.value)
})

// 全选当前页
const allPageSelected = computed({
  get() {
    if (!paginatedFiles.value.length) return false
    return paginatedFiles.value.every(f => selectedPaths.value.has(f.path))
  },
  set(val) {
    const next = new Set(selectedPaths.value)
    if (val) {
      paginatedFiles.value.forEach(f => next.add(f.path))
    } else {
      paginatedFiles.value.forEach(f => next.delete(f.path))
    }
    selectedPaths.value = next
  }
})

function selectAllGlobally() {
  selectedPaths.value = new Set(filteredFiles.value.map(f => f.path))
}

function clearSelection() {
  selectedPaths.value = new Set()
}

function toggleSelect(path) {
  const next = new Set(selectedPaths.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  selectedPaths.value = next
}

async function loadStatus() {
  loading.value = true
  try {
    const data = unwrap(await props.api.get(`${base.value}/status`))
    if (data && typeof data === 'object') {
      status.value = data
      if (data.status === 'running') {
        startPolling()
      } else {
        stopPolling()
      }
    }
  } catch (err) {
    error.value = `读取状态失败：${errorText(err)}`
  } finally {
    loading.value = false
  }
}

async function triggerScan() {
  scanning.value = true
  error.value = ''
  message.value = ''
  try {
    const data = unwrap(await props.api.post(`${base.value}/scan`, {}))
    message.value = data?.msg || '扫描任务已在后台成功启动！'
    startPolling()
    await loadStatus()
  } catch (err) {
    error.value = `触发扫描失败：${errorText(err)}`
  } finally {
    scanning.value = false
  }
}

async function deleteFiles(files) {
  if (!files || !files.length) return
  if (!confirm(`确定清理选中的 ${files.length} 个文件吗？`)) return
  deleting.value = true
  error.value = ''
  try {
    const data = unwrap(await props.api.post(`${base.value}/delete`, { files }))
    message.value = data?.msg || `已成功清理 ${files.length} 个文件`
    files.forEach(p => selectedPaths.value.delete(p))
    await loadStatus()
  } catch (err) {
    error.value = `清理失败：${errorText(err)}`
  } finally {
    deleting.value = false
  }
}

function deleteSelected() {
  deleteFiles(Array.from(selectedPaths.value))
}

async function clearHistory() {
  if (!rawFiles.value.length) return
  if (!confirm("确定要清空历史扫描记录吗？\n（说明：这不会删除您磁盘上的任何文件，仅重置并清空当前的审计结果列表）")) return
  clearingHistory.value = true
  error.value = ''
  try {
    const data = unwrap(await props.api.post(`${base.value}/clear_history`, {}))
    message.value = data?.msg || '已成功清空扫描记录'
    selectedPaths.value = new Set()
    await loadStatus()
  } catch (err) {
    error.value = `清空记录失败：${errorText(err)}`
  } finally {
    clearingHistory.value = false
  }
}

function startPolling() {
  if (timer) return
  timer = window.setInterval(() => {
    loadStatus()
  }, 2500)
}

function stopPolling() {
  if (!timer) return
  window.clearInterval(timer)
  timer = null
}

onMounted(() => {
  loadStatus()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="void-page">
    <!-- 头部栏 -->
    <div v-if="!props.hideTitle" class="d-flex align-center justify-space-between mb-4 flex-wrap gap-3">
      <div class="d-flex align-center gap-3">
        <VAvatar color="primary" rounded="lg" size="48" class="text-h5 font-weight-bold text-white shadow-sm">
          V
        </VAvatar>
        <div>
          <div class="text-h6 font-weight-bold d-flex align-center gap-2">
            Void 冗余文件清理工作台
            <VChip size="x-small" color="success" variant="flat">v1.1.0 (SSH 多节点支持)</VChip>
          </div>
          <div class="text-caption text-medium-emphasis">
            已支持本地挂载与自定义远程 SSH 节点下载器无感混部扫描，Inode 穿透保护绝不误删同源硬链接
          </div>
        </div>
      </div>
      <div class="d-flex align-center gap-2">
        <VBtn
          variant="outlined"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="loadStatus"
        >
          刷新
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="mdi-play"
          :loading="scanning || status.status === 'running'"
          @click="triggerScan"
        >
          {{ status.status === 'running' ? '扫描进行中...' : '立即扫描' }}
        </VBtn>
        <VBtn
          variant="tonal"
          prepend-icon="mdi-cog-outline"
          @click="emit('switch')"
        >
          配置 &amp; SSH 节点
        </VBtn>
      </div>
    </div>

    <!-- 提示消息 -->
    <VAlert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" closable @click:close="error = ''">
      {{ error }}
    </VAlert>
    <VAlert v-if="message" type="info" variant="tonal" density="compact" class="mb-3" closable @click:close="message = ''">
      {{ message }}
    </VAlert>

    <!-- 顶部状态看板 -->
    <VRow dense class="mb-3">
      <VCol cols="12" sm="6" md="3">
        <VCard variant="tonal" color="warning" class="h-100 pa-3">
          <div class="d-flex justify-space-between align-center">
            <span class="text-caption font-weight-bold text-uppercase">待清理冗余文件</span>
            <VIcon icon="mdi-alert-circle-outline" size="20" />
          </div>
          <div class="text-h4 font-weight-bold my-1">
            {{ status.unseeded_count || 0 }}
            <span class="text-body-2 font-weight-regular text-medium-emphasis">个文件</span>
          </div>
          <div class="text-subtitle-2 font-weight-bold text-warning">
            占用容量：{{ formatSize(status.unseeded_size_mb) }}
          </div>
        </VCard>
      </VCol>

      <VCol cols="12" sm="6" md="3">
        <VCard variant="tonal" color="success" class="h-100 pa-3">
          <div class="d-flex justify-space-between align-center">
            <span class="text-caption font-weight-bold text-uppercase">累计清理释放</span>
            <VIcon icon="mdi-delete-sweep-outline" size="20" />
          </div>
          <div class="text-h4 font-weight-bold my-1 text-success">
            {{ status.cleaned_count || 0 }}
            <span class="text-body-2 font-weight-regular text-medium-emphasis">个文件</span>
          </div>
          <div class="text-caption text-success font-weight-medium">
            已物理删除或安全移入回收站
          </div>
        </VCard>
      </VCol>

      <VCol cols="12" sm="6" md="3">
        <VCard variant="outlined" class="h-100 pa-3">
          <div class="d-flex justify-space-between align-center">
            <span class="text-caption font-weight-bold text-uppercase">最近扫描概况</span>
            <VIcon icon="mdi-history" size="20" />
          </div>
          <div class="text-subtitle-1 font-weight-bold my-1 font-monospace">
            {{ status.last_scan_time || '--' }}
          </div>
          <div class="text-caption text-medium-emphasis text-truncate" :title="status.last_message">
            {{ status.last_message || '--' }}
          </div>
        </VCard>
      </VCol>

      <VCol cols="12" sm="6" md="3">
        <VCard variant="outlined" class="h-100 pa-3">
          <div class="d-flex justify-space-between align-center">
            <span class="text-caption font-weight-bold text-uppercase text-info">扫描引擎架构</span>
            <VIcon icon="mdi-shield-check" size="20" color="info" />
          </div>
          <div class="text-subtitle-1 font-weight-bold my-1 text-info d-flex align-center gap-1">
            <VIcon icon="mdi-server-network" size="18" />
            本地 + 远程 SSH 双模核验
          </div>
          <div class="text-caption text-medium-emphasis">
            已扫描 {{ status.total_files_scanned || 0 }} 项，Inode 硬链接穿透保护
          </div>
        </VCard>
      </VCol>
    </VRow>

    <!-- 过滤器与控制栏 -->
    <VCard variant="outlined" class="mb-3">
      <VCardText class="py-2">
        <VRow dense align="center">
          <VCol cols="12" sm="6" md="3">
            <VSelect
              v-model="selectedNodeFilter"
              :items="nodeFilterOptions"
              density="compact"
              variant="outlined"
              label="节点 / 来源筛选"
              hide-details
            />
          </VCol>
          <VCol cols="12" sm="6" md="3">
            <VTextField
              v-model="searchQuery"
              density="compact"
              variant="outlined"
              placeholder="搜索文件名或路径..."
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
            />
          </VCol>
          <VCol cols="6" sm="6" md="2">
            <VSelect
              v-model="sortOrder"
              :items="[
                { title: '文件大小降序 (大到小)', value: 'size_desc' },
                { title: '文件大小升序 (小到大)', value: 'size_asc' },
                { title: '修改时间最新', value: 'time_desc' },
                { title: '文件路径字典序', value: 'path_asc' },
              ]"
              density="compact"
              variant="outlined"
              label="排序方式"
              hide-details
            />
          </VCol>
          <VCol cols="6" sm="6" md="1">
            <VSelect
              v-model="itemsPerPage"
              :items="[10, 15, 25, 50, 100]"
              density="compact"
              variant="outlined"
              label="分页"
              hide-details
            />
          </VCol>
          <VCol cols="12" md="3" class="d-flex justify-end align-center flex-wrap gap-2">
            <VBtn
              v-if="selectedPaths.size > 0"
              color="error"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              :loading="deleting"
              @click="deleteSelected"
            >
              清理选中 ({{ selectedPaths.size }})
            </VBtn>
            <VBtn
              v-if="selectedPaths.size > 0"
              variant="text"
              size="small"
              @click="clearSelection"
            >
              取消勾选
            </VBtn>
            <VBtn
              v-if="selectedPaths.size < filteredFiles.length && filteredFiles.length > 0"
              variant="tonal"
              size="small"
              @click="selectAllGlobally"
            >
              全选 ({{ filteredFiles.length }})
            </VBtn>
            <VBtn
              v-if="rawFiles.length > 0 && selectedPaths.size === 0"
              variant="outlined"
              color="secondary"
              size="small"
              prepend-icon="mdi-broom"
              title="清空并重置当前的扫描结果列表（不删除真实文件）"
              :loading="clearingHistory"
              @click="clearHistory"
            >
              清空记录
            </VBtn>
            <VBtn
              color="primary"
              size="small"
              prepend-icon="mdi-play"
              title="点击此按钮立即运行冗余文件扫描任务"
              :loading="scanning || status.status === 'running'"
              @click="triggerScan"
            >
              {{ status.status === 'running' ? '扫描中' : '立即运行' }}
            </VBtn>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <!-- 冗余文件审计列表 -->
    <VCard variant="outlined">
      <VTable density="comfortable" hover>
        <thead>
          <tr>
            <th style="width: 48px;" class="text-center">
              <VCheckboxBtn v-model="allPageSelected" />
            </th>
            <th style="width: 170px;">所属节点 / 下载器</th>
            <th>文件名称 / 物理位置</th>
            <th style="width: 130px;" class="text-right">占用容量</th>
            <th style="width: 170px;" class="text-center">修改时间</th>
            <th style="width: 90px;" class="text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filteredFiles.length">
            <td colspan="6" class="text-center py-10 text-medium-emphasis">
              <VIcon icon="mdi-check-decagram-outline" color="success" size="48" class="mb-2" /><br />
              <div class="text-subtitle-1 font-weight-bold mt-1">本地与远程下载目录整洁</div>
              <div class="text-caption">未发现任何未做种且未建立硬链接的孤儿文件</div>
            </td>
          </tr>
          <tr v-for="item in paginatedFiles" :key="item.path">
            <td class="text-center">
              <VCheckboxBtn
                :model-value="selectedPaths.has(item.path)"
                @update:model-value="toggleSelect(item.path)"
              />
            </td>
            <td>
              <VChip
                :color="item.storage_type === 'ssh' ? 'info' : 'secondary'"
                size="x-small"
                variant="tonal"
                class="font-weight-medium"
              >
                <VIcon :icon="item.storage_type === 'ssh' ? 'mdi-server-network' : 'mdi-harddisk'" start size="14" />
                {{ item.node_name || '本地' }}
              </VChip>
              <div v-if="item.downloader" class="text-caption text-medium-emphasis mt-1">
                {{ item.downloader }}
              </div>
            </td>
            <td>
              <div class="font-weight-bold text-body-2 d-flex align-center gap-1">
                <VIcon icon="mdi-file-outline" size="18" color="medium-emphasis" />
                <span>{{ getFileName(item.path) }}</span>
              </div>
              <div class="text-caption text-medium-emphasis font-monospace text-truncate" style="max-width: 550px;" :title="item.path">
                {{ getFileDir(item.path) || '/' }}
              </div>
            </td>
            <td class="text-right font-monospace text-warning font-weight-bold">
              {{ formatSize(item.size_mb) }}
            </td>
            <td class="text-center font-monospace text-caption text-medium-emphasis">
              {{ item.time || '--' }}
            </td>
            <td class="text-center">
              <VBtn
                size="x-small"
                variant="tonal"
                color="error"
                prepend-icon="mdi-trash-can-outline"
                @click="deleteFiles([item.path])"
              >
                清理
              </VBtn>
            </td>
          </tr>
        </tbody>
      </VTable>

      <VDivider v-if="pageCount > 1" />

      <div v-if="pageCount > 1" class="d-flex justify-space-between align-center px-4 py-2">
        <span class="text-caption text-medium-emphasis">
          共 {{ filteredFiles.length }} 条记录，第 {{ currentPage }} / {{ pageCount }} 页
        </span>
        <VPagination
          v-model="currentPage"
          :length="pageCount"
          total-visible="7"
          density="compact"
        />
      </div>
    </VCard>
  </div>
</template>

<style scoped>
.void-page {
  padding: 16px 20px 32px;
}
.font-monospace {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
