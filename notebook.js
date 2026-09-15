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

// 全局 Apple 风格优雅悬浮 Toast 消息组件
let agyToastTimer = null;
function showToast(msg, type = 'info', duration = 2800) {
  let toastEl = document.getElementById('agyGlobalToast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'agyGlobalToast';
    toastEl.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      z-index: 999999;
      background: rgba(26, 26, 26, 0.94);
      color: #f5f5f7;
      font-size: 13.5px;
      font-weight: 500;
      padding: 10px 22px;
      border-radius: 9999px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.14);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: pre-wrap;
      text-align: center;
      max-width: 90vw;
      line-height: 1.4;
    `;
    document.body.appendChild(toastEl);
  }

  // 根据类型定制微边框高亮
  let borderHighlight = 'rgba(255, 255, 255, 0.16)';
  if (type === 'error') borderHighlight = 'rgba(239, 68, 68, 0.5)';
  else if (type === 'success') borderHighlight = 'rgba(16, 185, 129, 0.5)';
  else if (type === 'warning') borderHighlight = 'rgba(245, 158, 11, 0.5)';

  toastEl.style.borderColor = borderHighlight;
  toastEl.innerHTML = msg;
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateX(-50%) translateY(0)';

  if (agyToastTimer) clearTimeout(agyToastTimer);
  agyToastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(-20px)';
  }, duration);
}

// 原生零延迟 Web Audio API 物理微触感音效合成引擎 (Zero-Asset Synthetic Haptics)
const SoundFx = {
  ctx: null,
  enabled: true,

  init() {
    try {
      this.enabled = localStorage.getItem('antigravity_sound_enabled') !== 'false';
    } catch (e) {
      this.enabled = true;
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('antigravity_sound_enabled', this.enabled ? 'true' : 'false');
    } catch (e) {}
    return this.enabled;
  },

  getCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  },

  // 翻牌微气泡轻音 (Bubble Pop)
  playBubble() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.045);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  },

  // 按键轻微触控音 (Soft Click)
  playClick() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.025);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  },

  // 「熟练」流光双音和弦 (Success Sparkle Chime)
  playSuccess() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [1046.5, 1318.5, 1567.9]; // C6, E6, G6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.055;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.24);
      });
    } catch (e) {}
  },

  // 「模糊」柔和微谐波 (Soft Harmonic Ping)
  playHard() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {}
  },

  // 「忘了」温润低频回弹 (Warm Cushion Thud)
  playForgot() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {}
  },

  // 连击激励华丽琶音 (Streak Celebratory Chord)
  playStreak() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const chord = [783.99, 1046.5, 1318.51, 1567.98]; // G5, C6, E6, G6
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.048;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch (e) {}
  }
};

// 连击激励已根据用户需求彻底移除
function updateComboPill() {}

// 多巴胺微粒子爆破反馈 (Sparkle Particle Burst on Good/Mastered)
function createSparkleBurst(x, y) {
  const colors = ['#FF5E3A', '#FF2A68', '#FFD200', '#10B981', '#007AFF', '#AF52DE'];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'sparkle-particle';
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = Math.random() * 45 + 30;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const size = Math.random() * 5 + 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    particle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    document.body.appendChild(particle);
    setTimeout(() => {
      particle.remove();
    }, 620);
  }
}

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
  
  // 0. 若存在多种并列变体发音（分号/逗号分隔，如 dimension 返回 "daɪ'menʃn; dɪ'menʃn"），默认提取第一种首选标准音标
  if (str.includes(';') || str.includes('；') || str.includes(',')) {
    str = str.split(/[;；,]/)[0].trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  }

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 常见不规则动词变化表（支持原型与过去式/分词双向智能联想）
const IRREGULAR_VERBS = {
  'be': ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  'have': ['had', 'having', 'has'],
  'do': ['did', 'done', 'doing', 'does'],
  'go': ['went', 'gone', 'going', 'goes'],
  'say': ['said', 'saying', 'says'],
  'get': ['got', 'gotten', 'getting', 'gets'],
  'make': ['made', 'making', 'makes'],
  'know': ['knew', 'known', 'knowing', 'knows'],
  'think': ['thought', 'thinking', 'thinks'],
  'take': ['took', 'taken', 'taking', 'takes'],
  'see': ['saw', 'seen', 'seeing', 'sees'],
  'come': ['came', 'coming', 'comes'],
  'find': ['found', 'finding', 'finds'],
  'give': ['gave', 'given', 'giving', 'gives'],
  'tell': ['told', 'telling', 'tells'],
  'feel': ['felt', 'feeling', 'feels'],
  'become': ['became', 'becoming', 'becomes'],
  'leave': ['left', 'leaving', 'leaves'],
  'put': ['putting', 'puts'],
  'mean': ['meant', 'meaning', 'means'],
  'keep': ['kept', 'keeping', 'keeps'],
  'let': ['letting', 'lets'],
  'begin': ['began', 'begun', 'beginning', 'begins'],
  'seem': ['seemed', 'seeming', 'seems'],
  'help': ['helped', 'helping', 'helps'],
  'show': ['showed', 'shown', 'showing', 'shows'],
  'hear': ['heard', 'hearing', 'hears'],
  'play': ['played', 'playing', 'plays'],
  'run': ['ran', 'running', 'runs'],
  'move': ['moved', 'moving', 'moves'],
  'live': ['lived', 'living', 'lives'],
  'bring': ['brought', 'bringing', 'brings'],
  'happen': ['happened', 'happening', 'happens'],
  'write': ['wrote', 'written', 'writing', 'writes'],
  'sit': ['sat', 'sitting', 'sits'],
  'stand': ['stood', 'standing', 'stands'],
  'lose': ['lost', 'losing', 'loses'],
  'pay': ['paid', 'paying', 'pays'],
  'meet': ['met', 'meeting', 'meets'],
  'speak': ['spoke', 'spoken', 'speaking', 'speaks'],
  'spend': ['spent', 'spending', 'spends'],
  'grow': ['grew', 'grown', 'growing', 'grows'],
  'win': ['won', 'winning', 'wins'],
  'teach': ['taught', 'teaching', 'teaches'],
  'buy': ['bought', 'buying', 'buys'],
  'send': ['sent', 'sending', 'sends'],
  'build': ['built', 'building', 'builds'],
  'fall': ['fell', 'fallen', 'falling', 'falls'],
  'cut': ['cutting', 'cuts'],
  'sell': ['sold', 'selling', 'sells'],
  'break': ['broke', 'broken', 'breaking', 'breaks'],
  'choose': ['chose', 'chosen', 'choosing', 'chooses'],
  'drive': ['drove', 'driven', 'driving', 'drives'],
  'eat': ['ate', 'eaten', 'eating', 'eats'],
  'fly': ['flew', 'flown', 'flying', 'flies'],
  'forget': ['forgot', 'forgotten', 'forgetting', 'forgets'],
  'hide': ['hid', 'hidden', 'hiding', 'hides'],
  'ride': ['rode', 'ridden', 'riding', 'rides'],
  'ring': ['rang', 'rung', 'ringing', 'rings'],
  'rise': ['rose', 'risen', 'rising', 'rises'],
  'sing': ['sang', 'sung', 'singing', 'sings'],
  'sink': ['sank', 'sunk', 'sinking', 'sinks'],
  'sleep': ['slept', 'sleeping', 'sleeps'],
  'swim': ['swam', 'swum', 'swimming', 'swims'],
  'throw': ['threw', 'thrown', 'throwing', 'throws'],
  'wake': ['woke', 'woken', 'waking', 'wakes'],
  'wear': ['wore', 'worn', 'wearing', 'wears'],
  'withdraw': ['withdrew', 'withdrawn', 'withdrawing', 'withdraws']
};

const POSSESSIVE_SUFFIXES = "(?:['’‘`]s|s['’‘`]|['’‘`])?";
const BOUNDARY_LOOKAHEAD = "(?=\\b|\\s|[.,!?;:\"'’‘`)\\]]|$)";

function getDirectInflections(w) {
  const patterns = new Set();
  patterns.add(escapeRegex(w));

  // 1. 不规则动词查表
  if (IRREGULAR_VERBS[w]) {
    IRREGULAR_VERBS[w].forEach(iv => patterns.add(escapeRegex(iv)));
  }
  for (const [base, forms] of Object.entries(IRREGULAR_VERBS)) {
    if (forms.includes(w)) {
      patterns.add(escapeRegex(base));
      forms.forEach(f => patterns.add(escapeRegex(f)));
    }
  }

  // 2. 超短词 (<= 3 字符，如 cat, run, in)
  if (w.length <= 3) {
    patterns.add(escapeRegex(w) + '(?:s|es|ed|ing|d)?');
    if (/[aeiou][b-df-hj-np-tv-z]$/i.test(w)) {
      const c = w[w.length - 1];
      patterns.add(escapeRegex(w) + c + '(?:ed|ing|er|ers)?');
    }
    return patterns;
  }

  // 3. 常规词（>= 4 字符）：本体 + 屈折后缀
  patterns.add(escapeRegex(w) + '(?:d|ed|s|es|ing|ingly|er|ers|est|or|ors|able|ably|ible|ibly|ive|ively|ions?|ations?|ments?|ness|ly|ful|fully|less|lessly)');

  if (w.endsWith('e')) {
    const stem = w.slice(0, -1);
    patterns.add(escapeRegex(stem) + '(?:ing|ingly|ions?|ations?|ables?|ably|ives?|ively|ors?|ers?)');
  } else if (w.endsWith('y') && !/[aeiou]y$/i.test(w)) {
    const stem = w.slice(0, -1);
    patterns.add(escapeRegex(stem) + 'i(?:ed|es|er|est|able|ables|ably|al|ally|ful|fully)');
    patterns.add(escapeRegex(w) + '(?:ing|ingly|s)?');
  } else if (/[aeiou][b-df-hj-np-tv-z]$/i.test(w) && !/[wyx]$/i.test(w)) {
    const c = w[w.length - 1];
    patterns.add(escapeRegex(w) + c + '(?:ed|ing|er|ers|able)');
  }

  return patterns;
}

function getReverseLemmas(w) {
  const lemmas = new Set();
  if (w.endsWith('ed')) {
    lemmas.add(escapeRegex(w.slice(0, -2)));       // played -> play
    lemmas.add(escapeRegex(w.slice(0, -1)));       // attributed -> attribute
  } else if (w.endsWith('ing')) {
    lemmas.add(escapeRegex(w.slice(0, -3)));       // playing -> play
    lemmas.add(escapeRegex(w.slice(0, -3) + 'e')); // creating -> create
  } else if (w.endsWith('ies')) {
    lemmas.add(escapeRegex(w.slice(0, -3) + 'y')); // applies -> apply
  } else if (w.endsWith('es')) {
    lemmas.add(escapeRegex(w.slice(0, -2)));       // watches -> watch
    lemmas.add(escapeRegex(w.slice(0, -1)));       // creates -> create
  } else if (w.endsWith('s') && !w.endsWith('ss')) {
    lemmas.add(escapeRegex(w.slice(0, -1)));
  }
  return lemmas;
}

function highlightWordInSentence(sentence, word) {
  if (!sentence || !word) return sentence || '';
  const w = word.trim().toLowerCase();
  if (!w) return sentence;

  try {
    // 优先级 1: 精准目标匹配 (含所有格 's, ’s, s', s’)
    // 若句子中已有目标词本身（如 nailed），仅高亮精准词本身，杜绝连带匹配 nails 等同词根其他词
    let tier1Pattern;
    if (w.includes(' ')) {
      const parts = w.split(/\s+/).map(escapeRegex);
      tier1Pattern = parts.join('\\s+');
    } else {
      tier1Pattern = escapeRegex(w);
    }

    const regex1 = new RegExp(`\\b(${tier1Pattern}${POSSESSIVE_SUFFIXES})${BOUNDARY_LOOKAHEAD}`, 'gi');
    if (regex1.test(sentence)) {
      return sentence.replace(regex1, '<span class="highlight">$1</span>');
    }

    // 优先级 2: 目标原型向前屈折形态 (当例句中没有原型，但有过去式/分词等形态，如 attribute -> attributed)
    let tier2PatternStr;
    if (w.includes(' ')) {
      const parts = w.split(/\s+/);
      const firstForms = getDirectInflections(parts[0]);
      const rest = parts.slice(1).map(escapeRegex).join('\\s+');
      const firstGroup = Array.from(firstForms).sort((a, b) => b.length - a.length).join('|');
      tier2PatternStr = `(?:${firstGroup})\\s+${rest}`;
    } else {
      const tier2Forms = getDirectInflections(w);
      tier2PatternStr = Array.from(tier2Forms).sort((a, b) => b.length - a.length).join('|');
    }

    const regex2 = new RegExp(`\\b((?:${tier2PatternStr})${POSSESSIVE_SUFFIXES})${BOUNDARY_LOOKAHEAD}`, 'gi');
    if (regex2.test(sentence)) {
      return sentence.replace(regex2, '<span class="highlight">$1</span>');
    }

    // 优先级 3: 目标屈折词向后倒推原型 (当存入的词是过去式/进行时，如 playing / attributed，而例句中是原型 play / attribute)
    const tier3Lemmas = getReverseLemmas(w);
    if (tier3Lemmas.size > 0) {
      const tier3PatternStr = Array.from(tier3Lemmas).sort((a, b) => b.length - a.length).join('|');
      const regex3 = new RegExp(`\\b((?:${tier3PatternStr})${POSSESSIVE_SUFFIXES})${BOUNDARY_LOOKAHEAD}`, 'gi');
      if (regex3.test(sentence)) {
        return sentence.replace(regex3, '<span class="highlight">$1</span>');
      }
    }

    return sentence;
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

let lastSyncDetailError = "";

function updateSyncBadge(status, text, tooltip = "") {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  const btn = document.getElementById('btnSyncStatus');
  if (!dot || !txt) return;

  if (status === 'connected') {
    dot.className = "sync-icon-dot active";
    txt.innerText = text || "已同步";
    if (btn) btn.title = tooltip || "坚果云 / 欧路已连接，点击打开同步设置";
  } else if (status === 'syncing') {
    dot.className = "sync-icon-dot active rotating";
    txt.innerText = text || "正在同步中...";
    if (btn) btn.title = tooltip || "正在与云端交换数据...";
  } else {
    dot.className = "sync-icon-dot";
    txt.innerText = text || "未同步";
    if (btn) btn.title = tooltip || (lastSyncDetailError ? `同步异常原因: ${lastSyncDetailError} (点击打开设置)` : "点击打开同步设置");
  }
}

let isFullSyncing = false;

// 全量多端融合同步引擎：欧路词典 OpenAPI 增量拉取 + 坚果云 WebDAV 双向合并
async function doFullSync(notifyUser = false) {
  if (isFullSyncing) {
    console.log("已有同步任务正在进行中，跳过重复触发");
    return;
  }
  isFullSyncing = true;
  updateSyncBadge('syncing', '正在同步中...');

  // 看门狗超时保护：即使遇到极端断网或服务器假死，最多 15 秒后强制重置状态，绝不永久卡在「正在同步中」
  const watchdogTimer = setTimeout(() => {
    if (isFullSyncing) {
      console.warn("同步超时触发，重置状态");
      isFullSyncing = false;
      updateSyncBadge('disconnected', '同步超时');
      if (notifyUser) showToast('⚠️ 网络请求超时，请检查网络或坚果云配置', 'warning', 4000);
    }
  }, 15000);

  let eudicNewCount = 0;
  let eudicTotalScanned = 0;
  let eudicError = null;
  let hasWebDAV = false;
  let webdavSuccessCount = 0;

  try {
    // 1. 若配置了欧路 Token，自动拉取欧路全部分类生词（传入 currentWords 开启极速早停加速）
    const storageData = await new Promise(resolve => {
      chrome.storage.sync.get({ eudicToken: '' }, resolve);
    });

    const token = (storageData.eudicToken || "").trim();
    if (token) {
      try {
        const engine = new EudicSyncEngine(token);
        const eudicWords = await engine.fetchAllCategoriesAndWords(currentWords);
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

    // 2. 坚果云 WebDAV 双向合并（直接在页面线程原生执行，彻底规避 MV3 Service Worker 30秒被杀导致的丢包卡死）
    if (webdavConfig && webdavConfig.enabled && webdavConfig.username && webdavConfig.password) {
      hasWebDAV = true;
      const localRes = await new Promise(resolve => {
        chrome.storage.local.get({ savedWords: [], deletedWords: {}, lastWebDAVSyncTime: 0 }, resolve);
      });
      const list = localRes.savedWords || [];
      const deletions = localRes.deletedWords || {};
      const lastSync = localRes.lastWebDAVSyncTime || 0;

      const client = new WebDAVClient(webdavConfig);
      const { mergedList, mergedDeletions, syncTime } = await client.performSync(list, deletions, lastSync);

      await new Promise(resolve => {
        chrome.storage.local.set({
          savedWords: mergedList,
          deletedWords: mergedDeletions,
          lastWebDAVSyncTime: syncTime || Date.now()
        }, resolve);
      });

      currentWords = mergedList;
      webdavSuccessCount = mergedList.length;
      if (currentView !== 'flashcard') {
        applyFilter();
      }
      updateStats();

      updateSyncBadge('connected', `已同步 (${webdavSuccessCount} 词)`);
      if (notifyUser) {
        let msg = `🎉 同步完成！词库共 ${webdavSuccessCount} 词。`;
        if (token && eudicNewCount > 0) {
          msg += `\n• 欧路新增入库: ${eudicNewCount} 词`;
        }
        if (eudicError) {
          msg += `\n⚠️ 欧路提示: ${eudicError}`;
        }
        showToast(msg, 'success', 3500);
      }
    } else {
      // 仅欧路模式或未配置模式
      if (token) {
        updateSyncBadge('connected', `欧路已同步 (${currentWords.length} 词)`);
        if (notifyUser) {
          if (eudicError) {
            showToast(`❌ 欧路同步失败: ${eudicError}`, 'error', 4000);
          } else {
            showToast(`🎉 欧路词典同步完成！共扫描 ${eudicTotalScanned} 词，新增入库 ${eudicNewCount} 词。`, 'success', 3500);
          }
        }
      } else {
        updateSyncBadge('disconnected', '未配置同步');
        if (notifyUser) showToast("请先在「☁️ 同步设置」中填写坚果云或欧路词典 Token！", 'warning');
      }
    }
  } catch (err) {
    console.error("同步异常:", err);
    let errMsg = err.message || '网络连接异常';
    let shortTxt = "同步失败";
    let detailAdvice = errMsg;

    if (errMsg.includes('401') || errMsg.toLowerCase().includes('unauthorized')) {
      shortTxt = "密码错误(401)";
      detailAdvice = "坚果云授权失败 (401)：请检查坚果云用户名与「应用专用密码」是否正确（注意必须在坚果云官网生成“第三方应用密码”，不能使用主账号登录密码）！";
    } else if (errMsg.includes('403') || errMsg.includes('404') || errMsg.includes('409')) {
      shortTxt = "路径错误";
      const folderName = (webdavConfig && webdavConfig.filePath) ? webdavConfig.filePath.split('/')[0] : 'antigravity';
      detailAdvice = `坚果云路径错误 (${errMsg})：坚果云必须先存在该同步文件夹。请在坚果云网页版中新建「${folderName}」文件夹，或在设置中将文件路径改为「我的坚果云/antigravity.json」！`;
    } else if (errMsg.includes('超时') || errMsg.toLowerCase().includes('timeout')) {
      shortTxt = "网络超时";
      detailAdvice = "连接坚果云服务器超时，请检查网络连接或系统代理设置！";
    }

    lastSyncDetailError = detailAdvice;
    updateSyncBadge('disconnected', shortTxt, detailAdvice);
    showToast(`❌ 同步异常: ${detailAdvice}`, 'error', 6000);
  } finally {
    clearTimeout(watchdogTimer);
    isFullSyncing = false;
  }
}

async function doWebDAVSync(notifyUser = false) {
  return doFullSync(notifyUser);
}

async function doWebDAVOverwrite(callback = null) {
  if (!webdavConfig || !webdavConfig.enabled || !webdavConfig.username || !webdavConfig.password) {
    if (callback) callback({ success: false, error: '未配置坚果云' });
    return;
  }
  updateSyncBadge('syncing', '正在覆盖上传...');
  try {
    const client = new WebDAVClient(webdavConfig);
    const localRes = await new Promise(r => chrome.storage.local.get({ savedWords: [], deletedWords: {} }, r));
    const list = localRes.savedWords || [];
    const deletions = localRes.deletedWords || {};
    await client.uploadWords(list);
    await client.uploadDeletions(deletions);
    updateSyncBadge('connected', `坚果云已同步 (${list.length} 词)`);
    if (callback) callback({ success: true, count: list.length });
  } catch (err) {
    console.error("WebDAV 覆盖上传失败:", err);
    updateSyncBadge('disconnected', "同步失败");
    if (callback) callback({ success: false, error: err.message });
  }
}

async function doWebDAVPullForce(callback = null) {
  if (!webdavConfig || !webdavConfig.enabled || !webdavConfig.username || !webdavConfig.password) {
    if (callback) callback({ success: false, error: '未配置坚果云' });
    return;
  }
  updateSyncBadge('syncing', '正在拉取云端全量...');
  try {
    const client = new WebDAVClient(webdavConfig);
    const remoteList = await client.downloadWords();
    const remoteDeletions = await client.downloadDeletions();
    await new Promise(r => chrome.storage.local.set({
      savedWords: remoteList,
      deletedWords: remoteDeletions,
      lastWebDAVSyncTime: Date.now()
    }, r));
    currentWords = remoteList;
    applyFilter();
    updateStats();
    updateSyncBadge('connected', `云端已拉取 (${remoteList.length} 词)`);
    if (callback) callback({ success: true, count: remoteList.length });
  } catch (err) {
    console.error("WebDAV 强制拉取失败:", err);
    updateSyncBadge('disconnected', "拉取失败");
    if (callback) callback({ success: false, error: err.message });
  }
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

// 快速设置某个单词的熟练度 (精准定位到具体单条记录)
function setWordMastery(targetUid, targetLevel) {
  const item = currentWords.find(w => (targetUid && w._uid) ? w._uid === targetUid : (w.text || w.word || "").toLowerCase().trim() === (targetUid || "").toLowerCase().trim());
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

// 方案 1: 单词关键词精准高亮辅助函数
function highlightSearchMatch(text, query) {
  if (!text) return "";
  if (!query) return escapeHtml(text);
  const q = query.trim();
  if (!q) return escapeHtml(text);
  try {
    const escapedQ = escapeRegex(q);
    const regex = new RegExp(escapedQ, 'gi');
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      result += escapeHtml(text.substring(lastIndex, match.index));
      result += `<mark class="search-match">${escapeHtml(match[0])}</mark>`;
      lastIndex = regex.lastIndex;
      if (!regex.global) break;
    }
    result += escapeHtml(text.substring(lastIndex));
    return result;
  } catch (e) {
    return escapeHtml(text);
  }
}

// 渲染主表格列表
function renderList(list, query = "") {
  filteredWords = list;
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const searchInput = document.getElementById('searchInput');
  const q = typeof query === 'string' ? query.trim() : (searchInput ? searchInput.value.trim() : "");
  
  if (list.length === 0) {
    if (q) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#8C827A; padding:60px 20px; font-size:14px;">未检索到包含「<strong>${escapeHtml(q)}</strong>」的生词</td></tr>`;
    } else {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#8C827A; padding:60px 20px; font-size:14px;">生词本暂无词汇记录，在外刊划词或点击右上角「➕ 添加新词」开始积累吧！</td></tr>';
    }
    return;
  }
  
  list.forEach((item) => {
    const wordText = item.text || item.word || "";
    const phonetic = extractPhoneticFromItem(item);
    const transHtml = formatTransHtml(item.trans || item.definition || "");
    const notesText = cleanNotes(item.notes);
    const contextSentence = highlightWordInSentence(item.context || item.sentence || "暂无上下文例句", wordText);
    const sourceTitle = item.title || "Web Article";
    const faviconUrl = getSourceFavicon(item);
    const masteryInfo = getMasteryInfo(item.srsLevel, item.srsReviews);
    
    // 确保每条记录拥有绝对唯一的标识符，杜绝同名重复词混淆
    if (!item._uid) {
      item._uid = 'w_' + (item.date || Date.now()) + '_' + Math.random().toString(36).slice(2, 9);
    }
    const uid = item._uid;

    const wordTitleHtml = highlightSearchMatch(wordText, q);
    const dialect = getDialectLabel(wordText);
    const dialectHtml = dialect ? `<span class="nb-dialect-badge dialect-${dialect === '英式' ? 'uk' : 'us'}" title="${wordText} 属于${dialect}拼写规范">${dialect}</span>` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="vertical-align: middle !important; text-align: center;">
        <div class="word-cell-wrap">
          <span class="word-title">${wordTitleHtml}${dialectHtml}</span>
          ${phonetic ? `<span class="word-phonetic audio-phonetic-trigger" data-word="${wordText}" title="点击朗读发音">${phonetic}</span>` : ''}
        </div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="salad-context-box">
          <div class="salad-sentence">${contextSentence}</div>
        </div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="trans-text">${transHtml}</div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="note-text">${notesText || ''}</div>
      </td>
      <td style="vertical-align: middle !important;">
        <div class="action-group">
          <div class="mastery-wrap">
            <button class="mastery-dot-btn btn-mastery-toggle" data-uid="${uid}" data-word="${wordText}" title="${masteryInfo.title}">
              <span class="mastery-dot-glow ${masteryInfo.class}"></span>
            </button>
            <div class="mastery-picker-popup">
              <button class="candy-option btn-candy" data-uid="${uid}" data-level="-1" title="⚪ 设为未标记">
                <span class="candy-dot" style="border: 1.5px dashed #A8A29E; background: transparent;"></span>
              </button>
              <button class="candy-option btn-candy" data-uid="${uid}" data-level="0" title="🔴 陌生 (Lv 0)">
                <span class="candy-dot" style="background: #EF4444; box-shadow: 0 0 5px rgba(239, 68, 68, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-uid="${uid}" data-level="1" title="🟠 学习中 (Lv 1)">
                <span class="candy-dot" style="background: #F59E0B; box-shadow: 0 0 5px rgba(245, 158, 11, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-uid="${uid}" data-level="3" title="🟢 已掌握 (Lv 3)">
                <span class="candy-dot" style="background: #10B981; box-shadow: 0 0 5px rgba(16, 185, 129, 0.6);"></span>
              </button>
              <button class="candy-option btn-candy" data-uid="${uid}" data-level="5" title="🔵 已精通 (Lv 5)">
                <span class="candy-dot" style="background: #6366F1; box-shadow: 0 0 5px rgba(99, 102, 241, 0.6);"></span>
              </button>
            </div>
          </div>
          <button class="apple-icon-btn btn-edit" data-uid="${uid}" data-word="${wordText}" title="编辑词条与笔记">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="apple-icon-btn apple-icon-btn-del btn-del" data-uid="${uid}" data-word="${wordText}" title="删除词条">
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
      const targetUid = btn.getAttribute('data-uid');
      const targetLevel = parseInt(btn.getAttribute('data-level'));
      document.querySelectorAll('.mastery-picker-popup.open').forEach(p => p.classList.remove('open'));
      setWordMastery(targetUid, targetLevel);
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
      const targetUid = btn.getAttribute('data-uid');
      const targetWord = btn.getAttribute('data-word');
      const idx = currentWords.findIndex(w => (targetUid && w._uid) ? w._uid === targetUid : (w.text || w.word || "").toLowerCase().trim() === (targetWord || "").toLowerCase().trim());
      if (idx !== -1) {
        openEditModal(idx);
      }
    };
  });

  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetUid = btn.getAttribute('data-uid');
      const targetWord = btn.getAttribute('data-word');
      if (!targetUid && !targetWord) return;

      const idx = currentWords.findIndex(w => (targetUid && w._uid) ? w._uid === targetUid : (w.text || w.word || "").toLowerCase().trim() === (targetWord || "").toLowerCase().trim());
      if (idx === -1) return;

      if (confirm(`确定要从生词本中删除「${targetWord}」吗？`)) {
        // 核心修复：精准仅删除被点击的那条单独记录！同名单词其他副本绝对完整保留
        currentWords.splice(idx, 1);

        const cleanTarget = (targetWord || "").toLowerCase().trim();
        chrome.storage.local.get({ deletedWords: {} }, (rDel) => {
          const delMap = Object.assign({}, rDel.deletedWords || {});
          if (cleanTarget) delMap[cleanTarget] = Date.now();

          chrome.storage.local.set({ savedWords: currentWords, deletedWords: delMap }, () => {
            doWebDAVOverwrite(); // 立即用删除后的纯净数据覆盖坚果云端并同步上传墓碑

            // 关键：检查库中是否还存在其他同名单词；若无，才从欧路词典生词本中同步删除
            const hasOtherSameWord = currentWords.some(w => (w.text || w.word || "").toLowerCase().trim() === cleanTarget);
            if (!hasOtherSameWord) {
              chrome.storage.sync.get({ eudicToken: '' }, (r) => {
                if (r.eudicToken) {
                  const engine = new EudicSyncEngine(r.eudicToken);
                  engine.deleteWord(targetWord).catch(err => {
                    console.warn(`从欧路同步删除 ${targetWord} 失败:`, err);
                  });
                }
              });
            }

            applyFilter();
            updateStats();
            showToast(`🗑️ 已删除「${targetWord}」`, 'info');
          });
        });
      }
    };
  });
}

// ---------------- 艾宾浩斯交互闪卡系统 (SM-2 SRS + 定量组自测) ----------------
let currentBatchSize = '20'; // 10, 20, 50, all
let batchStats = { forgot: 0, hard: 0, good: 0, completedCount: 0 };
let batchTotalTarget = 20;

// 智能释义显示排版引擎：多词性 (n./v./adj./adv.)、序号列表与形态衍生 (时态/名词/复数) 自动分行排版（纯净展示，不破坏/不截断人工编辑与输入内容）
function formatTrans(s) {
  if (!s) return "";
  let str = String(s).replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // 1. 标准化分号与逗号
  str = str.replace(/;/g, "；").replace(/；\s*/g, "；").replace(/,/g, "，").replace(/，\s*/g, "，");

  // 2. 识别所有英文常见词性缩写并自动换行 (如 vt. vi. n. adj. adv. a. ad. prep. conj. pron. art. num. interj. aux. abbr. pl. sing. pref. suff. link-v. 等)
  const posRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)\b((?:n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|art|num|int|interj|aux|abbr|pl|sing|pref|suff|link-v)\.)\s*/gi;
  str = str.replace(posRegex, "\n$1 ");

  // 3. 识别序号列表分项并自动换行 (如 1. 2. / 1、2、/ (1) (2) / ① ② 等)
  const numRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((\d+[\.、]|\(\d+\)|\[\d+\]|[\u2460-\u2473]))\s*/g;
  str = str.replace(numRegex, "\n$1 ");

  // 4. 识别中文词性与时态衍生标签并自动换行 (如 [名] [动] 【形】 或 时态: 名词: 过去式: 等，必须带冒号或方括号，避免误伤像“（curb 的过去式和过去分词）”这样的括号内正常文字)
  const metaRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((?:\[(?:名|动|形|副|代|介|连|叹|时态|名词|形容词|副词|复数|比较级|最高级|过去式|过去分词|现在分词)\]|【(?:名|动|形|副|代|介|连|叹|时态|名词|形容词|副词|复数|比较级|最高级|过去式|过去分词|现在分词)】|(?:时\s*态|名\s*词|形\s*容\s*词|副\s*词|复\s*数|比较级|最高级|过去式|过去分词|现在分词|第三人称单数)\s*[:：]))\s*/gi;
  str = str.replace(metaRegex, "\n$1 ");

  // 5. 清理每行首尾多余标点与空格，完整保留全部释义内容
  return str.split("\n")
    .map(line => line.replace(/^[\s；，,;]+|[\s；，,;]+$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

function formatTransHtml(s) {
  const formatted = formatTrans(s);
  if (!formatted) return "";
  const POS_RE = /^([a-zA-Z\-]+\.|[\u2460-\u2473]|\(\d+\)|\[\d+\]|\d+[\.、]|\[.+?\]|【.+?】)\s*/;
  return formatted.split('\n').map(line => {
    const escaped = escapeHtml(line.trim());
    if (!escaped) return '';
    const m = escaped.match(POS_RE);
    if (m) {
      const posTag = m[1];
      const rest = escaped.slice(m[0].length);
      return `<div class="trans-line trans-line-pos"><span class="trans-pos-tag">${posTag}</span><span class="trans-meaning">${rest}</span></div>`;
    }
    return `<div class="trans-line trans-line-plain">${escaped}</div>`;
  }).filter(Boolean).join('');
}

let sessionTestedWordKeys = new Set(); // 记录当前会话已测试词汇，避免多组自测时频繁重复

function calculateMemoryUrgency(item, now) {
  const lv = parseInt(item.srsLevel) || 0;
  const nextRev = parseInt(item.srsNextReview) || 0;
  const date = item.date ? (typeof item.date === 'number' ? item.date : new Date(item.date).getTime()) : 0;
  const ageDays = Math.max(0, (now - date) / (86400 * 1000));

  let score = 0;
  if (lv > 0 && nextRev > 0 && now >= nextRev) {
    // 1. 到期未复习词：遗忘临界点，最高优先级
    const overdueDays = (now - nextRev) / (86400 * 1000);
    score = 2000 + overdueDays * 25;
  } else if (lv === 0) {
    // 2. 零熟练度生词：越早收录越容易彻底遗忘，给予极高抢救权重
    score = 1000 + ageDays * 8 - (parseInt(item.srsReviews) || 0) * 40;
  } else {
    // 3. 尚未到期的高阶词：保持基础活性探索
    score = 200 + ageDays * 2 - (lv * 60);
  }

  // 叠加动态随机扰动因子
  score += Math.random() * 80;
  return score;
}

function selectSmartFlashcardBatch(pool, targetN) {
  if (pool.length <= targetN) {
    const res = [...pool];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }

  const now = Date.now();

  // 若已测试词数接近池总量，自动重置以便无缝开启新一轮全库循环
  if (sessionTestedWordKeys.size >= pool.length - Math.min(5, Math.floor(targetN / 2))) {
    sessionTestedWordKeys.clear();
  }

  // 1. 优先从当前会话尚未测过的词池中抽选
  const freshPool = pool.filter(w => !sessionTestedWordKeys.has((w.text || w.word || '').toLowerCase().trim()));
  const candidatePool = freshPool.length >= targetN ? freshPool : pool;

  // 2. 分桶 A: 到期应复习词 (srsLevel > 0 且 srsNextReview <= now，按最逾期优先)
  const dueReviews = candidatePool.filter(w => (parseInt(w.srsLevel) || 0) > 0 && (parseInt(w.srsNextReview) || 0) <= now);
  dueReviews.sort((a, b) => (parseInt(a.srsNextReview) || 0) - (parseInt(b.srsNextReview) || 0));

  // 3. 分桶 B: 早期沉淀 / 最早加入生词 (srsLevel == 0，按加入时间最早优先，彻底解决老词无法出题问题)
  const unmastered = candidatePool.filter(w => (parseInt(w.srsLevel) || 0) === 0);
  const unmasteredOldest = [...unmastered].sort((a, b) => {
    const dateA = a.date ? (typeof a.date === 'number' ? a.date : new Date(a.date).getTime()) : 0;
    const dateB = b.date ? (typeof b.date === 'number' ? b.date : new Date(b.date).getTime()) : 0;
    return dateA - dateB;
  });

  // 4. 分桶 C: 近期新增生词 (srsLevel == 0，按加入时间最新优先)
  const unmasteredNewest = [...unmastered].sort((a, b) => {
    const dateA = a.date ? (typeof a.date === 'number' ? a.date : new Date(a.date).getTime()) : 0;
    const dateB = b.date ? (typeof b.date === 'number' ? b.date : new Date(b.date).getTime()) : 0;
    return dateB - dateA;
  });

  // 科学配额：约 35% 到期复习词 + 约 40% 最早老生词 + 约 25% 近期新增生词
  const quotaDue = Math.min(dueReviews.length, Math.max(1, Math.floor(targetN * 0.35)));
  const quotaOld = Math.min(unmasteredOldest.length, Math.max(2, Math.floor(targetN * 0.40)));
  const quotaNew = Math.min(unmasteredNewest.length, Math.max(1, Math.floor(targetN * 0.25)));

  const selectedSet = new Set();
  const selectedList = [];

  function addCandidates(list, count) {
    let added = 0;
    for (const item of list) {
      const key = (item.text || item.word || '').toLowerCase().trim();
      if (!selectedSet.has(key) && added < count) {
        selectedSet.add(key);
        selectedList.push(item);
        added++;
      }
    }
  }

  addCandidates(dueReviews, quotaDue);
  addCandidates(unmasteredOldest, quotaOld);
  addCandidates(unmasteredNewest, quotaNew);

  // 5. 剩余配额按全库艾宾浩斯综合记忆紧迫度补充
  if (selectedList.length < targetN) {
    const remaining = candidatePool.filter(item => {
      const key = (item.text || item.word || '').toLowerCase().trim();
      return !selectedSet.has(key);
    });

    remaining.sort((a, b) => calculateMemoryUrgency(b, now) - calculateMemoryUrgency(a, now));
    addCandidates(remaining, targetN - selectedList.length);
  }

  // 组内 Fisher-Yates 随机乱序
  for (let i = selectedList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectedList[i], selectedList[j]] = [selectedList[j], selectedList[i]];
  }

  // 记录选中的词条
  selectedList.forEach(item => {
    const key = (item.text || item.word || '').toLowerCase().trim();
    sessionTestedWordKeys.add(key);
  });

  return selectedList;
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

  // 核心修复：闪卡自测池仅受熟练度（SRS）筛选器控制，绝不受顶部搜索框临时检索词干扰，保障艾宾浩斯组卷完整
  let pool = currentWords.filter(item => {
    if (!selectedSrsSet.has('all')) {
      const itemLv = (parseInt(item.srsLevel) || 0).toString();
      return selectedSrsSet.has(itemLv);
    }
    return true;
  });
  
  if (currentBatchSize !== 'all') {
    const targetN = parseInt(currentBatchSize) || 20;
    pool = selectSmartFlashcardBatch(pool, targetN);
  } else {
    // 全量模式：整库乱序
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
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
  if (contextEl) contextEl.innerHTML = highlightWordInSentence(context, word);

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
    if (specTrans) specTrans.innerHTML = formatTransHtml(item.trans || item.definition || "");
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
  const fcDialectTag = document.getElementById('fcDialectTag');
  if (fcDialectTag) {
    const dialect = getDialectLabel(word);
    if (dialect) {
      fcDialectTag.innerText = dialect;
      fcDialectTag.className = `nb-dialect-badge dialect-${dialect === '英式' ? 'uk' : 'us'}`;
      fcDialectTag.title = `${word} 属于${dialect}拼写规范`;
      fcDialectTag.style.display = 'inline-block';
    } else {
      fcDialectTag.style.display = 'none';
    }
  }

  document.getElementById('fcPhonetic').innerText = phonetic;
  document.getElementById('fcContext').innerHTML = context;
  document.getElementById('fcTrans').innerHTML = formatTransHtml(item.trans || item.definition || "");

  const badgeEl = document.getElementById('fcSrsBadge');
  badgeEl.className = `srs-badge ${srs.class}`;
  document.getElementById('fcSrsText').innerText = srs.label;

  const notesEl = document.getElementById('fcNotes');
  const notesBody = document.getElementById('fcNotesBody');
  if (notes && notes.trim()) {
    if (notesBody) {
      notesBody.innerText = notes;
    } else {
      notesEl.innerText = notes;
    }
    notesEl.style.display = 'flex';
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

    // 绽放 Apple 级五彩礼花微动效与连击庆祝音
    SoundFx.playStreak();
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
  SoundFx.playBubble();
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
    SoundFx.playForgot();
  } else if (rating === 2) { // 模糊
    newLevel = Math.max(1, currentLevel);
    intervalDays = 1;
    batchStats.hard++;
    SoundFx.playHard();
  } else if (rating === 3) { // 熟练
    newLevel = Math.min(3, currentLevel + 1);
    intervalDays = newLevel === 3 ? 7 : (newLevel === 2 ? 3 : 1);
    batchStats.good++;
    SoundFx.playSuccess();
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
let isVariantFilterActive = false; // 是否处于词根变体检索筛选模式
let isNoContextFilterActive = false; // 是否处于无例句生词筛选模式

// 判定词条是否缺少真实语境例句（为空、仅空白、或为系统占位默认文本）
function isNoContextWord(item) {
  if (!item) return false;
  const ctx = (item.context || item.sentence || "").trim();
  return !ctx || ctx === "来自欧路词典同步" || ctx === "暂无上下文例句";
}

// 词根屈折变体衍生词提取算法 (支持常规屈折变体与英美拼写互通)
function getBaseForms(word) {
  const w = (word || "").toLowerCase().trim();
  if (!w) return [];
  const forms = [w];
  
  // 1. 英美拼写系统规则归一 (UK <-> US Spelling)
  // -our <-> -or (colour <-> color, flavour <-> flavor, honour <-> honor, labour <-> labor, rumour <-> rumor, etc.)
  if (w.endsWith("our") && w.length > 4) forms.push(w.slice(0, -3) + "or");
  if (w.endsWith("or") && w.length > 3) forms.push(w.slice(0, -2) + "our");
  
  // -ise / -ising / -ised <-> -ize / -izing / -ized (organise <-> organize, realise <-> realize)
  if (w.endsWith("ise") && w.length > 4) forms.push(w.slice(0, -3) + "ize");
  if (w.endsWith("ize") && w.length > 4) forms.push(w.slice(0, -3) + "ise");
  if (w.endsWith("ised") && w.length > 5) {
    forms.push(w.slice(0, -4) + "ized");
    forms.push(w.slice(0, -4) + "ise");
    forms.push(w.slice(0, -4) + "ize");
  }
  if (w.endsWith("ized") && w.length > 5) {
    forms.push(w.slice(0, -4) + "ised");
    forms.push(w.slice(0, -4) + "ize");
    forms.push(w.slice(0, -4) + "ise");
  }
  if (w.endsWith("ising") && w.length > 6) {
    forms.push(w.slice(0, -5) + "izing");
    forms.push(w.slice(0, -5) + "ise");
    forms.push(w.slice(0, -5) + "ize");
  }
  if (w.endsWith("izing") && w.length > 6) {
    forms.push(w.slice(0, -5) + "ising");
    forms.push(w.slice(0, -5) + "ize");
    forms.push(w.slice(0, -5) + "ise");
  }

  // -re <-> -er (theatre <-> theater, centre <-> center, metre <-> meter, fibre <-> fiber)
  if (w.endsWith("tre") && w.length > 4) forms.push(w.slice(0, -3) + "ter");
  if (w.endsWith("ter") && w.length > 4) forms.push(w.slice(0, -3) + "tre");
  if (w.endsWith("bre") && w.length > 4) forms.push(w.slice(0, -3) + "ber");
  if (w.endsWith("ber") && w.length > 4) forms.push(w.slice(0, -3) + "bre");

  // -ogue <-> -og (catalogue <-> catalog, dialogue <-> dialog)
  if (w.endsWith("ogue") && w.length > 5) forms.push(w.slice(0, -4) + "og");
  if (w.endsWith("og") && w.length > 3) forms.push(w.slice(0, -2) + "ogue");

  // 2. 屈折词尾变换与英美重叠双辅音还原 (如 fuel -> fuelled / fueled, travel -> travelled / traveled)
  // 复数与第三人称单数
  if (w.endsWith("ies") && w.length > 3) forms.push(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) forms.push(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) forms.push(w.slice(0, -1));

  // 过去式 / 过去分词 (-ed)
  if (w.endsWith("ed") && w.length > 3) {
    const stemEd = w.slice(0, -2);
    forms.push(stemEd); // played -> play, traveled -> travel
    forms.push(w.slice(0, -1)); // smiled -> smile (stem + e)

    // 检测英式重叠双辅音脱落 (如 fuelled -> fuel, cancelled -> cancel, stopped -> stop, planned -> plan)
    if (stemEd.length >= 3) {
      const lastChar = stemEd[stemEd.length - 1];
      const secondLastChar = stemEd[stemEd.length - 2];
      if (lastChar === secondLastChar && /[b-df-hj-np-tv-z]/.test(lastChar)) {
        forms.push(stemEd.slice(0, -1)); // fuelled -> fuel, stopped -> stop
      }
    }
  }

  // 现在分词 / 动名词 (-ing)
  if (w.endsWith("ing") && w.length > 4) {
    const stemIng = w.slice(0, -3);
    forms.push(stemIng); // traveling -> travel, playing -> play
    forms.push(stemIng + "e"); // writing -> write, wiping -> wipe
    if (stemIng.endsWith("y")) forms.push(stemIng.slice(0, -1) + "ie");

    // 检测英式重叠双辅音脱落 (如 fuelling -> fuel, travelling -> travel, stopping -> stop)
    if (stemIng.length >= 3) {
      const lastChar = stemIng[stemIng.length - 1];
      const secondLastChar = stemIng[stemIng.length - 2];
      if (lastChar === secondLastChar && /[b-df-hj-np-tv-z]/.test(lastChar)) {
        forms.push(stemIng.slice(0, -1)); // fuelling -> fuel, stopping -> stop
      }
    }
  }

  return [...new Set(forms)];
}

// 智能英式/美式拼写感知提取
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

// 扫描全库找出所有词根重复变体群组
function findWordVariantClusters(list) {
  const clusters = [];
  const visitedIndices = new Set();

  list.forEach((item, i) => {
    if (visitedIndices.has(i)) return;
    const w = (item.text || item.word || "").toLowerCase().trim();
    if (!w) return;

    const matchedIndices = [i];
    const forms = getBaseForms(w);

    list.forEach((other, oIdx) => {
      if (oIdx === i || visitedIndices.has(oIdx)) return;
      const ow = (other.text || other.word || "").toLowerCase().trim();
      if (!ow) return;
      const oForms = getBaseForms(ow);
      const isRelated = forms.some(f => oForms.includes(f) || ow === f || w === oForms[0]);
      if (isRelated) {
        matchedIndices.push(oIdx);
      }
    });

    if (matchedIndices.length > 1) {
      matchedIndices.forEach(idx => visitedIndices.add(idx));
      // 将群组内的词按照词长或词根匹配进行排序：词根原型在前，变体在后
      const groupWords = matchedIndices.map(idx => list[idx]);
      groupWords.sort((a, b) => {
        const wa = (a.text || a.word || '').toLowerCase();
        const wb = (b.text || b.word || '').toLowerCase();
        return wa.length - wb.length || wa.localeCompare(wb);
      });
      clusters.push(groupWords);
    }
  });

  return clusters;
}

// 退出词根变体筛选模式
function exitVariantFilterMode() {
  isVariantFilterActive = false;
  const banner = document.getElementById('variantFilterBanner');
  if (banner) banner.style.display = 'none';
  applyFilter();
}

// 退出无例句生词筛选模式
function exitNoContextFilterMode() {
  isNoContextFilterActive = false;
  const banner = document.getElementById('noContextFilterBanner');
  if (banner) banner.style.display = 'none';
  applyFilter();
}

function applyFilter() {
  if (isVariantFilterActive) {
    // 词根变体筛选模式：计算并展示所有变体列表
    const clusters = findWordVariantClusters(currentWords);
    const flattened = [];
    clusters.forEach(cluster => {
      cluster.forEach(item => flattened.push(item));
    });
    filteredWords = flattened;
    const banner = document.getElementById('variantFilterBanner');
    const bannerText = document.getElementById('variantFilterText');
    if (banner && bannerText) {
      banner.style.display = 'flex';
      bannerText.innerHTML = `已检索到 <strong>${clusters.length}</strong> 组（共 <strong>${flattened.length}</strong> 词）词根重复变体`;
    }
    const noCtxBanner = document.getElementById('noContextFilterBanner');
    if (noCtxBanner) noCtxBanner.style.display = 'none';
    renderList(flattened, "");
    return;
  }

  const varBanner = document.getElementById('variantFilterBanner');
  if (varBanner) varBanner.style.display = 'none';

  if (isNoContextFilterActive) {
    // 无例句词筛选模式
    const noCtxWords = currentWords.filter(item => isNoContextWord(item));
    filteredWords = noCtxWords;
    const banner = document.getElementById('noContextFilterBanner');
    const bannerText = document.getElementById('noContextFilterText');
    if (banner && bannerText) {
      banner.style.display = 'flex';
      bannerText.innerHTML = `已筛选出 <strong>${noCtxWords.length}</strong> 个缺少语境例句的生词`;
    }
    renderList(noCtxWords, "");
    return;
  }

  const noCtxBanner = document.getElementById('noContextFilterBanner');
  if (noCtxBanner) noCtxBanner.style.display = 'none';

  const searchInput = document.getElementById('searchInput');
  const rawQ = searchInput ? searchInput.value : "";
  const q = rawQ.toLowerCase().trim();

  // 方案 1: 检索状态下为表格容器添加 .is-searching 类名，例句高亮优雅降权
  const viewTableContainer = document.getElementById('viewTableContainer');
  if (viewTableContainer) {
    viewTableContainer.classList.toggle('is-searching', q.length > 0);
  }

  const filtered = currentWords.filter(item => {
    // 文本匹配：仅搜索生词本身 (Word Only)
    const wordText = (item.text || item.word || '').toLowerCase();
    const matchText = !q || wordText.includes(q);

    // 熟练度多选匹配
    let matchSrs = true;
    if (!selectedSrsSet.has('all')) {
      const itemLv = (parseInt(item.srsLevel) || 0).toString();
      matchSrs = selectedSrsSet.has(itemLv);
    }

    return matchText && matchSrs;
  });

  filteredWords = filtered;
  renderList(filtered, rawQ.trim());
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

let originalEditingWord = "";

function openAddModal() {
  modalTitle.innerText = "添加新词条";
  if (modalSubmitBtn) modalSubmitBtn.innerText = "保存入库";
  editIndexInput.value = "-1";
  const editUidInput = document.getElementById('editUid');
  if (editUidInput) editUidInput.value = "";
  originalEditingWord = "";
  vocabForm.reset();
  if (autoFillStatus) autoFillStatus.style.display = "none";
  const variantWarn = document.getElementById('wordVariantWarning');
  if (variantWarn) variantWarn.style.display = "none";
  modal.style.display = "flex";
  document.getElementById('inputWord').focus();
}

function openEditModal(idx) {
  modalTitle.innerText = "编辑生词与笔记";
  if (modalSubmitBtn) modalSubmitBtn.innerText = "保存修改";
  editIndexInput.value = idx.toString();
  const item = currentWords[idx];
  if (!item) return;

  const variantWarn = document.getElementById('wordVariantWarning');
  if (variantWarn) variantWarn.style.display = "none";

  const editUidInput = document.getElementById('editUid');
  if (editUidInput) editUidInput.value = item._uid || "";

  originalEditingWord = (item.text || item.word || "").trim();
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

// ---------------- 主题外观系统 (跟随系统 / 浅色模式 / 黑色模式) ----------------
let currentThemeMode = 'system'; // 'system' | 'light' | 'dark'

function applyThemeMode(mode) {
  currentThemeMode = mode || 'system';
  try {
    localStorage.setItem('antigravity_theme', currentThemeMode);
  } catch (e) {}

  const isDark = currentThemeMode === 'dark' || (currentThemeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', currentThemeMode);
  document.documentElement.setAttribute('data-applied-theme', isDark ? 'dark' : 'light');

  document.querySelectorAll('.theme-item').forEach(item => {
    const val = item.getAttribute('data-theme-val');
    const isSelected = val === currentThemeMode;
    item.classList.toggle('selected', isSelected);
    const ck = item.querySelector('.check-mark');
    if (ck) ck.remove();
    if (isSelected) {
      item.insertAdjacentHTML('beforeend', '<span class="check-mark">✓</span>');
    }
  });
}

function initCard3DTilt() {
  // 闪卡卡片保持绝对平稳，不随鼠标移动发生 3D 倾斜或上下位移
  const card = document.getElementById('flashcardBox');
  if (card) {
    card.style.transform = 'none';
  }
}

function initTheme() {
  chrome.storage.sync.get({ themeMode: 'system' }, (res) => {
    applyThemeMode(res.themeMode || 'system');
  });

  // 监听系统深色模式动态切换 (当处于“跟随系统”时实时响应)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentThemeMode === 'system') {
      document.documentElement.setAttribute('data-applied-theme', e.matches ? 'dark' : 'light');
    }
  });

  // 监听其他标签页或弹窗中的主题修改
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.themeMode) {
      applyThemeMode(changes.themeMode.newValue || 'system');
    }
  });

  const btnMoreMenu = document.getElementById('btnMoreMenu');
  const moreDropdownMenu = document.getElementById('moreDropdownMenu');
  if (btnMoreMenu && moreDropdownMenu) {
    btnMoreMenu.onclick = (e) => {
      e.stopPropagation();
      const isOpen = moreDropdownMenu.style.display === 'flex';
      // 关闭其他可能打开的下拉浮层
      const srsMenu = document.getElementById('srsDropdownMenu');
      if (srsMenu) srsMenu.style.display = 'none';
      moreDropdownMenu.style.display = isOpen ? 'none' : 'flex';
    };

    document.addEventListener('click', () => {
      moreDropdownMenu.style.display = 'none';
    });

    moreDropdownMenu.querySelectorAll('.theme-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-theme-val') || 'system';
        applyThemeMode(val);
        chrome.storage.sync.set({ themeMode: val });
        moreDropdownMenu.style.display = 'none';
      };
    });

    // 触感微音效开关初始化与绑定
    const menuToggleSound = document.getElementById('menuToggleSound');
    const soundMenuIcon = document.getElementById('soundMenuIcon');
    const soundMenuCheck = document.getElementById('soundMenuCheck');

    const updateSoundUI = () => {
      const isEnabled = SoundFx.enabled;
      if (soundMenuIcon) soundMenuIcon.innerText = isEnabled ? '🔊' : '🔇';
      if (soundMenuCheck) soundMenuCheck.style.display = isEnabled ? 'inline' : 'none';
    };

    SoundFx.init();
    updateSoundUI();

    if (menuToggleSound) {
      menuToggleSound.onclick = (e) => {
        e.stopPropagation();
        SoundFx.toggle();
        updateSoundUI();
        if (SoundFx.enabled) {
          SoundFx.playSuccess();
        }
      };
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initCard3DTilt();

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
    let needSave = false;
    currentWords = list.map(item => {
      item.notes = cleanNotes(item.notes);
      if (item.phonetic) item.phonetic = cleanIPA(item.phonetic);
      if (typeof item.srsLevel === 'undefined') item.srsLevel = 0;
      if (!item._uid) {
        item._uid = 'w_' + (item.date || Date.now()) + '_' + Math.random().toString(36).slice(2, 9);
        needSave = true;
      }
      return item;
    });
    if (needSave) {
      chrome.storage.local.set({ savedWords: currentWords });
    }
    
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

    // 智能词根原型感知检测 (仅在“添加新词条”模式下生效)
    const variantWarn = document.getElementById('wordVariantWarning');
    const variantWarnText = document.getElementById('variantWarningText');
    const btnSwitchToRoot = document.getElementById('btnSwitchToRootEdit');

    if (editIndexInput.value === "-1") {
      const lowerWord = text.toLowerCase();
      const forms = getBaseForms(lowerWord);
      let foundRootItem = null;
      let foundRootIdx = -1;

      for (const f of forms) {
        if (f === lowerWord) continue;
        const idx = currentWords.findIndex(w => (w.text || w.word || "").toLowerCase().trim() === f);
        if (idx !== -1) {
          foundRootItem = currentWords[idx];
          foundRootIdx = idx;
          break;
        }
      }

      if (foundRootItem && variantWarn && variantWarnText && btnSwitchToRoot) {
        const rootWord = foundRootItem.text || foundRootItem.word || "";
        const srsLv = foundRootItem.srsLevel !== undefined ? foundRootItem.srsLevel : 0;
        const lvName = ["生疏待背", "初识阶段", "巩固阶段", "熟练掌握"][srsLv] || `Lv.${srsLv}`;
        variantWarnText.innerHTML = `检测到词库中已存在原型词条 <strong>「${rootWord}」</strong> (${lvName})`;
        variantWarn.style.display = 'block';

        btnSwitchToRoot.onclick = () => {
          SoundFx.playClick();
          openEditModal(foundRootIdx);
        };
      } else if (variantWarn) {
        variantWarn.style.display = 'none';
      }
    } else if (variantWarn) {
      variantWarn.style.display = 'none';
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
        transInp.value = res.definition || res.translation || "";
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
      }, 300);
    });
    inputWordEl.addEventListener('blur', (e) => {
      handleWordInputAutoFill(e.target.value);
    });
  }

  // Tab 切换事件 (笔记本 / 闪卡自测 纯净双模式)
  document.getElementById('tabTableView').onclick = () => {
    SoundFx.playClick();
    switchView('table');
  };
  document.getElementById('tabFlashcardView').onclick = () => {
    SoundFx.playClick();
    switchView('flashcard');
  };

  // 闪卡自测事件
  document.getElementById('flashcardBox').onclick = toggleCardReveal;

  // 闪卡实时编辑按钮 (点击打开编辑窗，保存即时重绘当前卡片)
  const btnFcEdit = document.getElementById('btnFcEdit');
  if (btnFcEdit) {
    btnFcEdit.onclick = (e) => {
      e.stopPropagation(); // 绝对阻止卡片翻转
      SoundFx.playClick();
      if (cardList.length === 0) return;
      const item = cardList[cardIndex];
      if (!item) return;
      const targetWord = item.text || item.word;
      const realIdx = currentWords.findIndex(w => (w._uid && item._uid && w._uid === item._uid) || (w.date && item.date && w.date === item.date) || ((w.text || w.word || '').toLowerCase().trim() === (targetWord || '').toLowerCase().trim()));
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
    SoundFx.playClick();
    nextCard();
  };
  document.getElementById('btnCardPrev').onclick = (e) => {
    e.stopPropagation();
    SoundFx.playClick();
    prevCard();
  };
  document.getElementById('btnCardShuffle').onclick = (e) => {
    e.stopPropagation();
    SoundFx.playClick();
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
      SoundFx.playClick();
      batchTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentBatchSize = tab.getAttribute('data-size');
      updateFlashcardList(true);
    };
  });

  const btnRestartBatch = document.getElementById('btnRestartBatch');
  if (btnRestartBatch) {
    btnRestartBatch.onclick = () => {
      SoundFx.playClick();
      updateFlashcardList(true);
    };
  }

  const btnBackToTable = document.getElementById('btnBackToTable');
  if (btnBackToTable) {
    btnBackToTable.onclick = () => {
      SoundFx.playClick();
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
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || (rect.left + rect.width / 2);
    const y = e.clientY || (rect.top + rect.height / 2);
    createSparkleBurst(x, y);
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
        const goodBtn = document.getElementById('btnSrsGood');
        if (goodBtn) {
          const rect = goodBtn.getBoundingClientRect();
          createSparkleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
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
      doWebDAVSync(true).then(() => {
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
        const eudicWords = await engine.fetchAllCategoriesAndWords(currentWords);

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
    try {
      let idx = parseInt(editIndexInput.value);
      const editUidEl = document.getElementById('editUid');
      const editUid = editUidEl ? editUidEl.value : "";
      if (editUid && idx >= 0) {
        const foundIdx = currentWords.findIndex(w => w._uid === editUid);
        if (foundIdx !== -1) {
          idx = foundIdx;
        }
      }

      const word = document.getElementById('inputWord').value.trim();
      const phonetic = document.getElementById('inputPhonetic').value.trim();
      const trans = document.getElementById('inputTrans').value.trim();
      const context = document.getElementById('inputContext').value.trim();
      const notes = document.getElementById('inputNotes').value.trim();
      const existingItem = (idx >= 0 && currentWords[idx]) ? currentWords[idx] : null;

      if (!word) {
        alert('请输入单词或短语');
        return;
      }
      if (!trans) {
        alert('请输入释义');
        return;
      }

      if (idx === -1) {
        // 1. 手动添加新词条：检测词库中是否已存在该词的同名词或词根原型 (如输入 deficits，库中已有 deficit)
        const lowerWord = word.toLowerCase().trim();
        const forms = getBaseForms(lowerWord);
        let rootIdx = -1;
        
        for (const f of forms) {
          if (f === lowerWord) continue;
          const found = currentWords.findIndex(w => (w.text || w.word || "").toLowerCase().trim() === f);
          if (found !== -1) {
            rootIdx = found;
            break;
          }
        }

        if (rootIdx !== -1) {
          const rootItem = currentWords[rootIdx];
          const rootWord = rootItem.text || rootItem.word || forms[1];
          const shouldMerge = confirm(
            `💡 智能词根归一提醒：\n\n` +
            `词库中已收录该词的原型「${rootWord}」！\n\n` +
            `点击【确定】：将本次录入的例句、笔记与释义自动融合更新到原型「${rootWord}」中（推荐，避免重复冗余）；\n` +
            `点击【取消】：仍将「${word}」作为独立条目录入。`
          );

          if (shouldMerge) {
            // 将新例句与笔记融合进原型词条
            if (context) {
              rootItem.context = rootItem.context ? (rootItem.context + "\n" + context) : context;
            }
            if (notes) {
              rootItem.notes = rootItem.notes ? (rootItem.notes + "；" + notes) : notes;
            }
            if (!rootItem.trans && trans) {
              rootItem.trans = trans;
            }
            if (!rootItem.phonetic && phonetic) {
              rootItem.phonetic = cleanIPA(phonetic);
            }
            rootItem.updatedAt = Date.now();

            closeModal();
            saveAndRefresh();
            SoundFx.playSuccess();
            showToast(`✨ 已成功将内容智能融合更新至原型「${rootWord}」！`);
            return;
          }
        }

        // 手动添加独立新词条：计算全库最高时间戳，确保新加入的词必定排在最顶端（第 1 位）
        const maxExistingDate = currentWords.reduce((max, w) => {
          const t = typeof w.date === 'number' ? w.date : (w.date ? new Date(w.date).getTime() : 0);
          return Math.max(max, t);
        }, 0);
        const newDate = Math.max(Date.now(), maxExistingDate + 1);

        const newItem = {
          text: word,
          trans: trans,
          phonetic: cleanIPA(phonetic),
          context: context,
          title: "手动录入",
          url: "",
          date: newDate,
          updatedAt: Date.now(),
          notes: notes,
          srsLevel: 0,
          srsNextReview: 0,
          srsReviews: 0,
          _uid: 'w_' + newDate + '_' + Math.random().toString(36).slice(2, 9)
        };

        // 若库中已存在同名单词，先完全清理旧记录再置顶更新 (防止重复条目堆积)
        const cleanWord = word.toLowerCase().trim();
        chrome.storage.local.get({ deletedWords: {} }, (rDel) => {
          const delMap = Object.assign({}, rDel.deletedWords || {});
          if (delMap[cleanWord]) {
            delete delMap[cleanWord]; // 重新收录时移除历史删除标记
          }
          currentWords = currentWords.filter(w => (w.text || w.word || "").toLowerCase().trim() !== cleanWord);
          currentWords.unshift(newItem);
          chrome.storage.local.set({ savedWords: currentWords, deletedWords: delMap }, () => {
            closeModal();
            saveAndRefresh();
            showToast(`✨ 生词「${word}」已成功收录入库！`, 'success');
          });
        });
      } else {
        // 2. 编辑修改已有单词（即便修改了单词本体拼写，如 halted 改为 halt）：原地更新原词条，严格保留原有 date 创建时间，顺序绝对不变
        const oldWordText = originalEditingWord || (existingItem ? (existingItem.text || existingItem.word) : "");
        const isWordRenamed = oldWordText && oldWordText.toLowerCase().trim() !== word.toLowerCase().trim();

        const originalDate = existingItem ? (existingItem.date || Date.now()) : Date.now();
        const originalUid = existingItem ? existingItem._uid : (editUid || ('w_' + originalDate + '_' + Math.random().toString(36).slice(2, 9)));
        const updatedItem = {
          text: word,
          trans: trans,
          phonetic: cleanIPA(phonetic),
          context: context,
          title: existingItem ? (existingItem.title || "") : "",
          url: existingItem ? (existingItem.url || "") : "",
          date: originalDate, // 核心：保持原创建时间戳，牢牢锁定在原有位置！
          updatedAt: Date.now(),
          notes: notes,
          srsLevel: existingItem ? (existingItem.srsLevel || 0) : 0,
          srsNextReview: existingItem ? (existingItem.srsNextReview || 0) : 0,
          srsReviews: existingItem ? (existingItem.srsReviews || 0) : 0,
          _uid: originalUid
        };

        // 原地完全覆盖更新当前索引位置的词条 (按编辑后的内容直接覆盖原词条)
        currentWords[idx] = Object.assign({}, currentWords[idx] || {}, updatedItem, { date: originalDate });

        // 如果把单词修改为生词本中其他位置已存在的同名单词，合并去重：移除库中原有的那条重复词，由当前编辑后的条目直接覆盖替代！
        if (isWordRenamed) {
          const dupIdx = currentWords.findIndex((w, i) => i !== idx && (w.text || w.word || "").toLowerCase().trim() === word.toLowerCase().trim());
          if (dupIdx !== -1) {
            currentWords.splice(dupIdx, 1);
            if (dupIdx < idx) {
              idx--;
            }
          }
        }

        closeModal();

        if (isWordRenamed) {
          // 单词本体被重命名：
          const cleanOld = (oldWordText || "").toLowerCase().trim();
          chrome.storage.local.get({ deletedWords: {} }, (rDel) => {
            const delMap = Object.assign({}, rDel.deletedWords || {});
            if (cleanOld) delMap[cleanOld] = Date.now();

            chrome.storage.local.set({ savedWords: currentWords, deletedWords: delMap }, () => {
              // 关键：立即执行 WebDAV 覆盖同步与墓碑上传，彻底抹除云端的旧词，防止云端拉取时双份合并！
              doWebDAVOverwrite();
              // 检查生词本中是否还有 oldWordText 的其他副本；若全库无副本，才从欧路词典中同步删除旧词
              const hasOldWord = currentWords.some(w => (w.text || w.word || "").toLowerCase().trim() === cleanOld);
              if (!hasOldWord) {
                chrome.storage.sync.get({ eudicToken: '' }, (r) => {
                  if (r.eudicToken) {
                    const engine = new EudicSyncEngine(r.eudicToken);
                    engine.deleteWord(oldWordText).catch(err => {
                      console.warn(`从欧路同步删除旧词 ${oldWordText} 失败:`, err);
                    });
                  }
                });
              }
              applyFilter();
              updateStats();
              showToast(`✨ 已成功将「${oldWordText}」修改为「${word}」`, 'success');
            });
          });
        } else {
          saveAndRefresh();
          showToast(`✨ 词条「${word}」修改已保存！`, 'success');
        }
      }

      // 只有在【显式编辑当前闪卡单词】(idx >= 0) 时，才即时更新并重绘当前卡片；
      // 若是在闪卡界面点击右上角「➕ 添加新词」(idx === -1)，只存入生词库，绝不覆盖当前正在测试的闪卡词条！
      if (idx >= 0 && currentView === 'flashcard' && cardList.length > 0) {
        const wasRevealed = cardRevealed;
        const currentTarget = cardList[cardIndex];
        if (currentTarget) {
          const found = currentWords[idx] || currentWords.find(w => (w._uid && currentTarget._uid && w._uid === currentTarget._uid) || (w.text || w.word || '').toLowerCase().trim() === word.toLowerCase().trim());
          if (found) {
            cardList[cardIndex] = Object.assign({}, cardList[cardIndex], found);
            renderFlashcard();
            if (wasRevealed) {
              cardRevealed = true;
              const ansBox = document.getElementById('fcAnswerBox');
              const hint = document.getElementById('cardHintText');
              const barUnrevealed = document.getElementById('smartBarUnrevealed');
              const barRevealed = document.getElementById('smartBarRevealed');
              if (ansBox) ansBox.style.display = 'block';
              if (hint) hint.innerText = "请根据记忆情况进行反馈";
              if (barUnrevealed) barUnrevealed.style.display = 'none';
              if (barRevealed) barRevealed.style.display = 'flex';
            }
          }
        }
      }
    } catch (err) {
      console.error('保存词条失败:', err);
      alert('保存词条失败: ' + (err && err.message ? err.message : String(err)));
    }
  };

  const exportBtn = document.getElementById('menuExportJson') || document.getElementById('btnExportJson');
  if (exportBtn) {
    exportBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      const moreMenu = document.getElementById('moreDropdownMenu');
      if (moreMenu) moreMenu.style.display = 'none';
      const blob = new Blob([JSON.stringify(getStandardJsonList(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'antigravity.json';
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // 🔍 词根变体检索菜单项与合并处理
  const menuFindVariants = document.getElementById('menuFindVariants');
  if (menuFindVariants) {
    menuFindVariants.onclick = (e) => {
      if (e) e.stopPropagation();
      const moreMenu = document.getElementById('moreDropdownMenu');
      if (moreMenu) moreMenu.style.display = 'none';

      const clusters = findWordVariantClusters(currentWords);
      if (!clusters || clusters.length === 0) {
        showToast('🎉 词库检查完毕：未发现任何词根重复变体，词库极其纯净！');
        return;
      }

      // 切换至列表视图
      if (currentView === 'flashcard') {
        switchView('table');
      }

      isVariantFilterActive = true;
      applyFilter();
    };
  }

  // 退出词根变体筛选
  const btnCloseVariantFilter = document.getElementById('btnCloseVariantFilter');
  if (btnCloseVariantFilter) {
    btnCloseVariantFilter.onclick = (e) => {
      if (e) e.stopPropagation();
      SoundFx.playClick();
      exitVariantFilterMode();
    };
  }

  // 一键合并所有词根变体到原型
  const btnMergeAllVariants = document.getElementById('btnMergeAllVariants');
  if (btnMergeAllVariants) {
    btnMergeAllVariants.onclick = (e) => {
      if (e) e.stopPropagation();
      SoundFx.playClick();

      const clusters = findWordVariantClusters(currentWords);
      if (!clusters || clusters.length === 0) {
        showToast('未发现需要合并的变体');
        exitVariantFilterMode();
        return;
      }

      const totalItems = clusters.reduce((acc, c) => acc + c.length, 0);
      const msg = `确定将检索到的 ${clusters.length} 组（共 ${totalItems} 词）词根变体智能合并到原型中吗？\n\n` +
        `• 原型词将完整保留并智能吸收变体中更丰富的例句语境与笔记\n` +
        `• 艾宾浩斯熟练度将保留群组中的最高级别\n` +
        `• 冗余变体词将被清理并自动同步至本地与云端`;

      if (!confirm(msg)) return;

      // 执行智能合并
      const uidsToRemove = new Set();
      let mergedCount = 0;

      clusters.forEach(cluster => {
        // cluster[0] 为排序后的原型词
        const baseItem = cluster[0];
        const baseWord = (baseItem.text || baseItem.word || "").toLowerCase();

        // 收集群组中所有例句与笔记
        const contexts = cluster.map(c => (c.context || "").trim()).filter(Boolean);
        const notes = cluster.map(c => (c.notes || "").trim()).filter(Boolean);
        const maxSrs = Math.max(...cluster.map(c => parseInt(c.srsLevel) || 0));

        // 如果原型的 context 为空或变体有更长的非空 context，优先选用
        if (contexts.length > 0) {
          // 挑选一个包含关键词的最完整例句
          const bestContext = contexts.find(c => c.toLowerCase().includes(baseWord)) || contexts[0];
          baseItem.context = bestContext;
        }

        // 合并笔记（去重）
        if (notes.length > 0) {
          const uniqueNotes = [...new Set(notes)];
          baseItem.notes = uniqueNotes.join("；");
        }

        baseItem.srsLevel = maxSrs;

        // 其余变体标记为待移除
        const wordsToDelete = [];
        for (let i = 1; i < cluster.length; i++) {
          const v = cluster[i];
          const uid = v._uid || `${v.text || v.word}_${v.dateAdded}`;
          uidsToRemove.add(uid);
          const wName = (v.text || v.word || "").toLowerCase().trim();
          if (wName) wordsToDelete.push(wName);
          mergedCount++;
        }
      });

      // 从 currentWords 中滤除冗余变体
      currentWords = currentWords.filter(item => {
        const uid = item._uid || `${item.text || item.word}_${item.dateAdded}`;
        return !uidsToRemove.has(uid);
      });

      // 保存删除墓碑并权威覆盖坚果云端，确保其他电脑绝对不再复活旧变体
      chrome.storage.local.get({ deletedWords: {} }, (res) => {
        const delMap = Object.assign({}, res.deletedWords || {});
        const now = Date.now();
        wordsToDelete.forEach(w => { delMap[w] = now; });

        chrome.storage.local.set({ savedWords: currentWords, deletedWords: delMap }, () => {
          doWebDAVOverwrite(); // 关键：权威覆盖坚果云并同步上传删除墓碑
          exitVariantFilterMode();
          applyFilter();
          updateStats();
          SoundFx.playSuccess();
          showToast(`✨ 成功合并 ${clusters.length} 组词根变体，清理了 ${mergedCount} 个冗余词！`, 'success');
        });
      });
    };
  }

  // 📚 无例句生词筛选处理函数 (快速筛选出所有缺少真实语境例句的单词)
  function triggerNoContextFilter() {
    const noCtxWords = currentWords.filter(item => isNoContextWord(item));
    if (!noCtxWords || noCtxWords.length === 0) {
      showToast('🎉 词库检查完毕：所有生词均拥有完整真实语境例句！');
      return;
    }

    if (currentView === 'flashcard') {
      switchView('table');
    }

    isVariantFilterActive = false;
    isNoContextFilterActive = true;
    applyFilter();
  }

  // 1. 右上角「⋯」菜单中的「筛选无例句单词」项
  const menuFindNoContext = document.getElementById('menuFindNoContext') || document.getElementById('menuFindEudicNoContext');
  if (menuFindNoContext) {
    menuFindNoContext.onclick = (e) => {
      if (e) e.stopPropagation();
      const moreMenu = document.getElementById('moreDropdownMenu');
      if (moreMenu) moreMenu.style.display = 'none';
      triggerNoContextFilter();
    };
  }

  // 2. 坚果云与欧路同步设置弹窗中的「筛选无例句单词」按钮
  const btnFilterNoContext = document.getElementById('btnFilterNoContext') || document.getElementById('btnFilterEudicNoContext');
  if (btnFilterNoContext) {
    btnFilterNoContext.onclick = (e) => {
      if (e) e.stopPropagation();
      SoundFx.playClick();
      closeDavModal();
      triggerNoContextFilter();
    };
  }

  // 3. 退出无例句筛选模式
  const btnCloseNoContextFilter = document.getElementById('btnCloseNoContextFilter') || document.getElementById('btnCloseEudicFilter');
  if (btnCloseNoContextFilter) {
    btnCloseNoContextFilter.onclick = (e) => {
      if (e) e.stopPropagation();
      SoundFx.playClick();
      exitNoContextFilterMode();
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
      const moreMenu = document.getElementById('moreDropdownMenu');
      if (moreMenu) moreMenu.style.display = 'none';
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
        if (currentView === 'flashcard') {
          updateFlashcardList(true);
        }
      };
    });
  }

  const searchInput = document.getElementById('searchInput');
  const searchBoxWrap = document.getElementById('searchBoxWrap');
  const btnSearchClear = document.getElementById('btnSearchClear');

  function updateSearchClearState() {
    const hasVal = searchInput && searchInput.value.length > 0;
    if (searchBoxWrap) {
      searchBoxWrap.classList.toggle('has-text', hasVal);
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (isVariantFilterActive) {
        isVariantFilterActive = false;
        const banner = document.getElementById('variantFilterBanner');
        if (banner) banner.style.display = 'none';
      }
      if (isNoContextFilterActive) {
        isNoContextFilterActive = false;
        const banner = document.getElementById('noContextFilterBanner');
        if (banner) banner.style.display = 'none';
      }
      updateSearchClearState();
      // 若用户在闪卡界面中在搜索框输入内容，智能自动切换到笔记本列表，方便直观查看单词检索结果
      if (currentView === 'flashcard' && searchInput.value.trim().length > 0) {
        switchView('table');
      } else {
        applyFilter();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (isVariantFilterActive) {
          isVariantFilterActive = false;
          const banner = document.getElementById('variantFilterBanner');
          if (banner) banner.style.display = 'none';
        }
        if (isNoContextFilterActive) {
          isNoContextFilterActive = false;
          const banner = document.getElementById('noContextFilterBanner');
          if (banner) banner.style.display = 'none';
        }
        searchInput.value = '';
        updateSearchClearState();
        applyFilter();
        searchInput.blur();
      }
    });
  }

  if (btnSearchClear) {
    btnSearchClear.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SoundFx.playClick();
      if (isVariantFilterActive) {
        isVariantFilterActive = false;
        const banner = document.getElementById('variantFilterBanner');
        if (banner) banner.style.display = 'none';
      }
      if (isNoContextFilterActive) {
        isNoContextFilterActive = false;
        const banner = document.getElementById('noContextFilterBanner');
        if (banner) banner.style.display = 'none';
      }
      if (searchInput) {
        searchInput.value = '';
        updateSearchClearState();
        applyFilter();
        searchInput.focus();
      }
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
