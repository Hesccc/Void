import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createTextVNode:_createTextVNode,resolveComponent:_resolveComponent,withCtx:_withCtx,createVNode:_createVNode,createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,createBlock:_createBlock,renderList:_renderList,Fragment:_Fragment} = await importShared('vue');


const _hoisted_1 = { class: "void-page" };
const _hoisted_2 = {
  key: 0,
  class: "d-flex align-center justify-space-between mb-4 flex-wrap gap-3"
};
const _hoisted_3 = { class: "d-flex align-center gap-3" };
const _hoisted_4 = { class: "text-h6 font-weight-bold d-flex align-center gap-2" };
const _hoisted_5 = { class: "d-flex align-center gap-2" };
const _hoisted_6 = { class: "d-flex justify-space-between align-center" };
const _hoisted_7 = { class: "text-h4 font-weight-bold my-1" };
const _hoisted_8 = { class: "text-subtitle-2 font-weight-bold text-warning" };
const _hoisted_9 = { class: "d-flex justify-space-between align-center" };
const _hoisted_10 = { class: "text-h4 font-weight-bold my-1 text-success" };
const _hoisted_11 = { class: "d-flex justify-space-between align-center" };
const _hoisted_12 = { class: "text-subtitle-1 font-weight-bold my-1 font-monospace" };
const _hoisted_13 = ["title"];
const _hoisted_14 = { class: "d-flex justify-space-between align-center" };
const _hoisted_15 = { class: "text-subtitle-1 font-weight-bold my-1 text-info d-flex align-center gap-1" };
const _hoisted_16 = { class: "text-caption text-medium-emphasis" };
const _hoisted_17 = {
  style: {"width":"48px"},
  class: "text-center"
};
const _hoisted_18 = { key: 0 };
const _hoisted_19 = {
  colspan: "6",
  class: "text-center py-10 text-medium-emphasis"
};
const _hoisted_20 = { class: "text-center" };
const _hoisted_21 = {
  key: 0,
  class: "text-caption text-medium-emphasis mt-1"
};
const _hoisted_22 = { class: "font-weight-bold text-body-2 d-flex align-center gap-1" };
const _hoisted_23 = ["title"];
const _hoisted_24 = { class: "text-right font-monospace text-warning font-weight-bold" };
const _hoisted_25 = { class: "text-center font-monospace text-caption text-medium-emphasis" };
const _hoisted_26 = { class: "text-center" };
const _hoisted_27 = {
  key: 1,
  class: "d-flex justify-space-between align-center px-4 py-2"
};
const _hoisted_28 = { class: "text-caption text-medium-emphasis" };

const {computed,onMounted,onUnmounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: {
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
  navKey: { type: String, default: 'main' },
  hideTitle: { type: Boolean, default: false },
},
  emits: ['close', 'switch'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const base = computed(() => `plugin/${props.pluginId || 'VoidCleaner'}`);

const loading = ref(false);
const scanning = ref(false);
const deleting = ref(false);
const message = ref('');
const error = ref('');
const searchQuery = ref('');
const sortOrder = ref('size_desc');
const itemsPerPage = ref(15);
const currentPage = ref(1);
const selectedNodeFilter = ref('all');

const status = ref({
  status: 'idle',
  last_scan_time: '--',
  last_message: '尚未执行扫描',
  total_files_scanned: 0,
  unseeded_count: 0,
  unseeded_size_mb: 0.0,
  cleaned_count: 0,
  unseeded_files: []
});
const selectedPaths = ref(new Set());
let timer = null;

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
  const num = Number(mb) || 0;
  if (num < 1024) return `${num.toFixed(1)} MB`
  return `${(num / 1024).toFixed(2)} GB`
}

function getFileName(p) {
  if (!p) return ''
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p
}

function getFileDir(p) {
  if (!p) return ''
  const parts = p.split(/[/\\]/);
  if (parts.length <= 1) return ''
  parts.pop();
  return parts.join('/')
}

const rawFiles = computed(() => status.value.unseeded_files || []);

// 节点筛选下拉项
const nodeFilterOptions = computed(() => {
  const nodes = new Map();
  nodes.set('all', { title: '全部节点与下载器', value: 'all' });
  rawFiles.value.forEach(f => {
    const key = f.node_id || f.storage_type || 'local';
    const name = f.node_name || (f.storage_type === 'ssh' ? '远程 SSH' : '本地挂载');
    if (!nodes.has(key)) {
      nodes.set(key, { title: `${name} (${f.storage_type === 'ssh' ? 'SSH' : 'Local'})`, value: key });
    }
  });
  return Array.from(nodes.values())
});

// 搜索、节点过滤与排序
const filteredFiles = computed(() => {
  let list = rawFiles.value;

  // 节点过滤
  if (selectedNodeFilter.value !== 'all') {
    list = list.filter(item => {
      const key = item.node_id || item.storage_type || 'local';
      return key === selectedNodeFilter.value
    });
  }

  // 搜索关键字
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(item => (item.path || '').toLowerCase().includes(q));
  }

  // 排序
  const copy = [...list];
  if (sortOrder.value === 'size_desc') {
    copy.sort((a, b) => (b.size_mb || 0) - (a.size_mb || 0));
  } else if (sortOrder.value === 'size_asc') {
    copy.sort((a, b) => (a.size_mb || 0) - (b.size_mb || 0));
  } else if (sortOrder.value === 'time_desc') {
    copy.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  } else if (sortOrder.value === 'path_asc') {
    copy.sort((a, b) => (a.path || '').localeCompare(b.path || ''));
  }
  return copy
});

// 分页列表
const pageCount = computed(() => Math.ceil(filteredFiles.value.length / itemsPerPage.value) || 1);
const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredFiles.value.slice(start, start + itemsPerPage.value)
});

// 全选当前页
const allPageSelected = computed({
  get() {
    if (!paginatedFiles.value.length) return false
    return paginatedFiles.value.every(f => selectedPaths.value.has(f.path))
  },
  set(val) {
    if (val) {
      paginatedFiles.value.forEach(f => selectedPaths.value.add(f.path));
    } else {
      paginatedFiles.value.forEach(f => selectedPaths.value.delete(f.path));
    }
  }
});

function selectAllGlobally() {
  selectedPaths.value = new Set(filteredFiles.value.map(f => f.path));
}

function clearSelection() {
  selectedPaths.value.clear();
}

function toggleSelect(path) {
  if (selectedPaths.value.has(path)) {
    selectedPaths.value.delete(path);
  } else {
    selectedPaths.value.add(path);
  }
}

async function loadStatus() {
  loading.value = true;
  try {
    const data = unwrap(await props.api.get(`${base.value}/status`));
    if (data && typeof data === 'object') {
      status.value = data;
      if (data.status === 'running') {
        startPolling();
      } else {
        stopPolling();
      }
    }
  } catch (err) {
    error.value = `读取状态失败：${errorText(err)}`;
  } finally {
    loading.value = false;
  }
}

async function triggerScan() {
  scanning.value = true;
  error.value = '';
  message.value = '';
  try {
    const data = unwrap(await props.api.post(`${base.value}/scan`, {}));
    message.value = data?.msg || '扫描任务已在后台成功启动！';
    startPolling();
    await loadStatus();
  } catch (err) {
    error.value = `触发扫描失败：${errorText(err)}`;
  } finally {
    scanning.value = false;
  }
}

async function deleteFiles(files) {
  if (!files || !files.length) return
  if (!confirm(`确定清理选中的 ${files.length} 个文件吗？`)) return
  deleting.value = true;
  error.value = '';
  try {
    const data = unwrap(await props.api.post(`${base.value}/delete`, { files }));
    message.value = data?.msg || `已成功清理 ${files.length} 个文件`;
    files.forEach(p => selectedPaths.value.delete(p));
    await loadStatus();
  } catch (err) {
    error.value = `清理失败：${errorText(err)}`;
  } finally {
    deleting.value = false;
  }
}

function deleteSelected() {
  deleteFiles(Array.from(selectedPaths.value));
}

function startPolling() {
  if (timer) return
  timer = window.setInterval(() => {
    loadStatus();
  }, 2500);
}

function stopPolling() {
  if (!timer) return
  window.clearInterval(timer);
  timer = null;
}

onMounted(() => {
  loadStatus();
});

onUnmounted(() => {
  stopPolling();
});

return (_ctx, _cache) => {
  const _component_VAvatar = _resolveComponent("VAvatar");
  const _component_VChip = _resolveComponent("VChip");
  const _component_VBtn = _resolveComponent("VBtn");
  const _component_VAlert = _resolveComponent("VAlert");
  const _component_VIcon = _resolveComponent("VIcon");
  const _component_VCard = _resolveComponent("VCard");
  const _component_VCol = _resolveComponent("VCol");
  const _component_VRow = _resolveComponent("VRow");
  const _component_VSelect = _resolveComponent("VSelect");
  const _component_VTextField = _resolveComponent("VTextField");
  const _component_VCardText = _resolveComponent("VCardText");
  const _component_VCheckboxBtn = _resolveComponent("VCheckboxBtn");
  const _component_VTable = _resolveComponent("VTable");
  const _component_VDivider = _resolveComponent("VDivider");
  const _component_VPagination = _resolveComponent("VPagination");

  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    (!props.hideTitle)
      ? (_openBlock(), _createElementBlock("div", _hoisted_2, [
          _createElementVNode("div", _hoisted_3, [
            _createVNode(_component_VAvatar, {
              color: "primary",
              rounded: "lg",
              size: "48",
              class: "text-h5 font-weight-bold text-white shadow-sm"
            }, {
              default: _withCtx(() => [...(_cache[9] || (_cache[9] = [
                _createTextVNode(" V ", -1)
              ]))]),
              _: 1
            }),
            _createElementVNode("div", null, [
              _createElementVNode("div", _hoisted_4, [
                _cache[11] || (_cache[11] = _createTextVNode(" Void 冗余文件清理工作台 ", -1)),
                _createVNode(_component_VChip, {
                  size: "x-small",
                  color: "success",
                  variant: "flat"
                }, {
                  default: _withCtx(() => [...(_cache[10] || (_cache[10] = [
                    _createTextVNode("v1.1.0 (SSH 多节点支持)", -1)
                  ]))]),
                  _: 1
                })
              ]),
              _cache[12] || (_cache[12] = _createElementVNode("div", { class: "text-caption text-medium-emphasis" }, " 已支持本地挂载与自定义远程 SSH 节点下载器无感混部扫描，Inode 穿透保护绝不误删同源硬链接 ", -1))
            ])
          ]),
          _createElementVNode("div", _hoisted_5, [
            _createVNode(_component_VBtn, {
              variant: "outlined",
              "prepend-icon": "mdi-refresh",
              loading: loading.value,
              onClick: loadStatus
            }, {
              default: _withCtx(() => [...(_cache[13] || (_cache[13] = [
                _createTextVNode(" 刷新 ", -1)
              ]))]),
              _: 1
            }, 8, ["loading"]),
            _createVNode(_component_VBtn, {
              color: "primary",
              "prepend-icon": "mdi-play",
              loading: scanning.value || status.value.status === 'running',
              onClick: triggerScan
            }, {
              default: _withCtx(() => [
                _createTextVNode(_toDisplayString(status.value.status === 'running' ? '扫描进行中...' : '立即扫描'), 1)
              ]),
              _: 1
            }, 8, ["loading"]),
            _createVNode(_component_VBtn, {
              variant: "tonal",
              "prepend-icon": "mdi-cog-outline",
              onClick: _cache[0] || (_cache[0] = $event => (emit('switch')))
            }, {
              default: _withCtx(() => [...(_cache[14] || (_cache[14] = [
                _createTextVNode(" 配置 & SSH 节点 ", -1)
              ]))]),
              _: 1
            })
          ])
        ]))
      : _createCommentVNode("", true),
    (error.value)
      ? (_openBlock(), _createBlock(_component_VAlert, {
          key: 1,
          type: "error",
          variant: "tonal",
          density: "compact",
          class: "mb-3",
          closable: "",
          "onClick:close": _cache[1] || (_cache[1] = $event => (error.value = ''))
        }, {
          default: _withCtx(() => [
            _createTextVNode(_toDisplayString(error.value), 1)
          ]),
          _: 1
        }))
      : _createCommentVNode("", true),
    (message.value)
      ? (_openBlock(), _createBlock(_component_VAlert, {
          key: 2,
          type: "info",
          variant: "tonal",
          density: "compact",
          class: "mb-3",
          closable: "",
          "onClick:close": _cache[2] || (_cache[2] = $event => (message.value = ''))
        }, {
          default: _withCtx(() => [
            _createTextVNode(_toDisplayString(message.value), 1)
          ]),
          _: 1
        }))
      : _createCommentVNode("", true),
    _createVNode(_component_VRow, {
      dense: "",
      class: "mb-3"
    }, {
      default: _withCtx(() => [
        _createVNode(_component_VCol, {
          cols: "12",
          sm: "6",
          md: "3"
        }, {
          default: _withCtx(() => [
            _createVNode(_component_VCard, {
              variant: "tonal",
              color: "warning",
              class: "h-100 pa-3"
            }, {
              default: _withCtx(() => [
                _createElementVNode("div", _hoisted_6, [
                  _cache[15] || (_cache[15] = _createElementVNode("span", { class: "text-caption font-weight-bold text-uppercase" }, "待清理冗余文件", -1)),
                  _createVNode(_component_VIcon, {
                    icon: "mdi-alert-circle-outline",
                    size: "20"
                  })
                ]),
                _createElementVNode("div", _hoisted_7, [
                  _createTextVNode(_toDisplayString(status.value.unseeded_count || 0) + " ", 1),
                  _cache[16] || (_cache[16] = _createElementVNode("span", { class: "text-body-2 font-weight-regular text-medium-emphasis" }, "个文件", -1))
                ]),
                _createElementVNode("div", _hoisted_8, " 占用容量：" + _toDisplayString(formatSize(status.value.unseeded_size_mb)), 1)
              ]),
              _: 1
            })
          ]),
          _: 1
        }),
        _createVNode(_component_VCol, {
          cols: "12",
          sm: "6",
          md: "3"
        }, {
          default: _withCtx(() => [
            _createVNode(_component_VCard, {
              variant: "tonal",
              color: "success",
              class: "h-100 pa-3"
            }, {
              default: _withCtx(() => [
                _createElementVNode("div", _hoisted_9, [
                  _cache[17] || (_cache[17] = _createElementVNode("span", { class: "text-caption font-weight-bold text-uppercase" }, "累计清理释放", -1)),
                  _createVNode(_component_VIcon, {
                    icon: "mdi-delete-sweep-outline",
                    size: "20"
                  })
                ]),
                _createElementVNode("div", _hoisted_10, [
                  _createTextVNode(_toDisplayString(status.value.cleaned_count || 0) + " ", 1),
                  _cache[18] || (_cache[18] = _createElementVNode("span", { class: "text-body-2 font-weight-regular text-medium-emphasis" }, "个文件", -1))
                ]),
                _cache[19] || (_cache[19] = _createElementVNode("div", { class: "text-caption text-success font-weight-medium" }, " 已物理删除或安全移入回收站 ", -1))
              ]),
              _: 1
            })
          ]),
          _: 1
        }),
        _createVNode(_component_VCol, {
          cols: "12",
          sm: "6",
          md: "3"
        }, {
          default: _withCtx(() => [
            _createVNode(_component_VCard, {
              variant: "outlined",
              class: "h-100 pa-3"
            }, {
              default: _withCtx(() => [
                _createElementVNode("div", _hoisted_11, [
                  _cache[20] || (_cache[20] = _createElementVNode("span", { class: "text-caption font-weight-bold text-uppercase" }, "最近扫描概况", -1)),
                  _createVNode(_component_VIcon, {
                    icon: "mdi-history",
                    size: "20"
                  })
                ]),
                _createElementVNode("div", _hoisted_12, _toDisplayString(status.value.last_scan_time || '--'), 1),
                _createElementVNode("div", {
                  class: "text-caption text-medium-emphasis text-truncate",
                  title: status.value.last_message
                }, _toDisplayString(status.value.last_message || '--'), 9, _hoisted_13)
              ]),
              _: 1
            })
          ]),
          _: 1
        }),
        _createVNode(_component_VCol, {
          cols: "12",
          sm: "6",
          md: "3"
        }, {
          default: _withCtx(() => [
            _createVNode(_component_VCard, {
              variant: "outlined",
              class: "h-100 pa-3"
            }, {
              default: _withCtx(() => [
                _createElementVNode("div", _hoisted_14, [
                  _cache[21] || (_cache[21] = _createElementVNode("span", { class: "text-caption font-weight-bold text-uppercase text-info" }, "扫描引擎架构", -1)),
                  _createVNode(_component_VIcon, {
                    icon: "mdi-shield-check",
                    size: "20",
                    color: "info"
                  })
                ]),
                _createElementVNode("div", _hoisted_15, [
                  _createVNode(_component_VIcon, {
                    icon: "mdi-server-network",
                    size: "18"
                  }),
                  _cache[22] || (_cache[22] = _createTextVNode(" 本地 + 远程 SSH 双模核验 ", -1))
                ]),
                _createElementVNode("div", _hoisted_16, " 已扫描 " + _toDisplayString(status.value.total_files_scanned || 0) + " 项，Inode 硬链接穿透保护 ", 1)
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ]),
      _: 1
    }),
    _createVNode(_component_VCard, {
      variant: "outlined",
      class: "mb-3"
    }, {
      default: _withCtx(() => [
        _createVNode(_component_VCardText, { class: "py-2" }, {
          default: _withCtx(() => [
            _createVNode(_component_VRow, {
              dense: "",
              align: "center"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "3"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VSelect, {
                      modelValue: selectedNodeFilter.value,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((selectedNodeFilter).value = $event)),
                      items: nodeFilterOptions.value,
                      density: "compact",
                      variant: "outlined",
                      label: "节点 / 来源筛选",
                      "hide-details": ""
                    }, null, 8, ["modelValue", "items"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "3"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: searchQuery.value,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((searchQuery).value = $event)),
                      density: "compact",
                      variant: "outlined",
                      placeholder: "搜索文件名或路径...",
                      "prepend-inner-icon": "mdi-magnify",
                      "hide-details": "",
                      clearable: ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "6",
                  md: "2"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VSelect, {
                      modelValue: sortOrder.value,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = $event => ((sortOrder).value = $event)),
                      items: [
                { title: '文件大小降序 (大到小)', value: 'size_desc' },
                { title: '文件大小升序 (小到大)', value: 'size_asc' },
                { title: '修改时间最新', value: 'time_desc' },
                { title: '文件路径字典序', value: 'path_asc' },
              ],
                      density: "compact",
                      variant: "outlined",
                      label: "排序方式",
                      "hide-details": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "6",
                  md: "1"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VSelect, {
                      modelValue: itemsPerPage.value,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = $event => ((itemsPerPage).value = $event)),
                      items: [10, 15, 25, 50, 100],
                      density: "compact",
                      variant: "outlined",
                      label: "分页",
                      "hide-details": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "3",
                  class: "d-flex justify-end align-center gap-2"
                }, {
                  default: _withCtx(() => [
                    (selectedPaths.value.size > 0)
                      ? (_openBlock(), _createBlock(_component_VBtn, {
                          key: 0,
                          color: "error",
                          size: "small",
                          "prepend-icon": "mdi-trash-can-outline",
                          loading: deleting.value,
                          onClick: deleteSelected
                        }, {
                          default: _withCtx(() => [
                            _createTextVNode(" 清理选中 (" + _toDisplayString(selectedPaths.value.size) + ") ", 1)
                          ]),
                          _: 1
                        }, 8, ["loading"]))
                      : _createCommentVNode("", true),
                    (selectedPaths.value.size > 0)
                      ? (_openBlock(), _createBlock(_component_VBtn, {
                          key: 1,
                          variant: "text",
                          size: "small",
                          onClick: clearSelection
                        }, {
                          default: _withCtx(() => [...(_cache[23] || (_cache[23] = [
                            _createTextVNode(" 取消勾选 ", -1)
                          ]))]),
                          _: 1
                        }))
                      : _createCommentVNode("", true),
                    (selectedPaths.value.size < filteredFiles.value.length && filteredFiles.value.length > 0)
                      ? (_openBlock(), _createBlock(_component_VBtn, {
                          key: 2,
                          variant: "tonal",
                          size: "small",
                          onClick: selectAllGlobally
                        }, {
                          default: _withCtx(() => [
                            _createTextVNode(" 全选 (" + _toDisplayString(filteredFiles.value.length) + ") ", 1)
                          ]),
                          _: 1
                        }))
                      : _createCommentVNode("", true),
                    _createVNode(_component_VBtn, {
                      color: "primary",
                      size: "small",
                      "prepend-icon": "mdi-play",
                      title: "点击此按钮立即运行冗余文件扫描任务",
                      loading: scanning.value || status.value.status === 'running',
                      onClick: triggerScan
                    }, {
                      default: _withCtx(() => [
                        _createTextVNode(_toDisplayString(status.value.status === 'running' ? '扫描中' : '立即运行'), 1)
                      ]),
                      _: 1
                    }, 8, ["loading"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ]),
      _: 1
    }),
    _createVNode(_component_VCard, { variant: "outlined" }, {
      default: _withCtx(() => [
        _createVNode(_component_VTable, {
          density: "comfortable",
          hover: ""
        }, {
          default: _withCtx(() => [
            _createElementVNode("thead", null, [
              _createElementVNode("tr", null, [
                _createElementVNode("th", _hoisted_17, [
                  _createVNode(_component_VCheckboxBtn, {
                    modelValue: allPageSelected.value,
                    "onUpdate:modelValue": _cache[7] || (_cache[7] = $event => ((allPageSelected).value = $event))
                  }, null, 8, ["modelValue"])
                ]),
                _cache[24] || (_cache[24] = _createElementVNode("th", { style: {"width":"170px"} }, "所属节点 / 下载器", -1)),
                _cache[25] || (_cache[25] = _createElementVNode("th", null, "文件名称 / 物理位置", -1)),
                _cache[26] || (_cache[26] = _createElementVNode("th", {
                  style: {"width":"130px"},
                  class: "text-right"
                }, "占用容量", -1)),
                _cache[27] || (_cache[27] = _createElementVNode("th", {
                  style: {"width":"170px"},
                  class: "text-center"
                }, "修改时间", -1)),
                _cache[28] || (_cache[28] = _createElementVNode("th", {
                  style: {"width":"90px"},
                  class: "text-center"
                }, "操作", -1))
              ])
            ]),
            _createElementVNode("tbody", null, [
              (!filteredFiles.value.length)
                ? (_openBlock(), _createElementBlock("tr", _hoisted_18, [
                    _createElementVNode("td", _hoisted_19, [
                      _createVNode(_component_VIcon, {
                        icon: "mdi-check-decagram-outline",
                        color: "success",
                        size: "48",
                        class: "mb-2"
                      }),
                      _cache[29] || (_cache[29] = _createElementVNode("br", null, null, -1)),
                      _cache[30] || (_cache[30] = _createElementVNode("div", { class: "text-subtitle-1 font-weight-bold mt-1" }, "本地与远程下载目录整洁", -1)),
                      _cache[31] || (_cache[31] = _createElementVNode("div", { class: "text-caption" }, "未发现任何未做种且未建立硬链接的孤儿文件", -1))
                    ])
                  ]))
                : _createCommentVNode("", true),
              (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(paginatedFiles.value, (item) => {
                return (_openBlock(), _createElementBlock("tr", {
                  key: item.path
                }, [
                  _createElementVNode("td", _hoisted_20, [
                    _createVNode(_component_VCheckboxBtn, {
                      "model-value": selectedPaths.value.has(item.path),
                      "onUpdate:modelValue": $event => (toggleSelect(item.path))
                    }, null, 8, ["model-value", "onUpdate:modelValue"])
                  ]),
                  _createElementVNode("td", null, [
                    _createVNode(_component_VChip, {
                      color: item.storage_type === 'ssh' ? 'info' : 'secondary',
                      size: "x-small",
                      variant: "tonal",
                      class: "font-weight-medium"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_VIcon, {
                          icon: item.storage_type === 'ssh' ? 'mdi-server-network' : 'mdi-harddisk',
                          start: "",
                          size: "14"
                        }, null, 8, ["icon"]),
                        _createTextVNode(" " + _toDisplayString(item.node_name || '本地'), 1)
                      ]),
                      _: 2
                    }, 1032, ["color"]),
                    (item.downloader)
                      ? (_openBlock(), _createElementBlock("div", _hoisted_21, _toDisplayString(item.downloader), 1))
                      : _createCommentVNode("", true)
                  ]),
                  _createElementVNode("td", null, [
                    _createElementVNode("div", _hoisted_22, [
                      _createVNode(_component_VIcon, {
                        icon: "mdi-file-outline",
                        size: "18",
                        color: "medium-emphasis"
                      }),
                      _createElementVNode("span", null, _toDisplayString(getFileName(item.path)), 1)
                    ]),
                    _createElementVNode("div", {
                      class: "text-caption text-medium-emphasis font-monospace text-truncate",
                      style: {"max-width":"550px"},
                      title: item.path
                    }, _toDisplayString(getFileDir(item.path) || '/'), 9, _hoisted_23)
                  ]),
                  _createElementVNode("td", _hoisted_24, _toDisplayString(formatSize(item.size_mb)), 1),
                  _createElementVNode("td", _hoisted_25, _toDisplayString(item.time || '--'), 1),
                  _createElementVNode("td", _hoisted_26, [
                    _createVNode(_component_VBtn, {
                      size: "x-small",
                      variant: "tonal",
                      color: "error",
                      "prepend-icon": "mdi-trash-can-outline",
                      onClick: $event => (deleteFiles([item.path]))
                    }, {
                      default: _withCtx(() => [...(_cache[32] || (_cache[32] = [
                        _createTextVNode(" 清理 ", -1)
                      ]))]),
                      _: 1
                    }, 8, ["onClick"])
                  ])
                ]))
              }), 128))
            ])
          ]),
          _: 1
        }),
        (pageCount.value > 1)
          ? (_openBlock(), _createBlock(_component_VDivider, { key: 0 }))
          : _createCommentVNode("", true),
        (pageCount.value > 1)
          ? (_openBlock(), _createElementBlock("div", _hoisted_27, [
              _createElementVNode("span", _hoisted_28, " 共 " + _toDisplayString(filteredFiles.value.length) + " 条记录，第 " + _toDisplayString(currentPage.value) + " / " + _toDisplayString(pageCount.value) + " 页 ", 1),
              _createVNode(_component_VPagination, {
                modelValue: currentPage.value,
                "onUpdate:modelValue": _cache[8] || (_cache[8] = $event => ((currentPage).value = $event)),
                length: pageCount.value,
                "total-visible": "7",
                density: "compact"
              }, null, 8, ["modelValue", "length"])
            ]))
          : _createCommentVNode("", true)
      ]),
      _: 1
    })
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-e44c9d54"]]);

export { AppPage as default };
