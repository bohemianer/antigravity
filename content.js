// Antigravity Vocab Pro - Content Script (完整捕获上下文 + 显式存储独立音标字段)

let triggerIcon = null;
let popupCard = null;
let currentSelectionText = "";
let currentSurroundingSentence = "";

function getTriggerIcon() {
  if (triggerIcon) return triggerIcon;
  
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
    hideTriggerIcon();
    showCard(currentSelectionRect, currentSelectionText, currentSurroundingSentence);
  });

  return triggerIcon;
}

function getPopupCard() {
  if (popupCard) return popupCard;
  
  popupCard = document.createElement('div');
  popupCard.id = 'agy-vocab-popup';
  popupCard.style.display = 'none';
  document.body.appendChild(popupCard);
  
  popupCard.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    // 点击卡片内部按钮时不取消网页背景的选中文本
  });
  popupCard.addEventListener('mouseup', (e) => e.stopPropagation());
  
  return popupCard;
}

function getSurroundingSentence(selection) {
  if (!selection || !selection.anchorNode) return "";
  const text = selection.anchorNode.textContent || "";
  const selectedText = selection.toString().trim();
  if (!text || !selectedText) return selectedText;
  
  const index = text.indexOf(selectedText);
  if (index === -1) return selectedText;
  
  let start = index;
  while (start > 0 && !/[.!?\n\r]/.test(text[start - 1])) {
    start--;
  }
  
  let end = index + selectedText.length;
  while (end < text.length && !/[.!?\n\r]/.test(text[end])) {
    end++;
  }
  if (end < text.length) end++;
  
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

function formatDefinition(def) {
  if (!def) return "";
  const safe = escapeHtml(def);
  return safe.replace(/\b(noun|verb|adj|adv|pron|prep|conj|v|vt|vi|n|a)\./gi, '<span class="agy-pos-tag">$1.</span>');
}

function showCard(rect, text, sentence) {
  const card = getPopupCard();
  const wordsCount = text.trim().split(/\s+/).length;
  const isWordMode = wordsCount <= 2;
  const safeText = escapeHtml(text);

  if (isWordMode) {
    card.innerHTML = `
      <div class="agy-card agy-card-word">
        <div class="agy-header">
          <div class="agy-word-group">
            <span class="agy-word">${safeText}</span>
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
        try {
          const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`;
          const audio = new Audio(audioUrl);
          audio.play().catch(() => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'en-US';
            u.rate = 0.95;
            window.speechSynthesis.speak(u);
          });
        } catch (e) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'en-US';
          u.rate = 0.95;
          window.speechSynthesis.speak(u);
        }
      };
    }
  }

  chrome.runtime.sendMessage({ action: "LOOKUP_WORD", word: text }, (response) => {
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

    const saveBtn = document.getElementById('agy-btn-save');
    if (saveBtn) {
      let isSavedState = !!res.isSaved;

      if (isSavedState) {
        saveBtn.classList.add('agy-saved');
        saveBtn.innerHTML = `<span class="agy-star">✓</span> 已收藏`;
        saveBtn.title = "该词已在生词本中 (点击可更新例句)";
      }

      saveBtn.onclick = () => {
        saveBtn.innerHTML = `<span>⏳</span>`;
        saveBtn.disabled = true;
        
        chrome.runtime.sendMessage({
          action: "SAVE_WORD",
          data: {
            text: text,
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
          saveBtn.classList.add('agy-saved');
          saveBtn.innerHTML = `<span class="agy-star">✓</span> 已收藏`;
          saveBtn.title = "已成功存入生词本并同步云端";
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

document.addEventListener('mouseup', (e) => {
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
});

document.addEventListener('mousedown', (e) => {
  if (triggerIcon && !triggerIcon.contains(e.target)) {
    hideTriggerIcon();
  }
  if (popupCard && !popupCard.contains(e.target)) {
    hideCard();
  }
});
