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
  setStreamText: (text: string) => void;
  appendStreamText: (text: string) => void;
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

    // 根据实际数据决定 currentStep（取最高已到达步骤）
    let step = novel.current_step || 0;
    if (outline) step = Math.max(step, 1);
    if ((novel.characters || []).length > 0) step = Math.max(step, 2);
    if (chapterOutlines.length > 0) step = Math.max(step, 3);
    if (chapters.some((ch: Chapter) => !!ch.content)) step = Math.max(step, 4);

    set({
      currentNovel: novel,
      activeNovelId: novel.id,
      outline,
      characters: novel.characters || [],
      chapterOutlines,
      chapters,
      currentStep: step,
      streamText: '',
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
  setStreamText: (streamText) => set({ streamText }),
  appendStreamText: (text) => set((s) => ({ streamText: s.streamText + text })),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setActiveNovelId: (activeNovelId) => set({ activeNovelId }),
  safeAbort: (novelId) => {
    const s = useNovelStore.getState();
    // 仅当传入的 novelId 与当前活跃小说 ID 匹配时才清理流式状态
    if (s.activeNovelId === novelId) {
      set({ isStreaming: false, streamText: '', activeNovelId: null });
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
    isStreaming: false,
    currentStep: 0,
    activeNovelId: null,
    reviewResults: {},
    extractionResults: {},
  }),
}));
