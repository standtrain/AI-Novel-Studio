// ContextManager — 长上下文记忆管理（MySQL 持久化版本）
// 从 book/src/utils/contextManager.js 迁移，替换文件 I/O 为数据库持久化

class ContextManager {
  constructor(novelDao, novelId) {
    this.novelDao = novelDao || null;
    this.novelId = novelId || null;
    this.context = {
      novel: null,           // { title, genre, setting, theme }
      characters: [],        // 角色数组
      currentChapter: 0,
      chaptersSummary: [],   // [{ chapter, summary }]
      conversationHistory: [], // [{ stage, timestamp, content }]
    };
  }

  // 绑定到指定小说（用于从数据库加载）
  bind(novelDao, novelId) {
    this.novelDao = novelDao;
    this.novelId = novelId;
  }

  // 保存小说上下文信息
  saveNovel(novel) {
    this.context.novel = {
      title: novel.title,
      genre: novel.genre,
      setting: novel.setting,
      theme: novel.theme,
    };
    return this.persist();
  }

  getNovel() {
    return this.context.novel;
  }

  // 保存角色设定
  saveCharacters(characters) {
    this.context.characters = characters;
    return this.persist();
  }

  getCharacters() {
    return this.context.characters;
  }

  // 添加章节摘要
  addChapterSummary(chapterNumber, summary) {
    this.context.chaptersSummary.push({ chapter: chapterNumber, summary });
    this.context.currentChapter = chapterNumber;
    return this.persist();
  }

  // 获取前面章节摘要
  getPreviousChaptersSummary() {
    if (this.context.chaptersSummary.length === 0) return '（暂无之前的章节）';
    return this.context.chaptersSummary
      .map(s => `第${s.chapter}章摘要：${s.summary}`)
      .join('\n');
  }

  // 添加对话历史
  addHistory(stage, content) {
    this.context.conversationHistory.push({
      stage,
      timestamp: new Date().toISOString(),
      content: typeof content === 'string' ? content.substring(0, 500) : content,
    });
    return this.persist();
  }

  // 获取全局系统提示
  getGlobalSystemPrompt() {
    const novel = this.context.novel;
    if (!novel) return '你是一个专业的小说创作助手。';

    let prompt = '你是一个专业的小说创作助手。当前正在创作的小说信息如下：\n';
    prompt += `标题：${novel.title}\n`;
    if (novel.genre) prompt += `类型：${novel.genre}\n`;
    if (novel.setting) prompt += `世界观：${novel.setting}\n`;
    if (novel.theme) prompt += `主题：${novel.theme}\n`;

    if (this.context.characters.length > 0) {
      prompt += '\n主要角色：\n';
      this.context.characters.forEach(c => {
        prompt += `- ${c.name}（${c.role}）：${c.personality || c.description || ''}\n`;
      });
    }

    const summary = this.getPreviousChaptersSummary();
    if (summary !== '（暂无之前的章节）') {
      prompt += `\n已完成章节摘要：\n${summary}\n`;
    }

    return prompt;
  }

  // ---------- 持久化（DB）----------

  // 将上下文序列化到 novels.context_data 列
  async persist() {
    if (this.novelDao && this.novelId) {
      try {
        await this.novelDao.updateContextData(this.novelId, this.context);
      } catch (err) {
        process.stderr.write(`ContextManager 持久化失败：${err.message}\n`);
      }
    }
  }

  // 从 novels.context_data 列加载上下文
  async loadContext() {
    if (!this.novelDao || !this.novelId) return false;
    try {
      const novel = await this.novelDao.findById(this.novelId);
      if (novel && novel.context_data) {
        const data = typeof novel.context_data === 'string'
          ? JSON.parse(novel.context_data)
          : novel.context_data;
        this.context = { ...this.context, ...data };
        return true;
      }
    } catch (err) {
      process.stderr.write(`ContextManager 加载失败：${err.message}\n`);
    }
    return false;
  }

  // 重置（开始新小说）
  async reset() {
    this.context = {
      novel: null,
      characters: [],
      currentChapter: 0,
      chaptersSummary: [],
      conversationHistory: [],
    };
    if (this.novelDao && this.novelId) {
      await this.persist();
    }
  }

  // 获取当前上下文快照（深拷贝，防止外部修改影响内部状态）
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.context));
  }
}

module.exports = ContextManager;
