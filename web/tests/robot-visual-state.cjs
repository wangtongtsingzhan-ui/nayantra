const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/map/robotVisualState.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const visual = {};
vm.runInNewContext(js, { exports: visual });
const state = (mode, extra = {}) => ({ mode, online: true, charging: false, e_stop: false, ...extra });
test('activity effects follow the reported mode', () => {
  for (const mode of ['moving', 'acting', 'charging', 'waiting', 'paused', 'idle', 'offline']) {
    assert.equal(visual.robotVisualState(state(mode)), mode);
  }
});
test('fault, emergency stop and offline override charging or motion', () => {
  assert.equal(visual.robotVisualState(state('moving', { e_stop: true, charging: true })), 'error');
  assert.equal(visual.robotVisualState(state('error', { online: false, charging: true })), 'error');
  assert.equal(visual.robotVisualState(state('emergency_stop', { online: false })), 'error');
  assert.equal(visual.robotVisualState(state('moving', { online: false, charging: true })), 'offline');
  assert.equal(visual.robotVisualState(state('idle', { charging: true })), 'charging');
});

test('routes receive distinct colors that survive robot list changes', () => {
  const colorSource = fs.readFileSync('src/map/routeColors.ts', 'utf8');
  const colorJs = ts.transpileModule(colorSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const colors = {};
  vm.runInNewContext(colorJs, { exports: colors });
  const assigned = new Map();
  const ids = Array.from({ length: 30 }, (_, i) => `robot-${i}`);
  colors.assignRouteColors(ids, assigned);
  assert.equal(new Set(assigned.values()).size, ids.length);
  const first = assigned.get('robot-5');
  colors.assignRouteColors(['robot-5', 'new-robot'], assigned);
  assert.equal(assigned.get('robot-5'), first);
  assert.notEqual(assigned.get('new-robot'), first);
  const initial = new Map();
  colors.assignRouteColors([...ids].reverse(), initial);
  for (const id of ids) assert.equal(initial.get(id), assigned.get(id));
});
