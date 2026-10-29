import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);

// Run the real fallback component's handlers without a browser or extra test
// dependencies. Only React's scheduling and DOM focus boundary are substituted.
function menuHarness(language = 'en') {
  const hooks = [], effects = [], modules = new Map(), document = new EventTarget();
  let cursor = 0, tree, followed = 0, focus;
  const props = { language, onFollow: () => followed++ };
  const hook = initial => { const index = cursor++; return hooks[index] ??= { value: initial }; };
  const platform = {
    ...React,
    useState(initial) { const slot = hook(initial); return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useRef(initial) { return hook({ current: initial }).value; },
    useId() { return hook('gary-test-menu').value; },
    useEffect(callback, deps) { const slot = hook(undefined); if (!slot.deps || deps.some((value, index) => value !== slot.deps[index])) { effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); }); slot.deps = deps; } },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} }; modules.set(file, loaded);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const dependency = id => id === 'react' ? platform : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
    vm.runInThisContext('(function(exports,require,module,document){' + code + '\n})', { filename: file })(loaded.exports, dependency, loaded, document);
    return loaded.exports;
  }
  function expand(element) {
    if (!React.isValidElement(element)) return element;
    if (typeof element.type === 'function') return expand(element.type(element.props));
    return { type: element.type, props: element.props, children: React.Children.toArray(element.props.children).map(expand) };
  }
  const findAll = (type, node = tree) => !node || typeof node !== 'object' ? [] : [...(node.type === type ? [node] : []), ...(node.children || []).flatMap(child => findAll(type, child))];
  const summary = { focus: () => { focus = 'summary'; } }, linkNodes = new Map();
  const details = {
    contains: target => target === summary || [...linkNodes.values()].includes(target),
    querySelectorAll: () => findAll('a').map(link => { if (!linkNodes.has(link.props.href)) linkNodes.set(link.props.href, { focus: () => { focus = link.props.href; } }); return linkNodes.get(link.props.href); }),
  };
  const { GaryAppsMenu } = load(root + '/shared/gary-apps/gary-apps.tsx');
  function render(next = {}) {
    Object.assign(props, next); cursor = 0; tree = expand(GaryAppsMenu(props));
    tree.props.ref.current = details; findAll('summary')[0].props.ref.current = summary;
    details.querySelectorAll(); while (effects.length) effects.shift()();
    return tree;
  }
  function toggle() { findAll('summary')[0].props.onClick({ preventDefault() {} }); render(); }
  render();
  return { render, toggle, findAll, details, summary, document, get tree() { return tree; }, get followed() { return followed; }, get focus() { return focus; } };
}

test('the Customer Connect fallback treats all Gary services as external sites', () => {
  const h = menuHarness(), links = h.findAll('a');
  assert.deepEqual(links.slice(0, 3).map(link => link.props.href), ['https://garyhome.vn/', 'https://jobs.garyhome.vn/', 'https://visa.garyhome.vn/']);
  assert.equal(links.length, 5);
  for (const link of links) { assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noopener noreferrer'); }
  assert.ok(!JSON.stringify(h.tree).includes('This site'));
});

test('a touch blur keeps the tapped service link available until activation', () => {
  const h = menuHarness(); h.toggle();
  h.tree.props.onBlur({ currentTarget: h.details, relatedTarget: null }); h.render();
  assert.equal(h.tree.props.open, true, 'blur without a focus destination must not hide the tapped link');
  h.findAll('a')[1].props.onClick(); h.render();
  assert.equal(h.followed, 1); assert.equal(h.tree.props.open, false);
});

test('language updates retain the open menu while known outside focus and outside taps close it', () => {
  const h = menuHarness(); h.toggle(); h.render({ language: 'vi' });
  assert.equal(h.tree.props.open, true); assert.equal(h.findAll('summary')[0].props['aria-label'], 'Khám phá các trang và dịch vụ Gary');
  for (const name of ['Tìm Nhà', 'Tìm Việc', 'Dịch Vụ Visa']) assert.ok(JSON.stringify(h.tree).includes(name), name);
  h.tree.props.onBlur({ currentTarget: h.details, relatedTarget: {} }); h.render(); assert.equal(h.tree.props.open, false);
  h.toggle(); h.document.dispatchEvent(new Event('pointerdown')); h.render(); assert.equal(h.tree.props.open, false);
});

test('keyboard opening and Escape preserve focus access to the service links', async () => {
  const h = menuHarness(); let prevented = false;
  h.tree.props.onKeyDown({ key: 'ArrowDown', target: h.summary, preventDefault() { prevented = true; }, stopPropagation() {} }); h.render();
  await Promise.resolve(); assert.equal(prevented, true); assert.equal(h.tree.props.open, true); assert.equal(h.focus, 'https://garyhome.vn/');
  h.tree.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); h.render();
  assert.equal(h.tree.props.open, false); assert.equal(h.focus, 'summary');
});
