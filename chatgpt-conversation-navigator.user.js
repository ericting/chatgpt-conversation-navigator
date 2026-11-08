// ==UserScript==
// @name         ChatGPT 对话导航
// @namespace    https://github.com/EricTing/chatgpt-conversation-navigator
// @version      1.0.0
// @description  为 ChatGPT 页面生成包含用户提问和 AI 回答的对话导航，支持搜索和点击跳转。
// @author       EricTing
// @date         2026-11-08
// @license      MIT
// @homepageURL  https://github.com/EricTing/chatgpt-conversation-navigator
// @downloadURL  https://raw.githubusercontent.com/EricTing/chatgpt-conversation-navigator/main/chatgpt-conversation-navigator.user.js
// @updateURL    https://raw.githubusercontent.com/EricTing/chatgpt-conversation-navigator/main/chatgpt-conversation-navigator.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'vm-chatgpt-conversation-nav';
  const TOGGLE_ID = 'vm-chatgpt-conversation-nav-toggle';
  const STYLE_ID = 'vm-chatgpt-conversation-nav-style';
  const STORAGE_KEY = 'vm-chatgpt-conversation-nav-open';
  const MAX_PREVIEW_LENGTH = 120;
  const AUTO_COLLAPSE_ROUNDS = 5;

  const state = {
    open: localStorage.getItem(STORAGE_KEY) !== '0',
    entries: [],
    query: '',
    updateTimer: null,
    highlightTimer: null,
    contentCollapsed: false,
    collapseUserSet: false,
  };

  function addStyle(css) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  addStyle(`
    #${PANEL_ID}, #${TOGGLE_ID} {
      --cgn-bg: #ffffff;
      --cgn-border: rgba(0, 0, 0, .12);
      --cgn-muted: #6b7280;
      --cgn-text: #1f2937;
      --cgn-hover: #f3f4f6;
      --cgn-accent: #10a37f;
      --cgn-shadow: 0 10px 30px rgba(0, 0, 0, .16);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-sizing: border-box;
    }
    #${PANEL_ID} *, #${TOGGLE_ID} * { box-sizing: border-box; }
    #${PANEL_ID} {
      position: fixed;
      z-index: 2147483646;
      top: 68px;
      right: 16px;
      width: min(350px, calc(100vw - 32px));
      height: min(78vh, 760px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--cgn-text);
      background: var(--cgn-bg);
      border: 1px solid var(--cgn-border);
      border-radius: 14px;
      box-shadow: var(--cgn-shadow);
      font-size: 13px;
      transition: opacity .15s ease, transform .15s ease;
    }
    #${PANEL_ID}[data-open="false"] {
      opacity: 0;
      pointer-events: none;
      transform: translateX(12px);
    }
    #${PANEL_ID} .cgn-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 12px 8px;
      border-bottom: 1px solid var(--cgn-border);
    }
    #${PANEL_ID} .cgn-title {
      min-width: 0;
      font-size: 14px;
      font-weight: 700;
    }
    #${PANEL_ID} .cgn-count {
      margin-left: 5px;
      color: var(--cgn-muted);
      font-size: 11px;
      font-weight: 400;
    }
    #${PANEL_ID} .cgn-close {
      width: 26px;
      height: 26px;
      padding: 0;
      color: var(--cgn-muted);
      background: transparent;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      line-height: 26px;
    }
    #${PANEL_ID} .cgn-actions { display: flex; align-items: center; gap: 2px; }
    #${PANEL_ID} .cgn-minimize {
      width: 26px;
      height: 26px;
      padding: 0;
      color: var(--cgn-muted);
      background: transparent;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      line-height: 22px;
    }
    #${PANEL_ID} .cgn-close:hover,
    #${PANEL_ID} .cgn-minimize:hover { background: var(--cgn-hover); }
    #${PANEL_ID} .cgn-search-wrap { padding: 9px 12px; }
    #${PANEL_ID} .cgn-search {
      width: 100%;
      height: 32px;
      padding: 0 10px;
      color: var(--cgn-text);
      background: var(--cgn-hover);
      border: 1px solid transparent;
      border-radius: 8px;
      outline: none;
      font-size: 12px;
    }
    #${PANEL_ID} .cgn-search:focus {
      background: var(--cgn-bg);
      border-color: var(--cgn-accent);
    }
    #${PANEL_ID} .cgn-collapse-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 12px 9px;
    }
    #${PANEL_ID} .cgn-collapse {
      padding: 4px 8px;
      color: var(--cgn-accent);
      background: transparent;
      border: 1px solid rgba(16, 163, 127, .45);
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
    }
    #${PANEL_ID} .cgn-collapse:hover { background: var(--cgn-hover); }
    #${PANEL_ID} .cgn-collapse-note {
      color: var(--cgn-muted);
      font-size: 10px;
      white-space: nowrap;
    }
    #${PANEL_ID} .cgn-list {
      flex: 1;
      min-height: 0;
      padding: 0 8px 10px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    #${PANEL_ID} .cgn-item {
      margin: 0 0 7px;
      overflow: hidden;
      border: 1px solid var(--cgn-border);
      border-radius: 10px;
      background: var(--cgn-bg);
    }
    #${PANEL_ID} .cgn-item:hover { border-color: rgba(16, 163, 127, .55); }
    #${PANEL_ID} .cgn-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 9px 4px;
      color: var(--cgn-muted);
      font-size: 11px;
    }
    #${PANEL_ID} .cgn-item-index { font-weight: 600; }
    #${PANEL_ID} .cgn-jump {
      display: block;
      width: 100%;
      padding: 7px 9px;
      color: inherit;
      background: transparent;
      border: 0;
      text-align: left;
      cursor: pointer;
    }
    #${PANEL_ID} .cgn-jump:hover { background: var(--cgn-hover); }
    #${PANEL_ID} .cgn-label {
      display: inline-block;
      width: 21px;
      margin-right: 5px;
      color: var(--cgn-accent);
      font-size: 11px;
      font-weight: 700;
      vertical-align: top;
    }
    #${PANEL_ID} .cgn-answer .cgn-label { color: #6366f1; }
    #${PANEL_ID} .cgn-preview {
      display: inline;
      color: var(--cgn-text);
      line-height: 1.45;
      word-break: break-word;
    }
    #${PANEL_ID} .cgn-empty {
      padding: 28px 12px;
      color: var(--cgn-muted);
      text-align: center;
      line-height: 1.6;
    }
    #${TOGGLE_ID} {
      position: fixed;
      z-index: 2147483645;
      top: 76px;
      right: 16px;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      background: var(--cgn-accent);
      border: 0;
      border-radius: 50%;
      box-shadow: var(--cgn-shadow);
      cursor: pointer;
      font-size: 17px;
      transition: opacity .15s ease, transform .15s ease;
    }
    #${TOGGLE_ID}[data-open="true"] { opacity: 0; pointer-events: none; transform: scale(.85); }
    #${TOGGLE_ID}:hover { transform: scale(1.06); }
    #${PANEL_ID} .cgn-hint {
      padding: 0 12px 8px;
      color: var(--cgn-muted);
      font-size: 10px;
    }
    .cgn-highlight {
      outline: 2px solid rgba(16, 163, 127, .7) !important;
      outline-offset: 4px;
      transition: outline-color .2s ease;
    }
    .cgn-nav-target { scroll-margin-top: 80px; }
    .cgn-turn-collapsed { display: none !important; }
    @media (prefers-color-scheme: dark) {
      #${PANEL_ID}, #${TOGGLE_ID} {
        --cgn-bg: #212121;
        --cgn-border: rgba(255, 255, 255, .12);
        --cgn-muted: #a1a1aa;
        --cgn-text: #ececec;
        --cgn-hover: #2f2f2f;
        --cgn-shadow: 0 10px 30px rgba(0, 0, 0, .36);
      }
    }
  `);

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function preview(value) {
    const text = normalizeText(value);
    if (text.length <= MAX_PREVIEW_LENGTH) return text;
    return `${text.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
  }

  function roleText(root, role) {
    const node = root.matches?.(`[data-message-author-role="${role}"]`)
      ? root
      : root.querySelector?.(`[data-message-author-role="${role}"]`);
    return node ? normalizeText(node.innerText || node.textContent) : '';
  }

  function roleFromHeading(text) {
    const value = normalizeText(text);
    if (/^(你说|You said|User|用户)\s*[:：]?$/i.test(value)) return 'user';
    if (/^(ChatGPT 说|ChatGPT said|Assistant|助手)\s*[:：]?$/i.test(value)) return 'assistant';
    return '';
  }

  function cleanHeadingMessageText(root, role) {
    let text = normalizeText(root?.innerText || root?.textContent);
    text = text
      .replace(/^(你说|You said|User|用户)\s*[:：]?\s*/i, '')
      .replace(/^(ChatGPT 说|ChatGPT said|Assistant|助手)\s*[:：]?\s*/i, '');
    text = text.replace(/^[:：]\s*/, '');

    // 当前页面的消息操作按钮文字也会出现在 innerText 里，去掉它们以免污染导航预览。
    const controls = /\s+(复制消息|共享提示|编辑消息|复制|分享|更多操作|评价回复|朗读|Copy|Share|Edit|More|Read aloud)\s*$/i;
    while (controls.test(text)) text = text.replace(controls, '').trim();
    return text;
  }

  function collectHeadingTurns() {
    const turns = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]').forEach((heading) => {
      const role = roleFromHeading(heading.innerText || heading.textContent);
      if (!role) return;
      const root = heading.parentElement || heading;
      const text = cleanHeadingMessageText(root, role);
      // 标题的父容器就是该消息的起点；从顶部对齐可避免落在长回答的中间。
      if (text) turns.push({ role, text, root });
    });
    return turns;
  }

  function collectTurnRoots() {
    const roots = [];
    const seen = new Set();
    const candidates = document.querySelectorAll(
      'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]'
    );
    candidates.forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        roots.push(node);
      }
    });

    // 兼容部分页面版本没有 conversation-turn data-testid 的情况。
    if (!roots.length) {
      document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]').forEach((node) => {
        const root = node.closest('article') || node.parentElement;
        if (root && !seen.has(root)) {
          seen.add(root);
          roots.push(root);
        }
      });
    }
    return roots;
  }

  function collectEntries() {
    const semanticNodes = [...document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    )].map((node) => ({
      role: node.getAttribute('data-message-author-role'),
      text: normalizeText(node.innerText || node.textContent),
      root: node.closest('article') || node.parentElement || node,
    })).filter((turn) => turn.text);

    const turns = semanticNodes.length ? semanticNodes : collectHeadingTurns();
    const entries = [];
    let current = null;

    turns.forEach((turn, index) => {
      if (turn.role === 'user') {
        current = {
          user: turn.text,
          assistant: '',
          userRoot: turn.root,
          assistantRoot: null,
          order: index,
        };
        entries.push(current);
        return;
      }

      if (turn.role === 'assistant' && current && !current.assistant) {
        current.assistant = turn.text;
        current.assistantRoot = turn.root;
        current = null;
        return;
      }

      if (turn.role === 'assistant') {
        entries.push({ user: '', assistant: turn.text, userRoot: null, assistantRoot: turn.root, order: index });
      }
    });

    return entries;
  }

  function ensureAnchor(node, prefix, index) {
    if (!node) return null;
    if (!node.id || node.id === PANEL_ID || node.id === TOGGLE_ID) {
      node.id = `cgn-${prefix}-${index}`;
    }
    return node;
  }

  function scrollTo(node, index, role) {
    if (!node) return;
    const anchor = ensureAnchor(node, role || 'turn', index);
    anchor.classList.add('cgn-nav-target');
    anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const highlightTarget = anchor.parentElement || anchor;
    highlightTarget.classList.add('cgn-highlight');
    window.clearTimeout(state.highlightTimer);
    state.highlightTimer = window.setTimeout(() => highlightTarget.classList.remove('cgn-highlight'), 1300);
  }

  function updateCollapseControl() {
    const button = document.querySelector(`#${PANEL_ID} .cgn-collapse`);
    if (!button) return;
    button.hidden = state.entries.length <= AUTO_COLLAPSE_ROUNDS;
    button.textContent = state.contentCollapsed ? '展开正文' : '折叠正文';
    button.title = state.contentCollapsed ? '展开完整对话' : '只保留问答缩略列表';
  }

  function applyCollapseState() {
    const roots = new Set();
    state.entries.forEach((entry) => {
      if (entry.userRoot) roots.add(entry.userRoot);
      if (entry.assistantRoot) roots.add(entry.assistantRoot);
    });
    roots.forEach((root) => root.classList.toggle('cgn-turn-collapsed', state.contentCollapsed));
    updateCollapseControl();
  }

  function setConversationCollapsed(collapsed, manual = false) {
    state.contentCollapsed = collapsed;
    if (manual) state.collapseUserSet = true;
    applyCollapseState();
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const list = panel.querySelector('.cgn-list');
    const count = panel.querySelector('.cgn-count');
    const query = normalizeText(state.query).toLowerCase();
    const filtered = state.entries.filter((entry) => {
      if (!query) return true;
      return `${entry.user} ${entry.assistant}`.toLowerCase().includes(query);
    });

    count.textContent = `${filtered.length}/${state.entries.length}`;
    updateCollapseControl();
    list.textContent = '';

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'cgn-empty';
      empty.textContent = state.entries.length ? '没有匹配的提问或回答' : '当前页面还没有识别到对话内容';
      list.appendChild(empty);
      return;
    }

    filtered.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'cgn-item';

      const head = document.createElement('div');
      head.className = 'cgn-item-head';
      const index = state.entries.indexOf(entry) + 1;
      const number = document.createElement('span');
      number.className = 'cgn-item-index';
      number.textContent = `第 ${index} 轮`;
      head.appendChild(number);
      item.appendChild(head);

      if (entry.user) item.appendChild(makeJumpButton('问', entry.user, 'cgn-question', entry.userRoot, index));
      if (entry.assistant) item.appendChild(makeJumpButton('答', entry.assistant, 'cgn-answer', entry.assistantRoot, index));
      list.appendChild(item);
    });
  }

  function makeJumpButton(label, text, className, target, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cgn-jump ${className}`;
    button.title = text;

    const labelNode = document.createElement('span');
    labelNode.className = 'cgn-label';
    labelNode.textContent = label;
    button.appendChild(labelNode);

    const previewNode = document.createElement('span');
    previewNode.className = 'cgn-preview';
    previewNode.textContent = preview(text) || '（暂无内容）';
    button.appendChild(previewNode);

    button.addEventListener('click', () => {
      if (state.contentCollapsed) setConversationCollapsed(false, true);
      scrollTo(target, index, className.includes('answer') ? 'answer' : 'question');
    });
    return button;
  }

  function updateEntries() {
    const next = collectEntries();
    const changed = next.length !== state.entries.length || next.some((entry, index) => {
      const old = state.entries[index];
      return !old || old.user !== entry.user || old.assistant !== entry.assistant;
    });
    if (changed) {
      state.entries = next;
      if (next.length <= AUTO_COLLAPSE_ROUNDS) {
        state.contentCollapsed = false;
        state.collapseUserSet = false;
      } else if (!state.collapseUserSet) {
        state.contentCollapsed = true;
      }
      applyCollapseState();
      render();
    }
  }

  function scheduleUpdate() {
    window.clearTimeout(state.updateTimer);
    state.updateTimer = window.setTimeout(updateEntries, 180);
  }

  function setOpen(open) {
    state.open = open;
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    const panel = document.getElementById(PANEL_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    if (panel) panel.dataset.open = String(open);
    if (toggle) toggle.dataset.open = String(open);
  }

  function buildUI() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.dataset.open = String(state.open);
    panel.setAttribute('aria-label', 'ChatGPT 对话导航');
    panel.innerHTML = `
      <div class="cgn-header">
        <div class="cgn-title">对话导航 <span class="cgn-count">0/0</span></div>
        <div class="cgn-actions">
          <button type="button" class="cgn-minimize" aria-label="收起导航" title="收起导航">−</button>
          <button type="button" class="cgn-close" aria-label="关闭导航" title="关闭导航">×</button>
        </div>
      </div>
      <div class="cgn-search-wrap">
        <input class="cgn-search" type="search" placeholder="搜索提问或 AI 回答…" aria-label="搜索提问或 AI 回答">
      </div>
      <div class="cgn-collapse-row">
        <button type="button" class="cgn-collapse" hidden>折叠正文</button>
        <span class="cgn-collapse-note">超过 5 轮自动显示问答缩略</span>
      </div>
      <div class="cgn-list"></div>
      <div class="cgn-hint">点击“问”或“答”可跳转 · Ctrl/Cmd + Shift + L 显示/隐藏</div>
    `;

    const toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.type = 'button';
    toggle.dataset.open = String(state.open);
    toggle.title = '打开对话导航 (Ctrl/Cmd + Shift + L)';
    toggle.setAttribute('aria-label', '打开对话导航');
    toggle.textContent = '☰';

    panel.querySelector('.cgn-close').addEventListener('click', () => setOpen(false));
    panel.querySelector('.cgn-minimize').addEventListener('click', () => setOpen(false));
    panel.querySelector('.cgn-collapse').addEventListener('click', () => {
      setConversationCollapsed(!state.contentCollapsed, true);
    });
    toggle.addEventListener('click', () => setOpen(true));
    panel.querySelector('.cgn-search').addEventListener('input', (event) => {
      state.query = event.target.value;
      render();
    });

    document.body.appendChild(panel);
    document.body.appendChild(toggle);
    render();
  }

  function init() {
    if (!document.body) return;
    buildUI();
    updateEntries();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => {
        const target = mutation.target?.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target?.parentElement;
        return target && !target.closest?.(`#${PANEL_ID}, #${TOGGLE_ID}`);
      })) scheduleUpdate();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setOpen(!state.open);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
