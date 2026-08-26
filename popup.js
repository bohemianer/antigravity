// Antigravity Vocab - popup.js (实时数据看板与快捷入口)

document.addEventListener('DOMContentLoaded', () => {
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
  document.getElementById('btnOpenNotebook').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  };

  document.getElementById('btnOpenFlashcard').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html#flashcard') });
  };

  document.getElementById('btnOpenSettings').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html#settings') });
  };
});
