import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Steps, Button, Input, Typography, App, Space, Card, List, Tag, Modal, Popconfirm, Collapse, Badge } from 'antd';
import { PlayCircleOutlined, ArrowLeftOutlined, EditOutlined, SendOutlined, RobotOutlined, ReloadOutlined, WarningOutlined, NodeIndexOutlined, AuditOutlined } from '@ant-design/icons';
import { getNovelApi } from '../api/novels';
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = parseInt(id!, 10);

  const store = useNovelStore();
  const {
    currentNovel, outline, characters, chapterOutlines, chapters,
    streamText, isStreaming, currentStep,
    reviewResults, extractionResults,
    setNovel, setOutline, setCharacters, setChapterOutlines, setChapters,
    appendStreamText, setStreamText, setIsStreaming, setCurrentStep,
    appendChapterOutlines,
    setReviewResult, setExtractionResult,
  } = store;

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
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  // AI 修订
  const [chatPhase, setChatPhase] = useState<string | null>(null);
  const [chatFeedback, setChatFeedback] = useState('');
  const [chatStream, setChatStream] = useState('');
  const [chatting, setChatting] = useState(false);
  const [chatDone, setChatDone] = useState(false);
  const [chatChapter, setChatChapter] = useState<number | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatResultRef = useRef<any>(null);

  // 审查报告弹窗
  const [reviewReportVisible, setReviewReportVisible] = useState(false);
  const [reviewReportData, setReviewReportData] = useState<{ chapterNumber: number; issues: any[]; summary: string } | null>(null);

  // 数据提取报告弹窗
  const [extractionReportVisible, setExtractionReportVisible] = useState(false);
  const [extractionReportData, setExtractionReportData] = useState<any>(null);

  // 章节大纲分段生成状态
  const [nextBatchStart, setNextBatchStart] = useState<number | null>(null);
  const [totalChapters, setTotalChapters] = useState<number>(0);

  // 自动模式：用 ref 追踪避免闭包过期（SSE 事件处理器捕获的是旧渲染周期的值）
  const [autoOutlines, _setAutoOutlines] = useState(false);
  const [autoWriting, _setAutoWriting] = useState(false);
  const [autoPaused, _setAutoPaused] = useState(false);
  const [autoTargetChapter, setAutoTargetChapter] = useState<number | null>(null);
  const autoOutlinesRef = useRef(false);
  const autoWritingRef = useRef(false);
  const autoPauseRef = useRef(false);

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
      activeNovelIdRef.current = novelId;
    }
    loadNovel();
    // 组件卸载时清理：中止流式操作并重置 store 中的流式状态
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      setAutoOutlines(false);
      setAutoWriting(false);
      setAutoPaused(false);
      // 安全清理 store 中的流式状态，防止残留状态影响其他页面
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

  const loadNovel = async () => {
    setLoading(true);
    try {
      const { novel } = await getNovelApi(novelId);
      setNovel(novel);
      if (novel.current_step >= 1) setUserInputSet(true);
      // 根据已有数据设置 viewStep
      const step = novel.current_step || 0;
      setViewStep(step > 0 ? step - 1 : 0); // current_step 是 1-indexed，viewStep 是 0-indexed
    } catch {
      message.error('加载小说失败');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
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
      case 'progress': message.info(data.message); break;
      case 'chunk': appendStreamText(data.text || ''); break;
      case 'context_brief':
        // 写作任务书生成完毕（Step 1），显示提示
        if (data.brief) message.success('写作任务书已生成，正在起草正文...');
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
      case 'polish_done':
        // 润色完成（Step 4）
        message.success(data.message || '润色完成');
        break;
      case 'model_fallback':
        // 模型回退通知
        message.warning(data.message || `模型已回退：${data.preferredModel || '首选'} → ${data.actualModel || '备选'}`);
        break;
      case 'result': {
        // 写章阶段 result 不清除文本也不停止流（后续还有审查/润色/提取步骤）
        if (!data.chapter) {
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
          updated.push({
            chapter_number: data.chapter.chapterNumber, title: data.chapter.title,
            content: data.chapter.content, summary: data.chapter.summary,
            status: 'completed' as const, word_count: data.chapter.wordCount,
          });
          setChapters(updated);
          setCurrentStep(4);
          setViewStep(STEP.WRITING);
        }
        // 在 result 事件中不显示成功提示，统一在 done 事件中显示
        break;
      }
      case 'done':
        setIsStreaming(false);
        // 写章完成后重新加载小说数据，同步标题/字数等到前端
        if (data.chapter || data.phase === 'write_chapter') {
          getNovelApi(novelId).then(({ novel }) => {
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
          getNovelApi(novelId).then(({ novel }) => { if (activeNovelIdRef.current === novelId) setNovel(novel); }).catch(() => {});
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
              message.success('全部章节写作已完成');
            }
          }, 300);
        } else if (!autoOutlinesRef.current && !autoWritingRef.current && data.phase !== 'review' && data.phase !== 'extract') {
          // 非自动模式下且非审查/提取操作，显示通用成功提示
          message.success('生成完成');
        }
        break;
      case 'error':
        setIsStreaming(false); setStreamText(''); setNextBatchStart(null);
        setAutoOutlines(false); setAutoWriting(false);
        message.error(data.message || '生成失败'); break;
    }
  };

  // ====== Steps 点击 ======
  const handleStepClick = (step: number) => {
    if (!stepHasContent(step)) return;
    setViewStep(step);
    setCurrentStep(step + 1);
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
    abortRef.current = startOutlineStream(novelId, prompt, handleSSEEvent);
  };
  const startPhase2 = () => {
    abortRef.current?.abort();
    setStreamText(''); setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startCharactersStream(novelId, handleSSEEvent);
  };
  const startPhase3 = (startChapter?: number, autoMode?: boolean) => {
    abortRef.current?.abort();
    setStreamText(''); setIsStreaming(true);
    setNextBatchStart(null);
    if (autoMode) { setAutoOutlines(true); setAutoPaused(false); }
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startChapterOutlinesStream(novelId, handleSSEEvent, startChapter, autoMode);
  };
  const startPhase4 = (cn: number, autoMode?: boolean) => {
    abortRef.current?.abort();
    setStreamText(''); setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startWriteChapterStream(novelId, cn, handleSSEEvent, autoMode);
  };
  const startReview = (cn: number) => {
    if (isStreaming) { message.warning('请等待当前操作完成'); return; }
    abortRef.current?.abort();
    setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startReviewStream(novelId, cn, handleSSEEvent);
  };
  const startExtract = (cn: number) => {
    if (isStreaming) { message.warning('请等待当前操作完成'); return; }
    abortRef.current?.abort();
    setIsStreaming(true);
    activeNovelIdRef.current = novelId;
    useNovelStore.getState().setActiveNovelId(novelId);
    abortRef.current = startExtractStream(novelId, cn, handleSSEEvent);
  };

  // ====== 编辑 ======
  const openEditor = (phase: string, content: any) => {
    setEditingPhase(phase);
    setEditText(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  };

  // 构建所有可搜索部分的列表（供 SearchEdit 跨部分跳转使用）
  const buildSearchSections = useCallback((): SearchSection[] => {
    const secs: SearchSection[] = [];
    // 大纲
    if (outline) {
      secs.push({ phase: 'outline', label: '整书大纲', content: JSON.stringify(outline, null, 2) });
    }
    // 人物设定
    if (characters.length > 0) {
      secs.push({ phase: 'characters', label: '人物设定', content: JSON.stringify({ characters }, null, 2) });
    }
    // 章节大纲
    if (chapterOutlines.length > 0) {
      secs.push({ phase: 'chapters_outline', label: '章节大纲', content: JSON.stringify({ chapters: chapterOutlines }, null, 2) });
    }
    // 各章节正文
    chapters.forEach(ch => {
      if (ch.content) {
        secs.push({
          phase: 'chapter_content',
          chapterNumber: ch.chapter_number,
          label: `第${ch.chapter_number}章 ${ch.title || ''}`,
          content: ch.content,
        });
      }
    });
    return secs;
  }, [outline, characters, chapterOutlines, chapters]);
  const handleSaveEdit = async () => {
    if (!editingPhase) return;
    setSaving(true);
    try {
      // 关键修复：将 JSON 字符串解析为对象后再发送
      let parsedContent = editText;
      if (editingPhase === 'outline' || editingPhase === 'characters' || editingPhase === 'chapters_outline') {
        try {
          parsedContent = JSON.parse(editText);
        } catch (e) {
          message.error('数据格式错误，请检查 JSON 格式');
          setSaving(false);
          return;
        }
      }
      await client.put(`/novels/${novelId}/save`, { phase: editingPhase, content: parsedContent, chapterNumber: chatChapter });
      message.success('保存成功'); setEditingPhase(null); loadNovel();
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  // ====== AI 修订 ======
  const openChat = (phase: string, chapterNum?: number) => {
    setChatPhase(phase); setChatChapter(chapterNum || null);
    setChatFeedback(''); setChatStream(''); setChatDone(false);
    chatResultRef.current = null;
  };
  const handleConfirmRevision = async () => {
    setChatting(true);
    try {
      const phaseKey = chatPhase === 'chapter_content' ? 'write_chapter' : chatPhase;
      const chTitle = chatChapter ? chapters.find(c => c.chapter_number === chatChapter)?.title || '' : '';
      const rawContent = chatResultRef.current || chatStream;
      let content: any = rawContent;
      if (phaseKey !== 'write_chapter' && typeof rawContent === 'string') {
        try { content = JSON.parse(rawContent); } catch { /* 非JSON文本则原样传递 */ }
      }
      await client.put(`/novels/${novelId}/save`, {
        phase: phaseKey === 'write_chapter' ? 'chapter_content' : phaseKey,
        content, chapterNumber: chatChapter, title: chTitle,
      });
      message.success('修订已更新'); setChatPhase(null); loadNovel();
    } catch { message.error('更新失败'); }
    finally { setChatting(false); }
  };
  const handleChatSend = () => {
    if (!chatFeedback.trim() || !chatPhase) return;
    setChatStream(''); setChatting(true);
    let currentContent: any = '';
    if (chatPhase === 'outline') currentContent = outline || { title: currentNovel?.title };
    else if (chatPhase === 'characters') currentContent = { characters };
    else if (chatPhase === 'chapters_outline') currentContent = { chapters: chapterOutlines };
    else if (chatPhase === 'chapter_content') {
      const ch = chapters.find(c => c.chapter_number === chatChapter);
      currentContent = ch?.content || '';
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;
    fetch(`/api/novels/${novelId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ phase: chatPhase === 'chapter_content' ? 'write_chapter' : chatPhase, chapterNumber: chatChapter, currentContent, feedback: chatFeedback }),
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
        setChatting(false);
        return;
      }
      readSSE(response);
    }).catch(() => { setChatting(false); });
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
            if (currentEvent === 'chunk' || !currentEvent) setChatStream(s => s + (data.text || ''));
            else if (currentEvent === 'progress') message.info(data.message);
            else if (currentEvent === 'error') { message.error(data.message); setChatting(false); }
            else if (currentEvent === 'done') { setChatting(false); setChatDone(true); }
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

      {/* 流式输出 */}
      {(isStreaming || streamText) && <StreamOutput text={streamText} isStreaming={isStreaming} />}

      {/* ====== 整书大纲 ====== */}
      {userInputSet && viewStep === STEP.OUTLINE && (
        <ActionCard title="整书大纲" onRegenerate={startPhase1} onEdit={() => openEditor('outline', outline || { title: currentNovel?.title, genre: currentNovel?.genre, theme: currentNovel?.theme, setting: currentNovel?.setting, mainPlot: currentNovel?.main_plot, subPlots: currentNovel?.sub_plots, chapterCount: currentNovel?.chapter_count })} onChat={() => openChat('outline')} isStreaming={isStreaming} isChatting={chatPhase === 'outline' && chatting} novelId={novelId} chapterCount={chapters.filter(c => !!c.content).length}>
          <OutlineView outline={outline || { title: currentNovel?.title, genre: currentNovel?.genre, theme: currentNovel?.theme, setting: currentNovel?.setting, mainPlot: currentNovel?.main_plot, subPlots: currentNovel?.sub_plots, chapterCount: currentNovel?.chapter_count }} />
          {!isStreaming && <Button type="primary" onClick={startPhase2} style={{ marginTop: 16 }}>生成人物设定</Button>}
        </ActionCard>
      )}

      {/* ====== 人物设定 ====== */}
      {viewStep === STEP.CHARACTERS && characters.length > 0 && (
        <ActionCard title="人物设定" onRegenerate={startPhase2} onEdit={() => openEditor('characters', { characters })} onChat={() => openChat('characters')} isStreaming={isStreaming} isChatting={chatPhase === 'characters' && chatting} novelId={novelId} chapterCount={chapters.filter(c => !!c.content).length}>
          <CharacterList characters={characters} />
          {!isStreaming && <Button type="primary" onClick={() => startPhase3(1, true)} style={{ marginTop: 16 }}>一键生成全部章节大纲</Button>}
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
                <Popconfirm title="确认重新生成？当前内容将被覆盖。" onConfirm={() => startPhase3()} okText="确认" cancelText="取消" disabled={isStreaming}>
                  <Button size="small" icon={<ReloadOutlined />} disabled={isStreaming} loading={isStreaming}>重新生成</Button>
                </Popconfirm>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditor('chapters_outline', { chapters: chapterOutlines })} disabled={isStreaming}>编辑</Button>
                <Button size="small" icon={<RobotOutlined />} onClick={() => openChat('chapters_outline')} loading={chatPhase === 'chapters_outline' && chatting} disabled={isStreaming}>AI 修订</Button>
              </Space>
            }
          >
            <ChapterOutlineList
              chapters={chapterOutlines}
              onWriteChapter={(chNum: number) => {
                setViewStep(STEP.WRITING);
                setCurrentStep(4);
                startPhase4(chNum);
              }}
              writtenChapterNumbers={new Set(chapters.filter((c: Chapter) => !!c.content).map((c: Chapter) => c.chapter_number))}
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
          {chapters.filter((c: Chapter) => !!c.content).map((ch: Chapter) => (
            <ChapterCard
              key={ch.chapter_number}
              title={`第${ch.chapter_number}章 ${ch.title}`}
              novelId={novelId}
              chapterCount={chapters.filter(c => !!c.content).length}
            >
              <ChapterContent chapter={ch} novelId={novelId}
                reviewResult={reviewResults[ch.chapter_number] || null}
                extractionResult={extractionResults[ch.chapter_number] || null}
                onRegenerate={() => startPhase4(ch.chapter_number)}
                onEdit={() => openEditor('chapter_content', ch.content || '')}
                onChat={() => openChat('chapter_content', ch.chapter_number)}
                onReview={() => startReview(ch.chapter_number)}
                onExtract={() => startExtract(ch.chapter_number)}
                isStreaming={isStreaming}
                isChatting={chatPhase === 'chapter_content' && chatChapter === ch.chapter_number && chatting}
              />
            </ChapterCard>
          ))}

          {/* 未写章节 — 一键自动写作 */}
          {chapterOutlines.length > 0 && !isStreaming && (() => {
            const st = useNovelStore.getState();
            const unwritten = st.chapterOutlines.filter((ch: any) => !st.chapters.find((c: Chapter) => (c.chapter_number === (ch.chapter || ch.chapter_number)) && !!c.content));
            const total = st.chapterOutlines.length;
            const written = total - unwritten.length;
            if (unwritten.length === 0 && !autoWriting) return null;
            return (
              <Card
                title={autoWriting ? (autoPaused ? '⏸ 已暂停' : `🔄 自动写作中...（${written}/${total}）`) : `待写作章节（${unwritten.length}章）`}
                style={{ marginTop: 16 }}
                extra={
                  <Space>
                    {autoWriting ? (
                      <>
                        <Button size="small" onClick={() => setAutoPaused(!autoPaused)}>
                          {autoPaused ? '继续' : '暂停'}
                        </Button>
                        <Button size="small" danger onClick={() => { setAutoWriting(false); setAutoPaused(false); abortRef.current?.abort(); }}>停止</Button>
                      </>
                    ) : unwritten.length > 0 ? (
                      <Button size="small" type="primary" onClick={() => {
                        setAutoWriting(true); setAutoPaused(false);
                        startPhase4(unwritten[0].chapter || unwritten[0].chapter_number, true);
                      }}>一键写作全部章节</Button>
                    ) : null}
                  </Space>
                }
              >
                <List size="small" dataSource={unwritten} renderItem={(ch: any) => {
                  const chNum = ch.chapter || ch.chapter_number;
                  return (
                    <List.Item
                      style={{ cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      onClick={() => startPhase4(chNum)}
                      extra={
                        <Button size="small" type="link" icon={<PlayCircleOutlined />}
                          onClick={(e) => { e.stopPropagation(); startPhase4(chNum); }}>
                          写此章
                        </Button>
                      }
                    >
                      <Tag color="blue">第{chNum}章</Tag><Text>{ch.title}</Text>
                    </List.Item>
                  );
                }} />
              </Card>
            );
          })()}
        </div>
      )}

      {/* ====== 编辑弹窗（带搜索定位 + 跨部分跳转） ====== */}
      <Modal title="直接编辑" open={!!editingPhase} onOk={handleSaveEdit} onCancel={() => setEditingPhase(null)} okText="保存" confirmLoading={saving} width={700}>
        <SearchEdit
          value={editText}
          onChange={setEditText}
          monospace={editingPhase !== 'chapter_content'}
          sections={buildSearchSections()}
          currentSection={editingPhase || ''}
          currentChapter={chatChapter || undefined}
          onNavigateSection={(sec, _searchTerm) => {
            const content = sec.phase === 'chapter_content'
              ? (chapters.find(c => c.chapter_number === sec.chapterNumber)?.content || '')
              : sec.content;
            openEditor(sec.phase, content);
            if (sec.chapterNumber) setChatChapter(sec.chapterNumber);
          }}
        />
      </Modal>

      {/* ====== 审查报告弹窗 ====== */}
      <Modal
        title={<Space><AuditOutlined /> 审查报告（第{reviewReportData?.chapterNumber}章）</Space>}
        open={reviewReportVisible}
        onCancel={() => setReviewReportVisible(false)}
        footer={<Button type="primary" onClick={() => setReviewReportVisible(false)}>确定</Button>}
        width={700}
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
        width={700}
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

      {/* ====== AI 修订弹窗 ====== */}
      <Modal
        title={<span><RobotOutlined /> AI 修订助手</span>}
        open={!!chatPhase}
        onCancel={() => { setChatPhase(null); chatAbortRef.current?.abort(); }}
        footer={chatDone ? [
          <Button key="cancel" onClick={() => setChatPhase(null)}>取消</Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmRevision} loading={chatting}>确定更新</Button>,
        ] : null}
        width={600}
      >
        <Paragraph style={{ color: '#94a3b8' }}>对当前内容不满意？告诉 AI 你想怎么修改。</Paragraph>
        {chatStream && (
          <div style={{ maxHeight: 300, overflow: 'auto', padding: 12, background: 'rgba(15,23,42,0.85)', borderRadius: 8, marginBottom: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: '#e2e8f0', border: '1px solid rgba(99,102,241,0.15)' }}>
            {chatStream}{chatting && <span className="stream-cursor" />}
          </div>
        )}
        {!chatDone && (
          <Space.Compact style={{ width: '100%' }}>
            <TextArea value={chatFeedback} onChange={e => setChatFeedback(e.target.value)}
              placeholder="例如：让主角的性格更加冷酷，增加一个神秘配角..." rows={2}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleChatSend(); } }} disabled={chatting} />
            <Button type="primary" icon={<SendOutlined />} onClick={handleChatSend} loading={chatting} style={{ height: 'auto' }}>发送</Button>
          </Space.Compact>
        )}
        {chatting && <Text style={{ color: '#94a3b8', display: 'block', marginTop: 8 }}>AI 正在修订中...</Text>}
        {chatDone && !chatting && <Text style={{ color: '#34d399', display: 'block', marginTop: 8 }}>修订完成，点击「确定更新」保存，或关闭继续修改。</Text>}
      </Modal>

    </div>
  );
};

// ====== 带搜索定位的编辑框（支持跨部分跳转） ======
interface SearchSection {
  phase: string;          // outline / characters / chapters_outline / chapter_content
  chapterNumber?: number;
  label: string;
  content: string;
}

const SearchEdit: React.FC<{
  value: string; onChange: (v: string) => void; monospace?: boolean;
  sections: SearchSection[];
  currentSection: string;
  currentChapter?: number;
  onNavigateSection: (section: SearchSection, searchTerm: string) => void;
}> = ({ value, onChange, monospace, sections, currentSection, currentChapter, onNavigateSection }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [matches, setMatches] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [noMoreMsg, setNoMoreMsg] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef({ term: '', sections: [] as SearchSection[], pending: false });

  // 收集文本中所有匹配位置
  const collectMatches = (text: string, term: string) => {
    const idxs: number[] = [];
    let pos = 0;
    const lower = text.toLowerCase();
    const t = term.toLowerCase();
    while ((pos = lower.indexOf(t, pos)) !== -1) { idxs.push(pos); pos += t.length; }
    return idxs;
  };

  // 在所有部分中查找匹配
  const findInSections = (term: string, secs: SearchSection[]) =>
    secs.map(s => {
      const indices = collectMatches(s.content || '', term);
      return { section: s, matchCount: indices.length, indices };
    }).filter(s => s.matchCount > 0);

  const doSearch = (term?: string) => {
    const t = term || searchTerm;
    if (!t || !textareaRef.current) return;
    const text = textareaRef.current.value;
    const idxs = collectMatches(text, t);
    setMatches(idxs);
    setNoMoreMsg('');
    searchRef.current = { term: t, sections, pending: false };

    if (idxs.length > 0) {
      setCurrentMatch(1);
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(idxs[0], idxs[0] + t.length);
    }
  };

  // value 变化时：如果是跨部分跳转触发，自动在新内容中搜索
  useEffect(() => {
    if (searchRef.current.pending && searchRef.current.term) {
      // 等 DOM 更新后再执行搜索
      const timer = setTimeout(() => doSearch(searchRef.current.term), 50);
      return () => clearTimeout(timer);
    }
    setMatches([]);
    setCurrentMatch(0);
    setNoMoreMsg('');
  }, [value]);

  const goToMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;

    const nextIdx = currentMatch - 1 + dir;
    // 当前部分内还有匹配 → 正常导航
    if (nextIdx >= 0 && nextIdx < matches.length) {
      const next = nextIdx + 1;
      setCurrentMatch(next);
      const pos = matches[next - 1];
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(pos, pos + searchTerm.length); }
      setNoMoreMsg('');
      return;
    }

    // 当前部分无更多匹配 → 查找相邻部分
    const term = searchRef.current.term;
    if (!term) return;
    const allSecs = sections.length > 0 ? sections : searchRef.current.sections;
    if (allSecs.length <= 1) {
      setNoMoreMsg('没有其他部分可搜索');
      return;
    }

    const results = findInSections(term, allSecs);
    if (results.length === 0) {
      setNoMoreMsg('所有部分均无匹配');
      return;
    }

    // 找到当前部分在结果中的索引
    const curResultIdx = results.findIndex(r =>
      r.section.phase === currentSection &&
      (r.section.phase !== 'chapter_content' || r.section.chapterNumber === (currentChapter || r.section.chapterNumber))
    );

    // 当前部分无匹配或不在结果中
    let targetIdx: number;
    if (curResultIdx === -1) {
      targetIdx = dir === 1 ? 0 : results.length - 1;
    } else {
      targetIdx = curResultIdx + dir;
    }

    if (targetIdx >= 0 && targetIdx < results.length) {
      const target = results[targetIdx];
      setNoMoreMsg(`已跳转至「${target.section.label}」（${target.matchCount} 处匹配）`);
      // 标记为待搜索
      searchRef.current.pending = true;
      // 触发跳转，同时传递搜索词
      onNavigateSection(target.section, term);
    } else {
      setNoMoreMsg(dir === 1 ? '已搜索完全部内容，无更多匹配' : '已是第一处，无更多匹配');
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        <Input size="small" placeholder="搜索..." value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setNoMoreMsg(''); }}
          onPressEnter={() => doSearch()}
          style={{ width: 160 }} />
        <Button size="small" onClick={() => doSearch()}>查找</Button>
        {matches.length > 0 && (
          <>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>{currentMatch}/{matches.length}</Text>
            <Button size="small" onClick={() => goToMatch(-1)} title="上一处">▲</Button>
            <Button size="small" onClick={() => goToMatch(1)} title="下一处（无更多则跳转）">▼</Button>
          </>
        )}
        {matches.length === 0 && searchRef.current.term && (
          <Text style={{ color: '#f87171', fontSize: 12 }}>当前部分无匹配</Text>
        )}
        {noMoreMsg && (
          <Text style={{ color: matches.length === 0 ? '#fbbf24' : '#6366f1', fontSize: 11 }}>{noMoreMsg}</Text>
        )}
      </Space>
      <textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)} rows={18}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9',
          fontFamily: monospace ? 'monospace' : 'inherit', fontSize: monospace ? 13 : 15,
          lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box',
          outline: 'none', transition: 'border-color 0.3s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#4096ff'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(5,145,255,0.1)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.boxShadow = 'none'; }}
      />
    </div>
  );
};

// ====== 带导出按钮的卡片（用于大纲/人物/章纲阶段） ======
const ActionCard: React.FC<{
  title: string; children: React.ReactNode;
  onRegenerate: () => void; onEdit: () => void; onChat: () => void;
  isChatting: boolean; isStreaming: boolean;
  novelId: number; chapterCount?: number;
}> = ({ title, children, onRegenerate, onEdit, onChat, isChatting, isStreaming, novelId, chapterCount = 0 }) => (
  <Card
    title={title}
    style={{ marginTop: 16 }}
    extra={
      <Space>
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
