import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Steps, Button, Input, Typography, App, Space, Card, List, Tag, Modal, Popconfirm, Collapse, Badge, InputNumber } from 'antd';
import { PlayCircleOutlined, ArrowLeftOutlined, ArrowRightOutlined, EditOutlined, SendOutlined, RobotOutlined, ReloadOutlined, WarningOutlined, NodeIndexOutlined, AuditOutlined, PauseCircleOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { getNovelApi, getChapterContentApi } from '../api/novels';
import client from '../api/client';
import {
  startOutlineStream, startCharactersStream, startChapterOutlinesStream, startWriteChapterStream,
  startReviewStream, startExtractStream,
} from '../api/agents';
import { useNovelStore } from '../store/novelStore';
import OutlineView from '../components/novel/OutlineView';
import CharacterList from '../components/novel/CharacterList';
import ChapterOutlineList from '../components/novel/ChapterOutlineList';
import ChapterContent from '../components/novel/ChapterContent';
import StreamOutput from '../components/novel/StreamOutput';
import ExportButton from '../components/novel/ExportButton';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import useMobile from '../hooks/useMobile';
import type { Chapter } from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const STEP = { OUTLINE: 0, CHARACTERS: 1, CHAPTERS: 2, WRITING: 3 } as const;

const stepItems = [
  { title: '整书大纲' },
  { title: '人物设定' },
  { title: '章节大纲' },
  { title: '逐章写作' },
];

const NovelPage: React.FC = () => {
  const { message } = App.useApp();
  const isMobile = useMobile();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = parseInt(id!, 10);

  // 细粒度选择器：只订阅需要的字段，避免无关状态变化触发重渲染
  const currentNovel = useNovelStore(s => s.currentNovel);
  const outline = useNovelStore(s => s.outline);
  const characters = useNovelStore(s => s.characters);
  const chapterOutlines = useNovelStore(s => s.chapterOutlines);
  const chapters = useNovelStore(s => s.chapters);
  const streamText = useNovelStore(s => s.streamText);
  const isStreaming = useNovelStore(s => s.isStreaming);
  const currentStep = useNovelStore(s => s.currentStep);
  const reviewResults = useNovelStore(s => s.reviewResults);
  const extractionResults = useNovelStore(s => s.extractionResults);
  // action 引用稳定，可安全批量取
  const {
    setNovel, setOutline, setCharacters, setChapterOutlines, setChapters,
    appendStreamText, setStreamText, appendChapterContent, setChapterContent, setIsStreaming, setCurrentStep,
    appendChapterOutlines, mergeChapter,
    setReviewResult, setExtractionResult,
  } = useNovelStore.getState();

  const [loading, setLoading] = useState(true);
  const [userInput, setUserInput] = useState('');
  const [userInputSet, setUserInputSet] = useState(false);
  // 当前查看的步骤（本地状态，不持久化）
  const [viewStep, setViewStep] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // 记录当前活跃 SSE 流对应的 novelId，用于切换书籍时守卫检查
  const activeNovelIdRef = useRef<number>(novelId);

  // 编辑
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editChapterNumber, setEditChapterNumber] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editData, setEditData] = useState<any>(null);
  const [editFallback, setEditFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // AI 修订（多轮对话）
  const [chatPhase, setChatPhase] = useState<string | null>(null);
  const [chatFeedback, setChatFeedback] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; content: string; revised?: any; wordCount?: number }[]>([]);
  const [chatAIStream, setChatAIStream] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatStreamingRef = useRef(false);
  const confirmRevisionRef = useRef(false);
  const [chatChapter, setChatChapter] = useState<number | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatResultRef = useRef<any>(null);
  const chatOriginalRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // 修订对话自动滚动到底部
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatAIStream]);

  // 审查报告弹窗
  const [reviewReportVisible, setReviewReportVisible] = useState(false);
  const [reviewReportData, setReviewReportData] = useState<{ chapterNumber: number; issues: any[]; summary: string } | null>(null);

  // 数据提取报告弹窗
  const [extractionReportVisible, setExtractionReportVisible] = useState(false);
  const [extractionReportData, setExtractionReportData] = useState<any>(null);

  // 章节大纲分段生成状态（state + ref 同步，确保 cleanup 能读到最新值）
  const [nextBatchStart, _setNextBatchStart] = useState<number | null>(null);
  const [totalChapters, _setTotalChapters] = useState<number>(0);
  const nextBatchStartRef = useRef<number | null>(null);
  const totalChaptersRef = useRef<number>(0);
  const setNextBatchStart = (v: number | null) => { _setNextBatchStart(v); nextBatchStartRef.current = v; };
  const setTotalChapters = (v: number) => { _setTotalChapters(v); totalChaptersRef.current = v; };

  // 自动模式：用 ref 追踪避免闭包过期（SSE 事件处理器捕获的是旧渲染周期的值）
  const [autoOutlines, _setAutoOutlines] = useState(false);
  const [autoWriting, _setAutoWriting] = useState(false);
  const [autoPaused, _setAutoPaused] = useState(false);
  const [autoTargetChapter, setAutoTargetChapter] = useState<number | null>(null);
  // 逐章写作翻页：当前查看的章节号
  const [chapterPage, setChapterPage] = useState(1);
  const chapterPageRef = useRef(1);
  const initialLoadDone = useRef(false);

  const safeSetChapterPage = (page: number) => {
    chapterPageRef.current = page;
    setChapterPage(page);
  };
  const autoOutlinesRef = useRef(false);
  const autoWritingRef = useRef(false);
  const autoPauseRef = useRef(false);
  const parseRetryRef = useRef({ chapter: 0, count: 0 }); // 解析失败重试计数

  const setAutoOutlines = (v: boolean) => { _setAutoOutlines(v); autoOutlinesRef.current = v; };
  const setAutoWriting = (v: boolean) => { _setAutoWriting(v); autoWritingRef.current = v; };
  const setAutoPaused = (v: boolean) => { _setAutoPaused(v); autoPauseRef.current = v; };

  useEffect(() => {
    // 切换书籍时，中止旧 SSE 流并重置自动模式
    if (activeNovelIdRef.current !== novelId) {
      abortRef.current?.abort();
      abortRef.current = null;
      setAutoOutlines(false);
      setAutoWriting(false);
      setAutoPaused(false);
      setIsStreaming(false);
      setStreamText('');
      setChapterContent('');
      activeNovelIdRef.current = novelId;
    }
    loadNovel().then(() => {
      // 恢复自动链：仅从 sessionStorage 恢复（用户主动触发后离开再回来）
      // 不从 DB 状态自动推断，避免误触发
      try {
        const saved = sessionStorage.getItem(`autoChain_${novelId}`);
        if (saved) {
          sessionStorage.removeItem(`autoChain_${novelId}`);
          const { type, nextStart, totalChapters } = JSON.parse(saved);
          if (type === 'outlines' && nextStart && totalChapters && nextStart <= totalChapters) {
            message.info(`检测到未完成的章节大纲生成（第${nextStart}/${totalChapters}章），自动继续...`);
            setTotalChapters(totalChapters);
            setNextBatchStart(nextStart);
            setTimeout(() => startPhase3(nextStart, true), 500);
          }
        }
      } catch { /* ignore parse errors */ }
    });
    // 组件卸载时清理：仅重置流式状态，保留章节内容等静态数据供下次进入复用
    return () => {
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      abortRef.current = null;
      setAutoOutlines(false);
      setAutoWriting(false);
      setAutoPaused(false);
      setIsStreaming(false);
      setStreamText('');
      // 不清空 chapterContent 和 chapters，下次进入同一小说时 store 中仍有数据
      useNovelStore.getState().safeAbort(novelId);
    };
  }, [novelId]);

  // 流式操作时阻止浏览器刷新/关闭页面
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isStreaming) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isStreaming]);

  // 当用户查看写作步骤中的某章时，按需加载该章完整内容
  useEffect(() => {
    if (viewStep === STEP.WRITING && !isStreaming) {
      ensureChapterContent(chapterPage);
    }
  }, [viewStep, chapterPage]);

  // 自动链状态持久化：当批次进度变化时保存到 sessionStorage
  // 仅在自动链结束时清除，避免批次切换间隙丢失状态
  useEffect(() => {
    if (!autoOutlines) {
      sessionStorage.removeItem(`autoChain_${novelId}`);
    } else if (nextBatchStart && totalChapters && nextBatchStart <= totalChapters) {
      sessionStorage.setItem(`autoChain_${novelId}`, JSON.stringify({
        type: 'outlines', nextStart: nextBatchStart, totalChapters,
      }));
    }
  }, [autoOutlines, nextBatchStart, totalChapters, novelId]);

  const loadNovel = async () => {
    setLoading(true);
    try {
      // 轻量加载：跳过章节正文/审查/提取等大字段，加速首屏
      const { novel } = await getNovelApi(novelId, true);
      setNovel(novel);
      if (novel.current_step >= 1) setUserInputSet(true);
      // 根据已有数据设置 viewStep
      const step = novel.current_step || 0;
      setViewStep(step > 0 ? step - 1 : 0); // current_step 是 1-indexed，viewStep 是 0-indexed
      // 仅首次加载时设置翻页位置，避免覆盖用户当前浏览的章节
      if (!initialLoadDone.current) {
        const firstWritten = (novel.chapters || []).find((c: any) => !!c.content);
        safeSetChapterPage(firstWritten?.chapter_number || 1);
        initialLoadDone.current = true;
      }
      return novel;
    } catch {
      message.error('加载小说失败');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // 按需加载单个章节的完整内容（正文 + 审查 + 提取结果）
  const ensureChapterContent = async (chapterNum: number) => {
    const st = useNovelStore.getState();
    const existing = st.chapters.find((c: Chapter) => c.chapter_number === chapterNum);
    if (existing?.content) return; // 已有内容，无需重复加载
    try {
      const { chapter } = await getChapterContentApi(novelId, chapterNum);
      if (chapter && activeNovelIdRef.current === novelId) {
        mergeChapter(chapter);
      }
    } catch { /* 静默失败，用户操作时会重试 */ }
  };

  // ====== 检查某步骤是否有内容 ======
  const stepHasContent = (step: number): boolean => {
    if (step === STEP.OUTLINE) return !!(outline || currentNovel?.setting);
    if (step === STEP.CHARACTERS) return characters.length > 0;
    if (step === STEP.CHAPTERS) return chapterOutlines.length > 0;
    if (step === STEP.WRITING) return chapterOutlines.length > 0;
    return false;
  };

  // ====== SSE 事件处理 ======
  const handleSSEEvent = (event: string, data: any) => {
    // 守卫：如果 SSE 事件对应的 novelId 与当前页面不匹配，忽略该事件
    if (activeNovelIdRef.current !== novelId) return;
    switch (event) {
      case 'progress':
        message.info(data.message);
        // 写作流程的步骤进度同步追加到流式输出区，让用户看到写入阶段
        if (data.step) {
          appendStreamText(`\n\n📌 ${data.message}\n`);
        }
        break;
      case 'chunk':
        appendStreamText(data.text || '');
        appendChapterContent(data.text || '');
        break;
      case 'context_brief':
        // 写作任务书生成完毕（Step 1），显示提示
        if (data.brief) {
          message.success('写作任务书已生成，正在起草正文...');
          appendStreamText('写作任务书已生成，开始起草正文...\n\n');
        }
        break;
      case 'review_result':
        // 审查结果弹出报告窗口
        if (data.issues && data.chapterNumber) {
          setReviewReportData({
            chapterNumber: data.chapterNumber,
            issues: data.issues || [],
            summary: data.summary || '',
          });
          setReviewReportVisible(true);
          const blockingCount = (data.issues || []).filter((i: any) => i.blocking).length;
          if (blockingCount > 0) {
            message.warning(`审查发现${blockingCount}个阻断问题`);
          } else {
            message.success(`审查通过（${data.issues?.length || 0}个建议）`);
          }
        }
        break;
      case 'extraction_result':
        // 数据提取结果弹出报告窗口
        if (data.chapterNumber) {
          setExtractionReportData({
            chapterNumber: data.chapterNumber,
            entityCount: data.entityCount || 0,
            deltaCount: data.deltaCount || 0,
            sceneCount: data.sceneCount || 0,
            summary: data.summary || data.summary_text || '',
            entities_appeared: data.entities_appeared || [],
            state_deltas: data.state_deltas || [],
            scenes: data.scenes || [],
            hook_type: data.hook_type || '',
            hook_strength: data.hook_strength || '',
          });
          setExtractionReportVisible(true);
          message.success(`数据提取完成`);
        }
        break;
      case 'polish_start':
        // 润色开始：清除原稿流式文本，准备接收润色后的内容
        setStreamText('');
        setChapterContent('');
        break;
      case 'polish_done':
        // 润色完成
        message.success(data.message || '润色完成');
        break;
      case 'model_fallback':
        // 模型回退通知
        message.warning(data.message || `模型已回退：${data.preferredModel || '首选'} → ${data.actualModel || '备选'}`);
        break;
      case 'result': {
        // 写章阶段 result 不清除文本也不停止流（后续还有审查/润色/提取步骤）
        // 自动大纲模式下也不停止，由 done 事件统一控制
        if (!data.chapter && !autoOutlinesRef.current) {
          setStreamText('');
          setIsStreaming(false);
        }
        if (data.outline) {
          setOutline(data.outline);
          setCurrentStep(1);
          setViewStep(STEP.OUTLINE);
        }
        if (data.characters) {
          setCharacters(data.characters);
          setCurrentStep(2);
          setViewStep(STEP.CHARACTERS);
        }
        if (data.chapters && Array.isArray(data.chapters) && data.chapters.length > 0) {
          // 用 getState() 读取最新 store 值（避免闭包过期）
          const currentOutlines = useNovelStore.getState().chapterOutlines;
          const merged = new Map<number, any>();
          currentOutlines.forEach((ch: any) => merged.set(ch.chapter || ch.chapter_number, ch));
          data.chapters.forEach((ch: any) => merged.set(ch.chapter || ch.chapter_number, ch));
          const sorted = Array.from(merged.values()).sort((a: any, b: any) => (a.chapter || a.chapter_number) - (b.chapter || b.chapter_number));
          setChapterOutlines(sorted);
          setCurrentStep(3);
          setViewStep(STEP.CHAPTERS);
        } else if (data.chapters) {
          message.warning('收到空章节数据');
        }
        if (data.chapter) {
          const currentChapters = useNovelStore.getState().chapters;
          const updated = currentChapters.filter((c: Chapter) => c.chapter_number !== data.chapter.chapterNumber);
          // 使用 chapterContent（仅含AI生成的正文，不含日志/进度信息）
          const savedContent = useNovelStore.getState().chapterContent;
          updated.push({
            chapter_number: data.chapter.chapterNumber, title: data.chapter.title,
            content: savedContent || '', summary: data.chapter.summary,
            status: 'completed' as const, word_count: data.chapter.wordCount,
          });
          setChapters(updated);
          setCurrentStep(4);
          setViewStep(STEP.WRITING);
          // 非自动模式才跳转到正在写的章节，自动模式保持用户当前浏览位置
          if (!autoWritingRef.current) {
            safeSetChapterPage(data.chapter.chapterNumber);
          }
        }
        // 在 result 事件中不显示成功提示，统一在 done 事件中显示
        break;
      }
      case 'abort':
        setIsStreaming(false);
        setAutoOutlines(false);
        setAutoWriting(false);
        setAutoPaused(false);
        break;
      case 'done':
        setIsStreaming(false);
        // 解析失败：跟踪重试次数，超过3次暂停自动链让用户处理
        if (data.parseError) {
          const retry = parseRetryRef.current;
          if (data.nextStart === retry.chapter) {
            retry.count++;
          } else {
            retry.chapter = data.nextStart;
            retry.count = 1;
          }
          if (retry.count >= 3) {
            message.error(`第${retry.chapter}章大纲连续生成失败（已重试3次），自动链已暂停。请手动处理后点击"继续"`);
            setAutoOutlines(false);
            setAutoPaused(true);
            parseRetryRef.current = { chapter: 0, count: 0 };
            // 不再自动重试，直接返回
            break;
          } else {
            message.warning(`章节大纲解析失败，正在自动重试（${retry.count}/3）...`);
          }
        } else {
          parseRetryRef.current = { chapter: 0, count: 0 };
        }
        // 写章完成后重新加载小说数据，同步标题/字数等到前端
        if (data.chapter || data.phase === 'write_chapter') {
          getNovelApi(novelId, true).then(({ novel }) => {
            if (activeNovelIdRef.current === novelId) {
              setNovel(novel);
            }
          }).catch(() => {});
        }
        // 仅章节大纲阶段处理批处理信息
        if (data.totalChapters && data.hasMore) {
          setNextBatchStart(data.nextStart);
          setTotalChapters(data.totalChapters);
          // 自动模式：链式调用下一批（用 ref 避免闭包过期）
          if (autoOutlinesRef.current && !autoPauseRef.current) {
            const target = autoTargetChapter || data.totalChapters;
            if (data.nextStart <= target) {
              setTimeout(() => {
                // 守卫：如果用户已切换到其他书籍，停止自动链
                if (activeNovelIdRef.current !== novelId) { setAutoOutlines(false); return; }
                startPhase3(data.nextStart, true);
              }, 300);
            } else {
              setAutoOutlines(false);
              message.success(`已生成到第${target}章，目标达成`);
            }
          }
        } else if (data.totalChapters) {
          // 全部完成
          setNextBatchStart(null);
          setTotalChapters(0);
          getNovelApi(novelId, true).then(({ novel }) => { if (activeNovelIdRef.current === novelId) setNovel(novel); }).catch(() => {});
          setAutoOutlines(false);
        } else {
          setAutoOutlines(false);
        }
        // 自动写作模式：链式写下一章（用 getState 避免闭包过期）
        if (autoWritingRef.current && !autoPauseRef.current) {
          setTimeout(() => {
            // 守卫：如果用户已切换到其他书籍，停止自动链
            if (activeNovelIdRef.current !== novelId) { setAutoWriting(false); return; }
            const st = useNovelStore.getState();
            const nextCh = st.chapterOutlines.find((ch: any) => {
              const cn = ch.chapter || ch.chapter_number;
              return !st.chapters.find((c: Chapter) => c.chapter_number === cn && !!c.content);
            });
            if (nextCh && (!autoTargetChapter || (nextCh.chapter || nextCh.chapter_number) <= autoTargetChapter)) {
              startPhase4(nextCh.chapter || nextCh.chapter_number, true);
            } else {
              setAutoWriting(false);
              setStreamText('');
              setChapterContent('');
              message.success('全部章节写作已完成');
            }
          }, 300);
        } else if (!autoOutlinesRef.current && !autoWritingRef.current && data.phase !== 'review' && data.phase !== 'extract') {
          // 非自动模式下且非审查/提取操作，显示通用成功提示
          setStreamText('');
          setChapterContent('');
          message.success('生成完成');
        }
        break;
      case 'error':
        setIsStreaming(false); setStreamText(''); setChapterContent(''); setNextBatchStart(null);
        setAutoOutlines(false); setAutoWriting(false);
        message.error(data.message || '生成失败'); break;
    }
  };

  // ====== Steps 点击 ======
  const handleStepClick = (step: number) => {
    if (!stepHasContent(step)) return;
    setViewStep(step);
    setCurrentStep(step + 1);
    // 切换到逐章写作时，仅在 chapterPage 无效时才重置
    if (step === STEP.WRITING) {
      const st = useNovelStore.getState();
      const totalCh = st.chapterOutlines.length;
      if (chapterPageRef.current < 1 || chapterPageRef.current > totalCh) {
        const firstWritten = st.chapters.find((c: Chapter) => !!c.content);
        safeSetChapterPage(firstWritten?.chapter_number || 1);
      }
    }
  };

  // ====== 生成 ======
  const startPhase1 = () => {
    // 构建 prompt：优先使用用户输入，重新生成时携带当前大纲数据防止信息丢失
    let prompt: string;
    if (userInput.trim()) {
      prompt = userInput.trim();
    } else if (outline && (outline.title || outline.genre || outline.theme || outline.mainPlot)) {
      // 重新生成：把当前大纲作为上下文传给 AI，使其基于现有内容优化而非从零开始
      const existing = {
        标题: outline.title || currentNovel?.title,
        类型: outline.genre || currentNovel?.genre,
        主题: outline.theme || currentNovel?.theme,
        世界观: outline.setting || currentNovel?.setting,
        主线: outline.mainPlot || currentNovel?.main_plot,
        支线: outline.subPlots || (currentNovel?.sub_plots ? (typeof currentNovel.sub_plots === 'string' ? JSON.parse(currentNovel.sub_plots) : currentNovel.sub_plots) : []),
        基调: outline.tone,
        章节数: outline.chapterCount || currentNovel?.chapter_count,
        梗概: outline.synopsis,
      };
      prompt = `请基于以下现有大纲进行优化和完善，保留合理的设定，补充不足之处。不要完全推翻重来，而是在现有基础上提升：\n${JSON.stringify(existing, null, 2)}`;
    } else {
      const fallback = `请重新生成小说大纲。当前大纲信息：\n标题：${currentNovel?.title || ''}\n类型：${currentNovel?.genre || ''}\n主题：${currentNovel?.theme || ''}`;
      if (!currentNovel?.title) { message.warning('请先输入小说需求描述'); return; }
      prompt = fallback;
    }
    // 先中止旧流，防止残留 SSE 事件污染新小说
    abortRef.current?.abort();
    setUserInputSet(true); setStreamText(''); setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startOutlineStream(novelId, prompt, handleSSEEvent, true);
  };
  const startPhase2 = () => {
    abortRef.current?.abort();
    setStreamText(''); setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startCharactersStream(novelId, handleSSEEvent, true);
  };
  const startPhase3 = (startChapter?: number, autoMode?: boolean) => {
    abortRef.current?.abort();
    setStreamText(''); setIsStreaming(true);
    setNextBatchStart(null);
    if (autoMode) {
      setAutoOutlines(true); setAutoPaused(false);
      // 保存自动链状态到 sessionStorage（防止导航离开后丢失）
      const tc = totalChaptersRef.current || currentNovel?.chapter_count || 0;
      if (tc > 0) {
        sessionStorage.setItem(`autoChain_${novelId}`, JSON.stringify({
          type: 'outlines', nextStart: startChapter || 1, totalChapters: tc,
        }));
      }
    }
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startChapterOutlinesStream(novelId, handleSSEEvent, startChapter, autoMode, true);
  };
  const startPhase4 = (cn: number, autoMode?: boolean) => {
    if (isStreaming && !autoPaused) { message.warning('请等待当前操作完成'); return; }
    abortRef.current?.abort();
    setStreamText(''); setChapterContent(''); setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startWriteChapterStream(novelId, cn, handleSSEEvent, autoMode, true);
  };
  const startReview = (cn: number) => {
    if (isStreaming) { message.warning('请等待当前操作完成'); return; }
    abortRef.current?.abort();
    setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startReviewStream(novelId, cn, handleSSEEvent, true);
  };
  const startExtract = (cn: number) => {
    if (isStreaming) { message.warning('请等待当前操作完成'); return; }
    abortRef.current?.abort();
    setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startExtractStream(novelId, cn, handleSSEEvent, true);
  };

  // ====== 编辑 ======
  const openEditor = (phase: string, content: any, chapterNum?: number) => {
    const normalized = normalizeEditContent(phase, content);
    setEditingPhase(phase);
    setEditChapterNumber(chapterNum || null);
    setEditData(normalized.data);
    setEditText(normalized.text);
    setEditFallback(normalized.fallback);
  };

  const closeEditor = () => {
    setEditingPhase(null);
    setEditChapterNumber(null);
    setEditData(null);
    setEditText('');
    setEditFallback(false);
  };

  const handleSaveEdit = async () => {
    if (!editingPhase || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let parsedContent: any = editData;

      if (editFallback) {
        parsedContent = editText;
      }

      if (editFallback && (editingPhase === 'outline' || editingPhase === 'characters' || editingPhase === 'chapters_outline')) {
        try {
          parsedContent = JSON.parse(editText);
        } catch (e) {
          message.error('数据格式错误，请检查 JSON 格式');
          savingRef.current = false;
          setSaving(false);
          return;
        }
      }

      if (!editFallback) {
        if (editingPhase === 'outline') {
          parsedContent = normalizeOutlineForSave(editData);
          if (!parsedContent.title.trim()) {
            message.warning('请填写大纲标题');
            return;
          }
        } else if (editingPhase === 'characters') {
          const charactersPayload = normalizeCharactersForSave(editData);
          if (charactersPayload.characters.length === 0) {
            message.warning('请至少保留一个角色');
            return;
          }
          parsedContent = charactersPayload;
        } else if (editingPhase === 'chapters_outline') {
          const chaptersPayload = normalizeChaptersOutlineForSave(editData);
          if (chaptersPayload.chapters.length === 0) {
            message.warning('请至少保留一个章节');
            return;
          }
          const invalid = chaptersPayload.chapters.find((ch: any) => !Number.isInteger(ch.chapter) || ch.chapter < 1);
          if (invalid) {
            message.warning('章节号必须为正整数');
            return;
          }
          parsedContent = chaptersPayload;
        } else if (editingPhase === 'chapter_content') {
          parsedContent = normalizeChapterContentForSave(editData);
          if (!parsedContent.content.trim()) {
            message.warning('正文不能为空');
            return;
          }
        }
      }

      await client.put(`/novels/${novelId}/save`, { phase: editingPhase, content: parsedContent, chapterNumber: editChapterNumber });
      message.success('保存成功');
      closeEditor();
      loadNovel();
    } catch { message.error('保存失败'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const renderInlineEditor = (phase: string, chapterNumber?: number) => {
    const isCurrent = editingPhase === phase &&
      (phase !== 'chapter_content' || editChapterNumber === chapterNumber);
    if (!isCurrent) return null;

    return (
      <InlineDirectEditor
        phase={phase}
        data={editData}
        onChange={setEditData}
        fallback={editFallback}
        fallbackText={editText}
        onFallbackTextChange={setEditText}
        saving={saving}
        onSave={handleSaveEdit}
        onCancel={closeEditor}
        isMobile={isMobile}
      />
    );
  };

  // ====== AI 修订 ======
  const openChat = (phase: string, chapterNum?: number) => {
    setChatPhase(phase); setChatChapter(chapterNum || null);
    setChatFeedback(''); setChatMessages([]); setChatAIStream(''); setChatStreaming(false);
    chatResultRef.current = null;
    // 记录原始内容，用于后续每轮请求的上下文
    let original: any = '';
    if (phase === 'outline') original = outline || { title: currentNovel?.title };
    else if (phase === 'characters') original = { characters };
    else if (phase === 'chapters_outline') original = { chapters: chapterOutlines };
    else if (phase === 'chapter_content') {
      const ch = chapters.find(c => c.chapter_number === chapterNum);
      original = ch?.content || '';
    }
    chatOriginalRef.current = original;
  };
  const handleConfirmRevision = async () => {
    if (confirmRevisionRef.current) return;
    confirmRevisionRef.current = true;
    setChatStreaming(true);
    try {
      const chTitle = chatChapter ? chapters.find(c => c.chapter_number === chatChapter)?.title || '' : '';
      // 取最后一条 AI 消息的修订内容
      const lastAI = [...chatMessages].reverse().find(m => m.role === 'ai');
      const rawContent = lastAI?.revised || lastAI?.content;
      if (!rawContent) { message.warning('没有可更新的内容'); return; }

      let content: any = rawContent;
      let savePhase = chatPhase;

      if (chatPhase === 'chapter_content') {
        content = { content: rawContent, title: chTitle, summary: '' };
        savePhase = 'chapter_content';
      } else if (typeof rawContent === 'string') {
        try { content = JSON.parse(rawContent); } catch { /* 非JSON文本则原样传递 */ }
      }

      await client.put(`/novels/${novelId}/save`, {
        phase: savePhase, content, chapterNumber: chatChapter, title: chTitle,
      });
      message.success('修订已更新'); setChatPhase(null); loadNovel();
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error || err?.message || '未知错误';
      message.error(`更新失败：${backendMsg}`);
    } finally { confirmRevisionRef.current = false; setChatStreaming(false); }
  };
  const handleChatSend = () => {
    if (!chatFeedback.trim() || !chatPhase || chatStreamingRef.current) return;
    chatStreamingRef.current = true;
    const feedback = chatFeedback.trim();
    // 追加用户消息到对话历史
    setChatMessages(prev => [...prev, { role: 'user', content: feedback }]);
    setChatFeedback(''); setChatAIStream(''); setChatStreaming(true);
    // 用最新一轮修订内容作为当前内容（首轮用原始内容）
    const lastAI = [...chatMessages].reverse().find(m => m.role === 'ai');
    const currentContent = lastAI?.revised || chatOriginalRef.current;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    fetch(`/api/novels/${novelId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ phase: chatPhase === 'chapter_content' ? 'write_chapter' : chatPhase, chapterNumber: chatChapter, currentContent, feedback }),
      signal: controller.signal,
    }).then(response => {
      if (!response.ok) {
        response.json().then(e => {
          if (response.status === 429 || e.code === 'TOKEN_QUOTA_EXCEEDED') {
            message.error('每日 Token 额度已耗尽，请明天再试或升级账号');
          } else {
            message.error(e.error || '请求失败');
          }
        }).catch(() => message.error('请求失败'));
        setChatStreaming(false); chatStreamingRef.current = false;
        return;
      }
      readSSE(response);
    }).catch(() => { setChatStreaming(false); chatStreamingRef.current = false; });
  };
  const readSSE = async (response: Response) => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', currentEvent = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { currentEvent = line.substring(7).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          const raw = line.substring(6);
          try {
            const data = JSON.parse(raw);
            if (currentEvent === 'chunk' || !currentEvent) setChatAIStream(s => s + (data.text || ''));
            else if (currentEvent === 'progress') message.info(data.message);
            else if (currentEvent === 'error') {
              // 错误时将已累积的流式文本保存到对话历史，避免丢失
              setChatAIStream(stream => {
                if (stream) {
                  setChatMessages(prev => [...prev, { role: 'ai' as const, content: stream, revised: chatResultRef.current || stream }]);
                }
                return '';
              });
              message.error(data.message);
              setChatStreaming(false); chatStreamingRef.current = false;
            }
            else if (currentEvent === 'done') {
              const revised = chatResultRef.current;
              setChatAIStream(stream => {
                const finalText = stream;
                setChatMessages(prev => [...prev, { role: 'ai' as const, content: finalText, revised: revised || finalText, wordCount: data.wordCount }]);
                return '';
              });
              setChatStreaming(false); chatStreamingRef.current = false;
            }
            else if (currentEvent === 'result') { chatResultRef.current = data.revised; }
          } catch { /* raw text */ }
        }
      }
    } finally { reader.releaseLock(); }
  };

  if (loading) return <LoadingSpinner tip="加载小说信息..." />;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>返回小说列表</Button>
      <Title level={3}>{currentNovel?.title || '未命名小说'}</Title>

      {/* 需求输入 */}
      {!userInputSet && (
        <Card title="你想写什么样的小说？" style={{ marginBottom: 24 }}>
          <TextArea rows={4} value={userInput} onChange={e => setUserInput(e.target.value)} placeholder="描述你的小说需求..." />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={startPhase1} style={{ marginTop: 16 }} loading={isStreaming}>开始生成大纲</Button>
        </Card>
      )}

      {/* 步骤条 — 无内容的步骤不可点击 */}
      {userInputSet && (
        <Steps
          current={viewStep}
          items={stepItems.map((item, i) => ({ ...item, disabled: !stepHasContent(i) }))}
          onChange={handleStepClick}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 流式输出（第四步有专属输出区，此处在其他步骤时显示） */}
      {(isStreaming || streamText) && viewStep !== STEP.WRITING && (
        <StreamOutput text={streamText} isStreaming={isStreaming} />
      )}

      {/* ====== 整书大纲 ====== */}
      {userInputSet && viewStep === STEP.OUTLINE && (
        <ActionCard title="整书大纲" onRegenerate={startPhase1} onEdit={() => openEditor('outline', outline || { title: currentNovel?.title, genre: currentNovel?.genre, theme: currentNovel?.theme, setting: currentNovel?.setting, mainPlot: currentNovel?.main_plot, subPlots: currentNovel?.sub_plots, chapterCount: currentNovel?.chapter_count })} onChat={() => openChat('outline')} onStop={() => abortRef.current?.abort()} isStreaming={isStreaming} isChatting={chatPhase === 'outline' && chatStreaming} novelId={novelId} chapterCount={chapters.filter(c => !!c.content).length}>
          {editingPhase === 'outline' ? (
            renderInlineEditor('outline')
          ) : (
            <>
              <OutlineView outline={outline || { title: currentNovel?.title, genre: currentNovel?.genre, theme: currentNovel?.theme, setting: currentNovel?.setting, mainPlot: currentNovel?.main_plot, subPlots: currentNovel?.sub_plots, chapterCount: currentNovel?.chapter_count }} />
              {!isStreaming && <Button type="primary" onClick={startPhase2} style={{ marginTop: 16 }}>生成人物设定</Button>}
            </>
          )}
        </ActionCard>
      )}

      {/* ====== 人物设定 ====== */}
      {viewStep === STEP.CHARACTERS && characters.length > 0 && (
        <ActionCard title="人物设定" onRegenerate={startPhase2} onEdit={() => openEditor('characters', { characters })} onChat={() => openChat('characters')} onStop={() => abortRef.current?.abort()} isStreaming={isStreaming} isChatting={chatPhase === 'characters' && chatStreaming} novelId={novelId} chapterCount={chapters.filter(c => !!c.content).length}>
          {editingPhase === 'characters' ? (
            renderInlineEditor('characters')
          ) : (
            <>
              <CharacterList characters={characters} />
              {!isStreaming && <Button type="primary" onClick={() => startPhase3(1, true)} style={{ marginTop: 16 }}>一键生成全部章节大纲</Button>}
            </>
          )}
        </ActionCard>
      )}

      {/* ====== 章节大纲 ====== */}
      {viewStep === STEP.CHAPTERS && (
        chapterOutlines.length > 0 ? (
          <Card
            title="章节大纲"
            style={{ marginTop: 16 }}
            extra={
              <Space>
                {isStreaming && (
                  <Button size="small" icon={<PauseCircleOutlined />} onClick={() => abortRef.current?.abort()} danger>停止生成</Button>
                )}
                <Popconfirm title="确认重新生成？当前内容将被覆盖。" onConfirm={() => startPhase3()} okText="确认" cancelText="取消" disabled={isStreaming}>
                  <Button size="small" icon={<ReloadOutlined />} disabled={isStreaming} loading={isStreaming}>重新生成</Button>
                </Popconfirm>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditor('chapters_outline', { chapters: chapterOutlines })} disabled={isStreaming}>编辑</Button>
                <Button size="small" icon={<RobotOutlined />} onClick={() => openChat('chapters_outline')} loading={chatPhase === 'chapters_outline' && chatStreaming} disabled={isStreaming}>AI 修订</Button>
              </Space>
            }
          >
            {editingPhase === 'chapters_outline' ? (
              renderInlineEditor('chapters_outline')
            ) : (
              <>
                <ChapterOutlineList
                  chapters={chapterOutlines}
                  onWriteChapter={(chNum: number) => {
                    safeSetChapterPage(chNum);
                    setViewStep(STEP.WRITING);
                    setCurrentStep(4);
                    startPhase4(chNum);
                  }}
                  writtenChapterNumbers={new Set(chapters.filter((c: Chapter) => !!c.content).map((c: Chapter) => c.chapter_number))}
                  disabled={isStreaming}
                />
                {/* 自动生成控制区 */}
                {!isStreaming && (() => {
                  const realOutlines = useNovelStore.getState().chapterOutlines;
                  const generatedCount = realOutlines.length;
                  const total = totalChapters || currentNovel?.chapter_count || 0;
                  const needMore = total > 0 && generatedCount < total;
                  if (generatedCount > 0 && !needMore) {
                    return (
                      <div style={{ textAlign: 'center', marginTop: 16 }}>
                        <Text style={{ color: '#34d399' }}>全部章节大纲已生成完毕（{generatedCount}/{total}章）</Text>
                      </div>
                    );
                  }
                  return (
                    <div style={{ marginTop: 16, padding: 12, background: 'rgba(251,191,36,0.08)', borderRadius: 8, border: '1px solid rgba(251,191,36,0.15)' }}>
                      {autoOutlines ? (
                        <div style={{ textAlign: 'center' }}>
                          <Text style={{ color: '#94a3b8', display: 'block', marginBottom: 8 }}>
                            🔄 自动生成中：已完成第1-{generatedCount}章 / 共{total}章
                            {autoTargetChapter ? `（目标：第${autoTargetChapter}章）` : ''}
                          </Text>
                          <Space>
                            <Button onClick={() => setAutoPaused(!autoPaused)}>
                              {autoPaused ? '继续' : '暂停'}
                            </Button>
                            <Button danger onClick={() => { setAutoOutlines(false); setAutoPaused(false); abortRef.current?.abort(); }}>
                              停止
                            </Button>
                          </Space>
                        </div>
                      ) : needMore ? (
                        <div style={{ textAlign: 'center' }}>
                          <Text style={{ color: '#94a3b8', display: 'block', marginBottom: 8 }}>
                            已生成第1-{generatedCount}章大纲，还剩{total - generatedCount}章
                          </Text>
                          <Space>
                            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => {
                              const startFrom = nextBatchStart || (generatedCount + 1);
                              startPhase3(startFrom, true);
                            }}>
                              继续生成全部
                            </Button>
                          </Space>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        ) : !isStreaming ? (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: '#94a3b8' }}>暂无章节大纲，请先在上一步生成。</Text>
            <Text style={{ color: '#94a3b8', display:'block', fontSize:11, marginTop:4 }}>DEBUG: outlines={chapterOutlines.length} viewStep={viewStep} chapters={chapters.length}</Text>
          </Card>
        ) : null
      )}

      {/* ====== 逐章写作 ====== */}
      {viewStep === STEP.WRITING && (
        <div>
          {/* 自动写作状态栏 */}
          {autoWriting && (
            <Card
              size="small"
              style={{ marginBottom: 12, background: autoPaused ? 'rgba(251,191,36,0.08)' : 'rgba(34,197,94,0.08)', borderColor: autoPaused ? 'rgba(251,191,36,0.25)' : 'rgba(34,197,94,0.25)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: autoPaused ? '#fbbf24' : '#4ade80' }}>
                  {autoPaused ? '⏸ 自动写作已暂停' : `🔄 自动写作中...（${chapters.filter(c => !!c.content).length}/${chapterOutlines.length}）`}
                </Text>
                <Space>
                  <Button size="small" onClick={() => setAutoPaused(!autoPaused)}>{autoPaused ? '继续' : '暂停'}</Button>
                  <Button size="small" danger onClick={() => { setAutoWriting(false); setAutoPaused(false); abortRef.current?.abort(); }}>停止</Button>
                </Space>
              </div>
            </Card>
          )}

          {/* 翻页控件 */}
          {chapterOutlines.length > 0 && (
            <div className="chapter-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16, padding: '10px 16px', background: 'rgba(15,23,42,0.5)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)', flexWrap: 'wrap' }}>
              <Button icon={<ArrowLeftOutlined />} disabled={chapterPage <= 1 || isStreaming} onClick={() => safeSetChapterPage(Math.max(1, chapterPageRef.current - 1))}>
                上一章
              </Button>
              <div style={{ textAlign: 'center', minWidth: 120, flex: 1 }}>
                <Text strong style={{ color: '#f1f5f9', fontSize: 16 }}>
                  第 {chapterPage} / {chapterOutlines.length} 章
                </Text>
                {(() => {
                  const outline = chapterOutlines.find((ch: any) => (ch.chapter || ch.chapter_number) === chapterPage);
                  return outline?.title ? <Text style={{ color: '#94a3b8', display: 'block', fontSize: 13 }}>{outline.title}</Text> : null;
                })()}
                <Tag color={chapters.find((c: Chapter) => c.chapter_number === chapterPage && !!c.content) ? 'green' : 'default'} style={{ marginTop: 4 }}>
                  {chapters.find((c: Chapter) => c.chapter_number === chapterPage && !!c.content) ? '已写' : '待写'}
                </Tag>
              </div>
              <Button icon={<ArrowRightOutlined />} disabled={chapterPage >= chapterOutlines.length || isStreaming} onClick={() => safeSetChapterPage(Math.min(chapterOutlines.length, chapterPageRef.current + 1))}>
                下一章
              </Button>
            </div>
          )}

          {/* 写作中：实时流式输出 */}
          {isStreaming && (
            <Card title="正在写作..." style={{ marginBottom: 16, borderColor: 'rgba(99,102,241,0.3)' }}
              extra={<Button size="small" icon={<PauseCircleOutlined />} onClick={() => abortRef.current?.abort()} danger>停止生成</Button>}
            >
              <StreamOutput text={streamText} isStreaming={isStreaming} />
            </Card>
          )}

          {/* 当前章节内容 */}
          {(() => {
            const ch = chapters.find((c: Chapter) => c.chapter_number === chapterPage && !!c.content);
            const outline = chapterOutlines.find((co: any) => (co.chapter || co.chapter_number) === chapterPage);
            if (ch) {
              return (
                <ChapterCard
                  key={ch.chapter_number}
                  title={`第${ch.chapter_number}章 ${ch.title}`}
                  novelId={novelId}
                  chapterCount={chapters.filter(c => !!c.content).length}
                >
                  {editingPhase === 'chapter_content' && editChapterNumber === ch.chapter_number ? (
                    renderInlineEditor('chapter_content', ch.chapter_number)
                  ) : (
                    <ChapterContent chapter={ch} novelId={novelId}
                      reviewResult={reviewResults[ch.chapter_number] || null}
                      extractionResult={extractionResults[ch.chapter_number] || null}
                      onRegenerate={() => startPhase4(ch.chapter_number)}
                      onEdit={() => openEditor('chapter_content', { title: ch.title, summary: ch.summary || '', content: ch.content || '' }, ch.chapter_number)}
                      onChat={() => openChat('chapter_content', ch.chapter_number)}
                      onReview={() => startReview(ch.chapter_number)}
                      onExtract={() => startExtract(ch.chapter_number)}
                      isStreaming={isStreaming}
                      isChatting={chatPhase === 'chapter_content' && chatChapter === ch.chapter_number && chatStreaming}
                    />
                  )}
                </ChapterCard>
              );
            }
            if (outline) {
              return (
                <Card
                  title={`第${chapterPage}章 ${outline.title || ''}`}
                  style={{ marginTop: 16 }}
                  extra={
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { startPhase4(chapterPage); }} disabled={isStreaming}>
                      写此章
                    </Button>
                  }
                >
                  {/* 引用章纲预览 */}
                  <div style={{ padding: '8px 12px', background: 'rgba(30,41,59,0.5)', borderRadius: 6, border: '1px solid rgba(99,102,241,0.1)' }}>
                    <Text strong style={{ color: '#f1f5f9', fontSize: 13 }}>章纲预览</Text>
                    {outline.synopsis && <Paragraph style={{ marginTop: 6, marginBottom: 4, color: '#cbd5e1', fontSize: 13 }}>{outline.synopsis}</Paragraph>}
                    {outline.conflict && <Paragraph style={{ marginBottom: 4, color: '#cbd5e1', fontSize: 13 }}><Text style={{ color: '#94a3b8' }}>核心冲突：</Text>{outline.conflict}</Paragraph>}
                    {outline.endingHook && <Paragraph style={{ marginBottom: 0, color: '#cbd5e1', fontSize: 13 }}><Text style={{ color: '#94a3b8' }}>结尾钩子：</Text>{outline.endingHook}</Paragraph>}
                    {outline.scenes && Array.isArray(outline.scenes) && (
                      <div style={{ marginTop: 6 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>场景（{outline.scenes.length}）：</Text>
                        {outline.scenes.slice(0, 3).map((s: any, i: number) => (
                          <Tag key={i} color="geekblue" style={{ margin: 2 }}>{s.location || `场景${s.number || i + 1}`}</Tag>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <Text style={{ color: '#94a3b8', display: 'block', marginBottom: 12 }}>本章尚未写作，准备好后点击上方按钮开始</Text>
                  </div>
                </Card>
              );
            }
            return (
              <Card style={{ marginTop: 16 }}>
                <Text style={{ color: '#94a3b8' }}>暂无章节数据</Text>
              </Card>
            );
          })()}

          {/* 底部：一键写作入口（仅当存在未写章节时显示） */}
          {!isStreaming && !autoWriting && (() => {
            const st = useNovelStore.getState();
            const unwritten = st.chapterOutlines.filter((co: any) => !st.chapters.find((c: Chapter) => (c.chapter_number === (co.chapter || co.chapter_number)) && !!c.content));
            if (unwritten.length === 0) return null;
            return (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Space>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>还有 {unwritten.length} 章未写</Text>
                  <Button type="primary" size="small" onClick={() => {
                    setAutoWriting(true); setAutoPaused(false);
                    const firstUnwritten = unwritten[0];
                    const cn = firstUnwritten.chapter || firstUnwritten.chapter_number;
                    safeSetChapterPage(cn);
                    startPhase4(cn, true);
                  }}>一键写作全部章节</Button>
                </Space>
              </div>
            );
          })()}
        </div>
      )}

      {/* ====== 审查报告弹窗 ====== */}
      <Modal
        title={<Space><AuditOutlined /> 审查报告（第{reviewReportData?.chapterNumber}章）</Space>}
        open={reviewReportVisible}
        onCancel={() => setReviewReportVisible(false)}
        footer={<Button type="primary" onClick={() => setReviewReportVisible(false)}>确定</Button>}
        width={isMobile ? '95vw' : 700}
      >
        {reviewReportData?.summary && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 6 }}>
            <Text style={{ color: '#94a3b8' }}>{reviewReportData.summary}</Text>
          </div>
        )}
        {reviewReportData?.issues?.length === 0 && (
          <Text style={{ color: '#34d399' }}>审查通过，无问题。</Text>
        )}
        <List
          size="small"
          dataSource={reviewReportData?.issues || []}
          renderItem={(issue: any) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Space direction="vertical" size={0} style={{ textAlign: 'center', minWidth: 60 }}>
                    <Tag color={{ critical: 'red', high: 'orange', medium: 'gold', low: 'blue' }[issue.severity as string] || 'default'} style={{ margin: 0 }}>
                      {issue.severity}
                    </Tag>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>{{ setting: '设定', timeline: '时间线', continuity: '连贯', character: '角色', logic: '逻辑', ai_flavor: 'AI味', pacing: '节奏', other: '其他' }[issue.category as string] || issue.category}</Text>
                  </Space>
                }
                title={<Space>{issue.description}{issue.blocking && <Tag color="red">阻断</Tag>}</Space>}
                description={
                  <div>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>位置：{issue.location}</Text>
                    {issue.evidence && (
                      <div style={{ marginTop: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, fontSize: 12 }}>
                        <Text style={{ color: '#6366f1' }}>证据：</Text><Text style={{ color: '#c4b5fd' }}>{issue.evidence}</Text>
                      </div>
                    )}
                    {issue.fix_hint && (
                      <div style={{ marginTop: 2 }}>
                        <Text style={{ color: '#34d399', fontSize: 12 }}>💡 {issue.fix_hint}</Text>
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* ====== 数据提取报告弹窗 ====== */}
      <Modal
        title={<Space><NodeIndexOutlined /> 数据提取报告（第{extractionReportData?.chapterNumber}章）</Space>}
        open={extractionReportVisible}
        onCancel={() => setExtractionReportVisible(false)}
        footer={<Button type="primary" onClick={() => setExtractionReportVisible(false)}>确定</Button>}
        width={isMobile ? '95vw' : 700}
      >
        {extractionReportData?.summary && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>章节摘要：</Text>
            <Text style={{ color: '#e2e8f0', display: 'block' }}>{extractionReportData.summary}</Text>
          </div>
        )}
        {extractionReportData?.hook_type && (
          <Tag color="purple" style={{ marginBottom: 12 }}>钩子类型：{extractionReportData.hook_type}（{extractionReportData.hook_strength}）</Tag>
        )}
        {extractionReportData?.sceneCount > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>场景切分（{extractionReportData.sceneCount}个）：</Text>
            <List
              size="small"
              dataSource={extractionReportData?.scenes || []}
              renderItem={(scene: any) => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Tag color="blue">场景{scene.index}</Tag>
                  <Text style={{ color: '#e2e8f0', fontSize: 13 }}>{scene.summary}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>📍{scene.location}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
        {extractionReportData?.deltaCount > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>状态变更（{extractionReportData.deltaCount}处）：</Text>
            <div style={{ marginTop: 6 }}>
              {(extractionReportData?.state_deltas || []).map((d: any, i: number) => (
                <Tag key={i} style={{ margin: 2 }}>{d.entity_id}.{d.field}: {d.old || '?'} → {d.new}</Tag>
              ))}
            </div>
          </div>
        )}
        {extractionReportData?.entityCount > 0 && (
          <div>
            <Text strong style={{ fontSize: 13 }}>出场实体（{extractionReportData.entityCount}个）：</Text>
            <div style={{ marginTop: 6 }}>
              {(extractionReportData?.entities_appeared || []).map((e: any) => (
                <Tag key={e.id} color={e.is_new ? 'green' : 'default'} style={{ margin: 2 }}>
                  {e.name}{e.is_new ? ' 🆕' : ''}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ====== AI 修订弹窗（多轮对话） ====== */}
      <Modal
        title={<span><RobotOutlined /> AI 修订助手</span>}
        open={!!chatPhase}
        onCancel={() => {
          chatAbortRef.current?.abort();
          // 保存已累积的流式文本到对话历史，避免丢失
          setChatAIStream(stream => {
            if (stream) {
              setChatMessages(prev => [...prev, { role: 'ai' as const, content: stream, revised: chatResultRef.current || stream }]);
            }
            return '';
          });
          setChatPhase(null); setChatStreaming(false);
        }}
        footer={chatMessages.some(m => m.role === 'ai') && !chatStreaming ? [
          <Button key="cancel" onClick={() => setChatPhase(null)}>取消</Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmRevision} loading={chatStreaming}>确定更新</Button>,
        ] : null}
        width={isMobile ? '95vw' : 640}
      >
        {/* 对话历史 */}
        <div ref={chatScrollRef} style={{ maxHeight: 400, overflow: 'auto', padding: '8px 0', marginBottom: 12 }}>
          {chatMessages.length === 0 && !chatStreaming && (
            <Paragraph style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>对当前内容不满意？告诉 AI 你想怎么修改。</Paragraph>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, background: msg.role === 'user' ? 'rgba(99,102,241,0.25)' : 'rgba(15,23,42,0.85)', border: msg.role === 'user' ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(99,102,241,0.15)' }}>
                <Text style={{ color: msg.role === 'user' ? '#c7d2fe' : '#e2e8f0', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </Text>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: '#e2e8f0' }}>
                  {msg.role === 'ai' ? (msg.revised || msg.content) : msg.content}
                </div>
                {msg.role === 'ai' && msg.wordCount && <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4, display: 'block' }}>约 {msg.wordCount} 字</Text>}
              </div>
            </div>
          ))}
          {/* 当前 AI 流式输出 */}
          {chatStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <Text style={{ color: '#e2e8f0', fontSize: 12, display: 'block', marginBottom: 4 }}>AI</Text>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: '#e2e8f0' }}>
                  {chatAIStream || '正在思考...'}<span className="stream-cursor" />
                </div>
              </div>
            </div>
          )}
        </div>
        {/* 输入区：始终显示，支持多轮 */}
        <Space.Compact style={{ width: '100%' }}>
          <TextArea value={chatFeedback} onChange={e => setChatFeedback(e.target.value)}
            placeholder="输入修改意见，Shift+Enter 换行..." rows={2}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleChatSend(); } }} disabled={chatStreaming} />
          <Button type="primary" icon={<SendOutlined />} onClick={handleChatSend} loading={chatStreaming} style={{ height: 'auto' }}>发送</Button>
        </Space.Compact>
        {chatStreaming && <Text style={{ color: '#94a3b8', display: 'block', marginTop: 8 }}>AI 正在修订中...</Text>}
      </Modal>

    </div>
  );
};

const ensureArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* text list fallback */ }
    return value.split(/\r?\n|[，,、]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
};

const stringifyField = (value: any) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};

const normalizeEditContent = (phase: string, content: any): { data: any; text: string; fallback: boolean } => {
  try {
    const parsed = typeof content === 'string' && phase !== 'chapter_content' ? JSON.parse(content) : content;
    if (phase === 'outline') {
      const data = {
        title: parsed?.title || '',
        genre: parsed?.genre || '',
        theme: parsed?.theme || '',
        setting: stringifyField(parsed?.setting),
        mainPlot: parsed?.mainPlot || parsed?.main_plot || '',
        subPlots: ensureArray(parsed?.subPlots || parsed?.sub_plots).map(stringifyField),
        chapterCount: Number(parsed?.chapterCount || parsed?.chapter_count || 0) || 0,
      };
      return { data, text: JSON.stringify(data, null, 2), fallback: false };
    }
    if (phase === 'characters') {
      const chars = ensureArray(parsed?.characters).map((char: any) => ({
        name: char?.name || '',
        age: stringifyField(char?.age),
        gender: char?.gender || '',
        role: char?.role || '',
        appearance: char?.appearance || '',
        personality: char?.personality || '',
        background: char?.background || '',
        motivation: char?.motivation || '',
        arc: char?.arc || '',
        relationships: stringifyField(char?.relationships || []),
      }));
      const data = { characters: chars };
      return { data, text: JSON.stringify(data, null, 2), fallback: false };
    }
    if (phase === 'chapters_outline') {
      const chapterList = ensureArray(parsed?.chapters).map((chapter: any, index: number) => ({
        chapter: Number(chapter?.chapter || chapter?.chapter_number || index + 1) || index + 1,
        title: chapter?.title || '',
        synopsis: chapter?.synopsis || chapter?.brief || '',
        conflict: chapter?.conflict || '',
        turningPoint: chapter?.turningPoint || chapter?.turning_point || '',
        emotionalTone: chapter?.emotionalTone || chapter?.emotional_tone || '',
        endingHook: chapter?.endingHook || chapter?.ending_hook || chapter?.hook || '',
        scenes: ensureArray(chapter?.scenes).map((scene: any) => ({
          location: typeof scene === 'object' ? scene?.location || '' : '',
          description: typeof scene === 'object' ? scene?.description || stringifyField(scene) : String(scene || ''),
        })),
        charactersInvolved: ensureArray(chapter?.charactersInvolved || chapter?.characters_involved).map(stringifyField),
      }));
      const data = { chapters: chapterList };
      return { data, text: JSON.stringify(data, null, 2), fallback: false };
    }
    if (phase === 'chapter_content') {
      const data = typeof content === 'string'
        ? { title: '', summary: '', content }
        : { title: content?.title || '', summary: content?.summary || '', content: content?.content || '' };
      return { data, text: data.content, fallback: false };
    }
  } catch { /* fallback below */ }

  return {
    data: null,
    text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    fallback: true,
  };
};

const normalizeOutlineForSave = (data: any) => ({
  title: String(data?.title || '').trim(),
  genre: String(data?.genre || '').trim(),
  theme: String(data?.theme || '').trim(),
  setting: String(data?.setting || '').trim(),
  mainPlot: String(data?.mainPlot || '').trim(),
  subPlots: ensureArray(data?.subPlots).map(stringifyField).map(item => item.trim()).filter(Boolean),
  chapterCount: Number(data?.chapterCount || 0) || 0,
});

const normalizeCharactersForSave = (data: any) => ({
  characters: ensureArray(data?.characters)
    .map((char: any) => ({
      name: String(char?.name || '').trim(),
      age: String(char?.age || '').trim(),
      gender: String(char?.gender || '').trim(),
      role: String(char?.role || '').trim(),
      appearance: String(char?.appearance || '').trim(),
      personality: String(char?.personality || '').trim(),
      background: String(char?.background || '').trim(),
      motivation: String(char?.motivation || '').trim(),
      arc: String(char?.arc || '').trim(),
      relationships: ensureArray(char?.relationships),
    }))
    .filter((char: any) => char.name),
});

const normalizeChaptersOutlineForSave = (data: any) => ({
  chapters: ensureArray(data?.chapters).map((chapter: any) => ({
    chapter: Number(chapter?.chapter || 0),
    title: String(chapter?.title || '').trim(),
    synopsis: String(chapter?.synopsis || '').trim(),
    conflict: String(chapter?.conflict || '').trim(),
    turningPoint: String(chapter?.turningPoint || '').trim(),
    emotionalTone: String(chapter?.emotionalTone || '').trim(),
    endingHook: String(chapter?.endingHook || '').trim(),
    scenes: ensureArray(chapter?.scenes)
      .map((scene: any) => ({
        location: String(scene?.location || '').trim(),
        description: String(scene?.description || '').trim(),
      }))
      .filter((scene: any) => scene.location || scene.description),
    charactersInvolved: ensureArray(chapter?.charactersInvolved).map(stringifyField).map(item => item.trim()).filter(Boolean),
  })),
});

const normalizeChapterContentForSave = (data: any) => ({
  title: String(data?.title || '').trim(),
  summary: String(data?.summary || '').trim(),
  content: String(data?.content || ''),
});

const fieldStyle: React.CSSProperties = { marginBottom: 10 };
const rowStyle: React.CSSProperties = {
  padding: 12,
  border: '1px solid rgba(99,102,241,0.16)',
  borderRadius: 6,
  background: 'rgba(15,23,42,0.38)',
  marginTop: 10,
};

const InlineDirectEditor: React.FC<{
  phase: string;
  data: any;
  onChange: (data: any) => void;
  fallback: boolean;
  fallbackText: string;
  onFallbackTextChange: (text: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isMobile: boolean;
}> = ({ phase, data, onChange, fallback, fallbackText, onFallbackTextChange, saving, onSave, onCancel, isMobile }) => {
  const setField = (key: string, value: any) => onChange({ ...(data || {}), [key]: value });
  const list = (key: string) => ensureArray(data?.[key]);
  const setListItem = (key: string, index: number, value: any) => {
    const next = [...list(key)];
    next[index] = value;
    setField(key, next);
  };
  const removeListItem = (key: string, index: number) => {
    setField(key, list(key).filter((_, i) => i !== index));
  };
  const addListItem = (key: string, value: any) => setField(key, [...list(key), value]);
  const setNested = (key: string, index: number, field: string, value: any) => {
    const next = [...list(key)];
    next[index] = { ...(next[index] || {}), [field]: value };
    setField(key, next);
  };
  const panelTitle = {
    outline: '编辑整书大纲',
    characters: '编辑人物设定',
    chapters_outline: '编辑章节大纲',
    chapter_content: '编辑章节正文',
  }[phase] || '编辑内容';

  return (
    <div style={{
      padding: isMobile ? 4 : 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Text strong style={{ color: '#e2e8f0' }}>{panelTitle}</Text>
        <Space>
          <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving}>保存</Button>
        </Space>
      </div>

      {fallback ? (
        <TextArea
          value={fallbackText}
          onChange={e => onFallbackTextChange(e.target.value)}
          rows={18}
          style={{ fontFamily: phase === 'chapter_content' ? 'inherit' : 'var(--font-mono)', fontSize: phase === 'chapter_content' ? 15 : 13 }}
        />
      ) : phase === 'outline' ? (
        <div>
          <Input value={data?.title} onChange={e => setField('title', e.target.value)} placeholder="标题" style={fieldStyle} maxLength={200} />
          <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
            <Input value={data?.genre} onChange={e => setField('genre', e.target.value)} placeholder="类型" maxLength={100} />
            <InputNumber value={data?.chapterCount} onChange={value => setField('chapterCount', value || 0)} placeholder="章节数" min={0} precision={0} style={{ width: 120 }} />
          </Space.Compact>
          <Input value={data?.theme} onChange={e => setField('theme', e.target.value)} placeholder="主题" style={fieldStyle} maxLength={200} />
          <TextArea value={data?.setting} onChange={e => setField('setting', e.target.value)} placeholder="世界观/设定" rows={3} style={fieldStyle} maxLength={12000} />
          <TextArea value={data?.mainPlot} onChange={e => setField('mainPlot', e.target.value)} placeholder="主线剧情" rows={3} style={fieldStyle} maxLength={12000} />
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>支线</Text>
          {list('subPlots').map((plot: string, index: number) => (
            <Space.Compact key={index} style={{ width: '100%', marginTop: 6 }}>
              <Input value={plot} onChange={e => setListItem('subPlots', index, e.target.value)} placeholder={`支线 ${index + 1}`} maxLength={2000} />
              <Button icon={<DeleteOutlined />} onClick={() => removeListItem('subPlots', index)} />
            </Space.Compact>
          ))}
          <Button size="small" icon={<PlusOutlined />} onClick={() => addListItem('subPlots', '')} style={{ marginTop: 8 }}>添加支线</Button>
        </div>
      ) : phase === 'characters' ? (
        <div>
          {list('characters').map((char: any, index: number) => (
            <div key={index} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <Text strong style={{ color: '#c7d2fe' }}>角色 {index + 1}</Text>
                <Button size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('characters', index)}>删除</Button>
              </div>
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input value={char.name} onChange={e => setNested('characters', index, 'name', e.target.value)} placeholder="姓名" maxLength={100} />
                <Input value={char.age} onChange={e => setNested('characters', index, 'age', e.target.value)} placeholder="年龄" maxLength={30} />
                <Input value={char.gender} onChange={e => setNested('characters', index, 'gender', e.target.value)} placeholder="性别" maxLength={10} />
                <Input value={char.role} onChange={e => setNested('characters', index, 'role', e.target.value)} placeholder="定位" maxLength={50} />
              </Space.Compact>
              <TextArea value={char.appearance} onChange={e => setNested('characters', index, 'appearance', e.target.value)} placeholder="外貌" rows={2} style={fieldStyle} maxLength={4000} />
              <TextArea value={char.personality} onChange={e => setNested('characters', index, 'personality', e.target.value)} placeholder="性格" rows={2} style={fieldStyle} maxLength={4000} />
              <TextArea value={char.background} onChange={e => setNested('characters', index, 'background', e.target.value)} placeholder="背景" rows={2} style={fieldStyle} maxLength={4000} />
              <TextArea value={char.motivation} onChange={e => setNested('characters', index, 'motivation', e.target.value)} placeholder="动机" rows={2} style={fieldStyle} maxLength={4000} />
              <TextArea value={char.arc} onChange={e => setNested('characters', index, 'arc', e.target.value)} placeholder="成长弧" rows={2} style={fieldStyle} maxLength={4000} />
              <TextArea value={char.relationships} onChange={e => setNested('characters', index, 'relationships', e.target.value)} placeholder="关系，可填 JSON 数组或逐行文本" rows={2} />
            </div>
          ))}
          <Button icon={<PlusOutlined />} onClick={() => addListItem('characters', { name: '', age: '', gender: '', role: '', appearance: '', personality: '', background: '', motivation: '', arc: '', relationships: '[]' })} style={{ marginTop: 10 }}>添加角色</Button>
        </div>
      ) : phase === 'chapters_outline' ? (
        <div>
          {list('chapters').map((chapter: any, index: number) => (
            <div key={index} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <Text strong style={{ color: '#c7d2fe' }}>章节 {index + 1}</Text>
                <Button size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('chapters', index)}>删除</Button>
              </div>
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <InputNumber value={chapter.chapter} onChange={value => setNested('chapters', index, 'chapter', value || 0)} min={1} precision={0} style={{ width: 120 }} />
                <Input value={chapter.title} onChange={e => setNested('chapters', index, 'title', e.target.value)} placeholder="章节标题" maxLength={200} />
              </Space.Compact>
              <TextArea value={chapter.synopsis} onChange={e => setNested('chapters', index, 'synopsis', e.target.value)} placeholder="简介/梗概" rows={2} style={fieldStyle} maxLength={8000} />
              <TextArea value={chapter.conflict} onChange={e => setNested('chapters', index, 'conflict', e.target.value)} placeholder="核心冲突" rows={2} style={fieldStyle} maxLength={4000} />
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input value={chapter.turningPoint} onChange={e => setNested('chapters', index, 'turningPoint', e.target.value)} placeholder="转折点" maxLength={2000} />
                <Input value={chapter.emotionalTone} onChange={e => setNested('chapters', index, 'emotionalTone', e.target.value)} placeholder="情绪基调" maxLength={100} />
              </Space.Compact>
              <Input value={chapter.endingHook} onChange={e => setNested('chapters', index, 'endingHook', e.target.value)} placeholder="结尾钩子" style={fieldStyle} maxLength={2000} />
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>场景</Text>
              {ensureArray(chapter.scenes).map((scene: any, sceneIndex: number) => (
                <Space.Compact key={sceneIndex} style={{ width: '100%', marginTop: 6 }}>
                  <Input value={scene.location} onChange={e => {
                    const scenes = [...ensureArray(chapter.scenes)];
                    scenes[sceneIndex] = { ...(scenes[sceneIndex] || {}), location: e.target.value };
                    setNested('chapters', index, 'scenes', scenes);
                  }} placeholder="地点" maxLength={200} />
                  <Input value={scene.description} onChange={e => {
                    const scenes = [...ensureArray(chapter.scenes)];
                    scenes[sceneIndex] = { ...(scenes[sceneIndex] || {}), description: e.target.value };
                    setNested('chapters', index, 'scenes', scenes);
                  }} placeholder="描述" maxLength={2000} />
                  <Button icon={<DeleteOutlined />} onClick={() => {
                    const scenes = ensureArray(chapter.scenes).filter((_, i) => i !== sceneIndex);
                    setNested('chapters', index, 'scenes', scenes);
                  }} />
                </Space.Compact>
              ))}
              <Button size="small" icon={<PlusOutlined />} onClick={() => setNested('chapters', index, 'scenes', [...ensureArray(chapter.scenes), { location: '', description: '' }])} style={{ marginTop: 8 }}>添加场景</Button>
              <div style={{ marginTop: 10 }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>出场人物</Text>
                {ensureArray(chapter.charactersInvolved).map((name: string, nameIndex: number) => (
                  <Space.Compact key={nameIndex} style={{ width: '100%', marginTop: 6 }}>
                    <Input value={name} onChange={e => {
                      const names = [...ensureArray(chapter.charactersInvolved)];
                      names[nameIndex] = e.target.value;
                      setNested('chapters', index, 'charactersInvolved', names);
                    }} placeholder="人物名称" maxLength={100} />
                    <Button icon={<DeleteOutlined />} onClick={() => {
                      const names = ensureArray(chapter.charactersInvolved).filter((_, i) => i !== nameIndex);
                      setNested('chapters', index, 'charactersInvolved', names);
                    }} />
                  </Space.Compact>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => setNested('chapters', index, 'charactersInvolved', [...ensureArray(chapter.charactersInvolved), ''])} style={{ marginTop: 8 }}>添加人物</Button>
              </div>
            </div>
          ))}
          <Button icon={<PlusOutlined />} onClick={() => addListItem('chapters', { chapter: list('chapters').length + 1, title: '', synopsis: '', conflict: '', turningPoint: '', emotionalTone: '', endingHook: '', scenes: [], charactersInvolved: [] })} style={{ marginTop: 10 }}>添加章节</Button>
        </div>
      ) : (
        <div>
          <Input value={data?.title} onChange={e => setField('title', e.target.value)} placeholder="章节标题" style={fieldStyle} maxLength={200} />
          <TextArea value={data?.summary} onChange={e => setField('summary', e.target.value)} placeholder="章节摘要" rows={2} style={fieldStyle} maxLength={4000} />
          <TextArea value={data?.content} onChange={e => setField('content', e.target.value)} placeholder="章节正文" rows={20} maxLength={200000} />
        </div>
      )}
    </div>
  );
};

// ====== 带导出按钮的卡片（用于大纲/人物/章纲阶段） ======
const ActionCard: React.FC<{
  title: string; children: React.ReactNode;
  onRegenerate: () => void; onEdit: () => void; onChat: () => void; onStop?: () => void;
  isChatting: boolean; isStreaming: boolean;
  novelId: number; chapterCount?: number;
}> = ({ title, children, onRegenerate, onEdit, onChat, onStop, isChatting, isStreaming, novelId, chapterCount = 0 }) => (
  <Card
    title={title}
    style={{ marginTop: 16 }}
    extra={
      <Space>
        {isStreaming && onStop && (
          <Button size="small" icon={<PauseCircleOutlined />} onClick={onStop} danger>停止生成</Button>
        )}
        <Popconfirm title="确认重新生成？当前内容将被覆盖。" onConfirm={onRegenerate} okText="确认" cancelText="取消" disabled={isStreaming}>
          <Button size="small" icon={<ReloadOutlined />} disabled={isStreaming} loading={isStreaming}>重新生成</Button>
        </Popconfirm>
        <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={isStreaming}>编辑</Button>
        <Button size="small" icon={<RobotOutlined />} onClick={onChat} loading={isChatting} disabled={isStreaming}>AI 修订</Button>
        <ExportButton novelId={novelId} variant="cardAction" chapterCount={chapterCount} />
      </Space>
    }
  >
    {children}
  </Card>
);

// ====== 章节卡片（外层仅保留全文导出） ======
const ChapterCard: React.FC<{
  title: React.ReactNode; children: React.ReactNode;
  novelId: number; chapterCount: number;
}> = ({ title, children, novelId, chapterCount }) => (
  <Card
    title={title}
    style={{ marginTop: 16 }}
    extra={
      <ExportButton novelId={novelId} variant="cardAction" chapterCount={chapterCount} />
    }
  >
    {children}
  </Card>
);

export default NovelPage;
