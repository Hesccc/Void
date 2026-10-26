import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {resolveComponent:_resolveComponent,createVNode:_createVNode,createElementVNode:_createElementVNode,normalizeClass:_normalizeClass,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,withCtx:_withCtx,vShow:_vShow,withDirectives:_withDirectives,createTextVNode:_createTextVNode,renderList:_renderList,Fragment:_Fragment,createBlock:_createBlock} = await importShared('vue');


const _hoisted_1 = { class: "void-config-wrap" };
const _hoisted_2 = { class: "void-tabs-nav-bar" };
const _hoisted_3 = { class: "void-nav-container" };
const _hoisted_4 = {
  key: 0,
  class: "void-tab-badge"
};
const _hoisted_5 = {
  key: 0,
  class: "void-tab-badge void-tab-badge--info"
};
const _hoisted_6 = { class: "pa-4" };
const _hoisted_7 = { class: "text-subtitle-2 font-weight-bold d-flex align-center gap-2 mb-2" };
const _hoisted_8 = { key: 0 };
const _hoisted_9 = { class: "text-center" };
const _hoisted_10 = { class: "font-weight-bold" };
const _hoisted_11 = {
  key: 1,
  class: "text-caption text-medium-emphasis"
};
const _hoisted_12 = { class: "d-flex justify-space-between align-center mb-3" };
const _hoisted_13 = { class: "d-flex justify-space-between align-center mb-2" };
const _hoisted_14 = { class: "d-flex align-center gap-2" };
const _hoisted_15 = { class: "font-weight-bold text-subtitle-2" };
const _hoisted_16 = { class: "text-body-2 font-monospace text-medium-emphasis mb-1" };
const _hoisted_17 = { class: "text-caption text-medium-emphasis mb-2 font-monospace" };
const _hoisted_18 = { class: "d-flex align-center justify-space-between pt-2 border-t" };
const _hoisted_19 = {
  key: 0,
  class: "text-caption"
};
const _hoisted_20 = {
  key: 0,
  class: "text-success font-weight-bold"
};
const _hoisted_21 = ["title"];
const _hoisted_22 = { class: "d-flex justify-end gap-2 pa-3" };
const _hoisted_23 = {
  key: 0,
  class: "my-2"
};
const _hoisted_24 = { class: "d-flex justify-space-between align-center mt-4" };
const _hoisted_25 = { class: "d-flex gap-2" };

const {computed,onMounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'Config',
  props: {
  initialConfig: { type: Object, default: () => ({}) },
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
},
  emits: ['save', 'close', 'layout'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

const base = computed(() => `plugin/${props.pluginId || 'VoidCleaner'}`);

const currentTab = ref('general');
const saving = ref(false);
const loadingDownloaders = ref(false);
const testingSsh = ref({});
const sshTestResults = ref({});

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
});

// 系统下载器列表
const systemDownloaders = ref([]);

// 对话框：编辑/新增 SSH 节点
const nodeDialog = ref(false);
const isEditingNode = ref(false);
const editingNodeIndex = ref(-1);
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
});

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
  };
}

async function loadSystemDownloaders() {
  loadingDownloaders.value = true;
  try {
    const res = unwrap(await props.api.get(`${base.value}/downloaders`));
    if (res && res.downloaders) {
      systemDownloaders.value = res.downloaders;

      // 初始化 mapping
      const existingMap = new Map((localConfig.value.downloader_mappings || []).map(m => [m.downloader_name, m]));
      const mergedMappings = [];
      systemDownloaders.value.forEach(dl => {
        if (existingMap.has(dl.name)) {
          mergedMappings.push({ ...existingMap.get(dl.name) });
        } else {
          mergedMappings.push({
            downloader_name: dl.name,
            enabled: true,
            mode: 'local',
            ssh_node_id: '',
            download_path: ''
          });
        }
      });
      localConfig.value.downloader_mappings = mergedMappings;
    }
  } catch (err) {
    console.error('加载系统下载器失败:', err);
  } finally {
    loadingDownloaders.value = false;
  }
}

// 打开添加节点弹窗
function openAddNodeDialog() {
  isEditingNode.value = false;
  editingNodeIndex.value = -1;
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
  };
  nodeDialog.value = true;
}

// 打开编辑节点弹窗
function openEditNodeDialog(index) {
  isEditingNode.value = true;
  editingNodeIndex.value = index;
  nodeForm.value = { ...localConfig.value.ssh_nodes[index] };
  nodeDialog.value = true;
}

// 保存节点
function saveNode() {
  if (!nodeForm.value.name || !nodeForm.value.host || !nodeForm.value.username) {
    alert('请填写节点名称、主机 IP 和 SSH 用户名！');
    return
  }
  if (isEditingNode.value && editingNodeIndex.value >= 0) {
    localConfig.value.ssh_nodes.splice(editingNodeIndex.value, 1, { ...nodeForm.value });
  } else {
    localConfig.value.ssh_nodes.push({ ...nodeForm.value });
  }
  nodeDialog.value = false;
}

// 删除节点
function deleteNode(index) {
  const node = localConfig.value.ssh_nodes[index];
  if (!confirm(`确定删除 SSH 节点 "${node.name}" 吗？`)) return
  localConfig.value.ssh_nodes.splice(index, 1);

  // 清除对应的映射绑定
  localConfig.value.downloader_mappings.forEach(m => {
    if (m.ssh_node_id === node.id) {
      m.mode = 'local';
      m.ssh_node_id = '';
    }
  });
}

// 测试 SSH 连通性
async function testSshConnection(node, testKey = 'default') {
  testingSsh.value[testKey] = true;
  sshTestResults.value[testKey] = null;
  try {
    const res = unwrap(await props.api.post(`${base.value}/ssh/test`, node));
    sshTestResults.value[testKey] = res;
  } catch (err) {
    sshTestResults.value[testKey] = {
      code: 1,
      msg: `测试异常: ${err?.message || err}`
    };
  } finally {
    testingSsh.value[testKey] = false;
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
});

function saveConfig() {
  saving.value = true;
  const payload = {
    ...localConfig.value,
    min_size_mb: Number(localConfig.value.min_size_mb) || 0,
    exclude_patterns: localConfig.value.exclude_patterns.split('\n').map(s => s.trim()).filter(Boolean)
  };
  emit('save', payload);
  window.setTimeout(() => {
    saving.value = false;
  }, 600);
}

onMounted(async () => {
  emit('layout', { maxWidth: '75rem' });
  if (props.initialConfig && Object.keys(props.initialConfig).length) {
    applyConfig(props.initialConfig);
  }
  await loadSystemDownloaders();
});

return (_ctx, _cache) => {
  const _component_VIcon = _resolveComponent("VIcon");
  const _component_VSwitch = _resolveComponent("VSwitch");
  const _component_VCol = _resolveComponent("VCol");
  const _component_VTextField = _resolveComponent("VTextField");
  const _component_VTextarea = _resolveComponent("VTextarea");
  const _component_VDivider = _resolveComponent("VDivider");
  const _component_VRow = _resolveComponent("VRow");
  const _component_VAlert = _resolveComponent("VAlert");
  const _component_VCheckboxBtn = _resolveComponent("VCheckboxBtn");
  const _component_VSelect = _resolveComponent("VSelect");
  const _component_VTable = _resolveComponent("VTable");
  const _component_VCard = _resolveComponent("VCard");
  const _component_VBtn = _resolveComponent("VBtn");
  const _component_VCardTitle = _resolveComponent("VCardTitle");
  const _component_VDialog = _resolveComponent("VDialog");

  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    _createElementVNode("div", _hoisted_2, [
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("button", {
          type: "button",
          class: _normalizeClass(["void-nav-tab", { 'void-nav-tab--active': currentTab.value === 'general' }]),
          onClick: _cache[0] || (_cache[0] = $event => (currentTab.value = 'general'))
        }, [
          _createVNode(_component_VIcon, {
            icon: "mdi-tune",
            size: "18",
            class: "void-tab-icon"
          }),
          _cache[24] || (_cache[24] = _createElementVNode("span", { class: "void-tab-title" }, "基础设置", -1))
        ], 2),
        _createElementVNode("button", {
          type: "button",
          class: _normalizeClass(["void-nav-tab", { 'void-nav-tab--active': currentTab.value === 'downloaders' }]),
          onClick: _cache[1] || (_cache[1] = $event => (currentTab.value = 'downloaders'))
        }, [
          _createVNode(_component_VIcon, {
            icon: "mdi-download-network",
            size: "18",
            class: "void-tab-icon"
          }),
          _cache[25] || (_cache[25] = _createElementVNode("span", { class: "void-tab-title" }, "下载器与扫描范围", -1)),
          (localConfig.value.downloader_mappings.length)
            ? (_openBlock(), _createElementBlock("span", _hoisted_4, _toDisplayString(localConfig.value.downloader_mappings.filter(m => m.enabled).length), 1))
            : _createCommentVNode("", true)
        ], 2),
        _createElementVNode("button", {
          type: "button",
          class: _normalizeClass(["void-nav-tab", { 'void-nav-tab--active': currentTab.value === 'ssh' }]),
          onClick: _cache[2] || (_cache[2] = $event => (currentTab.value = 'ssh'))
        }, [
          _createVNode(_component_VIcon, {
            icon: "mdi-server-network",
            size: "18",
            class: "void-tab-icon"
          }),
          _cache[26] || (_cache[26] = _createElementVNode("span", { class: "void-tab-title" }, "SSH 远程服务器", -1)),
          (localConfig.value.ssh_nodes.length)
            ? (_openBlock(), _createElementBlock("span", _hoisted_5, _toDisplayString(localConfig.value.ssh_nodes.length), 1))
            : _createCommentVNode("", true)
        ], 2)
      ])
    ]),
    _createElementVNode("div", _hoisted_6, [
      _withDirectives(_createElementVNode("div", null, [
        _createVNode(_component_VRow, { dense: "" }, {
          default: _withCtx(() => [
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VSwitch, {
                  modelValue: localConfig.value.enabled,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((localConfig.value.enabled) = $event)),
                  label: "启用插件主服务",
                  color: "primary",
                  "hide-details": ""
                }, null, 8, ["modelValue"]),
                _cache[27] || (_cache[27] = _createElementVNode("div", { class: "text-caption text-medium-emphasis mt-1" }, "控制插件生命周期与后台定时巡检任务", -1))
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VSwitch, {
                  modelValue: localConfig.value.enable_auto_remove,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((localConfig.value.enable_auto_remove) = $event)),
                  label: "自动清理未做种文件",
                  color: "primary",
                  "hide-details": ""
                }, null, 8, ["modelValue"]),
                _cache[28] || (_cache[28] = _createElementVNode("div", { class: "text-caption text-medium-emphasis mt-1" }, "关闭时仅输出审计清单，供用户在工作台手动复核与清理", -1))
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VSwitch, {
                  modelValue: localConfig.value.enable_recycle_bin,
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = $event => ((localConfig.value.enable_recycle_bin) = $event)),
                  label: "移入回收站（防误删）",
                  color: "primary",
                  "hide-details": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VTextField, {
                  modelValue: localConfig.value.recycle_bin_path,
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = $event => ((localConfig.value.recycle_bin_path) = $event)),
                  label: "回收站保存路径",
                  placeholder: "./.trash",
                  density: "comfortable",
                  hint: "相对路径时自动保存在对应下载目录的子文件夹中",
                  "persistent-hint": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VTextField, {
                  modelValue: localConfig.value.min_size_mb,
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = $event => ((localConfig.value.min_size_mb) = $event)),
                  type: "number",
                  label: "文件大小过滤阈值 (MB)",
                  density: "comfortable",
                  hint: "仅检测大于此大小的文件，保护字幕、NFO 等微型非媒体文件",
                  "persistent-hint": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VTextField, {
                  modelValue: localConfig.value.cron,
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = $event => ((localConfig.value.cron) = $event)),
                  label: "定时清理周期 (Cron表达式)",
                  density: "comfortable",
                  placeholder: "0 3 * * *",
                  hint: "默认每日凌晨 3:00 自动执行一次",
                  "persistent-hint": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VTextarea, {
                  modelValue: localConfig.value.exclude_patterns,
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = $event => ((localConfig.value.exclude_patterns) = $event)),
                  label: "全局排除路径 / 通配符匹配规则（每行一条）",
                  density: "comfortable",
                  rows: "3",
                  hint: "支持 glob 通配符，匹配的文件或文件夹会被彻底跳过",
                  "persistent-hint": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              class: "mt-4"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VDivider, { class: "mb-3" }),
                _createElementVNode("div", _hoisted_7, [
                  _createVNode(_component_VIcon, {
                    icon: "mdi-bell-ring-outline",
                    size: "18",
                    color: "primary"
                  }),
                  _cache[29] || (_cache[29] = _createElementVNode("span", null, "MoviePilot 原生消息推送配置", -1))
                ]),
                _cache[30] || (_cache[30] = _createElementVNode("div", { class: "text-caption text-medium-emphasis mb-3" }, " 巡检或清理完成后，直接调用 MoviePilot 消息中心统一广播至您已配置的渠道（企业微信、Telegram、网页端等） ", -1))
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VSwitch, {
                  modelValue: localConfig.value.notify_enabled,
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = $event => ((localConfig.value.notify_enabled) = $event)),
                  label: "开启清理任务通知推送",
                  color: "primary",
                  "hide-details": ""
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            _createVNode(_component_VCol, {
              cols: "12",
              md: "6"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VSwitch, {
                  modelValue: localConfig.value.notify_only_on_unseeded,
                  "onUpdate:modelValue": _cache[11] || (_cache[11] = $event => ((localConfig.value.notify_only_on_unseeded) = $event)),
                  label: "静默免打扰（仅发现冗余或执行清理时推送）",
                  color: "primary",
                  disabled: !localConfig.value.notify_enabled,
                  "hide-details": ""
                }, null, 8, ["modelValue", "disabled"])
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ], 512), [
        [_vShow, currentTab.value === 'general']
      ]),
      _withDirectives(_createElementVNode("div", null, [
        _createVNode(_component_VAlert, {
          type: "info",
          variant: "tonal",
          density: "compact",
          class: "mb-3"
        }, {
          default: _withCtx(() => [...(_cache[31] || (_cache[31] = [
            _createTextVNode(" 在此勾选需要核查孤儿文件的下载器。如果是远程机器上的下载器，请切换为「远程 SSH 服务器」并选择对应的节点，Void 将通过 SSH 远程进行无感核验与清理。 ", -1)
          ]))]),
          _: 1
        }),
        _createVNode(_component_VCard, { variant: "outlined" }, {
          default: _withCtx(() => [
            _createVNode(_component_VTable, {
              density: "comfortable",
              hover: ""
            }, {
              default: _withCtx(() => [
                _cache[33] || (_cache[33] = _createElementVNode("thead", null, [
                  _createElementVNode("tr", null, [
                    _createElementVNode("th", {
                      style: {"width":"70px"},
                      class: "text-center"
                    }, "启用"),
                    _createElementVNode("th", { style: {"width":"180px"} }, "下载器名称"),
                    _createElementVNode("th", { style: {"width":"170px"} }, "存储模式"),
                    _createElementVNode("th", { style: {"width":"220px"} }, "关联远程 SSH 节点"),
                    _createElementVNode("th", null, "扫描目录路径（留空取默认）")
                  ])
                ], -1)),
                _createElementVNode("tbody", null, [
                  (!localConfig.value.downloader_mappings.length)
                    ? (_openBlock(), _createElementBlock("tr", _hoisted_8, [...(_cache[32] || (_cache[32] = [
                        _createElementVNode("td", {
                          colspan: "5",
                          class: "text-center py-6 text-medium-emphasis"
                        }, " 暂未读取到下载器配置，可在 MoviePilot「设置」->「下载器」中添加 ", -1)
                      ]))]))
                    : _createCommentVNode("", true),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(localConfig.value.downloader_mappings, (item) => {
                    return (_openBlock(), _createElementBlock("tr", {
                      key: item.downloader_name
                    }, [
                      _createElementVNode("td", _hoisted_9, [
                        _createVNode(_component_VCheckboxBtn, {
                          modelValue: item.enabled,
                          "onUpdate:modelValue": $event => ((item.enabled) = $event),
                          color: "primary"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _createElementVNode("td", _hoisted_10, _toDisplayString(item.downloader_name), 1),
                      _createElementVNode("td", null, [
                        _createVNode(_component_VSelect, {
                          modelValue: item.mode,
                          "onUpdate:modelValue": $event => ((item.mode) = $event),
                          items: [
                      { title: '本地挂载目录', value: 'local' },
                      { title: '远程 SSH 节点', value: 'ssh' }
                    ],
                          density: "compact",
                          variant: "outlined",
                          "hide-details": ""
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _createElementVNode("td", null, [
                        (item.mode === 'ssh')
                          ? (_openBlock(), _createBlock(_component_VSelect, {
                              key: 0,
                              modelValue: item.ssh_node_id,
                              "onUpdate:modelValue": $event => ((item.ssh_node_id) = $event),
                              items: sshNodeOptions.value,
                              density: "compact",
                              variant: "outlined",
                              placeholder: "请选择绑定的 SSH 节点",
                              "hide-details": ""
                            }, null, 8, ["modelValue", "onUpdate:modelValue", "items"]))
                          : (_openBlock(), _createElementBlock("span", _hoisted_11, "无需远程 SSH"))
                      ]),
                      _createElementVNode("td", null, [
                        _createVNode(_component_VTextField, {
                          modelValue: item.download_path,
                          "onUpdate:modelValue": $event => ((item.download_path) = $event),
                          density: "compact",
                          variant: "outlined",
                          placeholder: item.mode === 'ssh' ? '取 SSH 节点默认远程路径' : '取 MP DOWNLOAD_PATH',
                          "hide-details": ""
                        }, null, 8, ["modelValue", "onUpdate:modelValue", "placeholder"])
                      ])
                    ]))
                  }), 128))
                ])
              ]),
              _: 1
            })
          ]),
          _: 1
        })
      ], 512), [
        [_vShow, currentTab.value === 'downloaders']
      ]),
      _withDirectives(_createElementVNode("div", null, [
        _createElementVNode("div", _hoisted_12, [
          _cache[35] || (_cache[35] = _createElementVNode("div", { class: "text-caption text-medium-emphasis" }, " 配置可供远程下载器访问的 SSH 服务器凭据，支持密码与密钥认证 ", -1)),
          _createVNode(_component_VBtn, {
            color: "primary",
            "prepend-icon": "mdi-plus",
            size: "small",
            onClick: openAddNodeDialog
          }, {
            default: _withCtx(() => [...(_cache[34] || (_cache[34] = [
              _createTextVNode(" 新增 SSH 节点 ", -1)
            ]))]),
            _: 1
          })
        ]),
        _createVNode(_component_VRow, { dense: "" }, {
          default: _withCtx(() => [
            (!localConfig.value.ssh_nodes.length)
              ? (_openBlock(), _createBlock(_component_VCol, {
                  key: 0,
                  cols: "12"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VCard, {
                      variant: "outlined",
                      class: "text-center py-8 text-medium-emphasis"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_VIcon, {
                          icon: "mdi-server-network-off",
                          size: "40",
                          class: "mb-2"
                        }),
                        _cache[36] || (_cache[36] = _createElementVNode("br", null, null, -1)),
                        _cache[37] || (_cache[37] = _createTextVNode(" 暂无已配置的 SSH 远程节点，点击右上角「新增 SSH 节点」进行配置 ", -1))
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }))
              : _createCommentVNode("", true),
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(localConfig.value.ssh_nodes, (node, idx) => {
              return (_openBlock(), _createBlock(_component_VCol, {
                key: node.id || idx,
                cols: "12",
                md: "6"
              }, {
                default: _withCtx(() => [
                  _createVNode(_component_VCard, {
                    variant: "outlined",
                    class: "pa-3"
                  }, {
                    default: _withCtx(() => [
                      _createElementVNode("div", _hoisted_13, [
                        _createElementVNode("div", _hoisted_14, [
                          _createVNode(_component_VIcon, {
                            icon: "mdi-server",
                            color: "primary"
                          }),
                          _createElementVNode("span", _hoisted_15, _toDisplayString(node.name), 1)
                        ]),
                        _createElementVNode("div", null, [
                          _createVNode(_component_VBtn, {
                            size: "x-small",
                            variant: "tonal",
                            color: "primary",
                            class: "mr-1",
                            "prepend-icon": "mdi-pencil",
                            onClick: $event => (openEditNodeDialog(idx))
                          }, {
                            default: _withCtx(() => [...(_cache[38] || (_cache[38] = [
                              _createTextVNode(" 编辑 ", -1)
                            ]))]),
                            _: 1
                          }, 8, ["onClick"]),
                          _createVNode(_component_VBtn, {
                            size: "x-small",
                            variant: "tonal",
                            color: "error",
                            "prepend-icon": "mdi-delete",
                            onClick: $event => (deleteNode(idx))
                          }, {
                            default: _withCtx(() => [...(_cache[39] || (_cache[39] = [
                              _createTextVNode(" 删除 ", -1)
                            ]))]),
                            _: 1
                          }, 8, ["onClick"])
                        ])
                      ]),
                      _createElementVNode("div", _hoisted_16, _toDisplayString(node.username) + "@" + _toDisplayString(node.host) + ":" + _toDisplayString(node.port || 22), 1),
                      _createElementVNode("div", _hoisted_17, " 远程路径：" + _toDisplayString(node.remote_path || '未指定'), 1),
                      _createElementVNode("div", _hoisted_18, [
                        _createVNode(_component_VBtn, {
                          size: "x-small",
                          variant: "outlined",
                          color: "info",
                          "prepend-icon": "mdi-lightning-bolt",
                          loading: testingSsh.value[node.id],
                          onClick: $event => (testSshConnection(node, node.id))
                        }, {
                          default: _withCtx(() => [...(_cache[40] || (_cache[40] = [
                            _createTextVNode(" 测试连接 ", -1)
                          ]))]),
                          _: 1
                        }, 8, ["loading", "onClick"]),
                        (sshTestResults.value[node.id])
                          ? (_openBlock(), _createElementBlock("div", _hoisted_19, [
                              (sshTestResults.value[node.id].code === 0)
                                ? (_openBlock(), _createElementBlock("span", _hoisted_20, " ✓ " + _toDisplayString(sshTestResults.value[node.id].msg), 1))
                                : (_openBlock(), _createElementBlock("span", {
                                    key: 1,
                                    class: "text-error",
                                    title: sshTestResults.value[node.id].msg
                                  }, " ✗ " + _toDisplayString(sshTestResults.value[node.id].msg), 9, _hoisted_21))
                            ]))
                          : _createCommentVNode("", true)
                      ])
                    ]),
                    _: 2
                  }, 1024)
                ]),
                _: 2
              }, 1024))
            }), 128))
          ]),
          _: 1
        })
      ], 512), [
        [_vShow, currentTab.value === 'ssh']
      ])
    ]),
    _createVNode(_component_VDivider),
    _createElementVNode("div", _hoisted_22, [
      _createVNode(_component_VBtn, {
        variant: "text",
        onClick: _cache[12] || (_cache[12] = $event => (emit('close')))
      }, {
        default: _withCtx(() => [...(_cache[41] || (_cache[41] = [
          _createTextVNode("取消", -1)
        ]))]),
        _: 1
      }),
      _createVNode(_component_VBtn, {
        color: "primary",
        loading: saving.value,
        "prepend-icon": "mdi-content-save",
        onClick: saveConfig
      }, {
        default: _withCtx(() => [...(_cache[42] || (_cache[42] = [
          _createTextVNode(" 保存全部配置 ", -1)
        ]))]),
        _: 1
      }, 8, ["loading"])
    ]),
    _createVNode(_component_VDialog, {
      modelValue: nodeDialog.value,
      "onUpdate:modelValue": _cache[23] || (_cache[23] = $event => ((nodeDialog).value = $event)),
      "max-width": "580",
      persistent: ""
    }, {
      default: _withCtx(() => [
        _createVNode(_component_VCard, { class: "pa-4" }, {
          default: _withCtx(() => [
            _createVNode(_component_VCardTitle, { class: "text-h6 font-weight-bold px-0 pt-0" }, {
              default: _withCtx(() => [
                _createTextVNode(_toDisplayString(isEditingNode.value ? '编辑远程 SSH 节点' : '新增远程 SSH 节点'), 1)
              ]),
              _: 1
            }),
            _createVNode(_component_VRow, {
              dense: "",
              class: "mt-2"
            }, {
              default: _withCtx(() => [
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "8"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: nodeForm.value.name,
                      "onUpdate:modelValue": _cache[13] || (_cache[13] = $event => ((nodeForm.value.name) = $event)),
                      label: "节点别名 (用于标识)",
                      placeholder: "例如: 群晖 NAS",
                      density: "comfortable"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "4"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: nodeForm.value.port,
                      "onUpdate:modelValue": _cache[14] || (_cache[14] = $event => ((nodeForm.value.port) = $event)),
                      type: "number",
                      label: "SSH 端口",
                      placeholder: "22",
                      density: "comfortable"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "8"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: nodeForm.value.host,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = $event => ((nodeForm.value.host) = $event)),
                      label: "主机地址 (IP 或域名)",
                      placeholder: "例如: 192.168.1.50",
                      density: "comfortable"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, {
                  cols: "12",
                  md: "4"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: nodeForm.value.username,
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = $event => ((nodeForm.value.username) = $event)),
                      label: "SSH 用户名",
                      placeholder: "root 或 admin",
                      density: "comfortable"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                _createVNode(_component_VCol, { cols: "12" }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VSelect, {
                      modelValue: nodeForm.value.auth_type,
                      "onUpdate:modelValue": _cache[17] || (_cache[17] = $event => ((nodeForm.value.auth_type) = $event)),
                      items: [
                { title: '密码认证 (Password)', value: 'password' },
                { title: '私钥认证 (Private Key)', value: 'key' }
              ],
                      label: "认证方式",
                      density: "comfortable"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                (nodeForm.value.auth_type === 'password')
                  ? (_openBlock(), _createBlock(_component_VCol, {
                      key: 0,
                      cols: "12"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_VTextField, {
                          modelValue: nodeForm.value.password,
                          "onUpdate:modelValue": _cache[18] || (_cache[18] = $event => ((nodeForm.value.password) = $event)),
                          type: "password",
                          label: "SSH 密码",
                          placeholder: "输入远程服务器密码",
                          density: "comfortable"
                        }, null, 8, ["modelValue"])
                      ]),
                      _: 1
                    }))
                  : (_openBlock(), _createBlock(_component_VCol, {
                      key: 1,
                      cols: "12"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_VTextarea, {
                          modelValue: nodeForm.value.private_key,
                          "onUpdate:modelValue": _cache[19] || (_cache[19] = $event => ((nodeForm.value.private_key) = $event)),
                          label: "SSH 私钥文本 (PEM / OpenSSH / RSA)",
                          placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----...",
                          density: "comfortable",
                          rows: "4"
                        }, null, 8, ["modelValue"])
                      ]),
                      _: 1
                    })),
                _createVNode(_component_VCol, { cols: "12" }, {
                  default: _withCtx(() => [
                    _createVNode(_component_VTextField, {
                      modelValue: nodeForm.value.remote_path,
                      "onUpdate:modelValue": _cache[20] || (_cache[20] = $event => ((nodeForm.value.remote_path) = $event)),
                      label: "默认远程下载根目录",
                      placeholder: "例如: /volume1/downloads",
                      density: "comfortable",
                      hint: "该机器上 qBittorrent / Transmission 保存种子的根物理路径",
                      "persistent-hint": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }),
            (sshTestResults.value['modal'])
              ? (_openBlock(), _createElementBlock("div", _hoisted_23, [
                  _createVNode(_component_VAlert, {
                    type: sshTestResults.value['modal'].code === 0 ? 'success' : 'error',
                    variant: "tonal",
                    density: "compact"
                  }, {
                    default: _withCtx(() => [
                      _createTextVNode(_toDisplayString(sshTestResults.value['modal'].msg), 1)
                    ]),
                    _: 1
                  }, 8, ["type"])
                ]))
              : _createCommentVNode("", true),
            _createElementVNode("div", _hoisted_24, [
              _createVNode(_component_VBtn, {
                variant: "outlined",
                size: "small",
                color: "info",
                "prepend-icon": "mdi-lightning-bolt",
                loading: testingSsh.value['modal'],
                onClick: _cache[21] || (_cache[21] = $event => (testSshConnection(nodeForm.value, 'modal')))
              }, {
                default: _withCtx(() => [...(_cache[43] || (_cache[43] = [
                  _createTextVNode(" 测试连通性 ", -1)
                ]))]),
                _: 1
              }, 8, ["loading"]),
              _createElementVNode("div", _hoisted_25, [
                _createVNode(_component_VBtn, {
                  variant: "text",
                  onClick: _cache[22] || (_cache[22] = $event => (nodeDialog.value = false))
                }, {
                  default: _withCtx(() => [...(_cache[44] || (_cache[44] = [
                    _createTextVNode("取消", -1)
                  ]))]),
                  _: 1
                }),
                _createVNode(_component_VBtn, {
                  color: "primary",
                  onClick: saveNode
                }, {
                  default: _withCtx(() => [...(_cache[45] || (_cache[45] = [
                    _createTextVNode("确定", -1)
                  ]))]),
                  _: 1
                })
              ])
            ])
          ]),
          _: 1
        })
      ]),
      _: 1
    }, 8, ["modelValue"])
  ]))
}
}

};
const Config = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-a6f874c9"]]);

export { Config as default };
