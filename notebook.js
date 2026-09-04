// Antigravity Vocab - notebook.js (艾宾浩斯 SM-2 记忆算法 + 交互闪卡 + WebDAV 增量云同步 + 智能查词补全 + 真人原声发音)

let currentWords = [];
let filteredWords = [];
let webdavConfig = null;

// 闪卡与艾宾浩斯状态
let cardIndex = 0;
let cardList = [];
let cardRevealed = false;
let currentView = 'table';
let isInternalSrsUpdate = false; // 防止 handleSRSFeedback 触发 storage.onChanged 时重置 cardIndex

// 真人母语者高清原声发音引擎 (优先美音真人录音 MP3，离线自动降级 + 灵动声波微动效)
let currentAudio = null;
function speakWord(text, triggerEl = null) {
  if (!text) return;
  const clean = text.trim();

  // 触发灵动声波跳动波形
  const pills = triggerEl ? [triggerEl] : document.querySelectorAll(`.audio-pill-trigger[data-word="${clean}"]`);
  pills.forEach(p => p.classList.add('playing'));
  const fcAudioPill = document.getElementById('fcAudioPill');
  if (fcAudioPill && (!triggerEl || triggerEl === fcAudioPill)) {
    fcAudioPill.classList.add('playing');
  }

  const stopWave = () => {
    pills.forEach(p => p.classList.remove('playing'));
    if (fcAudioPill) fcAudioPill.classList.remove('playing');
  };

  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=2`;
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = stopWave;
    currentAudio.onerror = () => {
      fallbackTTS(clean);
      setTimeout(stopWave, 1200);
    };
    currentAudio.play().catch(() => {
      fallbackTTS(clean);
      setTimeout(stopWave, 1200);
    });
  } catch (e) {
    fallbackTTS(clean);
    setTimeout(stopWave, 1200);
  }
}

function fallbackTTS(text) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function cleanIPA(s) {
  if (!s) return "";
  let str = s.trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  
  // 1. 移除结合变音符及多余符号
  str = str.replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[\x00-\x1f\x7f-\x9f\ufffd]/g, '');
  str = str.replace(/[()]/g, '');
  
  // 2. 将美式 Webster/拼音音标转换为现代国际标准 IPA
  str = str.replace(/ô[r]?|ôr/g, "ɔːr")
           .replace(/ô/g, "ɔː")
           .replace(/yo͞o|yo͝o|yoō|yoo/g, "juː")
           .replace(/o͞o|o͝o|oō|oo/g, "uː")
           .replace(/ō|oʊ/g, "oʊ")
           .replace(/ā/g, "eɪ")
           .replace(/ē/g, "iː")
           .replace(/ī/g, "aɪ")
           .replace(/ä/g, "ɑː");
  
  // 3. 规范化长音符号与重音符号
  str = str.replace(/:/g, "ː")
           .replace(/['`]/g, "ˈ")
           .replace(/ˌ/g, "ˌ")
           .replace(/ədiː|ədi/g, "əti");
  
  // 4. 优化开头闭音节与常见辅音组合
  str = str.replace(/^inˈ/g, "ɪnˈ")
           .replace(/^in/g, "ɪn")
           .replace(/^rəˈ/g, "rɪˈ");
  
  str = str.trim();
  return str ? `/${str}/` : "";
}

function extractPhoneticFromItem(item) {
  if (item.phonetic) return cleanIPA(item.phonetic);
  if (item.notes && item.notes.includes("音标:")) {
    const m = item.notes.match(/音标:\s*(\/[^\n\/]+\/)/);
    if (m) return cleanIPA(m[1]);
  }
  return "";
}

function cleanNotes(notes) {
  if (!notes) return "";
  let s = notes.trim();
  // 清除历史遗留自动拼接的音标格式
  s = s.replace(/音标:\s*\/[^\n\/]+\/\s*/g, "").trim();

  // 智能清洗历史多次同步重复追加的段落
  const paragraphs = s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    const uniquePara = Array.from(new Set(paragraphs));
    s = uniquePara.join("\n\n");
  }

  // 智能清洗连续相同行
  const lines = s.split("\n").map(l => l.trim());
  const dedupLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 || lines[i] !== lines[i - 1] || lines[i] === "") {
      dedupLines.push(lines[i]);
    }
  }
  return dedupLines.join("\n").trim();
}

const DEFAULT_ARTICLE_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23CC785C' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>";
const EUDIC_BOOK_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23059669' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/><path d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/></svg>";

function getSourceFavicon(item) {
  const title = (item.title || "").toLowerCase();
  const url = (item.url || "").toLowerCase();

  // 1. 欧路词典同步来源
  if (title.includes("eudic") || title.includes("欧路") || url.includes("eudic")) {
    return EUDIC_BOOK_SVG;
  }

  // 2. 主流外刊权威 Favicon 映射
  if (title.includes("wsj") || url.includes("wsj.com")) return "https://www.wsj.com/favicon.ico";
  if (title.includes("bloomberg") || url.includes("bloomberg.com")) return "https://www.bloomberg.com/favicon.ico";
  if (title.includes("ft") || title.includes("financial times") || url.includes("ft.com")) return "https://www.ft.com/favicon.ico";
  if (title.includes("economist") || url.includes("economist.com")) return "https://www.economist.com/favicon.ico";
  if (title.includes("reuters") || url.includes("reuters.com")) return "https://www.reuters.com/favicon.ico";
  if (title.includes("nytimes") || url.includes("nytimes.com")) return "https://www.nytimes.com/favicon.ico";
  if (title.includes("guardian") || url.includes("theguardian.com")) return "https://www.theguardian.com/favicon.ico";
  if (title.includes("bbc") || url.includes("bbc.com") || url.includes("bbc.co.uk")) return "https://www.bbc.com/favicon.ico";
  if (title.includes("nature") || url.includes("nature.com")) return "https://www.nature.com/favicon.ico";
  if (title.includes("wired") || url.includes("wired.com")) return "https://www.wired.com/favicon.ico";
  if (title.includes("medium") || url.includes("medium.com")) return "https://medium.com/favicon.ico";
  if (title.includes("substack") || url.includes("substack.com")) return "https://substack.com/favicon.ico";

  // 3. 通用外部 URL 提取
  if (item.url && item.url.startsWith("http")) {
    try {
      const u = new URL(item.url);
      return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
    } catch (e) {}
  }

  // 4. 默认优雅报刊书卷 SVG 徽标 (0 网络依赖，100% 呈现)
  return DEFAULT_ARTICLE_SVG;
}

function highlightWordInSentence(sentence, word) {
  if (!sentence || !word) return sentence || '';
  try {
    const regex = new RegExp(`(\\b${word}\\b|${word})`, 'gi');
    return sentence.replace(regex, `<span class="highlight">$1</span>`);
  } catch (e) {
    return sentence;
  }
}

// 艾宾浩斯记忆等级标签
function getSrsInfo(level = 0) {
  const lv = parseInt(level) || 0;
  switch (lv) {
    case 3:
      return { class: "srs-level-3", label: "熟练掌握", days: 7 };
    case 2:
      return { class: "srs-level-2", label: "巩固阶段", days: 3 };
    case 1:
      return { class: "srs-level-1", label: "初识阶段", days: 1 };
    default:
      return { class: "srs-level-0", label: "生疏待背", days: 0 };
  }
}

function getStandardJsonList() {
  return currentWords.map(item => ({
    text: item.text || item.word,
    trans: item.trans || item.definition || '',
    phonetic: extractPhoneticFromItem(item),
    context: item.context || item.sentence || '',
    title: item.title || item.sourceTitle || 'Web Article',
    url: item.url || item.sourceUrl || '',
    date: item.date ? (typeof item.date === 'number' ? item.date : new Date(item.date).getTime()) : Date.now(),
    notes: cleanNotes(item.notes),
    srsLevel: item.srsLevel || 0,
    srsNextReview: item.srsNextReview || 0,
    srsReviews: item.srsReviews || 0
  }));
}

function updateSyncBadge(status, text) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  if (!dot || !txt) return;

  if (status === 'connected') {
    dot.className = "sync-icon-dot active";
    txt.innerText = text || "已同步";
  } else if (status === 'syncing') {
    dot.className = "sync-icon-dot active rotating";
    txt.innerText = "正在同步中...";
  } else {
    dot.className = "sync-icon-dot";
    txt.innerText = text || "未同步";
  }
}

// 全量多端融合同步引擎：欧路词典 OpenAPI 增量拉取 + 坚果云 WebDAV 双向合并
async function doFullSync(showToast = false) {
  updateSyncBadge('syncing', '正在同步中...');

  let eudicNewCount = 0;
  let eudicTotalScanned = 0;
  let eudicError = null;

  // 1. 若配置了欧路 Token，自动拉取欧路全部分类生词
  const storageData = await new Promise(resolve => {
    chrome.storage.sync.get({ eudicToken: '' }, resolve);
  });

  const token = (storageData.eudicToken || "").trim();
  if (token) {
    try {
      const engine = new EudicSyncEngine(token);
      const eudicWords = await engine.fetchAllCategoriesAndWords();
      eudicTotalScanned = eudicWords.length;
      
      const { mergedList, newAddedCount } = engine.mergeEudicWords(currentWords, eudicWords);
      eudicNewCount = newAddedCount;
      if (newAddedCount > 0) {
        currentWords = mergedList;
        await new Promise(resolve => {
          chrome.storage.local.set({ savedWords: currentWords }, resolve);
        });
        if (currentView !== 'flashcard') {
          applyFilter();
        }
      }
    } catch (err) {
      console.warn("欧路词典自动拉取失败:", err);
      eudicError = err.message;
    }
  }

  // 2. 紧接着执行坚果云 WebDAV 双向同步
  if (webdavConfig && webdavConfig.enabled && webdavConfig.username && webdavConfig.password) {
    chrome.runtime.sendMessage({
      action: "MANUAL_WEBDAV_SYNC",
      config: webdavConfig
    }, (res) => {
      if (res && res.success) {
        updateSyncBadge('connected', `已同步 (${res.count} 词)`);
        chrome.storage.local.get({ savedWords: [] }, (r) => {
          currentWords = r.savedWords || [];
          if (currentView !== 'flashcard') {
            applyFilter();
          }
        });
        if (showToast) {
          let msg = `🎉 同步完成！当前生词库共 ${res.count} 词。`;
          if (token && eudicNewCount > 0) {
            msg += `\n\n• 成功从欧路词典新增入库: ${eudicNewCount} 个生词`;
          } else if (token) {
            msg += `\n\n• 欧路词典已扫描 (${eudicTotalScanned} 词)，暂无未收录新词`;
          }
          if (eudicError) {
            msg += `\n\n⚠️ 欧路词典同步提示: ${eudicError}`;
          }
          alert(msg);
        }
      } else {
        updateSyncBadge('disconnected', "同步失败 (请检查密码)");
        if (showToast) alert(`❌ WebDAV 同步失败: ${res ? res.error : '网络超时或密码错误'}`);
      }
    });
  } else {
    // 仅欧路模式
    if (token) {
      updateSyncBadge('connected', `欧路已同步 (${currentWords.length} 词)`);
      if (showToast) {
        if (eudicError) {
          alert(`❌ 欧路同步失败: ${eudicError}`);
        } else {
          alert(`🎉 欧路词典同步完成！共扫描 ${eudicTotalScanned} 词，新增入库 ${eudicNewCount} 个未收录单词。`);
        }
      }
    } else {
      updateSyncBadge('disconnected', '未配置同步');
      if (showToast) alert("请先在「☁️ 同步设置」中填写坚果云或欧路词典 Token！");
    }
  }
}

async function doWebDAVSync(showToast = false) {
  return doFullSync(showToast);
}

function doWebDAVOverwrite() {
  if (!webdavConfig || !webdavConfig.enabled || !webdavConfig.username || !webdavConfig.password) {
    return;
  }
  updateSyncBadge('syncing');
  chrome.runtime.sendMessage({
    action: "OVERWRITE_WEBDAV_SYNC",
    config: webdavConfig
  }, (res) => {
    if (res && res.success) {
      updateSyncBadge('connected', `坚果云已同步 (${res.count} 词)`);
    }
  });
}

// 辅助函数：根据 SRS 等级与复习历史获取熟练度圆点颜色、描述及下一档状态
function getMasteryInfo(level, reviews = 0) {
  const lvl = parseInt(level);
  const rev = parseInt(reviews) || 0;

  // 未标记：未设过或未复习过
  if (isNaN(lvl) || (lvl === 0 && rev === 0)) {
    return { class: 'mastery-dot-unmarked', title: '熟练度: ⚪ 未标记 (点击开始标记)', nextLevel: 1 };
  }
  if (lvl === 0) {
    return { class: 'mastery-dot-red', title: '熟练度: 🔴 陌生 (点击切换为学习中)', nextLevel: 1 };
  } else if (lvl >= 1 && lvl <= 2) {
    return { class: 'mastery-dot-orange', title: '熟练度: 🟠 学习中 (点击切换为已掌握)', nextLevel: 3 };
  } else if (lvl >= 3 && lvl <= 4) {
    return { class: 'mastery-dot-green', title: '熟练度: 🟢 已掌握 (点击切换为已精通)', nextLevel: 5 };
  } else {
    return { class: 'mastery-dot-purple', title: '熟练度: 🔵 已精通 (点击重置为未标记)', nextLevel: -1 };
  }
}

// 快速设置某个单词的熟练度
function setWordMastery(targetWord, targetLevel) {
  const item = currentWords.find(w => (w.text || w.word || "").toLowerCase().trim() === (targetWord || "").toLowerCase().trim());
  if (!item) return;

  if (targetLevel === -1) {
    item.srsLevel = 0;
    item.srsReviews = 0;
    item.srsNextReview = 0;
  } else {
    item.srsLevel = targetLevel;
    item.srsReviews = Math.max(1, (parseInt(item.srsReviews) || 0) + 1);
    item.srsNextReview = targetLevel === 0 ? 0 : Date.now() + (targetLevel * 24 * 3600 * 1000);
  }

  chrome.storage.local.set({ savedWords: currentWords }, () => {
    applyFilter();
    updateStats();
    doWebDAVSync(false);
  });
}

// 渲染主表格列表
function renderList(list) {
  filteredWords = list;
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#8C827A; padding:60px 20px; font-size:14px;">生词本暂无词汇记录，在外刊划词或点击右上角「➕ 添加新词」开始积累吧！</td></tr>';
    return;
  }
  
  list.forEach((item) => {
    const wordText = item.text || item.word || "";
    const phonetic = extractPhoneticFromItem(item);
    const transText = formatTrans(item.trans || item.definition || "");
    const notesText = cleanNotes(item.notes);
    const contextSentence = highlightWordInSentence(item.context || item.sentence || "暂无上下文例句", wordText);
    const sourceTitle = item.title || "Web Article";
    const faviconUrl = getSourceFavicon(item);
    const masteryInfo = getMasteryInfo(item.srsLevel, item.srsReviews);
    
    const realIndex = currentWords.findIndex(w => (w.text || w.word) === wordText);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="vertical-align: middle !important; text-align: center;">
        <div class="word-cell-wrap">
          <span class="word-title">${wordText}</span>
          ${phonetic ? `<span class="word-phonetic audio-phonetic-trigger" data-word="${wordText}" title="点击朗读发音">${phonetic}</span>` : ''}
        </div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="salad-context-box">
          <div class="salad-sentence">${contextSentence}</div>
        </div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="trans-text">${transText}</div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="note-text">${notesText || ''}</div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="action-group">
          <div class="mastery-wrap">
            <button class="mastery-dot-btn btn-mastery-toggle" data-word="${wordText}" title="${masteryInfo.title}">
              <span class="mastery-dot-glow ${masteryInfo.class}"></span>
            </button>
            <div class="mastery-picker-popup">
              <button class="candy-option btn-candy" data-word="${wordText}" data-level="-1" title="⚪ 设为未标记">
                <span class="candy-dot" style="border: 1.5px dashed #A8A29E; background: transparent;"></span>
              </button>
              <button class="candy-option btn-candy" data-word="${wordText}" data-level="0" title="🔴 陌生 (Lv 0)">
                <span class="candy-dot" style="background: #EF4444; box-shadow: 0 0 5px rgba(239, 68, 68, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-word="${wordText}" data-level="1" title="🟠 学习中 (Lv 1)">
                <span class="candy-dot" style="background: #F59E0B; box-shadow: 0 0 5px rgba(245, 158, 11, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-word="${wordText}" data-level="3" title="🟢 已掌握 (Lv 3)">
                <span class="candy-dot" style="background: #10B981; box-shadow: 0 0 5px rgba(16, 185, 129, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-word="${wordText}" data-level="5" title="🔵 已精通 (Lv 5)">
                <span class="candy-dot" style="background: #6366F1; box-shadow: 0 0 5px rgba(99, 102, 241, 0.6);"></span>
              </button>
            </div>
          </div>
          <button class="apple-icon-btn btn-edit" data-word="${wordText}" title="编辑词条与笔记">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="apple-icon-btn apple-icon-btn-del btn-del" data-word="${wordText}" title="删除词条">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 点击熟练度圆点：直接展开并锁定微胶囊选择器，方便用户选色
  tbody.querySelectorAll('.btn-mastery-toggle').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.mastery-wrap');
      const popup = wrap ? wrap.querySelector('.mastery-picker-popup') : null;
      if (!popup) return;

      const isOpen = popup.classList.contains('open');
      // 先关闭所有其他打开的弹窗
      document.querySelectorAll('.mastery-picker-popup.open').forEach(p => p.classList.remove('open'));
      
      if (!isOpen) {
        popup.classList.add('open');
      }
    };
  });

  // 悬浮糖果胶囊选择器：一键直达选定并自动收起
  tbody.querySelectorAll('.btn-candy').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetWord = btn.getAttribute('data-word');
      const targetLevel = parseInt(btn.getAttribute('data-level'));
      document.querySelectorAll('.mastery-picker-popup.open').forEach(p => p.classList.remove('open'));
      setWordMastery(targetWord, targetLevel);
    };
  });

  tbody.querySelectorAll('.audio-phonetic-trigger').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      speakWord(btn.getAttribute('data-word'));
    };
  });

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetWord = btn.getAttribute('data-word');
      const idx = currentWords.findIndex(w => (w.text || w.word || "").toLowerCase().trim() === (targetWord || "").toLowerCase().trim());
      if (idx !== -1) {
        openEditModal(idx);
      }
    };
  });

  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetWord = btn.getAttribute('data-word');
      if (!targetWord) return;
      if (confirm(`确定要从生词本中彻底删除「${targetWord}」吗？\n（将同时从本地、坚果云与欧路词典中同步删除）`)) {
        currentWords = currentWords.filter(w => (w.text || w.word || "").toLowerCase().trim() !== targetWord.toLowerCase().trim());
        chrome.storage.local.set({ savedWords: currentWords }, () => {
          doWebDAVOverwrite(); // 关键：立即用删除后的纯净数据覆盖坚果云端，彻底抹除云端该词！
          
          // 关键：同时从欧路词典生词本中同步删除该词
          chrome.storage.sync.get({ eudicToken: '' }, (r) => {
            if (r.eudicToken) {
              const engine = new EudicSyncEngine(r.eudicToken);
              engine.deleteWord(targetWord).catch(err => {
                console.warn(`从欧路同步删除 ${targetWord} 失败:`, err);
              });
            }
          });

          applyFilter();
        });
      }
    };
  });
}

// ---------------- 艾宾浩斯交互闪卡系统 (SM-2 SRS + 定量组自测) ----------------
let currentBatchSize = '20'; // 10, 20, 50, all
let batchStats = { forgot: 0, hard: 0, good: 0, completedCount: 0 };
let batchTotalTarget = 20;

// 智能释义格式化引擎：多词性 (n./v./adj./adv.) 与形态衍生 (时态/名词/复数) 自动分行排版
function formatTrans(s) {
  if (!s) return "";
  let str = String(s).replace(/<[^>]+>/g, '').trim();

  // 1. 标准化分号与逗号
  str = str.replace(/;/g, '；')
           .replace(/；\s*/g, '；')
           .replace(/,\s*/g, '，')
           .replace(/，\s*/g, '，');

  // 2. 识别所有英文常见词性缩写并自动换行 (如 vt. vi. n. adj. adv. prep. conj. pron. art. num. interj. aux. v.)
  const posRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)\b((?:n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|interj|aux)\.)\s*/gi;
  str = str.replace(posRegex, '\n$1 ');

  // 3. 识别中文时态与衍生词标记并自动换行 (如 时 态: 名 词: 形 容 词: 副 词: 复 数: 比较级: 最高级: 过去式: 过去分词: 等)
  const metaRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((?:时\s*态|名\s*词|形\s*容\s*词|副\s*词|复\s*数|比较级|最高级|过去式|过去分词)\s*[:：])\s*/gi;
  str = str.replace(metaRegex, '\n$1 ');

  // 4. 清理每行首尾多余标点与空格
  return str.split('\n')
            .map(line => line.replace(/^[\s；，,;]+|[\s；，,;]+$/g, '').trim())
            .filter(Boolean)
            .join('\n');
}

function updateFlashcardList(resetIndex = false) {
  // 重置完成小结卡片
  const summaryCard = document.getElementById('flashcardSummaryCard');
  const cardBox = document.getElementById('flashcardBox');
  const barUnrevealed = document.getElementById('smartBarUnrevealed');
  const barRevealed = document.getElementById('smartBarRevealed');

  if (summaryCard) summaryCard.style.display = 'none';
  if (cardBox) cardBox.style.display = 'flex';
  if (barUnrevealed) barUnrevealed.style.display = 'flex';
  if (barRevealed) barRevealed.style.display = 'none';

  // 重置统计数据
  batchStats = { forgot: 0, hard: 0, good: 0, completedCount: 0 };

  let pool = [...filteredWords];
  
  // 优先按定量抽取生词 (生疏与到期复习优先)
  if (currentBatchSize !== 'all') {
    const targetN = parseInt(currentBatchSize) || 20;
    const unmastered = pool.filter(w => (parseInt(w.srsLevel) || 0) === 0);
    const reviewing = pool.filter(w => (parseInt(w.srsLevel) || 0) > 0);
    pool = [...unmastered, ...reviewing].slice(0, targetN);
  }

  // 默认开启随机洗牌乱序，抗遗忘更高效
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  cardList = pool;
  batchTotalTarget = cardList.length;

  if (resetIndex || cardIndex >= cardList.length) {
    cardIndex = 0;
  }
  renderFlashcard();
}

// ---------------- 摸鱼模式 (VS Code 深度代码伪装 + 企业邮件伪装双模式) ----------------
let isStealthMode = false;
let stealthSubMode = 'code'; // 'code' | 'mail'
let stealthToastTimer = null;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showStealthToast(msg) {
  const toast = document.getElementById('stealthToastMsg');
  if (!toast) return;
  toast.innerText = msg;
  toast.style.display = 'inline-block';
  clearTimeout(stealthToastTimer);
  stealthToastTimer = setTimeout(() => {
    if (toast) toast.style.display = 'none';
  }, 1600);
}

function switchStealthSubMode(mode) {
  stealthSubMode = mode;
  const codeView = document.getElementById('stealthCodeView');
  const mailView = document.getElementById('stealthMailView');
  const btnCode = document.getElementById('btnStealthCodeMode');
  const btnMail = document.getElementById('btnStealthMailMode');
  const titleLabel = document.getElementById('stealthTitleBarLabel');
  const shortcutHint = document.getElementById('stealthShortcutHint');

  if (mode === 'mail') {
    if (codeView) codeView.style.display = 'none';
    if (mailView) mailView.style.display = 'flex';
    if (btnCode) btnCode.classList.remove('active');
    if (btnMail) btnMail.classList.add('active');
    if (titleLabel) titleLabel.innerText = 'Outlook (PWA) — Inbox — Language Operations Support';
    if (shortcutHint) shortcutHint.innerText = '按 [Space] 展开邮件附件 | 1拒绝 2待定 3批准 | [Esc] 快速恢复';
  } else {
    if (codeView) codeView.style.display = 'flex';
    if (mailView) mailView.style.display = 'none';
    if (btnCode) btnCode.classList.add('active');
    if (btnMail) btnMail.classList.remove('active');
    if (titleLabel) titleLabel.innerText = 'memoryCache.ts — antigravity-core — Visual Studio Code';
    if (shortcutHint) shortcutHint.innerText = '按 [Space] 展开释义 | 1忘了 2模糊 3熟练 | [Esc] 快速恢复';
  }

  renderStealthCard();
}

function enterStealthMode() {
  if (cardList.length === 0) {
    updateFlashcardList(true);
  }
  isStealthMode = true;
  const overlay = document.getElementById('stealthOverlay');
  if (overlay) overlay.style.display = 'flex';
  switchStealthSubMode(stealthSubMode || 'code');
}

function exitStealthMode() {
  isStealthMode = false;
  const overlay = document.getElementById('stealthOverlay');
  if (overlay) overlay.style.display = 'none';
  if (currentView === 'flashcard') {
    renderFlashcard();
  }
}

function renderStealthCard() {
  if (stealthSubMode === 'mail') {
    renderStealthMailCard();
  } else {
    renderStealthCodeCard();
  }
}

function renderStealthCodeCard() {
  if (cardList.length === 0) return;
  const item = cardList[cardIndex];
  if (!item) return;

  const word = (item.text || item.word || "").trim();
  const safeIdentifier = word.replace(/[^a-zA-Z0-9_$]/g, '_') || 'routine';
  const phonetic = extractPhoneticFromItem(item);
  const trans = formatTrans(item.trans || item.definition || "");
  const notes = cleanNotes(item.notes);
  const context = (item.context || item.sentence || "").trim() || `Core execution context for ${word}.`;
  const srs = getSrsInfo(item.srsLevel || 0);

  const pct = Math.round(((cardIndex + 1) / batchTotalTarget) * 100);
  const progEl = document.getElementById('stealthProgressStatus');
  if (progEl) {
    progEl.innerText = `Tests: ${cardIndex + 1}/${batchTotalTarget} passing (${pct}%)`;
  }
  const bcSym = document.getElementById('stealthBreadcrumbSymbol');
  if (bcSym) {
    bcSym.innerText = `process_${safeIdentifier}()`;
  }

  // 构建逼真的 VS Code TypeScript 编辑器行
  const codeLines = [
    { num: 1, html: `<span class="syn-kwd">import</span> { evaluateSRS, CacheRecord, SRSLevel } <span class="syn-kwd">from</span> <span class="syn-str">"../types/memory"</span>;` },
    { num: 2, html: `<span class="syn-kwd">import</span> { SystemLogger, TelemetryHook } <span class="syn-kwd">from</span> <span class="syn-str">"../utils/telemetry"</span>;` },
    { num: 3, html: `` },
    { num: 4, html: `<span class="syn-comment">/**</span>` },
    { num: 5, html: `<span class="syn-comment"> * @module core/services/memoryCacheService</span>` },
    { num: 6, html: `<span class="syn-comment"> * @currentCycle batch: ${batchTotalTarget} units | compiled: ${pct}%</span>` },
    { num: 7, html: `<span class="syn-comment"> */</span>` },
    { num: 8, html: `<span class="syn-kwd">export class</span> <span class="syn-type">MemoryCacheService</span> {` },
    { num: 9, html: `  <span class="syn-kwd">private readonly</span> <span class="syn-prop">moduleIdentifier</span>: <span class="syn-type">string</span> = <span class="syn-str">"AntigravityCore"</span>;` },
    { num: 10, html: `  <span class="syn-kwd">public static readonly</span> <span class="syn-prop">TARGET_IPA</span>: <span class="syn-type">string</span> = <span class="syn-str">"${escapeHtml(phonetic || '/.../')}"</span>;` },
    { num: 11, html: `` },
    { num: 12, html: `  <span class="syn-comment">/**</span>` },
    { num: 13, html: `   <span class="syn-comment">* Target symbol handler: [ <span class="syn-spec-text" style="font-weight: 700; font-size: 14px;">${escapeHtml(word)}</span> ]</span>` },
    { num: 14, html: `   <span class="syn-comment">* Current Mastery: <span class="syn-ipa">${escapeHtml(srs.label)}</span> (Stage ${item.srsLevel || 0})</span>` },
    { num: 15, html: `   <span class="syn-comment">*</span>` }
  ];

  let nextLineNum = 16;

  if (cardRevealed) {
    // 展开状态：以规范 JSDoc 的 @spec 和 @notes 呈现详细释义与笔记
    const transLines = trans.split('\n').filter(Boolean);
    transLines.forEach(tl => {
      codeLines.push({
        num: nextLineNum++,
        html: `   <span class="syn-comment">* <span class="syn-jsdoc-tag">@spec</span> <span class="syn-spec-text">${escapeHtml(tl)}</span></span>`,
        highlight: true
      });
    });

    if (notes) {
      const noteLines = notes.split('\n').filter(Boolean);
      noteLines.forEach(nl => {
        codeLines.push({
          num: nextLineNum++,
          html: `   <span class="syn-comment">* <span class="syn-jsdoc-tag">@internal_notes</span> <span class="syn-notes-text">${escapeHtml(nl)}</span></span>`,
          highlight: true
        });
      });
    }

    codeLines.push({
      num: nextLineNum++,
      html: `   <span class="syn-comment">* <span class="syn-jsdoc-tag">@folded</span> <span class="stealth-reveal-pill" id="stealthFoldTrigger">折叠释义 (Space)</span></span>`
    });
  } else {
    // 未揭晓状态：显示折叠提示微胶囊，点击或按 Space 展开
    codeLines.push({
      num: nextLineNum++,
      html: `   <span class="syn-comment">* <span class="syn-jsdoc-tag">@specification</span> [JSDoc folded: <span class="stealth-reveal-pill" id="stealthFoldTrigger">按 [Space] 展开规格释义</span>]</span>`,
      highlight: true
    });
  }

  codeLines.push({ num: nextLineNum++, html: `   <span class="syn-comment">*/</span>` });
  codeLines.push({ num: nextLineNum++, html: `  <span class="syn-kwd">public async</span> <span class="syn-fn">process_${safeIdentifier}</span>(<span class="syn-var">contextToken</span>?: <span class="syn-type">string</span>): <span class="syn-type">Promise</span>&lt;<span class="syn-type">CacheRecord</span>&gt; {` });
  codeLines.push({ num: nextLineNum++, html: `    <span class="syn-comment">// Verified context sentence:</span>` });
  codeLines.push({ num: nextLineNum++, html: `    <span class="syn-kwd">const</span> <span class="syn-var">executionSentence</span> = <span class="syn-str">"${escapeHtml(context).replace(/"/g, '\\"')}"</span>;` });
  codeLines.push({ num: nextLineNum++, html: `` });
  codeLines.push({ num: nextLineNum++, html: `    <span class="syn-comment">// Evaluate memory state: [1: RETRY(忘了) | 2: PENDING(模糊) | 3: RESOLVED(熟练)]</span>` });
  codeLines.push({ num: nextLineNum++, html: `    <span class="syn-kwd">return await</span> <span class="syn-fn">evaluateSRS</span>({` });
  codeLines.push({ num: nextLineNum++, html: `      <span class="syn-prop">symbol</span>: <span class="syn-str">"${escapeHtml(word)}"</span>,` });
  codeLines.push({ num: nextLineNum++, html: `      <span class="syn-prop">level</span>: <span class="syn-type">SRSLevel</span>.STAGE_${item.srsLevel || 0},` });
  codeLines.push({ num: nextLineNum++, html: `      <span class="syn-prop">telemetryContext</span>: <span class="syn-var">executionSentence</span>,` });
  codeLines.push({ num: nextLineNum++, html: `      <span class="syn-prop">status</span>: <span class="syn-num">200</span>` });
  codeLines.push({ num: nextLineNum++, html: `    });` });
  codeLines.push({ num: nextLineNum++, html: `  }` });
  codeLines.push({ num: nextLineNum++, html: `}` });

  // 渲染代码行
  const container = document.getElementById('stealthCodeContent');
  if (container) {
    container.innerHTML = codeLines.map(line => `
      <div class="code-line ${line.highlight ? 'highlight-line' : ''}">
        <span class="line-num">${line.num}</span>
        <span class="line-code">${line.html}</span>
      </div>
    `).join('');

    const foldBtn = document.getElementById('stealthFoldTrigger');
    if (foldBtn) {
      foldBtn.onclick = (e) => {
        e.stopPropagation();
        toggleCardReveal();
      };
    }
  }
}

function renderStealthMailCard() {
  if (cardList.length === 0) return;
  const item = cardList[cardIndex];
  if (!item) return;

  const word = (item.text || item.word || "").trim();
  const phonetic = extractPhoneticFromItem(item);
  const trans = formatTrans(item.trans || item.definition || "");
  const notes = cleanNotes(item.notes);
  const context = (item.context || item.sentence || "").trim() || `Core operational context for ${word}.`;
  const pct = Math.round(((cardIndex + 1) / batchTotalTarget) * 100);

  const progEl = document.getElementById('stealthProgressStatus');
  if (progEl) {
    progEl.innerText = `Mail: ${cardIndex + 1}/${batchTotalTarget} reviewed (${pct}%)`;
  }

  const wordTextEl = document.getElementById('mailWordText');
  if (wordTextEl) wordTextEl.innerText = word;

  const wordIpaEl = document.getElementById('mailWordIpa');
  if (wordIpaEl) wordIpaEl.innerText = phonetic ? phonetic : '';

  const contextEl = document.getElementById('mailContextText');
  if (contextEl) contextEl.innerText = context;

  const inboxCountEl = document.getElementById('mailInboxCount');
  if (inboxCountEl) inboxCountEl.innerText = batchTotalTarget;

  const detailSubjectEl = document.getElementById('mailDetailSubject');
  if (detailSubjectEl) {
    detailSubjectEl.innerText = `[Action Required] Terminology Spec Review - Item #${cardIndex + 1} (${word})`;
  }

  const cardSubjectEl = document.getElementById('mailCardSubject');
  if (cardSubjectEl) {
    cardSubjectEl.innerText = `[Action Required] Spec #${cardIndex + 1}: ${word}`;
  }

  const cardSnippetEl = document.getElementById('mailCardSnippet');
  if (cardSnippetEl) {
    cardSnippetEl.innerText = `Please verify usage: "${context.slice(0, 42)}..."`;
  }

  const foldTrigger = document.getElementById('mailFoldTrigger');
  const specBox = document.getElementById('mailSpecBox');
  const specTrans = document.getElementById('mailSpecTrans');
  const specNotes = document.getElementById('mailSpecNotes');

  if (cardRevealed) {
    if (foldTrigger) foldTrigger.style.display = 'none';
    if (specBox) specBox.style.display = 'block';
    if (specTrans) specTrans.innerText = trans;
    if (notes && notes.trim()) {
      if (specNotes) {
        specNotes.style.display = 'block';
        specNotes.innerText = notes;
      }
    } else {
      if (specNotes) specNotes.style.display = 'none';
    }
  } else {
    if (foldTrigger) foldTrigger.style.display = 'flex';
    if (specBox) specBox.style.display = 'none';
  }
}

// 视图切换控制 (支持 table 与 flashcard 纯净双视图)
function switchView(viewName) {
  currentView = viewName;
  const tableContainer = document.getElementById('viewTableContainer');
  const flashcardContainer = document.getElementById('viewFlashcardContainer');

  const tabTable = document.getElementById('tabTableView');
  const tabCard = document.getElementById('tabFlashcardView');

  if (tableContainer) tableContainer.style.display = viewName === 'table' ? 'block' : 'none';
  if (flashcardContainer) flashcardContainer.style.display = viewName === 'flashcard' ? 'flex' : 'none';

  if (tabTable) tabTable.classList.toggle('active', viewName === 'table');
  if (tabCard) tabCard.classList.toggle('active', viewName === 'flashcard');

  if (viewName === 'table') {
    applyFilter();
  } else if (viewName === 'flashcard') {
    updateFlashcardList(true);
  }
}

function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const colors = ['#CC785C', '#059669', '#2563EB', '#D97706', '#8B5CF6', '#EC4899'];
  const particles = [];
  for (let i = 0; i < 70; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() * 240 - 120),
      y: canvas.height / 2 + 60,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() * -13) - 5,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      gravity: 0.36,
      opacity: 1
    });
  }

  let frame = 0;
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotSpeed;
      p.opacity -= 0.009;

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    frame++;
    if (alive && frame < 180) {
      requestAnimationFrame(render);
    } else {
      canvas.style.display = 'none';
    }
  }
  requestAnimationFrame(render);
}

function renderFlashcard() {
  const barUnrevealed = document.getElementById('smartBarUnrevealed');
  const barRevealed = document.getElementById('smartBarRevealed');

  if (cardList.length === 0) {
    document.getElementById('fcWord').innerText = "当前筛选暂无自测词汇";
    document.getElementById('fcPhonetic').innerText = "";
    document.getElementById('fcContext').innerText = selectedSrsSet.has('all') ? "生词本为空，快去外刊划词加入吧！" : "恭喜！所选分组下暂无待复习词汇。";
    document.getElementById('fcAnswerBox').style.display = 'none';
    document.getElementById('cardCurrentIndex').innerText = "0";
    document.getElementById('cardTotalCount').innerText = "0";
    document.getElementById('cardProgressFill').style.width = '0%';
    if (barUnrevealed) barUnrevealed.style.display = 'none';
    if (barRevealed) barRevealed.style.display = 'none';
    return;
  }

  if (barUnrevealed) barUnrevealed.style.display = 'flex';
  if (barRevealed) barRevealed.style.display = 'none';

  if (cardIndex >= cardList.length) cardIndex = 0;
  if (cardIndex < 0) cardIndex = cardList.length - 1;

  const item = cardList[cardIndex];
  const word = item.text || item.word || "";
  const phonetic = extractPhoneticFromItem(item);
  const trans = formatTrans(item.trans || item.definition || "");
  const notes = cleanNotes(item.notes);
  const context = highlightWordInSentence(item.context || item.sentence || "暂无上下文例句", word);
  const srs = getSrsInfo(item.srsLevel || 0);

  document.getElementById('fcWord').innerText = word;
  document.getElementById('fcPhonetic').innerText = phonetic;
  document.getElementById('fcContext').innerHTML = context;
  document.getElementById('fcTrans').innerText = trans;

  const badgeEl = document.getElementById('fcSrsBadge');
  badgeEl.className = `srs-badge ${srs.class}`;
  document.getElementById('fcSrsText').innerText = srs.label;

  const notesEl = document.getElementById('fcNotes');
  if (notes && notes.trim()) {
    notesEl.innerText = notes;
    notesEl.style.display = 'block';
  } else {
    notesEl.style.display = 'none';
  }

  // 重置揭晓状态
  cardRevealed = false;
  document.getElementById('fcAnswerBox').style.display = 'none';
  document.getElementById('cardHintText').innerText = "点击卡片翻转揭晓释义";

  // 进度指示
  document.getElementById('cardCurrentIndex').innerText = (cardIndex + 1).toString();
  document.getElementById('cardTotalCount').innerText = batchTotalTarget.toString();
  const pct = Math.min(100, ((cardIndex + 1) / batchTotalTarget) * 100);
  document.getElementById('cardProgressFill').style.width = `${pct}%`;
}

function showBatchSummary() {
  const summaryCard = document.getElementById('flashcardSummaryCard');
  const cardBox = document.getElementById('flashcardBox');
  const barUnrevealed = document.getElementById('smartBarUnrevealed');
  const barRevealed = document.getElementById('smartBarRevealed');

  if (summaryCard && cardBox) {
    cardBox.style.display = 'none';
    if (barUnrevealed) barUnrevealed.style.display = 'none';
    if (barRevealed) barRevealed.style.display = 'none';
    summaryCard.style.display = 'flex';

    document.getElementById('statForgotCount').innerText = batchStats.forgot.toString();
    document.getElementById('statHardCount').innerText = batchStats.hard.toString();
    document.getElementById('statGoodCount').innerText = batchStats.good.toString();
    document.getElementById('summarySubtitle').innerText = `您已完成本组 ${batchTotalTarget} 个单词的艾宾浩斯强化自测！`;

    // 绽放 Apple 级五彩礼花微动效
    triggerConfetti();
  }
}

function toggleCardReveal() {
  // 如果用户当前正在划选例句文本，绝不触发翻转卡片
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) {
    return;
  }

  cardRevealed = !cardRevealed;
  const ansBox = document.getElementById('fcAnswerBox');
  const hint = document.getElementById('cardHintText');
  const barUnrevealed = document.getElementById('smartBarUnrevealed');
  const barRevealed = document.getElementById('smartBarRevealed');

  if (cardRevealed) {
    ansBox.style.display = 'block';
    hint.innerText = "请根据记忆情况进行反馈";
    if (barUnrevealed) barUnrevealed.style.display = 'none';
    if (barRevealed) barRevealed.style.display = 'flex';
  } else {
    ansBox.style.display = 'none';
    hint.innerText = "点击卡片翻转揭晓释义";
    if (barUnrevealed) barUnrevealed.style.display = 'flex';
    if (barRevealed) barRevealed.style.display = 'none';
  }

  if (isStealthMode) {
    renderStealthCard();
  }
}

// 艾宾浩斯记忆反馈处理 (1: 忘了, 2: 模糊, 3: 熟练)
function handleSRSFeedback(rating) {
  if (cardList.length === 0) return;
  const item = cardList[cardIndex];
  if (!item) return;

  const currentLevel = parseInt(item.srsLevel) || 0;
  let newLevel = currentLevel;
  let intervalDays = 1;

  if (rating === 1) { // 忘了
    newLevel = 0;
    intervalDays = 0.5;
    batchStats.forgot++;
  } else if (rating === 2) { // 模糊
    newLevel = Math.max(1, currentLevel);
    intervalDays = 1;
    batchStats.hard++;
  } else if (rating === 3) { // 熟练
    newLevel = Math.min(3, currentLevel + 1);
    intervalDays = newLevel === 3 ? 7 : (newLevel === 2 ? 3 : 1);
    batchStats.good++;
  }

  batchStats.completedCount++;

  item.srsLevel = newLevel;
  item.srsNextReview = Date.now() + intervalDays * 24 * 3600 * 1000;
  item.srsReviews = (item.srsReviews || 0) + 1;

  // 同步更新主词库中的该词
  const realIdx = currentWords.findIndex(w => (w.text || w.word) === (item.text || item.word));
  if (realIdx !== -1) {
    currentWords[realIdx] = Object.assign(currentWords[realIdx], item);
    isInternalSrsUpdate = true;
    chrome.storage.local.set({ savedWords: currentWords }, () => {
      isInternalSrsUpdate = false;
      doWebDAVSync(false);
    });
  }

  // 判断是否已完成本组自测
  if (batchStats.completedCount >= batchTotalTarget) {
    if (isStealthMode) {
      if (stealthSubMode === 'mail') {
        showStealthToast(`🎉 All ${batchTotalTarget} mail review items completed!`);
      } else {
        showStealthToast(`🎉 All ${batchTotalTarget} tests compiled & passed!`);
      }
    } else {
      showBatchSummary();
    }
    return;
  }

  // 平滑切换到下一张
  cardIndex = (cardIndex + 1) % cardList.length;
  if (isStealthMode) {
    renderStealthCard();
  } else {
    renderFlashcard();
  }
}

function nextCard() {
  if (cardList.length === 0) return;
  cardIndex = (cardIndex + 1) % cardList.length;
  if (isStealthMode) {
    renderStealthCard();
  } else {
    renderFlashcard();
  }
}

function prevCard() {
  if (cardList.length === 0) return;
  cardIndex = (cardIndex - 1 + cardList.length) % cardList.length;
  if (isStealthMode) {
    renderStealthCard();
  } else {
    renderFlashcard();
  }
}

function shuffleCards() {
  if (cardList.length <= 1) return;
  for (let i = cardList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardList[i], cardList[j]] = [cardList[j], cardList[i]];
  }
  cardIndex = 0;
  renderFlashcard();
  const current = cardList[0];
  if (current) speakWord(current.text || current.word);
}

let selectedSrsSet = new Set(['all']); // 支持多选熟练度过滤

function applyFilter() {
  const q = (document.getElementById('searchInput') ? document.getElementById('searchInput').value : "").toLowerCase().trim();

  const filtered = currentWords.filter(item => {
    // 文本匹配：精准匹配生词本身、中文释义、心得笔记，坚决不搜例句 context，杜绝同一例句带出多个词
    const wordText = (item.text || item.word || '').toLowerCase();
    const transText = (item.trans || item.definition || '').toLowerCase();
    const notesText = (item.notes || '').toLowerCase();

    const matchText = !q || (
      wordText.includes(q) ||
      transText.includes(q) ||
      notesText.includes(q)
    );

    // 熟练度多选匹配
    let matchSrs = true;
    if (!selectedSrsSet.has('all')) {
      const itemLv = (parseInt(item.srsLevel) || 0).toString();
      matchSrs = selectedSrsSet.has(itemLv);
    }

    return matchText && matchSrs;
  });

  filteredWords = filtered;
  renderList(filtered);
  if (currentView !== 'flashcard') {
    updateFlashcardList(false);
  }
}

function saveAndRefresh() {
  chrome.storage.local.set({ savedWords: currentWords }, () => {
    doFullSync(false);
    applyFilter();
  });
}

// 模态弹窗管理
const modal = document.getElementById('editModal');
const vocabForm = document.getElementById('vocabForm');
const modalTitle = document.getElementById('modalTitle');
const editIndexInput = document.getElementById('editIndex');
const autoFillStatus = document.getElementById('wordAutoFillStatus');
const modalSubmitBtn = document.getElementById('modalSubmitBtn');

const davModal = document.getElementById('webdavModal');
const davForm = document.getElementById('davForm');

function openAddModal() {
  modalTitle.innerText = "添加新词条";
  if (modalSubmitBtn) modalSubmitBtn.innerText = "保存入库";
  editIndexInput.value = "-1";
  vocabForm.reset();
  if (autoFillStatus) autoFillStatus.style.display = "none";
  modal.style.display = "flex";
  document.getElementById('inputWord').focus();
}

function openEditModal(idx) {
  modalTitle.innerText = "编辑生词与笔记";
  if (modalSubmitBtn) modalSubmitBtn.innerText = "保存修改";
  editIndexInput.value = idx.toString();
  const item = currentWords[idx];
  if (!item) return;

  document.getElementById('inputWord').value = item.text || item.word || "";
  document.getElementById('inputPhonetic').value = extractPhoneticFromItem(item);
  document.getElementById('inputTrans').value = item.trans || item.definition || "";
  document.getElementById('inputContext').value = item.context || item.sentence || "";
  document.getElementById('inputNotes').value = cleanNotes(item.notes);

  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}

function openDavModal() {
  if (webdavConfig) {
    document.getElementById('davServer').value = webdavConfig.serverUrl || "https://dav.jianguoyun.com/dav/";
    document.getElementById('davUsername').value = webdavConfig.username || "";
    document.getElementById('davPassword').value = webdavConfig.password || "";
    document.getElementById('davPath').value = webdavConfig.filePath || "antigravity/antigravity.json";
    document.getElementById('davEnable').checked = !!webdavConfig.enabled;
  }
  chrome.storage.sync.get({ eudicToken: "" }, (r) => {
    const eudicInp = document.getElementById('eudicTokenInput');
    if (eudicInp && r.eudicToken) {
      eudicInp.value = r.eudicToken;
    }
  });
  davModal.style.display = "flex";
}

function closeDavModal() {
  davModal.style.display = "none";
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({ webdavConfig: null }, (res) => {
    webdavConfig = res.webdavConfig;
    if (webdavConfig && webdavConfig.enabled) {
      updateSyncBadge('connected', '坚果云已就绪');
      doWebDAVSync(false);
    }
  });

  // 读取本地生词库 (默认空白 [])
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const list = res.savedWords || [];
    currentWords = list.map(item => {
      item.notes = cleanNotes(item.notes);
      if (item.phonetic) item.phonetic = cleanIPA(item.phonetic);
      if (typeof item.srsLevel === 'undefined') item.srsLevel = 0;
      return item;
    });
    
    applyFilter();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.savedWords) {
      currentWords = changes.savedWords.newValue || [];
      if (!isInternalSrsUpdate && currentView !== 'flashcard') {
        applyFilter();
      }
    }
  });

  // 添加新词输入框防抖智能联想与失焦查词补全
  let autoLookupTimeout = null;
  function handleWordInputAutoFill(val) {
    const text = (val || "").trim();
    if (!text || text.length < 2) {
      if (autoFillStatus) autoFillStatus.style.display = 'none';
      return;
    }

    if (autoFillStatus) {
      autoFillStatus.innerText = "✨ 正在智能联想音标与释义...";
      autoFillStatus.style.display = 'inline';
    }

    chrome.runtime.sendMessage({ action: "LOOKUP_WORD", word: text }, (res) => {
      if (!res) {
        if (autoFillStatus) autoFillStatus.style.display = 'none';
        return;
      }
      const phoneticInp = document.getElementById('inputPhonetic');
      const transInp = document.getElementById('inputTrans');
      
      if (res.phonetic && phoneticInp && (!phoneticInp.value.trim() || editIndexInput.value === "-1")) {
        phoneticInp.value = cleanIPA(res.phonetic);
      }
      if ((res.definition || res.translation) && transInp && (!transInp.value.trim() || editIndexInput.value === "-1")) {
        transInp.value = formatTrans(res.definition || res.translation);
      }
      if (autoFillStatus) {
        autoFillStatus.innerText = "✓ 已自动补全音标与释义";
        setTimeout(() => {
          if (autoFillStatus) autoFillStatus.style.display = 'none';
        }, 1800);
      }
    });
  }

  const inputWordEl = document.getElementById('inputWord');
  if (inputWordEl) {
    inputWordEl.addEventListener('input', (e) => {
      clearTimeout(autoLookupTimeout);
      autoLookupTimeout = setTimeout(() => {
        handleWordInputAutoFill(e.target.value);
      }, 400);
    });
    inputWordEl.addEventListener('blur', (e) => {
      handleWordInputAutoFill(e.target.value);
    });
  }

  // Tab 切换事件 (笔记本 / 闪卡自测 纯净双模式)
  document.getElementById('tabTableView').onclick = () => switchView('table');
  document.getElementById('tabFlashcardView').onclick = () => switchView('flashcard');

  // 闪卡自测事件
  document.getElementById('flashcardBox').onclick = toggleCardReveal;

  // 闪卡实时编辑按钮 (点击打开编辑窗，保存即时重绘当前卡片)
  const btnFcEdit = document.getElementById('btnFcEdit');
  if (btnFcEdit) {
    btnFcEdit.onclick = (e) => {
      e.stopPropagation(); // 绝对阻止卡片翻转
      if (cardList.length === 0) return;
      const item = cardList[cardIndex];
      if (!item) return;
      const targetWord = item.text || item.word;
      const realIdx = currentWords.findIndex(w => (w.text || w.word) === targetWord);
      if (realIdx !== -1) {
        openEditModal(realIdx);
      }
    };
  }
  
  const btnRevealCard = document.getElementById('btnRevealCard');
  if (btnRevealCard) {
    btnRevealCard.onclick = (e) => {
      e.stopPropagation();
      toggleCardReveal();
    };
  }

  document.getElementById('btnCardNext').onclick = (e) => {
    e.stopPropagation();
    nextCard();
  };
  document.getElementById('btnCardPrev').onclick = (e) => {
    e.stopPropagation();
    prevCard();
  };
  document.getElementById('btnCardShuffle').onclick = (e) => {
    e.stopPropagation();
    shuffleCards();
  };
  
  const fcAudioPill = document.getElementById('fcAudioPill');
  if (fcAudioPill) {
    fcAudioPill.onclick = (e) => {
      e.stopPropagation();
      const w = document.getElementById('fcWord').innerText;
      speakWord(w);
    };
  }

  // 闪卡定量自测 Tabs (10 / 20 / 50 / 全部)
  const batchTabs = document.querySelectorAll('.batch-tab');
  batchTabs.forEach(tab => {
    tab.onclick = () => {
      batchTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentBatchSize = tab.getAttribute('data-size');
      updateFlashcardList(true);
    };
  });

  const btnRestartBatch = document.getElementById('btnRestartBatch');
  if (btnRestartBatch) {
    btnRestartBatch.onclick = () => {
      updateFlashcardList(true);
    };
  }

  const btnBackToTable = document.getElementById('btnBackToTable');
  if (btnBackToTable) {
    btnBackToTable.onclick = () => {
      switchView('table');
    };
  }

  // 摸鱼模式触发入口与退出按钮绑定
  const btnEnterStealth = document.getElementById('btnEnterStealth');
  if (btnEnterStealth) {
    btnEnterStealth.onclick = (e) => {
      e.stopPropagation();
      enterStealthMode();
    };
  }
  const stealthCloseBtn = document.getElementById('stealthCloseBtn');
  if (stealthCloseBtn) stealthCloseBtn.onclick = exitStealthMode;
  const stealthExitHint = document.getElementById('stealthExitHint');
  if (stealthExitHint) stealthExitHint.onclick = exitStealthMode;
  const stealthExitTrigger = document.getElementById('stealthExitTrigger');
  if (stealthExitTrigger) stealthExitTrigger.onclick = exitStealthMode;

  // 摸鱼模式子视图切换 (代码模式 vs 邮件模式)
  const btnStealthCodeMode = document.getElementById('btnStealthCodeMode');
  if (btnStealthCodeMode) {
    btnStealthCodeMode.onclick = (e) => {
      e.stopPropagation();
      switchStealthSubMode('code');
    };
  }
  const btnStealthMailMode = document.getElementById('btnStealthMailMode');
  if (btnStealthMailMode) {
    btnStealthMailMode.onclick = (e) => {
      e.stopPropagation();
      switchStealthSubMode('mail');
    };
  }

  // 摸鱼邮件模式内操作与反馈按钮绑定
  const mailFoldTrigger = document.getElementById('mailFoldTrigger');
  if (mailFoldTrigger) {
    mailFoldTrigger.onclick = (e) => {
      e.stopPropagation();
      toggleCardReveal();
    };
  }
  const mailActiveItem = document.getElementById('mailCardActiveItem');
  if (mailActiveItem) {
    mailActiveItem.onclick = (e) => {
      e.stopPropagation();
      toggleCardReveal();
    };
  }

  const btnMailSrs0 = document.getElementById('btnMailSrs0');
  if (btnMailSrs0) {
    btnMailSrs0.onclick = (e) => {
      e.stopPropagation();
      handleSRSFeedback(1);
      showStealthToast('[Mail Review: REJECTED (生疏)]');
    };
  }
  const btnMailSrs1 = document.getElementById('btnMailSrs1');
  if (btnMailSrs1) {
    btnMailSrs1.onclick = (e) => {
      e.stopPropagation();
      handleSRSFeedback(2);
      showStealthToast('[Mail Review: PENDING (模糊)]');
    };
  }
  const btnMailSrs3 = document.getElementById('btnMailSrs3');
  if (btnMailSrs3) {
    btnMailSrs3.onclick = (e) => {
      e.stopPropagation();
      handleSRSFeedback(3);
      showStealthToast('[Mail Review: APPROVED (熟练)]');
    };
  }

  const btnMailPrev = document.getElementById('btnMailPrev');
  if (btnMailPrev) {
    btnMailPrev.onclick = (e) => {
      e.stopPropagation();
      prevCard();
    };
  }
  const btnMailNext = document.getElementById('btnMailNext');
  if (btnMailNext) {
    btnMailNext.onclick = (e) => {
      e.stopPropagation();
      nextCard();
    };
  }

  const btnMailReply = document.getElementById('btnMailReply');
  if (btnMailReply) {
    btnMailReply.onclick = (e) => {
      e.stopPropagation();
      showStealthToast('[Mail System: Draft reply generated]');
    };
  }
  const btnMailForward = document.getElementById('btnMailForward');
  if (btnMailForward) {
    btnMailForward.onclick = (e) => {
      e.stopPropagation();
      showStealthToast('[Mail System: Forward window opened]');
    };
  }
  const btnMailArchive = document.getElementById('btnMailArchive');
  if (btnMailArchive) {
    btnMailArchive.onclick = (e) => {
      e.stopPropagation();
      showStealthToast('[Mail System: Archived to team box]');
      nextCard();
    };
  }

  // 艾宾浩斯自测反馈按键点击
  document.getElementById('btnSrsAgain').onclick = (e) => {
    e.stopPropagation();
    handleSRSFeedback(1);
  };
  document.getElementById('btnSrsHard').onclick = (e) => {
    e.stopPropagation();
    handleSRSFeedback(2);
  };
  document.getElementById('btnSrsGood').onclick = (e) => {
    e.stopPropagation();
    handleSRSFeedback(3);
  };

  // 全局键盘快捷键 (支持常规与摸鱼双模式全键盘操作)
  document.addEventListener('keydown', (e) => {
    if (modal.style.display === 'flex' || davModal.style.display === 'flex') return;

    // 摸鱼模式极速老板键 (按 Esc 瞬间退出隐藏)
    if (e.code === 'Escape' && isStealthMode) {
      e.preventDefault();
      exitStealthMode();
      return;
    }

    // Alt + M 快捷键快速切换摸鱼模式
    if (e.altKey && e.code === 'KeyM') {
      e.preventDefault();
      if (isStealthMode) {
        exitStealthMode();
      } else {
        enterStealthMode();
      }
      return;
    }

    if (document.activeElement === document.getElementById('searchInput')) return;

    // 摸鱼模式专属键盘操作 (极度逼真无痕体验)
    if (isStealthMode) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        toggleCardReveal();
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault();
        handleSRSFeedback(1);
        showStealthToast(stealthSubMode === 'mail' ? '[Mail Review: REJECTED (生疏)]' : '[Git Commit: Memory REJECT (0)]');
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        e.preventDefault();
        handleSRSFeedback(2);
        showStealthToast(stealthSubMode === 'mail' ? '[Mail Review: PENDING (模糊)]' : '[Git Commit: Memory PENDING (1)]');
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        e.preventDefault();
        handleSRSFeedback(3);
        showStealthToast(stealthSubMode === 'mail' ? '[Mail Review: APPROVED (熟练)]' : '[Git Commit: Memory RESOLVED (3)]');
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyJ') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyK') {
        e.preventDefault();
        prevCard();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        if (cardList[cardIndex]) {
          speakWord(cardList[cardIndex].text || cardList[cardIndex].word);
        }
      }
      return;
    }

    if (currentView === 'flashcard') {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleCardReveal();
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault();
        if (!cardRevealed) toggleCardReveal();
        handleSRSFeedback(1);
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        e.preventDefault();
        if (!cardRevealed) toggleCardReveal();
        handleSRSFeedback(2);
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        e.preventDefault();
        if (!cardRevealed) toggleCardReveal();
        handleSRSFeedback(3);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        prevCard();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        const w = document.getElementById('fcWord').innerText;
        speakWord(w);
      }
    }
  });

  // 闪卡纯净音标点击朗读
  const fcPhoneticEl = document.getElementById('fcPhonetic');
  if (fcPhoneticEl) {
    fcPhoneticEl.onclick = (e) => {
      e.stopPropagation();
      const w = document.getElementById('fcWord').innerText;
      speakWord(w);
    };
  }

  // 状态胶囊点击：点击图标立即触发手动刷新，点击胶囊文本打开设置面板
  const btnSyncStatus = document.getElementById('btnSyncStatus');
  const syncDotEl = document.getElementById('syncDot');

  if (syncDotEl) {
    syncDotEl.onclick = (e) => {
      e.stopPropagation();
      syncDotEl.classList.add('rotating');
      doWebDAVSync(false).then(() => {
        setTimeout(() => {
          syncDotEl.classList.remove('rotating');
        }, 800);
      }).catch(() => {
        syncDotEl.classList.remove('rotating');
      });
    };
  }

  if (btnSyncStatus) {
    btnSyncStatus.onclick = openDavModal;
  }
  document.getElementById('davModalClose').onclick = closeDavModal;

  // 欧路词典 (Eudic) 一键拉取合并
  const btnEudicSync = document.getElementById('btnEudicSync');
  if (btnEudicSync) {
    btnEudicSync.onclick = async (e) => {
      e.preventDefault();
      const token = (document.getElementById('eudicTokenInput') ? document.getElementById('eudicTokenInput').value : "").trim();
      if (!token) {
        alert("请先填写欧路词典授权 Token（可点击右上角「👉 获取授权 Token」在欧路开放平台一键生成）。");
        return;
      }

      const statusEl = document.getElementById('eudicSyncStatus');
      btnEudicSync.disabled = true;
      btnEudicSync.innerText = "⏳ 正在拉取欧路生词...";
      if (statusEl) statusEl.innerText = "正在连接欧路 OpenAPI...";

      try {
        chrome.storage.sync.set({ eudicToken: token });

        const engine = new EudicSyncEngine(token);
        if (statusEl) statusEl.innerText = "正在验证授权并扫描全部分类生词本...";
        const eudicWords = await engine.fetchAllCategoriesAndWords();

        if (statusEl) statusEl.innerText = `已拉取 ${eudicWords.length} 词，正在比对合并...`;
        const { mergedList, newAddedCount, totalEudicScanned } = engine.mergeEudicWords(currentWords, eudicWords);

        currentWords = mergedList;
        chrome.storage.local.set({ savedWords: currentWords }, () => {
          applyFilter();
          doWebDAVSync(false);
          alert(`🎉 欧路词典同步成功！\n\n• 扫描欧路生词: ${totalEudicScanned} 个\n• 成功新增入库: ${newAddedCount} 个未收录单词\n• 当前生词库总量: ${currentWords.length} 个\n\n新数据已自动同步至坚果云多端漫游！`);
          if (statusEl) statusEl.innerText = `已同步: 新增 ${newAddedCount} 词 (总计: ${currentWords.length})`;
        });
      } catch (err) {
        alert(`❌ 欧路词典同步失败: ${err.message}`);
        if (statusEl) statusEl.innerText = `同步失败: ${err.message}`;
      } finally {
        btnEudicSync.disabled = false;
        btnEudicSync.innerText = "📥 立即从欧路词典拉取合并";
      }
    };
  }

  document.getElementById('davTestBtn').onclick = () => {
    const cfg = {
      serverUrl: document.getElementById('davServer').value.trim(),
      username: document.getElementById('davUsername').value.trim(),
      password: document.getElementById('davPassword').value.trim(),
      filePath: document.getElementById('davPath').value.trim(),
      enabled: document.getElementById('davEnable').checked
    };
    webdavConfig = cfg;
    chrome.storage.sync.set({ webdavConfig: cfg }, () => {
      doWebDAVSync(true);
    });
  };

  davForm.onsubmit = (e) => {
    e.preventDefault();
    const cfg = {
      serverUrl: document.getElementById('davServer').value.trim(),
      username: document.getElementById('davUsername').value.trim(),
      password: document.getElementById('davPassword').value.trim(),
      filePath: document.getElementById('davPath').value.trim(),
      enabled: document.getElementById('davEnable').checked
    };
    webdavConfig = cfg;
    chrome.storage.sync.set({ webdavConfig: cfg }, () => {
      closeDavModal();
      doWebDAVSync(true);
    });
  };

  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalCancel').onclick = closeModal;
  document.getElementById('btnAddWord').onclick = openAddModal;

  vocabForm.onsubmit = (e) => {
    e.preventDefault();
    const idx = parseInt(editIndexInput.value);
    const word = document.getElementById('inputWord').value.trim();
    const phonetic = document.getElementById('inputPhonetic').value.trim();
    const trans = document.getElementById('inputTrans').value.trim();
    const context = document.getElementById('inputContext').value.trim();
    const notes = document.getElementById('inputNotes').value.trim();
    const existingItem = (idx >= 0 && currentWords[idx]) ? currentWords[idx] : null;

    const newItem = {
      text: word,
      trans: trans,
      phonetic: cleanIPA(phonetic),
      context: context,
      title: existingItem ? (existingItem.title || "") : "",
      url: existingItem ? (existingItem.url || "") : "",
      date: Date.now(),
      notes: notes,
      srsLevel: existingItem ? (existingItem.srsLevel || 0) : 0
    };

    if (idx === -1) {
      const existIdx = currentWords.findIndex(w => (w.text || w.word || "").toLowerCase() === word.toLowerCase());
      if (existIdx !== -1) {
        currentWords[existIdx] = Object.assign(currentWords[existIdx], newItem);
      } else {
        currentWords.unshift(newItem);
      }
    } else {
      currentWords[idx] = Object.assign(currentWords[idx] || {}, newItem);
    }

    closeModal();
    saveAndRefresh();

    // 如果当前处于闪卡模式，立刻更新当前闪卡卡片的数据并即时重绘，无需退出重测
    if (currentView === 'flashcard' && cardList.length > 0) {
      const currentTarget = cardList[cardIndex];
      if (currentTarget) {
        const found = currentWords.find(w => (w.text || w.word || '').toLowerCase() === (currentTarget.text || currentTarget.word || '').toLowerCase());
        if (found) {
          cardList[cardIndex] = Object.assign(cardList[cardIndex], found);
          renderFlashcard();
        }
      }
    }
  };

  const exportBtn = document.getElementById('btnExportJson');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(getStandardJsonList(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'antigravity.json';
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // 苹果风格自定义多选下拉菜单交互 (宽度固定为 122px，绝不拉伸走形)
  const srsDropdownBtn = document.getElementById('srsDropdownBtn');
  const srsDropdownMenu = document.getElementById('srsDropdownMenu');
  const currentSrsDot = document.getElementById('currentSrsDot');
  const currentSrsLabel = document.getElementById('currentSrsLabel');

  if (srsDropdownBtn && srsDropdownMenu) {
    srsDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = srsDropdownMenu.style.display === 'flex';
      srsDropdownMenu.style.display = isOpen ? 'none' : 'flex';
    };

    document.addEventListener('click', () => {
      srsDropdownMenu.style.display = 'none';
      document.querySelectorAll('.mastery-picker-popup.open').forEach(p => p.classList.remove('open'));
    });

    srsDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-value');

        if (val === 'all') {
          selectedSrsSet = new Set(['all']);
        } else {
          selectedSrsSet.delete('all');
          if (selectedSrsSet.has(val)) {
            selectedSrsSet.delete(val);
          } else {
            selectedSrsSet.add(val);
          }

          if (selectedSrsSet.size === 0 || (selectedSrsSet.has('0') && selectedSrsSet.has('1') && selectedSrsSet.has('2') && selectedSrsSet.has('3'))) {
            selectedSrsSet = new Set(['all']);
          }
        }

        // 同步每项的勾选 UI 状态
        srsDropdownMenu.querySelectorAll('.dropdown-item').forEach(i => {
          const iVal = i.getAttribute('data-value');
          const isSelected = selectedSrsSet.has(iVal);
          
          i.classList.toggle('selected', isSelected);
          const ck = i.querySelector('.check-mark');
          if (ck) ck.remove();
          if (isSelected) {
            i.insertAdjacentHTML('beforeend', '<span class="check-mark">✓</span>');
          }
        });

        // 动态计算按钮文案与圆点 (固定精炼文案，宽度永不抖动拉伸)
        if (selectedSrsSet.has('all')) {
          currentSrsDot.className = "dropdown-dot dot-all";
          currentSrsLabel.innerText = "全部熟练度";
        } else if (selectedSrsSet.size === 1) {
          const onlyVal = Array.from(selectedSrsSet)[0];
          currentSrsDot.className = `dropdown-dot dot-${onlyVal}`;
          switch (onlyVal) {
            case '0': currentSrsLabel.innerText = "生疏待背"; break;
            case '1': currentSrsLabel.innerText = "初识阶段"; break;
            case '2': currentSrsLabel.innerText = "巩固阶段"; break;
            case '3': currentSrsLabel.innerText = "熟练掌握"; break;
          }
        } else {
          currentSrsDot.className = "dropdown-dot dot-all";
          currentSrsLabel.innerText = `已选 ${selectedSrsSet.size} 项`;
        }

        applyFilter();
      };
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFilter();
    });
  }

  // 支持 URL Hash 快捷路由 (如 #flashcard 或 #settings)
  if (window.location.hash === '#flashcard') {
    switchView('flashcard');
  } else if (window.location.hash === '#settings') {
    openDavModal();
  }

  // ---------------- 笔记本内嵌即时划词查词与双击查词引擎 ----------------
  let nbTriggerIcon = document.getElementById('nb-trigger-icon');
  let nbPopupCard = document.getElementById('nb-vocab-popup');
  let nbSelectedText = "";

  function showNbTrigger(rect, text) {
    nbSelectedText = text;
    if (!nbTriggerIcon) nbTriggerIcon = document.getElementById('nb-trigger-icon');
    if (!nbTriggerIcon) return;

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    nbTriggerIcon.style.left = `${Math.max(10, rect.right + scrollX + 4)}px`;
    nbTriggerIcon.style.top = `${Math.max(10, rect.top + scrollY - 24)}px`;
    nbTriggerIcon.style.display = 'flex';
  }

  function hideNbTrigger() {
    if (nbTriggerIcon) nbTriggerIcon.style.display = 'none';
  }

  function showNbCard(rect, text) {
    hideNbTrigger();
    if (!nbPopupCard) nbPopupCard = document.getElementById('nb-vocab-popup');
    if (!nbPopupCard) return;

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const cardWidth = 280;
    const estimatedHeight = 130;

    let targetX = rect ? rect.left + scrollX : scrollX + 20;
    let targetY = rect ? rect.bottom + scrollY + 8 : scrollY + 20;

    if (targetX + cardWidth > window.innerWidth + scrollX - 16) {
      targetX = window.innerWidth + scrollX - cardWidth - 16;
    }
    if (targetX < scrollX + 16) targetX = scrollX + 16;

    if (rect && (rect.bottom + estimatedHeight > window.innerHeight) && (rect.top - estimatedHeight > 0)) {
      targetY = rect.top + scrollY - estimatedHeight - 8;
    }

    nbPopupCard.style.left = `${Math.round(targetX)}px`;
    nbPopupCard.style.top = `${Math.round(targetY)}px`;
    nbPopupCard.style.display = 'block';

    document.getElementById('nbWord').innerText = text;
    document.getElementById('nbPhonetic').innerText = "";
    document.getElementById('nbSpeakPill').style.display = 'none';
    document.getElementById('nbLoading').style.display = 'flex';
    document.getElementById('nbDefinition').style.display = 'none';

    chrome.runtime.sendMessage({ action: "LOOKUP_WORD", word: text }, (res) => {
      document.getElementById('nbLoading').style.display = 'none';
      const defEl = document.getElementById('nbDefinition');
      const phoEl = document.getElementById('nbPhonetic');
      const speakPill = document.getElementById('nbSpeakPill');

      if (res && res.phonetic) {
        phoEl.innerText = cleanIPA(res.phonetic);
        speakPill.style.display = 'inline-flex';
        speakPill.onclick = (e) => {
          e.stopPropagation();
          speakWord(text);
        };
      }

      const rawDef = (res && (res.definition || res.translation)) || "暂无权威释义";
      defEl.innerText = formatTrans(rawDef);
      defEl.style.display = 'block';
    });
  }

  function hideNbCard() {
    if (nbPopupCard) nbPopupCard.style.display = 'none';
  }

  if (nbTriggerIcon) {
    nbTriggerIcon.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    nbTriggerIcon.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        showNbCard(rect, nbSelectedText);
      }
    };
  }

  if (nbPopupCard) {
    nbPopupCard.onmousedown = (e) => e.stopPropagation();
    nbPopupCard.onclick = (e) => e.stopPropagation();
  }

  document.addEventListener('mouseup', (e) => {
    if (modal.style.display === 'flex' || davModal.style.display === 'flex') return;
    if (nbTriggerIcon && nbTriggerIcon.contains(e.target)) return;
    if (nbPopupCard && nbPopupCard.contains(e.target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.length >= 1 && selectedText.length <= 250 && selection.rangeCount > 0) {
      const anchor = selection.anchorNode;
      const parentEl = anchor ? (anchor.nodeType === 3 ? anchor.parentElement : anchor) : null;
      const isInsideContext = parentEl && (
        parentEl.closest('.flashcard-context') ||
        parentEl.closest('.note-text') ||
        parentEl.closest('.table-container')
      );

      if (isInsideContext) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          hideNbCard();
          showNbTrigger(rect, selectedText);
          return;
        }
      }
    }

    hideNbTrigger();
  });

  document.addEventListener('mousedown', (e) => {
    if (nbTriggerIcon && !nbTriggerIcon.contains(e.target)) {
      hideNbTrigger();
    }
    if (nbPopupCard && !nbPopupCard.contains(e.target)) {
      hideNbCard();
    }
  });

  // 双击例句中的单词直接秒查
  document.addEventListener('dblclick', (e) => {
    if (modal.style.display === 'flex' || davModal.style.display === 'flex') return;
    const target = e.target;
    const isInsideContext = target.closest('.flashcard-context') || target.closest('.note-text') || target.closest('.table-container');
    if (isInsideContext) {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text && text.length >= 1 && text.length <= 50) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showNbCard(rect, text);
      }
    }
  });
});
