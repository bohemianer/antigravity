// Antigravity - Content Script (完整捕获上下文 + 显式存储独立音标字段)

let triggerIcon = null;
let popupCard = null;
let currentSelectionText = "";
let currentSurroundingSentence = "";

function getTriggerIcon() {
  if (triggerIcon) {
    syncContentTheme(triggerIcon);
    return triggerIcon;
  }
  
  triggerIcon = document.createElement('div');
  triggerIcon.id = 'agy-trigger-icon';
  triggerIcon.title = '点击查词 / 翻译';
  triggerIcon.innerHTML = `
    <div class="agy-icon-inner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#CC785C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="#8C533E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
  document.body.appendChild(triggerIcon);

  triggerIcon.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 阻止浏览器默认取消文本选中高亮
    e.stopPropagation();
  });
  triggerIcon.addEventListener('mouseup', (e) => e.stopPropagation());
  
  triggerIcon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isExtensionValid()) {
      showContextInvalidatedNotice();
      return;
    }
    hideTriggerIcon();
    showCard(currentSelectionRect, currentSelectionText, currentSurroundingSentence);
  });

  return triggerIcon;
}

function syncContentTheme(el) {
  if (!el) return;
  try {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ themeMode: 'system' }, (res) => {
        const mode = res.themeMode || 'system';
        const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        el.setAttribute('data-theme', mode);
        el.setAttribute('data-applied-theme', isDark ? 'dark' : 'light');
      });
    }
  } catch (e) {}
}

function getPopupCard() {
  if (popupCard) {
    syncContentTheme(popupCard);
    return popupCard;
  }
  
  popupCard = document.createElement('div');
  popupCard.id = 'agy-vocab-popup';
  popupCard.style.display = 'none';
  syncContentTheme(popupCard);
  document.body.appendChild(popupCard);
  
  popupCard.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    // 点击卡片内部按钮时不取消网页背景的选中文本
  });
  popupCard.addEventListener('mouseup', (e) => e.stopPropagation());
  
  return popupCard;
}

const ABBR_SET = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'gen', 'col', 'capt', 'st',
  'sen', 'rep', 'gov', 'pres', 'rev', 'dept', 'univ', 'fig', 'no', 'vol',
  'approx', 'e.g', 'i.e', 'etc', 'vs', 'v', 'al', 'inc', 'ltd', 'co', 'corp'
]);

function isSentenceBoundary(text, index) {
  const ch = text[index];
  if (!ch) return true;
  if (/[\n\r?!。！？]/.test(ch)) return true;
  if (ch !== '.') return false;

  // 1. 数字小数点 (如 3.14, 1.5M) 不断句
  if (index > 0 && /\d/.test(text[index - 1]) && index + 1 < text.length && /\d/.test(text[index + 1])) {
    return false;
  }

  // 2. 句点后紧跟字母或数字 (如 U.K. 中的第一点，或网址 example.com) 绝不是断句
  if (index + 1 < text.length && /[a-zA-Z0-9]/.test(text[index + 1])) {
    return false;
  }

  // 3. 向前提取单词，检测是否为常见头衔/缩写 (如 Mr., Dr., Prof., etc.)
  let p = index - 1;
  while (p >= 0 && /[a-zA-Z.]/.test(text[p])) p--;
  const prevWord = text.substring(p + 1, index).toLowerCase();

  if (ABBR_SET.has(prevWord) || ABBR_SET.has(prevWord + '.')) {
    return false;
  }

  // 单个大写字母缩写片段 (如中间名 John F. Kennedy)
  const rawPrev = text.substring(p + 1, index);
  if (/^[A-Z]$/.test(rawPrev)) {
    const rest = text.substring(index + 1).trim();
    if (rest.length > 0 && /^[a-z]/.test(rest)) {
      return false;
    }
  }

  // 4. 查看点后第一个非空白字符：若跟随小写英文字母，通常句子未结束
  let nextIdx = index + 1;
  while (nextIdx < text.length && /[\s"'\u2018\u2019\u201c\u201d)\]}]/.test(text[nextIdx])) {
    nextIdx++;
  }
  if (nextIdx < text.length) {
    const nextChar = text[nextIdx];
    if (/[a-z]/.test(nextChar)) {
      return false;
    }
  }

  return true;
}

function getSurroundingSentence(selection) {
  if (!selection || !selection.anchorNode) return "";
  const text = selection.anchorNode.textContent || "";
  const selectedText = selection.toString().trim();
  if (!text || !selectedText) return selectedText;
  
  const index = text.indexOf(selectedText);
  if (index === -1) return selectedText;
  
  let start = index;
  while (start > 0) {
    if (isSentenceBoundary(text, start - 1)) {
      break;
    }
    start--;
  }
  
  let end = index + selectedText.length;
  while (end < text.length) {
    if (isSentenceBoundary(text, end)) {
      end++; // 包含结尾标点
      // 若标点后有连带的引号或括号，一并收录
      while (end < text.length && /["'\u2018\u2019\u201c\u201d)\]}]/.test(text[end])) {
        end++;
      }
      break;
    }
    end++;
  }
  
  return text.substring(start, end).trim();
}

let currentSelectionRect = null;

function showTriggerIcon(rect, text, sentence) {
  currentSelectionText = text;
  currentSurroundingSentence = sentence;
  currentSelectionRect = rect;
  
  const icon = getTriggerIcon();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  // 微标出现在选中文本右上角上方，完全不遮挡文字
  icon.style.left = `${Math.max(10, rect.right + scrollX + 4)}px`;
  icon.style.top = `${Math.max(10, rect.top + scrollY - 24)}px`;
  icon.style.display = 'flex';
}

function hideTriggerIcon() {
  if (triggerIcon) {
    triggerIcon.style.display = 'none';
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDialectLabel(word) {
  const w = (word || "").toLowerCase().trim();
  if (!w) return "";
  
  // 1. -l- 动词英式双写 ll (fuelled/fuelling)，美式单写 l (fueled/fueling)
  const singleLStems = ["fuel", "travel", "cancel", "signal", "dial", "model", "label", "rival", "equal", "rebel", "marvel", "patrol", "jewel", "initial", "total", "distil", "fulfil"];
  for (const stem of singleLStems) {
    if (w === stem + "ed" || w === stem + "ing") return "美式";
    if (w === stem + "led" || w === stem + "ling") return "英式";
  }

  // 2. -our (英) vs -or (美)
  if (w.endsWith("our") && w.length > 4 && !["flour", "scour", "devour"].includes(w)) return "英式";
  if (w.endsWith("or") && ["color", "flavor", "honor", "labor", "rumor", "armor", "behavior", "humor", "neighbor", "favor", "harbor", "vigor"].includes(w)) return "美式";

  // 3. -re (英) vs -er (美)
  if (w.endsWith("re") && ["theatre", "centre", "metre", "fibre", "litre", "calibre", "sombre", "lustre"].includes(w)) return "英式";
  if (w.endsWith("er") && ["theater", "center", "meter", "fiber", "liter", "caliber", "somber", "luster"].includes(w)) return "美式";

  // 4. -ise / -ised / -ising (英) vs -ize / -ized / -izing (美)
  const isIsePattern = /(?:ised|ising|ise)$/.test(w);
  const isIzePattern = /(?:ized|izing|ize)$/.test(w);
  if (isIsePattern || isIzePattern) {
    // 永远不区分英美的固有单词（无论英式美式拼写完全一致，绝非变体）
    const invariantRoots = [
      "bruise", "cruise", "disguise", "surprise", "promise", "compromise",
      "enterprise", "exercise", "premise", "advise", "devise", "revise",
      "supervise", "improvise", "televise", "franchise", "surmise", "apprise",
      "comprise", "chastise", "excise", "incise", "concise", "precise",
      "paradise", "expertise", "merchandise", "noise", "poise", "tortoise",
      "turquoise", "otherwise", "clockwise", "likewise", "praise", "raise",
      "rise", "wise", "chemise", "size", "prize", "seize", "capsize", "assize"
    ];

    const isInvariant = invariantRoots.some(root => {
      const rootBase = root.replace(/e$/, '');
      return w === root || w === root + 's' || w === root + 'd' || w === rootBase + 'ed' || w === rootBase + 'ing';
    });

    if (!isInvariant && w.length > 4) {
      if (isIsePattern) return "英式";
      if (isIzePattern) return "美式";
    }
  }

  // 5. -ogue (英) vs -og (美)
  if (w.endsWith("ogue") && ["catalogue", "dialogue", "monologue", "prologue", "analogue"].includes(w)) return "英式";
  if (w.endsWith("og") && ["catalog", "dialog", "monolog", "prolog", "analog"].includes(w)) return "美式";

  // 6. -programme (英) vs -program (美)
  if (w === "programme" || w === "programmes") return "英式";
  if (w === "program" || w === "programs") return "美式";

  // 7. -ence (英) vs -ense (美)
  if (["defence", "offence", "licence", "pretence"].includes(w)) return "英式";
  if (["defense", "offense", "license", "pretense"].includes(w)) return "美式";

  return "";
}

function formatDefinition(def) {
  if (!def) return "";
  let str = String(def).replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  str = str.replace(/\uFF0E/g, ".");
  str = str.replace(/;/g, "；").replace(/；\s*/g, "；").replace(/,/g, "，").replace(/，\s*/g, "，");

  const posCleanRegex = /\b((?:n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|art|num|int|interj|aux|abbr|pl|sing|pref|suff|link-v)\.)[；，,;\s]*/gi;
  str = str.replace(posCleanRegex, "$1 ");

  const posRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)\b((?:n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|art|num|int|interj|aux|abbr|pl|sing|pref|suff|link-v)\.)\s*/gi;
  str = str.replace(posRegex, "\n$1 ");

  const metaRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((?:\[(?:名|动|形|副|代|介|连|叹)\]|【(?:名|动|形|副|代|介|连|叹)】|时\s*态|名\s*词|形\s*容\s*词|副\s*词|复\s*数|比较级|最高级|过去式|过去分词|现在分词|第三人称单数)\s*[:：]?)\s*/gi;
  str = str.replace(metaRegex, "\n$1 ");

  const rawLines = str.split("\n")
    .map(line => line.replace(/^[\s；，,;]+|[\s；，,;]+$/g, "").trim())
    .filter(Boolean);

  const POS_TAG_RE = /^([a-zA-Z\-]+\.|\([a-zA-Z\-]+\)|\[(?:名|动|形|副|代|介|连|叹)\]|【(?:名|动|形|副|代|介|连|叹)】)\s*(.*)$/;
  const groups = [];
  let currentGroup = { pos: "", contentParts: [] };

  for (const line of rawLines) {
    const pm = line.match(POS_TAG_RE);
    if (pm) {
      if (currentGroup.pos || currentGroup.contentParts.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { pos: pm[1], contentParts: [] };
      if (pm[2].trim()) {
        currentGroup.contentParts.push(pm[2].trim());
      }
    } else {
      currentGroup.contentParts.push(line);
    }
  }
  if (currentGroup.pos || currentGroup.contentParts.length > 0) {
    groups.push(currentGroup);
  }

  return groups.map(group => {
    let content = group.contentParts.map(p => {
      return p.replace(/^[\s；，,;、]+|[\s；，,;、]+$/g, "")
              .replace(/^(\d+[\.、]|\(\d+\)|\[\d+\]|[\u2460-\u2473])\s*/, "")
              .trim();
    }).filter(Boolean).join("； ");

    if (group.pos && content) {
      return `<div style="margin-bottom: 3px;"><span class="agy-pos-tag">${escapeHtml(group.pos)}</span> ${escapeHtml(content)}</div>`;
    } else if (group.pos) {
      return `<div style="margin-bottom: 3px;"><span class="agy-pos-tag">${escapeHtml(group.pos)}</span></div>`;
    } else if (content) {
      return `<div style="margin-bottom: 3px;">${escapeHtml(content)}</div>`;
    }
    return "";
  }).filter(Boolean).join("");
}

function isExtensionValid() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

function destroyContentScript() {
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleMouseDown);
  if (triggerIcon && triggerIcon.parentNode) {
    triggerIcon.parentNode.removeChild(triggerIcon);
    triggerIcon = null;
  }
}

function showContextInvalidatedNotice() {
  const card = getPopupCard();
  if (!card) return;
  card.innerHTML = `
    <div class="agy-card" style="padding: 16px 18px; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FFFDF9; border: 1px solid #E8E5DF; box-shadow: 0 8px 24px rgba(0,0,0,0.12);">
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #D97706; margin-bottom: 6px; font-size: 13.5px;">
        <span>⚠️ 插件已在后台更新</span>
      </div>
      <div style="font-size: 12.5px; color: #57534E; line-height: 1.55;">
        扩展插件刚完成更新或重载。请按 <b style="color: #CC785C;">F5</b> 或 <b style="color: #CC785C;">⌘ + R</b> 刷新当前页面即可恢复划词功能。
      </div>
    </div>
  `;
  card.style.display = 'block';
  destroyContentScript();
}

function safeSendMessage(message, callback) {
  if (!isExtensionValid()) {
    showContextInvalidatedNotice();
    return;
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || "";
        if (errMsg.includes("context invalidated") || errMsg.includes("Extension context")) {
          showContextInvalidatedNotice();
          return;
        }
        console.warn("[Antigravity] Runtime message error:", errMsg);
      }
      if (typeof callback === 'function') {
        callback(response);
      }
    });
  } catch (e) {
    if (e && e.message && (e.message.includes("context invalidated") || e.message.includes("Extension context"))) {
      showContextInvalidatedNotice();
    } else {
      console.warn("[Antigravity] Failed to send message:", e);
    }
  }
}

let currentContentAudio = null;
function playPronunciation(text, triggerEl = null) {
  if (!text) return;
  const clean = text.trim();
  if (!clean) return;

  if (triggerEl) triggerEl.style.opacity = '0.55';
  const resetUI = () => {
    if (triggerEl) triggerEl.style.opacity = '1';
  };

  if (currentContentAudio) {
    try {
      currentContentAudio.pause();
      currentContentAudio.currentTime = 0;
    } catch (e) {}
    currentContentAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  const doFallback = (accent) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resetUI();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = accent === 'uk' ? 'en-GB' : 'en-US';
      u.rate = 0.92;
      u.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices() || [];
      const targetPrefix = accent === 'uk' ? 'en-gb' : 'en-us';
      const pool = voices.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(targetPrefix));
      const preferred = accent === 'uk'
        ? ['google uk english female', 'google uk english male', 'daniel', 'oliver', 'serena']
        : ['google us english', 'samantha', 'ava', 'allison', 'jenny', 'guy', 'alex'];
      let chosen = null;
      for (const name of preferred) {
        chosen = (pool.length > 0 ? pool : voices).find(v => (v.name || '').toLowerCase().includes(name));
        if (chosen) break;
      }
      if (!chosen && pool.length > 0) chosen = pool[0];
      if (chosen) u.voice = chosen;
      u.onend = resetUI;
      u.onerror = resetUI;
      window.speechSynthesis.speak(u);
    } catch (e) {
      resetUI();
    }
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ pronunciationAccent: 'us' }, (res) => {
        const accent = (res && res.pronunciationAccent) || 'us';
        const typeParam = accent === 'uk' ? 1 : 2;
        const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=${typeParam}`;
        const audio = new Audio(audioUrl);
        currentContentAudio = audio;

        let fallbackFired = false;
        const fallback = () => {
          if (fallbackFired) return;
          fallbackFired = true;
          doFallback(accent);
        };

        audio.onended = resetUI;
        audio.onerror = fallback;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(fallback);
        }
      });
    } else {
      doFallback('us');
    }
  } catch (e) {
    doFallback('us');
  }
}

function showCard(rect, text, sentence) {
  const card = getPopupCard();
  const wordsCount = text.trim().split(/\s+/).length;
  const isWordMode = wordsCount <= 2;
  const displayText = isWordMode ? text.toLowerCase() : text;
  const safeText = escapeHtml(displayText);

  if (isWordMode) {
    card.innerHTML = `
      <div class="agy-card agy-card-word">
        <div class="agy-header">
          <div class="agy-word-group">
            <span class="agy-word">${safeText}</span>
            <span class="agy-dialect-tag" id="agy-dialect-tag" style="display:none;"></span>
            <span class="agy-root-badge" id="agy-root-badge" style="display:none;" title="词库已收录该词的原型"></span>
            <div class="agy-phonetic-pill" id="agy-btn-speak" title="点击朗读发音" style="display:none;">
              <span class="agy-phonetic" id="agy-phonetic"></span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
            </div>
          </div>
          <button class="agy-save-btn" id="agy-btn-save" title="收藏到生词本">
            <span class="agy-star">★</span> 收藏
          </button>
        </div>

        <div class="agy-skeleton" id="agy-loading">
          <div class="agy-sk-line"></div>
        </div>
        <div class="agy-definition" id="agy-definition" style="display:none;"></div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="agy-card agy-card-sentence">
        <div class="agy-header">
          <div class="agy-badge-group">
            <span class="agy-dot"></span>
            <span class="agy-badge">划词翻译</span>
          </div>
          <button class="agy-save-btn" id="agy-btn-save" title="收藏整句到生词本">
            <span class="agy-star">★</span> 收藏
          </button>
        </div>

        <div class="agy-skeleton" id="agy-loading">
          <div class="agy-sk-line"></div>
          <div class="agy-sk-line agy-sk-short"></div>
        </div>
        <div class="agy-sentence-translation" id="agy-definition" style="display:none;"></div>
      </div>
    `;
  }

  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const cardWidth = isWordMode ? 280 : 360;
  const estimatedCardHeight = isWordMode ? 140 : 180;

  // 智能避让定位：计算卡片最佳 X 与 Y
  let targetX = rect ? rect.left + scrollX : scrollX + 20;
  let targetY = rect ? rect.bottom + scrollY + 8 : scrollY + 20; // 默认在单词正下方 + 8px

  // 水平防溢出
  if (targetX + cardWidth > window.innerWidth + scrollX - 16) {
    targetX = window.innerWidth + scrollX - cardWidth - 16;
  }
  if (targetX < scrollX + 16) {
    targetX = scrollX + 16;
  }

  // 垂直智能避让：如果下方视口空间不足，则翻转到单词上方
  if (rect && (rect.bottom + estimatedCardHeight > window.innerHeight) && (rect.top - estimatedCardHeight > 0)) {
    targetY = rect.top + scrollY - estimatedCardHeight - 8;
  }

  card.style.left = `${Math.round(targetX)}px`;
  card.style.top = `${Math.round(targetY)}px`;
  card.style.display = 'block';

  if (isWordMode) {
    const speakBtn = document.getElementById('agy-btn-speak');
    if (speakBtn) {
      speakBtn.onclick = () => {
        playPronunciation(text, speakBtn);
      };
    }
  }

  safeSendMessage({ action: "LOOKUP_WORD", word: text }, (response) => {
    const res = response || { definition: "翻译加载失败，请重试" };
    const loading = document.getElementById('agy-loading');
    const defEl = document.getElementById('agy-definition');
    const phoEl = document.getElementById('agy-phonetic');
    if (!loading || !defEl) return;
    
    loading.style.display = 'none';
    
    let currentPhonetic = res.phonetic || "";
    const speakPill = document.getElementById('agy-btn-speak');
    if (phoEl && currentPhonetic && isWordMode) {
      phoEl.innerText = currentPhonetic;
      if (speakPill) speakPill.style.display = 'inline-flex';
    }
    
    const rawResult = res.definition || res.translation || "暂无释义";
    defEl.innerHTML = formatDefinition(rawResult);
    defEl.style.display = 'block';

    // 智能英式/美式拼写感知标签
    const dialectTag = document.getElementById('agy-dialect-tag');
    if (dialectTag && isWordMode) {
      const dialect = getDialectLabel(text);
      if (dialect) {
        dialectTag.innerText = dialect;
        dialectTag.className = `agy-dialect-tag dialect-${dialect === '英式' ? 'uk' : 'us'}`;
        dialectTag.title = `${text} 属于${dialect}英语常见拼写规范`;
        dialectTag.style.display = 'inline-block';
      } else {
        dialectTag.style.display = 'none';
      }
    }

    // 智能词根原型感知：若当前划词为复数/过去式，且词库中已收录原型
    const rootBadge = document.getElementById('agy-root-badge');
    if (rootBadge && res.isRootSaved && res.canonicalRoot) {
      rootBadge.innerText = `原型: ${res.canonicalRoot}`;
      rootBadge.style.display = 'inline-block';
    }

    const saveBtn = document.getElementById('agy-btn-save');
    if (saveBtn) {
      let isSavedState = !!res.isSaved;
      let isRootSavedState = !!res.isRootSaved;

      if (isSavedState) {
        saveBtn.classList.add('agy-saved');
        saveBtn.innerHTML = `<span class="agy-star">✓</span> 已收藏`;
        saveBtn.title = "该词已在生词本中 (点击可更新例句)";
      } else if (isRootSavedState && res.canonicalRoot) {
        saveBtn.classList.add('agy-root-saved');
        saveBtn.innerHTML = `<span class="agy-star">✓</span> 原型已在库`;
        saveBtn.title = `词库中已收录原型「${res.canonicalRoot}」(点击将当前语境例句融合更新至原型词)`;
      }

      saveBtn.onclick = () => {
        saveBtn.innerHTML = `<span>⏳</span>`;
        saveBtn.disabled = true;
        
        safeSendMessage({
          action: "SAVE_WORD",
          data: {
            text: isWordMode ? text.toLowerCase() : text,
            trans: rawResult,
            phonetic: currentPhonetic,
            context: sentence || "",
            title: document.title || "Web Article",
            url: window.location.href || "",
            date: Date.now(),
            notes: res.savedNotes || ""
          }
        }, () => {
          saveBtn.disabled = false;
          saveBtn.classList.remove('agy-root-saved');
          saveBtn.classList.add('agy-saved');
          if (isRootSavedState && res.canonicalRoot) {
            saveBtn.innerHTML = `<span class="agy-star">✓</span> 已融合原型`;
            saveBtn.title = `已将例句成功融合更新至原型「${res.canonicalRoot}」`;
          } else {
            saveBtn.innerHTML = `<span class="agy-star">✓</span> 已收藏`;
            saveBtn.title = "已成功存入生词本并同步云端";
          }
        });
      };
    }
  });
}

function hideCard() {
  if (popupCard) {
    popupCard.style.display = 'none';
  }
}

function handleMouseUp(e) {
  if (!isExtensionValid()) {
    destroyContentScript();
    return;
  }

  if ((triggerIcon && triggerIcon.contains(e.target)) || (popupCard && popupCard.contains(e.target))) {
    return;
  }
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  if (selectedText && selectedText.length >= 1 && selectedText.length <= 400 && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideTriggerIcon();
      hideCard();
      return;
    }
    const sentence = getSurroundingSentence(selection);
    hideCard();
    showTriggerIcon(rect, selectedText, sentence);
  } else {
    hideTriggerIcon();
    hideCard();
  }
}

function handleMouseDown(e) {
  if (!isExtensionValid()) {
    destroyContentScript();
    return;
  }

  if (triggerIcon && !triggerIcon.contains(e.target)) {
    hideTriggerIcon();
  }
  if (popupCard && !popupCard.contains(e.target)) {
    hideCard();
  }
}

document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('mousedown', handleMouseDown);
