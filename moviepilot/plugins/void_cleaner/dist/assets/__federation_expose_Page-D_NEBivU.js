import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import AppPage from './__federation_expose_AppPage-CZmFb--J.js';

const {openBlock:_openBlock,createBlock:_createBlock} = await importShared('vue');


const _sfc_main = {
  __name: 'Page',
  props: {
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
},
  emits: ['close', 'switch'],
  setup(__props, { emit: __emit }) {

const props = __props;

const emit = __emit;

return (_ctx, _cache) => {
  return (_openBlock(), _createBlock(AppPage, {
    api: props.api,
    "plugin-id": props.pluginId,
    "hide-title": "",
    onClose: _cache[0] || (_cache[0] = $event => (emit('close'))),
    onSwitch: _cache[1] || (_cache[1] = $event => (emit('switch')))
  }, null, 8, ["api", "plugin-id"]))
}
}

};

export { _sfc_main as default };
