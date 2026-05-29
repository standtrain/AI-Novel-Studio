import { create } from 'zustand';
import type { NovelDetail, Character, Chapter, ReviewIssue, ExtractionResult } from '../types';

function safeJsonParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw); } catch { return fallback; }
}

interface NovelState {
  currentNovel: NovelDetail | null;
  outline: any;
  characters: Character[];
  chapterOutlines: any[];
  chapters: Chapter[];
  streamText: string;
  /** 仅AI生成的章节正文内容（不含日志/进度信息），用于保存到数据库 */
  chapterContent: string;
  isStreaming: boolean;
  currentStep: number;
  /** 当前正在进行流式操作的小说 ID，用于防止跨小说数据污染 */
  activeNovelId: number | null;
  // 审查和提取结果（按章节号索引）
  reviewResults: Record<number, { issues: ReviewIssue[]; summary: string }>;
  extractionResults: Record<number, ExtractionResult>;

  setNovel: (novel: NovelDetail) => void;
  setOutline: (outline: any) => void;
  setCharacters: (characters: Character[]) => void;
  setChapterOutlines: (outlines: any[]) => void;
  appendChapterOutlines: (outlines: any[]) => void;
  setChapters: (chapters: Chapter[]) => void;
  mergeChapter: (chapter: Chapter) => void;
  setStreamText: (text: string) => void;
  appendStreamText: (text: string) => void;
  setChapterContent: (text: string) => void;
  appendChapterContent: (text: string) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setActiveNovelId: (id: number | null) => void;
  setCurrentStep: (step: number) => void;
  setReviewResult: (chapterNumber: number, result: { issues: ReviewIssue[]; summary: string }) => void;
  setExtractionResult: (chapterNumber: number, result: ExtractionResult) => void;
  /** 安全重置：仅当 activeNovelId 匹配时才清空流式状态 */
  safeAbort: (novelId: number) => void;
  reset: () => void;
}

export const useNovelStore = create<NovelState>((set) => ({
  currentNovel: null,
  outline: null,
  characters: [],
  chapterOutlines: [],
  chapters: [],
  streamText: '',
  chapterContent: '',
  isStreaming: false,
  currentStep: 0,
  activeNovelId: null,
  reviewResults: {},
  extractionResults: {},

  setNovel: (novel) => {
    const chapters = novel.chapters || [];
    // 从 chapters 中提取章纲数据（有 outline 字段的）
    const chapterOutlines = chapters
      .filter((ch: any) => ch.scenes || ch.conflict)
      .map((ch: any) => ({
        chapter: ch.chapter_number,
        title: ch.title,
        scenes: typeof ch.scenes === 'string' ? safeJsonParse(ch.scenes, []) : (ch.scenes || []),
        conflict: ch.conflict,
        turningPoint: ch.turning_point,
        charactersInvolved: typeof ch.characters_involved === 'string' ? safeJsonParse(ch.characters_involved, []) : (ch.characters_involved || []),
        emotionalTone: ch.emotional_tone,
        endingHook: ch.ending_hook,
      }));

    // 从 novel 字段重建 outline
    const outline = (novel.setting || novel.main_plot) ? {
      title: novel.title,
      genre: novel.genre,
      theme: novel.theme,
      setting: novel.setting,
      mainPlot: novel.main_plot,
      subPlots: typeof novel.sub_plots === 'string' ? safeJsonParse(novel.sub_plots, []) : (novel.sub_plots || []),
      chapterCount: novel.chapter_count,
    } : null;

    // 合并已有章节数据：轻量加载时新数据不含 content，需保留 store 中已有的
    const prevChapters = useNovelStore.getState().chapters;
    const prevMap = new Map<number, Chapter>();
    prevChapters.forEach((ch: Chapter) => prevMap.set(ch.chapter_number, ch));

    const mergedChapters = chapters.map((ch: any) => {
      const prev = prevMap.get(ch.chapter_number);
      return {
        ...ch,
        content: ch.content ?? prev?.content,
        review_result: ch.review_result ?? prev?.review_result,
        extraction_result: ch.extraction_result ?? prev?.extraction_result,
      };
    });

    // 根据实际数据决定 currentStep（取最高已到达步骤）
    let step = novel.current_step || 0;
    if (outline) step = Math.max(step, 1);
    if ((novel.characters || []).length > 0) step = Math.max(step, 2);
    if (chapterOutlines.length > 0) step = Math.max(step, 3);
    if (mergedChapters.some((ch: Chapter) => !!ch.content)) step = Math.max(step, 4);

    set({
      currentNovel: novel,
      activeNovelId: novel.id,
      outline,
      characters: novel.characters || [],
      chapterOutlines,
      chapters: mergedChapters,
      currentStep: step,
      streamText: '',
      chapterContent: '',
    });
  },

  setOutline: (outline) => set({ outline }),
  setCharacters: (characters) => set({ characters }),
  setChapterOutlines: (chapterOutlines) => set({ chapterOutlines }),
  appendChapterOutlines: (newOutlines: any[]) => set((s) => {
    const existing = new Map<number, any>();
    s.chapterOutlines.forEach((ch: any) => {
      existing.set(ch.chapter || ch.chapter_number, ch);
    });
    newOutlines.forEach((ch: any) => {
      existing.set(ch.chapter || ch.chapter_number, ch);
    });
    return { chapterOutlines: Array.from(existing.values()).sort((a, b) => (a.chapter || a.chapter_number) - (b.chapter || b.chapter_number)) };
  }),
  setChapters: (chapters) => set({ chapters }),
  mergeChapter: (chapter) => set((s) => {
    const idx = s.chapters.findIndex((c: Chapter) => c.chapter_number === chapter.chapter_number);
    if (idx >= 0) {
      const updated = [...s.chapters];
      updated[idx] = { ...updated[idx], ...chapter };
      return { chapters: updated };
    }
    return { chapters: [...s.chapters, chapter] };
  }),
  setStreamText: (streamText) => set({ streamText }),
  appendStreamText: (text) => set((s) => ({ streamText: s.streamText + text })),
  setChapterContent: (chapterContent) => set({ chapterContent }),
  appendChapterContent: (text) => set((s) => ({ chapterContent: s.chapterContent + text })),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setActiveNovelId: (activeNovelId) => set({ activeNovelId }),
  safeAbort: (novelId) => {
    const s = useNovelStore.getState();
    // 仅当传入的 novelId 与当前活跃小说 ID 匹配时才清理流式状态
    if (s.activeNovelId === novelId) {
      set({ isStreaming: false, streamText: '', chapterContent: '', activeNovelId: null });
    }
  },
  setCurrentStep: (currentStep) => set({ currentStep }),
  setReviewResult: (chapterNumber, reviewResult) =>
    set((s) => ({ reviewResults: { ...s.reviewResults, [chapterNumber]: reviewResult } })),
  setExtractionResult: (chapterNumber, extractionResult) =>
    set((s) => ({ extractionResults: { ...s.extractionResults, [chapterNumber]: extractionResult } })),
  reset: () => set({
    currentNovel: null,
    outline: null,
    characters: [],
    chapterOutlines: [],
    chapters: [],
    streamText: '',
    chapterContent: '',
    isStreaming: false,
    currentStep: 0,
    activeNovelId: null,
    reviewResults: {},
    extractionResults: {},
  }),
}));
