// Antigravity - WebDAV 客户端同步引擎 (100% 逐词双向增量合并，绝不覆盖丢失)

// 带超时的安全网络请求辅助函数 (默认 12 秒超时，彻底杜绝请求无响应假死挂起)
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`网络连接超时 (${Math.round(timeoutMs / 1000)}秒)`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

function cleanIPA(s) {
  if (!s) return "";
  let str = s.trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  if (str.includes(';') || str.includes('；') || str.includes(',')) {
    str = str.split(/[;；,]/)[0].trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  }
  str = str.replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[\x00-\x1f\x7f-\x9f\ufffd]/g, '');
  str = str.replace(/[()]/g, '');
  return str;
}

class WebDAVClient {
  constructor(config = {}) {
    this.serverUrl = (config.serverUrl || "https://dav.jianguoyun.com/dav/").replace(/\/+$/, '') + '/';
    this.username = (config.username || "").trim();
    this.password = (config.password || "").trim();
    this.filePath = (config.filePath || "antigravity/antigravity.json").replace(/^\/+/, '').trim();
  }

  getAuthHeader() {
    if (!this.username || !this.password) return "";
    return "Basic " + btoa(unescape(encodeURIComponent(this.username + ":" + this.password)));
  }

  getFullUrl() {
    return encodeURI(this.serverUrl + this.filePath);
  }

  getFolderUrl() {
    const parts = this.filePath.split('/');
    if (parts.length > 1) {
      parts.pop();
      return encodeURI(this.serverUrl + parts.join('/') + '/');
    }
    return this.serverUrl;
  }

  // 1. 确保云端目录存在 (MKCOL)
  async ensureDirectory() {
    const folderUrl = this.getFolderUrl();
    if (folderUrl === this.serverUrl) return true;

    try {
      const resp = await fetchWithTimeout(folderUrl, {
        method: "MKCOL",
        headers: {
          "Authorization": this.getAuthHeader()
        }
      }, 8000);
      return resp.status === 201 || resp.status === 405 || resp.status === 200;
    } catch (e) {
      console.warn("MKCOL error:", e);
      return false;
    }
  }

  getDeletionsUrl() {
    const delPath = this.filePath.replace(/\.json$/i, '_deleted.json');
    return encodeURI(this.serverUrl + (delPath === this.filePath ? this.filePath + '.deleted.json' : delPath));
  }

  // 2. 从云端拉取已有数据 (GET)
  async downloadWords() {
    let url = this.getFullUrl();
    let resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Cache-Control": "no-cache"
      }
    }, 12000);

    if (resp.status === 404) {
      return []; // 云端尚无文件，返回空数组
    }
    if (!resp.ok) {
      throw new Error(`WebDAV GET failed (${resp.status}): ${resp.statusText}`);
    }

    const text = await resp.text();
    if (!text || !text.trim()) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      throw new Error(`云端数据解析失败: ${err.message}`);
    }
  }

  // 2.1 从云端拉取删除墓碑记录 (Tombstones GET)
  async downloadDeletions() {
    const url = this.getDeletionsUrl();
    try {
      const resp = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Cache-Control": "no-cache"
        }
      }, 10000);
      if (resp.status === 404) return {};
      if (!resp.ok) return {};
      const text = await resp.text();
      if (!text || !text.trim()) return {};
      const parsed = JSON.parse(text);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      console.warn("downloadDeletions warning:", e);
      return {};
    }
  }

  // 3. 上传全量数据到云端 (PUT)
  async uploadWords(wordsList) {
    await this.ensureDirectory();
    const url = this.getFullUrl();
    const jsonStr = JSON.stringify(wordsList, null, 2);

    const resp = await fetchWithTimeout(url, {
      method: "PUT",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Content-Type": "application/json; charset=utf-8"
      },
      body: jsonStr
    }, 15000);

    if (resp.status === 200 || resp.status === 201 || resp.status === 204) {
      return true;
    }

    let bodyText = "";
    try {
      bodyText = (await resp.text()).slice(0, 300);
    } catch (e) {}
    let reason = resp.statusText || bodyText || "";
    if (resp.status === 507) {
      reason = "507 存储空间不足 (Insufficient Storage)";
    } else if (resp.status === 429) {
      reason = "429 请求过于频繁 (Too Many Requests)";
    } else if (resp.status === 403) {
      reason = "403 禁止写入 (Forbidden) - 坚果云免费版当月 1GB 上传流量已耗尽（或应用密码为只读权限）";
    }
    throw new Error(`WebDAV PUT failed (${resp.status}): ${reason}`);
  }

  // 3.1 上传删除墓碑记录到云端 (Tombstones PUT)
  async uploadDeletions(deletionsMap = {}) {
    await this.ensureDirectory();
    const url = this.getDeletionsUrl();
    // 自动清理超过 60 天的过期墓碑，防止删除列表无限膨胀
    const cleanMap = {};
    const now = Date.now();
    const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
    for (const [k, ts] of Object.entries(deletionsMap || {})) {
      if (typeof ts === 'number' && (now - ts < SIXTY_DAYS)) {
        cleanMap[k] = ts;
      }
    }
    const jsonStr = JSON.stringify(cleanMap, null, 2);
    try {
      await fetchWithTimeout(url, {
        method: "PUT",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Content-Type": "application/json; charset=utf-8"
        },
        body: jsonStr
      }, 10000);
    } catch (e) {
      console.warn("uploadDeletions warning:", e);
    }
    return cleanMap;
  }

  // 4. 双向智能逐词深度合并 (Two-way Deep Word-by-Word Merge with Deletion Tombstones & Timeline)
  mergeWords(localList = [], remoteList = [], deletionsMap = {}, lastSyncTime = 0) {
    const map = new Map();

    // 1. 先存入云端所有词 (遵从删除墓碑判断，已被删除词坚决抹除)
    remoteList.forEach(rItem => {
      const k = (rItem.text || rItem.word || "").toLowerCase().trim();
      if (!k) return;

      const delTime = deletionsMap[k] || 0;
      if (delTime > 0) {
        // 该词已被用户在墓碑表中标记删除，坚决抹除，绝不复活
        return;
      }

      map.set(k, Object.assign({}, rItem));
    });

    // 2. 逐词比对并合并本地词 (遵从删除墓碑与同步时间线判断)
    localList.forEach(lItem => {
      const k = (lItem.text || lItem.word || "").toLowerCase().trim();
      if (!k) return;

      const delTime = deletionsMap[k] || 0;
      if (delTime > 0) {
        // 该词已被标记删除，本地旧记录予以抹除，绝不复活
        return;
      }

      const lUpdate = typeof lItem.updatedAt === 'number' ? lItem.updatedAt : (typeof lItem.date === 'number' ? lItem.date : (lItem.date ? new Date(lItem.date).getTime() : 0));

      if (!map.has(k)) {
        // 云端没有该词：
        // 关键智能判定：该词是离线期间本地新增的？还是在其他设备上已被删除？
        // 如果此设备曾经成功同步过 (lastSyncTime > 0)，且此词的创建/修改时间早于上次同步时间，
        // 说明此词在上次同步时就已存在，但在云端却消失了 -> 这表明该词已被其他设备在云端删除！
        // 此时绝不能将其当成新词传回云端复活，而应当从本地顺应删除！
        const isOfflineNewAddition = (!lastSyncTime || lastSyncTime <= 0) ? true : (lUpdate > lastSyncTime);
        if (isOfflineNewAddition) {
          map.set(k, Object.assign({}, lItem));
        }
      } else {
        // 两端都有同一个词，进行字段级智能互补与更新时间戳决胜
        const rItem = map.get(k);
        const rUpdate = typeof rItem.updatedAt === 'number' ? rItem.updatedAt : (typeof rItem.date === 'number' ? rItem.date : (rItem.date ? new Date(rItem.date).getTime() : 0));

        const isLocalNewer = lUpdate >= rUpdate;

        const lCreate = typeof lItem.date === 'number' ? lItem.date : (lItem.date ? new Date(lItem.date).getTime() : lUpdate);
        const rCreate = typeof rItem.date === 'number' ? rItem.date : (rItem.date ? new Date(rItem.date).getTime() : rUpdate);
        // 若本地版本较新，以本地设定的 date 为准（新添加词置顶，已修改词保持原位）
        const targetDate = isLocalNewer ? (lItem.date || lCreate) : (rItem.date || rCreate);

        const mergedWord = {
          text: lItem.text || rItem.text || lItem.word || rItem.word,
          trans: (isLocalNewer ? (lItem.trans || rItem.trans) : (rItem.trans || lItem.trans)) || "",
          phonetic: lItem.phonetic || rItem.phonetic || "",
          context: (isLocalNewer ? (lItem.context || rItem.context) : (rItem.context || lItem.context)) || "",
          title: (isLocalNewer ? (lItem.title || rItem.title) : (rItem.title || lItem.title)) || "Web Article",
          url: (isLocalNewer ? (lItem.url || rItem.url) : (rItem.url || lItem.url)) || "",
          date: targetDate, // 保持最新添加的词在最前，编辑修改的词保持原创建位置
          updatedAt: Math.max(lUpdate, rUpdate) || Date.now(),
          notes: (isLocalNewer ? (lItem.notes !== undefined ? lItem.notes : rItem.notes) : (rItem.notes !== undefined ? rItem.notes : lItem.notes)) || "",
          srsLevel: Math.max(parseInt(lItem.srsLevel) || 0, parseInt(rItem.srsLevel) || 0),
          srsNextReview: Math.max(lItem.srsNextReview || 0, rItem.srsNextReview || 0),
          srsReviews: Math.max(lItem.srsReviews || 0, rItem.srsReviews || 0),
          _uid: lItem._uid || rItem._uid || ('w_' + targetDate + '_' + Math.random().toString(36).slice(2, 9))
        };

        map.set(k, mergedWord);
      }
    });

    // 按创建时间倒序排列（新词在前，老词在后，编辑单词不改变其创建时间与排序位置）
    const result = Array.from(map.values());
    result.sort((a, b) => {
      const dateA = a.date ? (typeof a.date === 'number' ? a.date : new Date(a.date).getTime()) : 0;
      const dateB = b.date ? (typeof b.date === 'number' ? b.date : new Date(b.date).getTime()) : 0;
      return dateB - dateA;
    });
    return result;
  }

  // 5. 执行一次完整的遵从墓碑规则与增量时间线的双向增量同步 (Sync)
  async performSync(localList = [], localDeletions = {}, lastSyncTime = 0) {
    // 1. 先安全拉取云端已有词库与删除墓碑表
    const remoteList = await this.downloadWords();
    const remoteDeletions = await this.downloadDeletions();

    // 2. 双向合并删除墓碑表（保留最新删除时间戳）
    const mergedDeletions = Object.assign({}, remoteDeletions);
    for (const [k, ts] of Object.entries(localDeletions || {})) {
      mergedDeletions[k] = Math.max(mergedDeletions[k] || 0, ts || 0);
    }

    // 3. 遵从墓碑规则与时间线的双向字段级深度合并
    const mergedList = this.mergeWords(localList || [], remoteList || [], mergedDeletions, lastSyncTime);

    // 4. 智能差异校验 (Smart Dirty Check)：
    // 只有当本地合并数据与云端真正存在新增、修改或删除差异时，才发起 PUT 上传！
    // 彻底杜绝在数据未变更时盲目上传，100% 保护坚果云当月 1GB 免费上传流量
    const isWordsChanged = (mergedList.length !== remoteList.length) || mergedList.some((w, i) => {
      const rw = remoteList[i];
      if (!rw) return true;
      return (w.text !== rw.text) || (w.trans !== rw.trans) || (w.updatedAt !== rw.updatedAt) || (w.date !== rw.date);
    });

    const isDeletionsChanged = Object.keys(mergedDeletions).length !== Object.keys(remoteDeletions).length ||
      Object.entries(mergedDeletions).some(([k, ts]) => remoteDeletions[k] !== ts);

    let cleanedDeletions = mergedDeletions;
    if (isWordsChanged) {
      await this.uploadWords(mergedList);
    }
    if (isDeletionsChanged) {
      cleanedDeletions = await this.uploadDeletions(mergedDeletions);
    }

    return {
      mergedList,
      mergedDeletions: cleanedDeletions,
      syncTime: Date.now()
    };
  }
}

// 欧路词典 (Eudic) OpenAPI 智能双向同步引擎
class EudicSyncEngine {
  constructor(token = "") {
    let t = (token || "").trim();
    if (t && !t.startsWith("NIS ") && !t.startsWith("Bearer ")) {
      t = `NIS ${t}`;
    }
    this.authHeader = t;
  }

  // 1. 获取所有生词本分类
  async getCategories() {
    if (!this.authHeader) throw new Error("请先填写欧路词典授权 Token");
    const resp = await fetchWithTimeout("https://api.frdic.com/api/open/v1/studylist/category?language=en", {
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json"
      }
    }, 8000);
    if (!resp.ok) {
      if (resp.status === 401) throw new Error("欧路 Token 无效或已过期，请在 my.eudic.net 重新获取");
      throw new Error(`欧路 API 连接失败 (${resp.status}): ${resp.statusText}`);
    }
    const data = await resp.json();
    return data && data.data ? data.data : [];
  }

  // 2. 分页递归拉取指定生词本的所有单词 (欧路 API 按时间升序返回，必须全量翻页拉取，每页最多 100 词，上限 50 页)
  async fetchAllWords(categoryId = "0") {
    let page = 0;
    let allWords = [];
    const pageSize = 100;

    while (page <= 50) {
      const url = `https://api.frdic.com/api/open/v1/studylist/words?language=en&category_id=${encodeURIComponent(categoryId)}&page=${page}&page_size=${pageSize}`;
      const resp = await fetchWithTimeout(url, {
        headers: {
          "Authorization": this.authHeader,
          "Content-Type": "application/json"
        }
      }, 10000);
      if (!resp.ok) {
        throw new Error(`拉取欧路生词本数据失败 (${resp.status}): ${resp.statusText}`);
      }
      const resData = await resp.json();
      const list = (resData && resData.data) ? resData.data : [];
      if (!list || list.length === 0) break;

      allWords = allWords.concat(list);

      if (list.length < pageSize) break;
      page++;
    }

    return allWords;
  }

  // 3. 自动多分类并行扫描并汇总全量单词 (Promise.all 并发极速提速)
  async fetchAllCategoriesAndWords() {
    let categories = [];
    try {
      categories = await this.getCategories();
    } catch (e) {
      console.warn("获取欧路生词本分类列表失败，降级为默认分类:", e);
    }

    const categoryIds = new Set(["0"]);
    if (Array.isArray(categories)) {
      categories.forEach(c => {
        if (c && c.id !== undefined && c.id !== null) {
          categoryIds.add(String(c.id));
        }
      });
    }

    const catArray = Array.from(categoryIds);
    const fetchPromises = catArray.map(catId => 
      this.fetchAllWords(catId).catch(err => {
        console.warn(`拉取生词本分类 ${catId} 失败:`, err);
        return [];
      })
    );

    const results = await Promise.all(fetchPromises);
    const wordMap = new Map();

    results.forEach(words => {
      words.forEach(w => {
        const key = (w.word || w.text || w.key || "").toLowerCase().trim();
        if (key && !wordMap.has(key)) {
          wordMap.set(key, w);
        }
      });
    });

    return Array.from(wordMap.values());
  }

  // 4. 欧路生词比对当前词库，按 Antigravity 标准格式合并（单向拉取入库，新词排在最前）
  mergeEudicWords(existingWords = [], eudicRawList = [], deletionsMap = {}) {
    const existingMap = new Map();
    existingWords.forEach(w => {
      const k = (w.text || w.word || "").toLowerCase().trim();
      if (k) existingMap.set(k, w);
    });

    // 计算当前全库已有的最大时间戳，确保新从欧路拉取的词时间戳大于库中所有老词，排在最顶部
    const maxExistingDate = existingWords.reduce((max, w) => {
      const t = typeof w.date === 'number' ? w.date : (w.date ? new Date(w.date).getTime() : 0);
      return Math.max(max, isNaN(t) ? 0 : t);
    }, 0);
    const baseTime = Math.max(Date.now(), maxExistingDate + 1000);

    const newItems = [];

    eudicRawList.forEach(item => {
      const wText = (item.word || item.text || item.key || "").trim();
      if (!wText) return;
      const k = wText.toLowerCase();

      // 删除墓碑检测：若本地曾经删除过该词，检查欧路添加时间是否晚于删除时间
      if (deletionsMap && deletionsMap[k]) {
        const delTime = deletionsMap[k];
        let isReAdded = false;
        if (item.add_time) {
          const addTime = new Date(item.add_time).getTime();
          if (!isNaN(addTime) && addTime > delTime) {
            isReAdded = true;
            delete deletionsMap[k]; // 用户在欧路重新添加了该词，清除删除墓碑并正常收录
          }
        }
        if (!isReAdded) return;
      }

      if (!existingMap.has(k)) {
        // 欧路官方 API 字段: phon, exp, context_line
        let p = (item.phon || item.phonetic || item.symbol || "").trim();
        if (p && !p.startsWith('/')) p = `/${p}/`;

        let exp = (item.exp || item.trans || item.explanation || item.definition || "").trim();
        exp = exp.replace(/<[^>]+>/g, '').replace(/[\r\n]+/g, '； ').trim();

        let ctx = (item.context_line || item.context || item.sentence || "").replace(/<[^>]+>/g, '').trim();

        const newItem = {
          text: wText,
          trans: exp || "暂无中文释义",
          phonetic: cleanIPA(p),
          context: ctx || "来自欧路词典同步",
          title: "欧路词典 (Eudic)",
          url: "https://dict.eudic.net",
          date: 0,
          updatedAt: Date.now(),
          notes: "",
          srsLevel: 0,
          srsNextReview: 0,
          srsReviews: 0,
          _uid: "",
          _eudicAddTime: item.add_time ? new Date(item.add_time).getTime() : 0
        };
        newItems.push(newItem);
        existingMap.set(k, newItem);
      }
    });

    // 将新发现的欧路生词按在欧路中的添加时间降序排列（最新查词排在最前）
    newItems.sort((a, b) => (b._eudicAddTime || 0) - (a._eudicAddTime || 0));

    // 为所有新词赋予递增的顶端时间戳：最新查词获得最高的时间戳，排在列表第 1 位
    const totalNew = newItems.length;
    newItems.forEach((item, idx) => {
      const itemDate = baseTime + (totalNew - idx) * 1000;
      item.date = itemDate;
      item._uid = 'w_' + itemDate + '_' + Math.random().toString(36).slice(2, 9);
      delete item._eudicAddTime;
    });

    // 新词排在最前
    const resultList = [...newItems, ...existingWords];

    return {
      mergedList: resultList,
      newAddedCount: totalNew,
      totalEudicScanned: eudicRawList.length,
      deletionsMap: deletionsMap
    };
  }

  // 5. 从欧路生词本中同步删除指定单词
  async deleteWord(word = "") {
    if (!this.authHeader || !word) return;
    const cleanWord = word.trim();
    let categories = [];
    try {
      categories = await this.getCategories();
    } catch (e) {}

    const categoryIds = new Set(["0"]);
    if (Array.isArray(categories)) {
      categories.forEach(c => {
        if (c && c.id !== undefined && c.id !== null) {
          categoryIds.add(String(c.id));
        }
      });
    }

    for (const catId of categoryIds) {
      try {
        await fetchWithTimeout("https://api.frdic.com/api/open/v1/studylist/words", {
          method: "DELETE",
          headers: {
            "Authorization": this.authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: String(catId),
            category_id: String(catId),
            language: "en",
            word: cleanWord,
            words: [cleanWord, cleanWord.toLowerCase()]
          })
        }, 8000);
      } catch (err) {
        console.warn(`从欧路生词本分类 ${catId} 删除单词 ${cleanWord} 异常:`, err);
      }
    }
  }

  // 6. 向欧路生词本中同步新增单词 (支持单个或批量，秒级实时推入)
  async addWords(words = [], categoryId = "0") {
    if (!this.authHeader) return { success: false, error: "未配置欧路 Token" };
    const list = (Array.isArray(words) ? words : [words])
      .map(w => (typeof w === 'string' ? w : (w.text || w.word || "")).trim())
      .filter(Boolean);
    if (list.length === 0) return { success: true, count: 0 };

    // 欧路官方 API 限制单次批量添加最多 50 词，自动按 50 分批处理
    const batchSize = 50;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      try {
        const resp = await fetchWithTimeout("https://api.frdic.com/api/open/v1/studylist/words", {
          method: "POST",
          headers: {
            "Authorization": this.authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: String(categoryId || "0"),
            category_id: String(categoryId || "0"),
            language: "en",
            words: batch
          })
        }, 10000);
        if (!resp.ok) {
          console.warn(`向欧路生词本添加单词失败 (${resp.status}):`, resp.statusText);
        }
      } catch (err) {
        console.warn("向欧路添加单词网络异常:", err);
      }
    }
    return { success: true, count: list.length };
  }

  async addWord(word = "", categoryId = "0") {
    return this.addWords([word], categoryId);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { WebDAVClient, EudicSyncEngine };
}
