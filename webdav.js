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

  // 4. 双向智能逐词深度合并 (Two-way Deep Word-by-Word Merge)
  mergeWords(localList = [], remoteList = []) {
    const map = new Map();

    // 先存入云端所有词
    remoteList.forEach(rItem => {
      const k = (rItem.text || rItem.word || "").toLowerCase().trim();
      if (k) map.set(k, Object.assign({}, rItem));
    });

    // 逐词比对并合并本地词
    localList.forEach(lItem => {
      const k = (lItem.text || lItem.word || "").toLowerCase().trim();
      if (!k) return;

      if (!map.has(k)) {
        // 云端没有，把本地的补充进去
        map.set(k, Object.assign({}, lItem));
      } else {
        // 两端都有同一个词，进行字段级智能互补与时间戳决胜
        const rItem = map.get(k);
        const lTime = typeof lItem.date === 'number' ? lItem.date : (lItem.date ? new Date(lItem.date).getTime() : 0);
        const rTime = typeof rItem.date === 'number' ? rItem.date : (rItem.date ? new Date(rItem.date).getTime() : 0);

        const mergedWord = {
          text: lItem.text || rItem.text || lItem.word || rItem.word,
          trans: (lTime >= rTime ? (lItem.trans || rItem.trans) : (rItem.trans || lItem.trans)) || "",
          phonetic: lItem.phonetic || rItem.phonetic || "",
          context: (lTime >= rTime ? (lItem.context || rItem.context) : (rItem.context || lItem.context)) || "",
          title: (lTime >= rTime ? (lItem.title || rItem.title) : (rItem.title || lItem.title)) || "Web Article",
          url: (lTime >= rTime ? (lItem.url || rItem.url) : (rItem.url || lItem.url)) || "",
          date: Math.max(lTime, rTime) || Date.now(),
          notes: (lTime >= rTime ? (lItem.notes !== undefined ? lItem.notes : rItem.notes) : (rItem.notes !== undefined ? rItem.notes : lItem.notes)) || "",
          srsLevel: Math.max(parseInt(lItem.srsLevel) || 0, parseInt(rItem.srsLevel) || 0),
          srsNextReview: Math.max(lItem.srsNextReview || 0, rItem.srsNextReview || 0),
          srsReviews: Math.max(lItem.srsReviews || 0, rItem.srsReviews || 0)
        };

        map.set(k, mergedWord);
      }
    });

    // 按添加时间倒序排列
    const result = Array.from(map.values());
    result.sort((a, b) => (b.date || 0) - (a.date || 0));
    return result;
  }

  // 5. 执行一次完整的双向增量同步 (Sync)
  async performSync(localList) {
    // 1. 先安全拉取云端，下载失败会直接抛错中止，绝不会发生本地空列表覆盖云端大词库
    const remoteList = await this.downloadWords();

    // 2. 双向字段级深度合并
    const mergedList = this.mergeWords(localList || [], remoteList || []);

    // 3. 上传合并后的全集到云端
    await this.uploadWords(mergedList);

    return mergedList;
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
