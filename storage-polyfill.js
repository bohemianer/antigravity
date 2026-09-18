// storage-polyfill.js
// Antigravity 跨平台存储与运行时 Polyfill (支持 GitHub Pages / 移动端浏览器 / PWA 离线运行)

(function() {
  // 如果当前处于原生 Chrome 扩展环境 (已注入 native chrome.storage.local)，则完全不干预，直接原样使用
  if (typeof window !== 'undefined' && window.chrome && window.chrome.storage && window.chrome.storage.local) {
    return;
  }

  const listeners = [];
  const LOCAL_PREFIX = 'antigravity_storage_local_';
  const SYNC_PREFIX = 'antigravity_storage_sync_';

  function createStorageArea(prefix, areaName) {
    return {
      get(keys, callback) {
        return new Promise((resolve) => {
          const result = {};

          if (keys === null || keys === undefined) {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith(prefix)) {
                const realKey = k.slice(prefix.length);
                try {
                  result[realKey] = JSON.parse(localStorage.getItem(k));
                } catch (e) {
                  result[realKey] = localStorage.getItem(k);
                }
              }
            }
          } else if (typeof keys === 'string') {
            const raw = localStorage.getItem(prefix + keys);
            if (raw !== null) {
              try {
                result[keys] = JSON.parse(raw);
              } catch (e) {
                result[keys] = raw;
              }
            }
          } else if (Array.isArray(keys)) {
            for (const k of keys) {
              const raw = localStorage.getItem(prefix + k);
              if (raw !== null) {
                try {
                  result[k] = JSON.parse(raw);
                } catch (e) {
                  result[k] = raw;
                }
              }
            }
          } else if (typeof keys === 'object') {
            for (const [k, defaultVal] of Object.entries(keys)) {
              const raw = localStorage.getItem(prefix + k);
              if (raw !== null) {
                try {
                  result[k] = JSON.parse(raw);
                } catch (e) {
                  result[k] = raw;
                }
              } else {
                result[k] = defaultVal;
              }
            }
          }

          if (typeof callback === 'function') {
            callback(result);
          }
          resolve(result);
        });
      },

      set(items, callback) {
        return new Promise((resolve) => {
          const changes = {};
          if (typeof items === 'object' && items !== null) {
            for (const [k, val] of Object.entries(items)) {
              const oldRaw = localStorage.getItem(prefix + k);
              let oldValue;
              if (oldRaw !== null) {
                try { oldValue = JSON.parse(oldRaw); } catch (e) { oldValue = oldRaw; }
              }
              localStorage.setItem(prefix + k, JSON.stringify(val));
              changes[k] = { oldValue, newValue: val };
            }
          }

          // 派发 onChanged 事件通知监听器
          for (const fn of listeners) {
            try {
              fn(changes, areaName);
            } catch (e) {
              console.warn('[Polyfill] onChanged listener execution error:', e);
            }
          }

          if (typeof callback === 'function') {
            callback();
          }
          resolve();
        });
      },

      remove(keys, callback) {
        return new Promise((resolve) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          for (const k of keyList) {
            const oldRaw = localStorage.getItem(prefix + k);
            let oldValue;
            if (oldRaw !== null) {
              try { oldValue = JSON.parse(oldRaw); } catch (e) { oldValue = oldRaw; }
            }
            localStorage.removeItem(prefix + k);
            changes[k] = { oldValue, newValue: undefined };
          }
          for (const fn of listeners) {
            try { fn(changes, areaName); } catch (e) {}
          }
          if (typeof callback === 'function') callback();
          resolve();
        });
      },

      clear(callback) {
        return new Promise((resolve) => {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) keysToRemove.push(k);
          }
          for (const k of keysToRemove) localStorage.removeItem(k);
          if (typeof callback === 'function') callback();
          resolve();
        });
      }
    };
  }

  const polyfillChrome = {
    storage: {
      local: createStorageArea(LOCAL_PREFIX, 'local'),
      sync: createStorageArea(SYNC_PREFIX, 'sync'),
      onChanged: {
        addListener(fn) {
          if (typeof fn === 'function' && !listeners.includes(fn)) {
            listeners.push(fn);
          }
        },
        removeListener(fn) {
          const idx = listeners.indexOf(fn);
          if (idx !== -1) listeners.splice(idx, 1);
        }
      }
    },
    runtime: {
      lastError: null,
      getURL(path) {
        return path;
      },
      sendMessage(message, callback) {
        if (message && message.action === 'LOOKUP_WORD') {
          const word = (message.word || '').trim();
          if (!word) {
            if (typeof callback === 'function') callback(null);
            return;
          }
          // 在 Web/PWA 端发起有道轻量词典查询以自动补全
          fetch(`https://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(word)}`)
            .then(res => res.json())
            .then(data => {
              if (data && data.data && data.data.entries && data.data.entries[0]) {
                const entry = data.data.entries[0];
                if (typeof callback === 'function') {
                  callback({
                    word: entry.entry || word,
                    phonetic: '',
                    definition: entry.explain || ''
                  });
                }
              } else {
                if (typeof callback === 'function') callback(null);
              }
            })
            .catch(() => {
              if (typeof callback === 'function') callback(null);
            });
          return true;
        }
        if (typeof callback === 'function') {
          callback(null);
        }
      }
    },
    tabs: {
      create(opt) {
        if (opt && opt.url) {
          window.open(opt.url, '_blank');
        }
      }
    }
  };

  window.chrome = Object.assign(window.chrome || {}, polyfillChrome);
  console.log('[Antigravity] Web/PWA storage-polyfill initialized successfully.');
})();
