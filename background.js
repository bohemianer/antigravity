// Antigravity - Background Service Worker (智能词形还原 + 100% 纯净标准 IPA 音标清洗引擎)
importScripts('webdav.js');

function cleanIPA(s) {
  if (!s) return "";
  let str = s.trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  
  // 1. 移除结合变音符及多余符号
  str = str.replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[\x00-\x1f\x7f-\x9f\ufffd]/g, '');
  str = str.replace(/[()]/g, ''); // 移除括号如 (ə) -> ə, (t) -> t
  
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
  str = str.replace(/:/g, "ː") // 统一为标准长音符 ː
           .replace(/['`]/g, "ˈ") // 统一为标准重音符 ˈ
           .replace(/ˌ/g, "ˌ")
           .replace(/ədiː|ədi/g, "əti");
  
  // 4. 优化开头闭音节与常见辅音组合
  str = str.replace(/^inˈ/g, "ɪnˈ")
           .replace(/^in/g, "ɪn")
           .replace(/^rəˈ/g, "rɪˈ");
  
  str = str.trim();
  return str ? `/${str}/` : "";
}

// 词形还原辅助 (复数/过去式/进行时 自动推导原形)
function getBaseForms(word) {
  const w = word.toLowerCase().trim();
  const forms = [w];
  if (w.endsWith("ies") && w.length > 3) forms.push(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) forms.push(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) forms.push(w.slice(0, -1));
  if (w.endsWith("ed") && w.length > 3) {
    forms.push(w.slice(0, -2));
    forms.push(w.slice(0, -1));
  }
  if (w.endsWith("ing") && w.length > 4) {
    forms.push(w.slice(0, -3));
    forms.push(w.slice(0, -3) + "e");
  }
  return [...new Set(forms)];
}

// 屈折词音标智能合成/原形回退
function deriveInflectedPhonetic(basePhonetic, originalWord, baseForm) {
  if (!basePhonetic) return "";
  let p = basePhonetic.trim().replace(/^\/|\/$/g, '');
  const orig = originalWord.toLowerCase();
  const base = baseForm.toLowerCase();
  
  if (orig === base) return `/${p}/`;

  // 过去式 / 过去分词 (ed)
  if (orig.endsWith("ed") && !base.endsWith("ed")) {
    if (p.endsWith("t") || p.endsWith("d")) {
      p += "ɪd";
    } else if (/[p|k|f|s|ʃ|tʃ]/.test(p[p.length - 1])) {
      p += "t";
    } else {
      p += "d";
    }
    return `/${p}/`;
  }

  // 复数 / 第三人称单数 (s/es)
  if (orig.endsWith("s") && !base.endsWith("s")) {
    if (/[s|z|ʃ|ʒ|tʃ|dʒ]/.test(p[p.length - 1])) {
      p += "ɪz";
    } else if (/[p|t|k|f|θ]/.test(p[p.length - 1])) {
      p += "s";
    } else {
      p += "z";
    }
    return `/${p}/`;
  }

  // 现在分词 (ing)
  if (orig.endsWith("ing") && !base.endsWith("ing")) {
    p = p.replace(/e$/, '') + "ɪŋ";
    return `/${p}/`;
  }

  return `/${p}/`;
}

// 划词查词与词典精简引擎：过滤人名/冗余释义、多词性自动分行排版、保留核心前 3 条释义（仅在划词查词/入库时执行）
function cleanAndStreamlineDictDefinition(s) {
  if (!s) return "";
  let str = String(s).replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // 1. 标准化分号与逗号
  str = str.replace(/;/g, "；").replace(/；\s*/g, "；").replace(/,/g, "，").replace(/，\s*/g, "，");

  // 2. 识别所有英文常见词性缩写并自动换行
  const posRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)\b((?:n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|art|num|int|interj|aux|abbr|pl|sing|pref|suff|link-v)\.)\s*/gi;
  str = str.replace(posRegex, "\n$1 ");

  // 3. 识别序号列表分项并自动换行
  const numRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((\d+[\.、]|\(\d+\)|\[\d+\]|[\u2460-\u2473]))\s*/g;
  str = str.replace(numRegex, "\n$1 ");

  // 4. 识别中文词性与时态衍生标签并自动换行 (必须带冒号或方括号，避免误伤括号内正常的时态说明)
  const metaRegex = /(?<!^)(?<!\n)\s*(?:[；，,;\s]*)((?:\[(?:名|动|形|副|代|介|连|叹|时态|名词|形容词|副词|复数|比较级|最高级|过去式|过去分词|现在分词)\]|【(?:名|动|形|副|代|介|连|叹|时态|名词|形容词|副词|复数|比较级|最高级|过去式|过去分词|现在分词)】|(?:时\s*态|名\s*词|形\s*容\s*词|副\s*词|复\s*数|比较级|最高级|过去式|过去分词|现在分词|第三人称单数)\s*[:：]))\s*/gi;
  str = str.replace(metaRegex, "\n$1 ");

  const rawLines = str.split("\n").map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return "";

  const isNameClause = (text) => /【名】|\[名\]|人名|男子名|女子名|男名|女名|姓氏|教名|（人名）|\(人名\)|（男子名）|\(男子名\)|（女子名）|\(女子名\)|（姓氏）|\(姓氏\)/.test(text);

  // 检查是否包含任何非人名的常规词义
  const hasAnyLexical = rawLines.some(line => {
    if (/^(?:【名】|\[名\])/.test(line)) return false;
    const clauses = line.split(/[；;]/).map(c => c.trim()).filter(Boolean);
    return clauses.some(c => !isNameClause(c));
  });

  const resultLines = [];

  for (const line of rawLines) {
    if (/^(?:【名】|\[名\])/.test(line) && hasAnyLexical) {
      continue;
    }

    const posMatch = line.match(/^([a-zA-Z\-]+\.|\([a-zA-Z\-]+\)|\[(?:名|动|形|副|代|介|连|叹)\]|【(?:名|动|形|副|代|介|连|叹)】|\d+[\.、]|\(\d+\)|[\u2460-\u2473])\s*(.*)$/);
    const prefix = posMatch ? (posMatch[1] + " ") : "";
    const content = posMatch ? posMatch[2] : line;

    const clauses = content.split(/[；;]/).map(c => c.trim()).filter(Boolean);
    const hasLexicalInLine = clauses.some(c => !isNameClause(c));

    const filteredClauses = [];
    const seenMeanings = new Set();

    for (let c of clauses) {
      if (isNameClause(c)) {
        if (hasLexicalInLine || hasAnyLexical) {
          continue;
        } else {
          c = c.replace(/（(?:英|美|法|德|意|西|俄|葡|日|拉|朝|波|匈|罗|瑞典|加|塞).*?）|\((?:英|美|法|德|意|西|俄|葡|日|拉|朝|波|匈|罗|瑞典|加|塞).*?\)/g, "");
          c = c.replace(/[（\(](?:人名|男子名|女子名|男名|女名|姓氏|教名|英语姓氏)[）\)]/g, "").trim();
        }
      }

      c = c.replace(/<(?:英|美|澳|古|罕|非正式)>(?:燃气|赛马|英橄|澳橄|板球|棒球跑垒)[^，；;]*/g, "");
      c = c.replace(/^[（\(][a-zA-Z\s]+[）\)]/g, "").trim();
      c = c.replace(/^[\s；，,;、]+|[\s；，,;、]+$/g, "").trim();

      if (!c) continue;

      const key = c.replace(/[\s，、\(\)（）]/g, "");
      if (seenMeanings.has(key)) continue;
      seenMeanings.add(key);

      filteredClauses.push(c);
    }

    if (filteredClauses.length > 3) {
      filteredClauses.length = 3;
    }

    if (filteredClauses.length > 0) {
      let joined = filteredClauses.join("； ");
      joined = joined.replace(/（\s*）|\(\s*\)/g, "").trim();
      resultLines.push(prefix + joined);
    }
  }

  if (resultLines.length === 0 && rawLines.length > 0) {
    return rawLines[0].replace(/[\s；，,;]+$/g, "");
  }

  return resultLines.join("\n");
}

async function queryYoudaoDict(word) {
  const forms = getBaseForms(word);
  
  for (let form of forms) {
    try {
      const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(form)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!resp.ok) continue;
      const data = await resp.json();
      
      let usphone = "";
      let ukphone = "";
      let explain = "";

      // 提取音标 (优先美音 usphone，其次 ukphone，再次 phone)
      if (data.ec && data.ec.word && data.ec.word[0]) {
        const w = data.ec.word[0];
        usphone = w.usphone || w.ukphone || w.phone || "";
        if (w.trs && Array.isArray(w.trs)) {
          explain = w.trs.map(t => (t.tr && t.tr[0] && t.tr[0].l && t.tr[0].l.i) ? t.tr[0].l.i.join("") : "").filter(Boolean).join("； ");
        }
      }

      if (!usphone && data.simple && data.simple.word && data.simple.word[0]) {
        const w = data.simple.word[0];
        usphone = w.usphone || w.ukphone || w.phone || "";
      }

      if (!explain && data.blng_sents_part) {
        // 如果无简单释义，取词性释义
        if (data.web_trans && data.web_trans["web-translation"]) {
          const transList = data.web_trans["web-translation"].slice(0, 2);
          explain = transList.map(item => item.trans ? item.trans.map(t => t.value).join(", ") : "").join("； ");
        }
      }

      let p = cleanIPA(usphone || ukphone);
      if (form !== word && p) {
        p = deriveInflectedPhonetic(p, word, form);
      }

      const formattedExplain = cleanAndStreamlineDictDefinition(explain);

      if (p || formattedExplain) {
        return {
          phonetic: p,
          definition: formattedExplain
        };
      }
    } catch (e) {}
  }
  return null;
}

function getLangPair(text) {
  return /[\u4e00-\u9fa5]/.test(text) ? "zh-CN|en" : "en|zh-CN";
}

async function queryGoogleDictChromeEx(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=zh-CN&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (Array.isArray(data) && data[0]) {
      return Array.isArray(data[0]) ? data[0][0] : data[0];
    }
  } catch (e) {}
  return null;
}

async function queryGoogleClients5(text) {
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=zh-CN&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (Array.isArray(data) && data[0]) {
      return Array.isArray(data[0]) ? data[0][0] : data[0];
    }
  } catch (e) {}
  return null;
}

async function queryMyMemoryTranslate(text) {
  try {
    const lp = getLangPair(text);
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${lp}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.responseData && data.responseData.translatedText) {
      const t = data.responseData.translatedText.trim();
      if (!t.startsWith("MYMEMORY WARNING") && !t.includes("INVALID SOURCE LANGUAGE")) return t;
    }
  } catch (e) {}
  return null;
}

async function translateSentenceMultiTier(text) {
  const promises = [
    queryGoogleDictChromeEx(text),
    queryGoogleClients5(text),
    queryMyMemoryTranslate(text)
  ].map(p => p.then(res => {
    if (res && typeof res === 'string' && res.trim().length > 0) return res.trim();
    throw new Error("Empty translation");
  }));

  try {
    return await Promise.any(promises);
  } catch (e) {
    const fallback = await queryMyMemoryTranslate(text);
    return fallback || "翻译加载失败";
  }
}

async function queryGoogleTranslate(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!resp.ok) return null;
    const data = await resp.json();
    
    let mainTrans = "";
    if (data[0] && data[0][0] && data[0][0][0]) {
      mainTrans = data[0].map(item => item[0]).filter(Boolean).join("").trim();
    }
    
    let dictList = [];
    if (data[1] && Array.isArray(data[1])) {
      data[1].forEach(item => {
        const pos = item[0];
        const terms = item[1];
        if (pos && terms) {
          dictList.push(`${pos}. ${terms.slice(0, 3).join("，")}`);
        }
      });
    }

    let phonetic = "";
    if (data[0] && data[0][1] && data[0][1][3]) {
      phonetic = cleanIPA(data[0][1][3]);
    }

    return {
      translation: mainTrans,
      dictFormatted: dictList.join("； "),
      phonetic: phonetic
    };
  } catch (e) {
    return null;
  }
}

async function smartLookup(text) {
  const cleanText = (text || "").trim();
  if (!cleanText) {
    return {
      word: "",
      phonetic: "",
      definition: "暂无内容"
    };
  }

  const isWord = cleanText.split(/\s+/).length <= 2;

  if (isWord) {
    try {
      const [youdaoRes, googleRes] = await Promise.allSettled([
        queryYoudaoDict(cleanText),
        queryGoogleDictChromeEx(cleanText)
      ]);

      const yd = youdaoRes.status === "fulfilled" ? youdaoRes.value : null;
      const gg = googleRes.status === "fulfilled" ? googleRes.value : null;

      const finalPhonetic = (yd && yd.phonetic) || "";
      const finalDef = (yd && yd.definition) || (gg && typeof gg === "string" ? cleanAndStreamlineDictDefinition(gg) : "") || "";

      if (finalDef) {
        return {
          word: cleanText,
          phonetic: finalPhonetic,
          definition: cleanAndStreamlineDictDefinition(finalDef)
        };
      }
    } catch (e) {}
  }

  // 长句、短语或词典未收录词：调用三路高可用并发容灾翻译引擎
  try {
    const finalTrans = await translateSentenceMultiTier(cleanText);
    return {
      word: cleanText,
      phonetic: "",
      definition: finalTrans || "翻译加载失败"
    };
  } catch (e) {
    return {
      word: cleanText,
      phonetic: "",
      definition: "网络连接超时，请检查网络"
    };
  }
}

async function autoSyncWebDAV(wordsList) {
  chrome.storage.sync.get({ webdavConfig: null }, async (res) => {
    const cfg = res.webdavConfig;
    if (cfg && cfg.enabled && cfg.username && cfg.password) {
      try {
        const client = new WebDAVClient(cfg);
        const merged = await client.performSync(wordsList);
        chrome.storage.local.set({ savedWords: merged });
      } catch (err) {
        console.warn("WebDAV Auto Sync warning:", err);
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "LOOKUP_WORD") {
    const cleanWord = (request.word || "").trim().toLowerCase();
    
    // 并行检查本地数据库是否已收录
    chrome.storage.local.get({ savedWords: [] }, (localRes) => {
      const savedList = (localRes && localRes.savedWords) || [];
      const existingItem = savedList.find(x => (x.text || x.word || "").toLowerCase().trim() === cleanWord);
      const isSaved = !!existingItem;
      const existingNotes = existingItem ? (existingItem.notes || "") : "";

      smartLookup(request.word)
        .then(result => {
          const safeResult = result || { word: request.word, phonetic: "", definition: "暂无释义" };
          safeResult.isSaved = isSaved;
          safeResult.savedNotes = existingNotes;
          sendResponse(safeResult);
        })
        .catch(err => {
          sendResponse({
            word: request.word,
            phonetic: "",
            definition: "查询超时，请重试",
            isSaved: isSaved,
            savedNotes: existingNotes
          });
        });
    });
    return true;
  }

  if (request.action === "UNSAVE_WORD") {
    const cleanWord = (request.word || "").trim().toLowerCase();
    chrome.storage.local.get({ savedWords: [] }, (result) => {
      let list = result.savedWords || [];
      list = list.filter(x => (x.text || x.word || "").toLowerCase().trim() !== cleanWord);
      chrome.storage.local.set({ savedWords: list }, () => {
        autoSyncWebDAV(list);
        sendResponse({ success: true, count: list.length });
      });
    });
    return true;
  }

  if (request.action === "SAVE_WORD") {
    const payload = request.data;
    const cleanWord = (payload.text || payload.word || "").trim();

    chrome.storage.local.get({ savedWords: [] }, (result) => {
      const list = result.savedWords || [];
      const existsIndex = list.findIndex(x => (x.text || x.word || "").toLowerCase().trim() === cleanWord.toLowerCase());
      
      let prevItem = existsIndex !== -1 ? list[existsIndex] : null;

      // 划词新收录/重新收藏：计算最高时间戳，确保新添加词条必定排在生词本最上方（第 1 位）
      const maxExistingDate = list.reduce((max, w) => {
        const t = typeof w.date === 'number' ? w.date : (w.date ? new Date(w.date).getTime() : 0);
        return Math.max(max, t);
      }, 0);
      const newDate = Math.max(Date.now(), maxExistingDate + 1);

      const item = {
        text: cleanWord,
        trans: payload.trans || payload.definition || (prevItem ? prevItem.trans : ""),
        phonetic: cleanIPA(payload.phonetic || (prevItem ? prevItem.phonetic : "")),
        context: payload.context || payload.sentence || (prevItem ? prevItem.context : ""),
        title: payload.title || payload.sourceTitle || (prevItem ? prevItem.title : "Web Article"),
        url: payload.url || payload.sourceUrl || (prevItem ? prevItem.url : ""),
        date: newDate,
        updatedAt: Date.now(),
        notes: payload.notes !== undefined ? payload.notes : (prevItem ? prevItem.notes : ""),
        srsLevel: (prevItem && prevItem.srsLevel !== undefined) ? prevItem.srsLevel : (payload.srsLevel !== undefined ? payload.srsLevel : 0),
        srsNextReview: (prevItem && prevItem.srsNextReview !== undefined) ? prevItem.srsNextReview : (payload.srsNextReview || 0),
        srsReviews: (prevItem && prevItem.srsReviews !== undefined) ? prevItem.srsReviews : (payload.srsReviews || 0)
      };

      if (existsIndex !== -1) {
        list.splice(existsIndex, 1);
      }
      list.unshift(item);
      
      chrome.storage.local.set({ savedWords: list }, () => {
        autoSyncWebDAV(list);
        sendResponse({ success: true, count: list.length });

        // 若当前单词缺少音标，后台自动发起多源音标补充
        if (!item.phonetic && cleanWord.split(/\s+/).length <= 2) {
          queryYoudaoDict(cleanWord).then(ydRes => {
            if (ydRes && ydRes.phonetic) {
              chrome.storage.local.get({ savedWords: [] }, (r2) => {
                const curList = r2.savedWords || [];
                const target = curList.find(x => (x.text || x.word || "").toLowerCase().trim() === cleanWord.toLowerCase());
                if (target && !target.phonetic) {
                  target.phonetic = cleanIPA(ydRes.phonetic);
                  chrome.storage.local.set({ savedWords: curList }, () => {
                    autoSyncWebDAV(curList);
                  });
                }
              });
            }
          }).catch(() => {});
        }
      });
    });

    return true;
  }

  if (request.action === "MANUAL_WEBDAV_SYNC") {
    chrome.storage.local.get({ savedWords: [] }, async (localRes) => {
      const list = localRes.savedWords || [];
      try {
        const client = new WebDAVClient(request.config);
        const merged = await client.performSync(list);
        chrome.storage.local.set({ savedWords: merged }, () => {
          sendResponse({ success: true, count: merged.length });
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }

  if (request.action === "OVERWRITE_WEBDAV_SYNC") {
    chrome.storage.local.get({ savedWords: [] }, async (localRes) => {
      const list = localRes.savedWords || [];
      try {
        const client = new WebDAVClient(request.config);
        await client.uploadWords(list);
        sendResponse({ success: true, count: list.length });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
});
