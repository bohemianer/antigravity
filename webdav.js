// Antigravity - WebDAV 客户端同步引擎 (100% 逐词双向增量合并，绝不覆盖丢失)

class WebDAVClient {
  constructor(config = {}) {
    this.serverUrl = (config.serverUrl || "https://dav.jianguoyun.com/dav/").replace(/\/+$/, '') + '/';
    this.username = config.username || "";
    this.password = config.password || "";
    this.filePath = (config.filePath || "antigravity/antigravity.json").replace(/^\/+/, '');
  }

  getAuthHeader() {
    if (!this.username || !this.password) return "";
    return "Basic " + btoa(unescape(encodeURIComponent(this.username + ":" + this.password)));
  }

  getFullUrl() {
    return this.serverUrl + this.filePath;
  }

  getFolderUrl() {
    const parts = this.filePath.split('/');
    if (parts.length > 1) {
      parts.pop();
      return this.serverUrl + parts.join('/') + '/';
    }
    return this.serverUrl;
  }

  // 1. 确保云端目录存在 (MKCOL)
  async ensureDirectory() {
    const folderUrl = this.getFolderUrl();
    if (folderUrl === this.serverUrl) return true;

    try {
      const resp = await fetch(folderUrl, {
        method: "MKCOL",
        headers: {
          "Authorization": this.getAuthHeader()
        }
      });
      return resp.status === 201 || resp.status === 405 || resp.status === 200;
    } catch (e) {
      console.warn("MKCOL error:", e);
      return false;
    }
  }

  getDeletionsUrl() {
    const delPath = this.filePath.replace(/\.json$/i, '_deleted.json');
    return this.serverUrl + (delPath === this.filePath ? this.filePath + '.deleted.json' : delPath);
  }

  // 2. 从云端拉取已有数据 (GET)
  async downloadWords() {
    const url = this.getFullUrl();
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Cache-Control": "no-cache"
      }
    });

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
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Cache-Control": "no-cache"
        }
      });
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

    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": this.getAuthHeader(),
        "Content-Type": "application/json; charset=utf-8"
      },
      body: jsonStr
    });

    if (resp.status === 200 || resp.status === 201 || resp.status === 204) {
      return true;
    }
    throw new Error(`WebDAV PUT failed (${resp.status}): ${resp.statusText}`);
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
      await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Content-Type": "application/json; charset=utf-8"
        },
        body: jsonStr
      });
    } catch (e) {
      console.warn("uploadDeletions warning:", e);
    }
    return cleanMap;
  }

  // 4. 双向智能逐词深度合并 (Two-way Deep Word-by-Word Merge with Deletion Tombstones)
  mergeWords(localList = [], remoteList = [], deletionsMap = {}) {
    const map = new Map();

    // 1. 先存入云端所有词 (遵从删除墓碑判断)
    remoteList.forEach(rItem => {
      const k = (rItem.text || rItem.word || "").toLowerCase().trim();
      if (!k) return;

      const delTime = deletionsMap[k] || 0;
      const rUpdate = typeof rItem.updatedAt === 'number' ? rItem.updatedAt : (typeof rItem.date === 'number' ? rItem.date : (rItem.date ? new Date(rItem.date).getTime() : 0));
      if (delTime > 0 && rUpdate <= delTime) {
        // 该词已被标记删除，且在删除后未被重新添加，云端旧词予以抹除
        return;
      }

      map.set(k, Object.assign({}, rItem));
    });

    // 2. 逐词比对并合并本地词 (遵从删除墓碑判断)
    localList.forEach(lItem => {
      const k = (lItem.text || lItem.word || "").toLowerCase().trim();
      if (!k) return;

      const delTime = deletionsMap[k] || 0;
      const lUpdate = typeof lItem.updatedAt === 'number' ? lItem.updatedAt : (typeof lItem.date === 'number' ? lItem.date : (lItem.date ? new Date(lItem.date).getTime() : 0));
      if (delTime > 0 && lUpdate <= delTime) {
        // 该词已被标记删除，本地旧记录予以抹除，绝不复活
        return;
      }

      if (!map.has(k)) {
        // 云端没有且未被删除，把本地的新词补充进去
        map.set(k, Object.assign({}, lItem));
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

  // 5. 执行一次完整的遵从墓碑规则的双向增量同步 (Sync)
  async performSync(localList = [], localDeletions = {}) {
    // 1. 先安全拉取云端已有词库与删除墓碑表
    const remoteList = await this.downloadWords();
    const remoteDeletions = await this.downloadDeletions();

    // 2. 双向合并删除墓碑表（保留最新删除时间戳）
    const mergedDeletions = Object.assign({}, remoteDeletions);
    for (const [k, ts] of Object.entries(localDeletions || {})) {
      mergedDeletions[k] = Math.max(mergedDeletions[k] || 0, ts || 0);
    }

    // 3. 遵从墓碑规则的双向字段级深度合并
    const mergedList = this.mergeWords(localList || [], remoteList || [], mergedDeletions);

    // 4. 上传合并后的全集与墓碑表到云端
    await this.uploadWords(mergedList);
    const cleanedDeletions = await this.uploadDeletions(mergedDeletions);

    return {
      mergedList,
      mergedDeletions: cleanedDeletions
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
    const resp = await fetch("https://api.frdic.com/api/open/v1/studylist/category?language=en", {
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json"
      }
    });
    if (!resp.ok) {
      if (resp.status === 401) throw new Error("欧路 Token 无效或已过期，请在 my.eudic.net 重新获取");
      throw new Error(`欧路 API 连接失败 (${resp.status}): ${resp.statusText}`);
    }
    const data = await resp.json();
    return data && data.data ? data.data : [];
  }

  // 2. 分页递归拉取指定生词本的所有单词 (page 从 0 开始，支持增量早停加速)
  async fetchAllWords(categoryId = "0", existingKeys = null) {
    let page = 0;
    let allWords = [];
    const pageSize = 100;

    while (page < 10) { // 限制单次同步最多检查前 1000 词
      const url = `https://api.frdic.com/api/open/v1/studylist/words?language=en&category_id=${encodeURIComponent(categoryId)}&page=${page}&page_size=${pageSize}`;
      const resp = await fetch(url, {
        headers: {
          "Authorization": this.authHeader,
          "Content-Type": "application/json"
        }
      });
      if (!resp.ok) {
        throw new Error(`拉取欧路生词本数据失败 (${resp.status}): ${resp.statusText}`);
      }
      const resData = await resp.json();
      const list = (resData && resData.data) ? resData.data : [];
      if (!list || list.length === 0) break;

      allWords = allWords.concat(list);

      // 智能早停优化：如果开启了已有词比对，且这一页的所有单词都已存在，说明后续都是历史老词，直接早停！
      if (existingKeys && list.length > 0) {
        const allExisted = list.every(item => {
          const k = (item.word || item.text || item.key || "").toLowerCase().trim();
          return k && existingKeys.has(k);
        });
        if (allExisted) {
          break; // 提前退出，节省 90% 以上的网络耗时！
        }
      }

      if (list.length < pageSize) break;
      page++;
    }

    return allWords;
  }

  // 3. 自动多分类并行扫描并汇总全量单词 (Promise.all 并发极速提速)
  async fetchAllCategoriesAndWords(existingWords = []) {
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

    // 构建已有词哈希表用于早停加速
    const existingKeys = new Set(existingWords.map(w => (w.text || w.word || "").toLowerCase().trim()).filter(Boolean));

    // 并发拉取各个分类
    const catArray = Array.from(categoryIds);
    const fetchPromises = catArray.map(catId => 
      this.fetchAllWords(catId, existingKeys).catch(err => {
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

  // 4. 欧路生词比对当前词库，按 Antigravity 标准格式合并
  mergeEudicWords(existingWords = [], eudicRawList = []) {
    const existingMap = new Map();
    existingWords.forEach(w => {
      const k = (w.text || w.word || "").toLowerCase().trim();
      if (k) existingMap.set(k, w);
    });

    let newAddedCount = 0;
    const resultList = [...existingWords];

    eudicRawList.forEach(item => {
      const wText = (item.word || item.text || item.key || "").trim();
      if (!wText) return;
      const k = wText.toLowerCase();

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
          date: item.add_time ? new Date(item.add_time).getTime() : Date.now(),
          notes: "",
          srsLevel: 0,
          srsNextReview: 0,
          srsReviews: 0
        };
        resultList.unshift(newItem);
        existingMap.set(k, newItem);
        newAddedCount++;
      }
    });

    return {
      mergedList: resultList,
      newAddedCount: newAddedCount,
      totalEudicScanned: eudicRawList.length
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
        await fetch("https://api.frdic.com/api/open/v1/studylist/words", {
          method: "DELETE",
          headers: {
            "Authorization": this.authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            category_id: String(catId),
            language: "en",
            words: [cleanWord]
          })
        });
      } catch (err) {
        console.warn(`从欧路生词本分类 ${catId} 删除单词 ${cleanWord} 异常:`, err);
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { WebDAVClient, EudicSyncEngine };
}
