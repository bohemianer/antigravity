// Antigravity - popup.js (实时数据看板与快捷入口)

let currentPopupTheme = 'system';

function applyPopupTheme(mode) {
  currentPopupTheme = mode || 'system';
  try {
    localStorage.setItem('antigravity_theme', currentPopupTheme);
  } catch (e) {}

  const isDark = currentPopupTheme === 'dark' || (currentPopupTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', currentPopupTheme);
  document.documentElement.setAttribute('data-applied-theme', isDark ? 'dark' : 'light');

  const btn = document.getElementById('popupThemeBtn');
  const icon = document.getElementById('popupThemeIcon');
  if (btn && icon) {
    if (currentPopupTheme === 'system') {
      icon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
      btn.title = '当前外观：跟随系统 (点击切换为浅色模式)';
    } else if (currentPopupTheme === 'light') {
      icon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
      btn.title = '当前外观：浅色模式 (点击切换为黑色模式)';
    } else {
      icon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      btn.title = '当前外观：黑色模式 (点击切换为跟随系统)';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 0. 初始化主题系统
  chrome.storage.sync.get({ themeMode: 'system' }, (res) => {
    applyPopupTheme(res.themeMode || 'system');
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentPopupTheme === 'system') {
      document.documentElement.setAttribute('data-applied-theme', e.matches ? 'dark' : 'light');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.themeMode) {
      applyPopupTheme(changes.themeMode.newValue || 'system');
    }
  });

  const themeBtn = document.getElementById('popupThemeBtn');
  if (themeBtn) {
    themeBtn.onclick = () => {
      let nextTheme = 'system';
      if (currentPopupTheme === 'system') nextTheme = 'light';
      else if (currentPopupTheme === 'light') nextTheme = 'dark';
      else if (currentPopupTheme === 'dark') nextTheme = 'system';

      applyPopupTheme(nextTheme);
      chrome.storage.sync.set({ themeMode: nextTheme });
    };
  }

  // 1. 获取并渲染生词统计
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const list = res.savedWords || [];
    const total = list.length;
    
    // 统计生疏待背及今日到期词汇
    const now = Date.now();
    const needReview = list.filter(w => {
      const lv = parseInt(w.srsLevel) || 0;
      const nextTime = w.srsNextReview || 0;
      return lv === 0 || nextTime <= now;
    }).length;

    document.getElementById('totalWordsCount').innerText = total.toString();
    document.getElementById('reviewWordsCount').innerText = needReview.toString();
  });

  // 2. 获取并渲染 WebDAV 云同步状态
  chrome.storage.sync.get({ webdavConfig: null }, (res) => {
    const cfg = res.webdavConfig;
    const dot = document.getElementById('syncDot');
    const txt = document.getElementById('syncText');
    if (cfg && cfg.enabled && cfg.username && cfg.password) {
      if (dot) dot.className = "sync-dot active";
      if (txt) txt.innerText = "已配置云同步";
    } else {
      if (dot) dot.className = "sync-dot";
      if (txt) txt.innerText = "未同步";
    }
  });

  // 3. 快捷入口跳转
  const openNotebook = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  };
  const openSettings = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html#settings') });
  };

  const btnLogo = document.getElementById('btnLogoHeader');
  if (btnLogo) btnLogo.onclick = openNotebook;

  const syncBadge = document.getElementById('syncBadge');
  if (syncBadge) syncBadge.onclick = openSettings;

  document.getElementById('btnOpenNotebook').onclick = openNotebook;

  document.getElementById('btnOpenFlashcard').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html#flashcard') });
  };

  document.getElementById('btnOpenSettings').onclick = openSettings;
});
