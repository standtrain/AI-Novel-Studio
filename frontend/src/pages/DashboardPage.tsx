import React, { useEffect, useState, useRef } from 'react';
import { Row, Col, Button, Modal, Form, Input, Typography, message, Empty, Card, Tabs, Alert, Descriptions, Tag, Divider, Space, Progress, List } from 'antd';
import { PlusOutlined, BookOutlined, EditOutlined, ExclamationCircleOutlined, ImportOutlined, UploadOutlined, FileTextOutlined, CodeOutlined, ThunderboltOutlined, LoadingOutlined, CheckCircleOutlined, MessageOutlined, SearchOutlined, BulbOutlined, RobotOutlined, RocketOutlined, EnterOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import NovelCard from '../components/novel/NovelCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { listNovelsApi, createNovelApi, deleteNovelApi, importNovelApi } from '../api/novels';
import { startImportAnalysisStream, startNovelPlanningStream, startNovelPlanReviseStream } from '../api/agents';
import { getTemplatesApi, createNovelFromTemplateApi, NovelTemplate } from '../api/templates';
import { useNovelStore } from '../store/novelStore';
import useMobile from '../hooks/useMobile';
import type { Novel, ImportNovelData, ImportPreview, ImportAnalysisResult } from '../types';

const { Title, Text } = Typography;

// 模块级小说列表缓存，避免路由切换时重复请求
let novelsCache: { data: Novel[]; timestamp: number } | null = null;
const NOVELS_CACHE_TTL = 30_000; // 30秒缓存有效期

const DashboardPage: React.FC = () => {
  const isMobile = useMobile();
  const [novels, setNovels] = useState<Novel[]>(novelsCache && Date.now() - novelsCache.timestamp < NOVELS_CACHE_TTL ? novelsCache.data : []);
  const [loading, setLoading] = useState(!novelsCache || Date.now() - novelsCache.timestamp >= NOVELS_CACHE_TTL);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<Novel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [confirmText, setConfirmText] = useState('');
  const [form] = Form.useForm();
  const navigate = useNavigate();

  // 导入相关状态
  const [activeTab, setActiveTab] = useState<'create' | 'import' | 'smart' | 'plan' | 'template'>('create');
  const [importContent, setImportContent] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [parsedImportData, setParsedImportData] = useState<ImportNovelData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);

  // 智能导入相关状态
  const [smartImportText, setSmartImportText] = useState('');
  const [smartImportFileName, setSmartImportFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImportAnalysisResult | null>(null);
  const [analysisPayload, setAnalysisPayload] = useState<any>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ phase: string; message?: string; current?: number; total?: number; done?: boolean } | null>(null);
  const smartFileRef = useRef<HTMLInputElement>(null);
  const smartAbortRef = useRef<AbortController | null>(null);
  const smartImportingRef = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [smartInstructions, setSmartInstructions] = useState('');

  // 对话式创建相关状态
  const [planInput, setPlanInput] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planMessages, setPlanMessages] = useState<{ type: 'info' | 'tool' | 'content' | 'result'; text: string; toolName?: string }[]>([]);
  const [planStreamContent, setPlanStreamContent] = useState('');
  const [planResult, setPlanResult] = useState<any>(null);
  const [createdNovelId, setCreatedNovelId] = useState<number | null>(null);
  const [createdNovelTitle, setCreatedNovelTitle] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);
  const planAbortRef = useRef<AbortController | null>(null);
  const planCreatedRef = useRef<{ id: number; title: string } | null>(null);

  // 多轮对话修订状态
  const [planReviseInput, setPlanReviseInput] = useState('');
  const [planRevising, setPlanRevising] = useState(false);
  const [planReviseStreamContent, setPlanReviseStreamContent] = useState('');
  const [planReviseMessages, setPlanReviseMessages] = useState<{ type: 'info' | 'content'; text: string }[]>([]);
  const [planChatHistory, setPlanChatHistory] = useState<{ role: 'user' | 'assistant'; text: string; revisionNote?: string }[]>([]);
  const planReviseAbortRef = useRef<AbortController | null>(null);

  // 模板创建相关状态
  const [templates, setTemplates] = useState<NovelTemplate[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<number | null>(null);
  const creatingFromTemplateRef = useRef(false);
  const [templateForm] = Form.useForm();

  // 状态标签映射
  const statusLabelMap: Record<string, string> = {
    draft: '草稿', outline: '大纲', characters: '人物设定',
    chapters_outline: '章节大纲', writing: '写作中', completed: '已完成',
  };
  const statusColorMap: Record<string, string> = {
    draft: 'default', outline: 'blue', characters: 'green',
    chapters_outline: 'orange', writing: 'volcano', completed: 'purple',
  };

  useEffect(() => {
    // 有有效缓存则跳过请求
    if (novelsCache && Date.now() - novelsCache.timestamp < NOVELS_CACHE_TTL) {
      setNovels(novelsCache.data);
      setLoading(false);
      return;
    }
    loadNovels();
  }, []);

  // 组件卸载时中断所有活跃的 SSE 流
  useEffect(() => {
    return () => {
      smartAbortRef.current?.abort();
      planAbortRef.current?.abort();
      planReviseAbortRef.current?.abort();
    };
  }, []);

  const loadNovels = async (force = false) => {
    if (!force && novelsCache && Date.now() - novelsCache.timestamp < NOVELS_CACHE_TTL) {
      setNovels(novelsCache.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listNovelsApi();
      const rows = data.rows || [];
      novelsCache = { data: rows, timestamp: Date.now() };
      setNovels(rows);
    } catch (err: any) {
      message.error(err.response?.data?.error || '加载小说列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: { title: string; genre?: string }) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const { novel } = await createNovelApi(values.title, values.genre);
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      resetImportState();
      navigate(`/novel/${novel.id}`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  // 加载模板列表
  const loadTemplates = async () => {
    setTemplateLoading(true);
    try {
      const data = await getTemplatesApi();
      setTemplates(data.templates);
    } catch {
      message.error('加载模板列表失败');
    } finally {
      setTemplateLoading(false);
    }
  };

  // 从模板创建
  const handleCreateFromTemplate = async (template: NovelTemplate) => {
    if (creatingFromTemplateRef.current) return;
    const title = (templateForm.getFieldValue('title') || '').trim();
    creatingFromTemplateRef.current = true;
    setCreatingFromTemplate(template.id);
    try {
      const result = await createNovelFromTemplateApi(template.id, title ? { title } : {});
      message.success(`已从「${template.display_name}」模板创建小说`);
      setModalOpen(false);
      templateForm.resetFields();
      resetImportState();
      navigate(`/novel/${result.novel.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建失败');
    } finally {
      creatingFromTemplateRef.current = false;
      setCreatingFromTemplate(null);
    }
  };

  // ========== 导入功能 ==========

  const resetSmartImportState = () => {
    if (smartAbortRef.current) {
      smartAbortRef.current.abort();
      smartAbortRef.current = null;
    }
    setSmartImportText('');
    setSmartImportFileName('');
    setDocxBase64('');
    setSmartInstructions('');
    setAnalyzing(false);
    setAnalysisResult(null);
    setAnalysisPayload(null);
    setAnalysisProgress(null);
    setAnalysisError(null);
  };

  const resetImportState = () => {
    setImportContent('');
    setImportPreview(null);
    setParsedImportData(null);
    setImportFileName('');
    resetSmartImportState();
    resetPlanState();
  };

  // 解析 JSON 内容为 ImportNovelData 并生成预览
  const parseImportContent = (content: string): { data: ImportNovelData; preview: ImportPreview } | null => {
    try {
      const json = JSON.parse(content);
      const importData: ImportNovelData = {
        title: json.title || json.novel?.title,
        genre: json.genre || json.novel?.genre,
        novel: json.novel || undefined,
        characters: json.characters || [],
        chapters: json.chapters || [],
      };

      const title = importData.novel?.title || importData.title || '未命名小说';
      const genre = importData.novel?.genre || importData.genre || '';
      const characters = importData.characters || [];
      const chapters = importData.chapters || [];
      const totalWords = chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0);

      const hasCharacters = characters.length > 0;
      const hasChapters = chapters.length > 0;
      const hasContent = hasChapters && chapters.some((c: any) => c.content?.trim().length > 0);
      const allCompleted = hasChapters && chapters.every((c: any) => c.status === 'completed' || (c.content?.trim().length > 0));

      let currentStep = 1, status = 'outline';
      if (hasCharacters) { currentStep = 2; status = 'characters'; }
      if (hasChapters) { currentStep = 3; status = 'chapters_outline'; }
      if (hasContent) { currentStep = 4; status = allCompleted ? 'completed' : 'writing'; }

      return {
        data: importData,
        preview: { title, genre, characterCount: characters.length, chapterCount: chapters.length, totalWords, status, currentStep },
      };
    } catch {
      return null;
    }
  };

  // 文件选择
  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportContent(text);
      const parsed = parseImportContent(text);
      if (parsed) {
        setParsedImportData(parsed.data);
        setImportPreview(parsed.preview);
        message.success('文件解析成功');
      } else {
        setParsedImportData(null);
        setImportPreview(null);
        message.error('JSON 格式无效，请检查文件内容');
      }
    };
    reader.readAsText(file);
  };

  // 解析粘贴内容
  const handleParseClick = () => {
    if (!importContent.trim()) {
      message.warning('请输入要导入的 JSON 内容');
      return;
    }
    const parsed = parseImportContent(importContent);
    if (parsed) {
      setParsedImportData(parsed.data);
      setImportPreview(parsed.preview);
      message.success('解析成功！请确认后导入');
    } else {
      setParsedImportData(null);
      setImportPreview(null);
      message.error('JSON 格式无效，请检查内容');
    }
  };

  // 确认导入
  const handleImportSubmit = async () => {
    if (!parsedImportData || importingRef.current) {
      return;
    }
    importingRef.current = true;
    setImporting(true);
    try {
      const { novel } = await importNovelApi(parsedImportData);
      message.success(`小说《${novel.title}》导入成功`);
      setModalOpen(false);
      form.resetFields();
      resetImportState();
      loadNovels(true);
      navigate(`/novel/${novel.id}`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '导入失败');
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  // Modal 关闭时重置所有状态
  const handleModalClose = () => {
    setModalOpen(false);
    form.resetFields();
    resetImportState();
    setActiveTab('create');
  };

  // ========== 智能导入功能 ==========

  // 存储 DOCX/DOC 文件的 base64 数据和类型
  const [docxBase64, setDocxBase64] = useState<string>('');
  const [docFileType, setDocFileType] = useState<'docx' | 'doc'>('docx');

  const handleSmartImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const textFormats = ['.txt', '.md', '.markdown', '.log', '.text', '.rtf', '.tex', '.csv', '.json'];
    const docFormats = ['.docx', '.doc'];

    if (!textFormats.includes(ext) && !docFormats.includes(ext)) {
      message.error('仅支持文本文件(.txt/.md/.log等) 和 .docx/.doc 文件');
      return;
    }

    setSmartImportFileName(file.name);
    setAnalysisResult(null);
    setAnalysisPayload(null);
    setAnalysisError(null);
    setDocxBase64('');

    if (textFormats.includes(ext)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSmartImportText(ev.target?.result as string || '');
      };
      reader.readAsText(file);
    } else {
      // DOCX/DOC 文件：读取为 base64，不显示原始内容
      const isDoc = ext === '.doc';
      setDocFileType(isDoc ? 'doc' : 'docx');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        setDocxBase64(base64);
        const label = isDoc ? 'DOC' : 'DOCX';
        setSmartImportText(`[${label} 文件已加载：${file.name}（${(file.size / 1024).toFixed(1)} KB）— 点击下方"开始 AI 分析"由后端解析文档内容]`);
      };
      reader.onerror = () => {
        message.error('文件读取失败，请重试');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartAnalysis = () => {
    // Word 文件使用 base64 数据，文本文件使用 textarea 内容
    let text: string;
    if (docxBase64) {
      const prefix = docFileType === 'doc' ? '[DOC_BASE64]' : '[DOCX_BASE64]';
      text = prefix + docxBase64;
      if (docxBase64.length < 500) {
        message.warning('文件内容过少，请确认文件包含足够的中文内容');
        return;
      }
    } else {
      text = smartImportText.trim();
      if (!text || text.length < 100) {
        message.warning('内容过短，请至少提供100字以上的内容');
        return;
      }
    }
    setAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisPayload(null);
    setAnalysisProgress({ phase: 'init', message: '正在连接 AI 服务...' });
    setAnalysisError(null);

    smartAbortRef.current = startImportAnalysisStream(text, smartInstructions.trim(), (event, data) => {
      switch (event) {
        case 'progress':
          setAnalysisProgress({
            phase: data.phase || '',
            message: data.message,
            current: data.current,
            total: data.total,
            done: data.done,
          });
          break;
        case 'result':
          setAnalysisResult(data);
          setAnalysisProgress(null);
          break;
        case 'import_payload':
          setAnalysisPayload(data);
          setAnalyzing(false);
          break;
        case 'error':
          setAnalysisError(data.message || data.error || '分析失败');
          setAnalyzing(false);
          setAnalysisProgress(null);
          break;
        case 'done':
          setAnalyzing(false);
          setAnalysisProgress(null);
          break;
      }
    });
  };

  const handleCancelAnalysis = () => {
    if (smartAbortRef.current) {
      smartAbortRef.current.abort();
      smartAbortRef.current = null;
    }
    setAnalyzing(false);
    setAnalysisProgress(null);
    setAnalysisError(null);
  };

  const handleSmartImportSubmit = async () => {
    if (!analysisPayload || smartImportingRef.current) {
      return;
    }
    smartImportingRef.current = true;
    setImporting(true);
    try {
      const { novel } = await importNovelApi(analysisPayload);
      message.success(`小说《${novel.title}》导入成功`);
      setModalOpen(false);
      form.resetFields();
      resetImportState();
      loadNovels(true);
      navigate(`/novel/${novel.id}`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '导入失败');
    } finally {
      smartImportingRef.current = false;
      setImporting(false);
    }
  };

  // ========== 对话式创建功能 ==========

  const resetPlanState = () => {
    if (planAbortRef.current) {
      planAbortRef.current.abort();
      planAbortRef.current = null;
    }
    if (planReviseAbortRef.current) {
      planReviseAbortRef.current.abort();
      planReviseAbortRef.current = null;
    }
    // 取消时如果后端已创建小说，需删除以避免残留空记录
    if (planCreatedRef.current) {
      deleteNovelApi(planCreatedRef.current.id).catch(() => {});
      planCreatedRef.current = null;
    }
    setPlanInput('');
    setPlanning(false);
    setPlanMessages([]);
    setPlanStreamContent('');
    setPlanResult(null);
    setCreatedNovelId(null);
    setCreatedNovelTitle('');
    setPlanError(null);
    setPlanReviseInput('');
    setPlanRevising(false);
    setPlanReviseStreamContent('');
    setPlanReviseMessages([]);
    setPlanChatHistory([]);
  };

  const handleStartPlanning = () => {
    const input = planInput.trim();
    if (!input || input.length < 5) {
      message.warning('请提供更详细的创作需求（至少5个字）');
      return;
    }
    setPlanning(true);
    setPlanMessages([]);
    setPlanStreamContent('');
    setPlanResult(null);
    setCreatedNovelId(null);
    setCreatedNovelTitle('');
    setPlanError(null);
    planCreatedRef.current = null;

    planAbortRef.current = startNovelPlanningStream(input, (event, data) => {
      switch (event) {
        case 'progress':
          setPlanMessages(prev => [...prev, {
            type: data.tool ? 'tool' : 'info',
            text: data.message || '',
            toolName: data.tool,
          }]);
          break;
        case 'chunk':
          setPlanStreamContent(prev => prev + (data.text || ''));
          break;
        case 'plan_result':
          setPlanResult(data);
          setPlanMessages(prev => [...prev, { type: 'result', text: '方案生成完成！' }]);
          break;
        case 'novel_created':
          planCreatedRef.current = { id: data.novelId, title: data.title };
          setCreatedNovelId(data.novelId);
          setCreatedNovelTitle(data.title);
          break;
        case 'error':
          setPlanError(data.message || data.error || '规划失败');
          setPlanning(false);
          break;
        case 'done':
          setPlanning(false);
          break;
      }
    });
  };

  const handleCancelPlanning = () => {
    if (planAbortRef.current) {
      planAbortRef.current.abort();
      planAbortRef.current = null;
    }
    setPlanning(false);
    // 取消时如果后端已创建小说，需删除以避免残留空记录
    if (planCreatedRef.current) {
      deleteNovelApi(planCreatedRef.current.id).catch(() => {});
      planCreatedRef.current = null;
      setCreatedNovelId(null);
      setCreatedNovelTitle('');
    }
  };

  const handleGoToNovel = () => {
    if (createdNovelId) {
      setModalOpen(false);
      form.resetFields();
      resetImportState();
      resetPlanState();
      loadNovels(true);
      navigate(`/novel/${createdNovelId}`);
    }
  };

  // ========== 多轮对话修订 ==========

  const handleStartPlanRevise = () => {
    const input = planReviseInput.trim();
    if (!input || input.length < 3) {
      message.warning('请提供更详细的修订意见（至少3个字）');
      return;
    }
    if (!createdNovelId) {
      message.warning('请先生成初始方案');
      return;
    }

    setPlanRevising(true);
    setPlanReviseStreamContent('');
    setPlanReviseMessages([]);

    // 添加用户消息到聊天历史
    setPlanChatHistory(prev => [...prev, { role: 'user', text: input }]);

    planReviseAbortRef.current = startNovelPlanReviseStream(createdNovelId, input, (event, data) => {
      switch (event) {
        case 'progress':
          setPlanReviseMessages(prev => [...prev, { type: 'info', text: data.message || '' }]);
          break;
        case 'chunk':
          setPlanReviseStreamContent(prev => prev + (data.text || ''));
          break;
        case 'plan_result':
          // 更新方案结果
          setPlanResult(data);
          setPlanRevising(false);
          setPlanReviseStreamContent('');
          setPlanReviseMessages([]);
          // 添加 AI 回复到聊天历史
          const note = data.revisionNote || '方案已根据你的反馈更新';
          setPlanChatHistory(prev => [...prev, { role: 'assistant', text: note, revisionNote: note }]);
          break;
        case 'error':
          setPlanError(data.message || '修订失败');
          setPlanRevising(false);
          setPlanReviseStreamContent('');
          setPlanReviseMessages([]);
          break;
        case 'done':
          setPlanRevising(false);
          break;
      }
    });

    setPlanReviseInput('');
  };

  const handleCancelPlanRevise = () => {
    if (planReviseAbortRef.current) {
      planReviseAbortRef.current.abort();
      planReviseAbortRef.current = null;
    }
    setPlanRevising(false);
    setPlanReviseStreamContent('');
    setPlanReviseMessages([]);
  };

  const resetDeleteState = () => {
    setDeleteTarget(null);
    setDeleting(false);
    setConfirmText('');
  };

  const handleDeleteClick = (novel: Novel) => {
    setDeleteTarget(novel);
    setConfirmText('');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deleteNovelApi(deleteTarget.id);
      message.success(`小说《${deleteTarget.title}》已删除`);
      resetDeleteState();
      loadNovels(true);
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSpinner tip="加载小说列表..." />;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {/* 页面头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 32,
        padding: '24px 28px',
        background: 'rgba(30,41,59,0.6)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        border: '1px solid rgba(99,102,241,0.15)',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44,
              height: 44,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.2)',
            }}>
              <BookOutlined style={{ fontSize: 22, color: '#818cf8' }} />
            </div>
            <Title level={3} style={{ color: '#f1f5f9', margin: 0, fontWeight: 700 }}>我的小说</Title>
          </div>
          <Text style={{ color: '#64748b', fontSize: 14 }}>
            共 {novels.length} 部作品，持续创作中...
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            const storeState = useNovelStore.getState();
            if (storeState.isStreaming && storeState.activeNovelId) {
              Modal.confirm({
                title: '有小说正在进行 AI 操作',
                icon: <ExclamationCircleOutlined />,
                content: `小说《${storeState.currentNovel?.title || ''}》正在生成内容中，创建新书将中断当前操作。确认继续？`,
                okText: '确认新建（中断当前操作）',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => {
                  storeState.safeAbort(storeState.activeNovelId!);
                  setModalOpen(true);
                },
              });
            } else {
              setModalOpen(true);
            }
          }}
          style={{
            height: 44,
            paddingInline: 24,
            fontSize: 15,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #7c3aed 100%)',
            border: 'none',
            borderRadius: 12,
            boxShadow: '0 4px 15px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)';
          }}
        >
          创建新小说
        </Button>
      </div>

      {/* 小说列表 */}
      {novels.length === 0 ? (
        <div style={{
          padding: '80px 40px',
          background: 'rgba(30,41,59,0.4)',
          borderRadius: 20,
          border: '1px dashed rgba(99,102,241,0.2)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 80,
            height: 80,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 100%)',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <EditOutlined style={{ fontSize: 32, color: '#6366f1' }} />
          </div>
          <Title level={4} style={{ color: '#94a3b8', marginBottom: 8 }}>还没有小说</Title>
          <Text style={{ color: '#64748b', display: 'block', marginBottom: 24 }}>
            点击上方按钮开始你的第一部 AI 创作
          </Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              const storeState = useNovelStore.getState();
              if (storeState.isStreaming && storeState.activeNovelId) {
                Modal.confirm({
                  title: '有小说正在进行 AI 操作',
                  icon: <ExclamationCircleOutlined />,
                  content: `小说《${storeState.currentNovel?.title || ''}》正在生成内容中，创建新书将中断当前操作。确认继续？`,
                  okText: '确认新建（中断当前操作）',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => {
                    storeState.safeAbort(storeState.activeNovelId!);
                    setModalOpen(true);
                  },
                });
              } else {
                setModalOpen(true);
              }
            }}
            style={{
              height: 44,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              border: 'none',
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            创建新小说
          </Button>
        </div>
      ) : (
        <Row gutter={[20, 20]}>
          {novels.map((novel, index) => (
            <Col key={novel.id} xs={24} sm={12} md={8} lg={6}>
              <div style={{
                animation: `slideUp 0.5s ease-out ${index * 0.1}s both`,
              }}>
                <NovelCard novel={novel} onClick={() => navigate(`/novel/${novel.id}`)} onDelete={() => handleDeleteClick(novel)} />
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* 创建 / 导入小说弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <PlusOutlined style={{ color: '#818cf8' }} />
            </div>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>创建新小说</span>
          </div>
        }
        open={modalOpen}
        onCancel={handleModalClose}
        footer={null}
        styles={{
          content: {
            background: 'rgba(30,41,59,0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 20,
          },
          header: {
            background: 'transparent',
            borderBottom: '1px solid rgba(99,102,241,0.1)',
            padding: '20px 24px',
          },
          body: { padding: isMobile ? '16px' : '24px' },
        }}
        width={isMobile ? '95vw' : 680}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key as 'create' | 'import' | 'smart' | 'plan' | 'template'); resetImportState(); if (key === 'template') loadTemplates(); }}
          items={[
            {
              key: 'create',
              label: <span><EditOutlined /> 手动创建</span>,
              children: (
                <Form form={form} onFinish={handleCreate} layout="vertical">
                  <Form.Item
                    name="title"
                    label={<span style={{ color: '#cbd5e1', fontWeight: 500 }}>小说标题</span>}
                    rules={[{ required: true, message: '请输入小说标题' }]}
                  >
                    <Input
                      placeholder="给小说起个名字"
                      maxLength={200}
                      style={{
                        background: 'rgba(15,23,42,0.5)',
                        borderColor: 'rgba(99,102,241,0.3)',
                        color: '#f1f5f9',
                        height: 48,
                        fontSize: 15,
                        borderRadius: 12,
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="genre"
                    label={<span style={{ color: '#cbd5e1', fontWeight: 500 }}>类型（选填）</span>}
                  >
                    <Input
                      placeholder="如：玄幻、都市、科幻、历史..."
                      maxLength={100}
                      style={{
                        background: 'rgba(15,23,42,0.5)',
                        borderColor: 'rgba(99,102,241,0.3)',
                        color: '#f1f5f9',
                        height: 48,
                        fontSize: 15,
                        borderRadius: 12,
                      }}
                    />
                  </Form.Item>
                  <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={creating}
                      block
                      style={{
                        height: 48,
                        fontSize: 16,
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        border: 'none',
                        borderRadius: 12,
                        boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                      }}
                    >
                      创建
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'template',
              label: <span><ShopOutlined /> 从模板创建</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="选择一个小说模板快速开始创作，模板会预填世界观、主题和剧情框架"
                    style={{ marginBottom: 16, borderRadius: 10 }}
                  />
                  <Form form={templateForm} layout="vertical" style={{ marginBottom: 16 }}>
                    <Form.Item
                      name="title"
                      label={<span style={{ color: '#cbd5e1', fontWeight: 500 }}>小说标题（选填，留空使用模板示例标题）</span>}
                    >
                      <Input
                        placeholder="自定义小说标题"
                        maxLength={200}
                        style={{
                          background: 'rgba(15,23,42,0.5)',
                          borderColor: 'rgba(99,102,241,0.3)',
                          color: '#f1f5f9',
                          height: 44,
                          borderRadius: 10,
                        }}
                      />
                    </Form.Item>
                  </Form>
                  {templateLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <LoadingOutlined style={{ fontSize: 24, color: '#818cf8' }} />
                      <Text style={{ display: 'block', marginTop: 8, color: '#94a3b8' }}>加载模板...</Text>
                    </div>
                  ) : templates.length === 0 ? (
                    <Empty description="暂无可用模板" />
                  ) : (
                    <div className="template-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                      {templates.map(tpl => (
                        <Card
                          key={tpl.id}
                          hoverable
                          size="small"
                          style={{
                            borderRadius: 10,
                            borderColor: 'rgba(99,102,241,0.15)',
                            background: 'rgba(15,23,42,0.6)',
                            cursor: 'pointer',
                          }}
                          bodyStyle={{ padding: 12 }}
                          onClick={() => handleCreateFromTemplate(tpl)}
                        >
                          {/* 渐变色条 */}
                          <div style={{
                            height: 6,
                            borderRadius: 3,
                            background: tpl.cover_gradient,
                            marginBottom: 10,
                          }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Text strong style={{ fontSize: 13, flex: 1 }} ellipsis>{tpl.display_name}</Text>
                            {tpl.is_official ? (
                              <Tag color="gold" style={{ fontSize: 10, lineHeight: '16px' }}>官方</Tag>
                            ) : tpl.creator_username && (
                              <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px' }}>@{tpl.creator_username}</Tag>
                            )}
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ rows: 2 } as any}>
                            {tpl.description}
                          </Text>
                          <Button
                            type="primary"
                            size="small"
                            block
                            style={{ marginTop: 10, borderRadius: 6 }}
                            loading={creatingFromTemplate === tpl.id}
                            onClick={(e) => { e.stopPropagation(); handleCreateFromTemplate(tpl); }}
                          >
                            使用模板
                          </Button>
                        </Card>
                      ))}
                    </div>
                  )}
                  <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12, textAlign: 'center' }}>
                    更多模板请前往 <a onClick={() => { setModalOpen(false); navigate('/templates'); }}>模板商店</a> 浏览
                  </Text>
                </div>
              ),
            },
            {
              key: 'import',
              label: <span><ImportOutlined /> 从文件导入</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="支持导入本平台导出的 JSON 文件，或自定义的结构化小说数据"
                    style={{ marginBottom: 16 }}
                  />

                  <Space style={{ marginBottom: 12 }}>
                    <Button
                      icon={<UploadOutlined />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      选择 JSON 文件
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={handleImportFileSelect}
                    />
                    {importFileName && (
                      <span style={{ color: '#818cf8' }}><FileTextOutlined /> {importFileName}</span>
                    )}
                  </Space>

                  <Input.TextArea
                    value={importContent}
                    onChange={(e) => { setImportContent(e.target.value); setParsedImportData(null); setImportPreview(null); }}
                    rows={8}
                    placeholder="粘贴 JSON 内容，或点击上方按钮选择文件..."
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 13,
                      background: 'rgba(15,23,42,0.5)',
                      borderColor: 'rgba(99,102,241,0.3)',
                      color: '#f1f5f9',
                      borderRadius: 12,
                    }}
                  />

                  {/* 预览区域 */}
                  {importPreview && parsedImportData && (
                    <div style={{
                      marginTop: 16, padding: 16,
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: 12,
                      border: '1px solid rgba(99,102,241,0.2)',
                    }}>
                      <span style={{ color: '#818cf8', fontWeight: 600 }}>导入预览</span>
                      <Divider style={{ margin: '8px 0' }} />
                      <Descriptions column={isMobile ? 1 : 2} size="small" colon={false}>
                        <Descriptions.Item label="标题">{importPreview.title}</Descriptions.Item>
                        <Descriptions.Item label="类型">{importPreview.genre || '未设置'}</Descriptions.Item>
                        <Descriptions.Item label="角色数">{importPreview.characterCount} 人</Descriptions.Item>
                        <Descriptions.Item label="章节数">{importPreview.chapterCount} 章</Descriptions.Item>
                        <Descriptions.Item label="总字数">{importPreview.totalWords.toLocaleString()}</Descriptions.Item>
                        <Descriptions.Item label="导入后状态">
                          <Tag color={statusColorMap[importPreview.status] || 'default'}>
                            {statusLabelMap[importPreview.status] || importPreview.status}
                          </Tag>
                        </Descriptions.Item>
                      </Descriptions>
                      {parsedImportData.characters && parsedImportData.characters.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>
                            角色：{parsedImportData.characters.slice(0, 5).map(c => c.name).join('、')}
                            {parsedImportData.characters.length > 5 ? ` 等${parsedImportData.characters.length}人` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    {!parsedImportData ? (
                      <Button
                        onClick={handleParseClick}
                        icon={<CodeOutlined />}
                        style={{ borderRadius: 12 }}
                      >
                        解析预览
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        onClick={handleImportSubmit}
                        loading={importing}
                        style={{
                          height: 48,
                          paddingInline: 32,
                          fontSize: 16,
                          fontWeight: 600,
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          border: 'none',
                          borderRadius: 12,
                          boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                        }}
                      >
                        确认导入
                      </Button>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'plan',
              label: <span><MessageOutlined /> 对话创建</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="用自然语言描述你想创作的小说，AI 将主动搜索最新趋势、分析读者偏好，并为你量身定制完整的小说创作方案（包括书名、大纲、角色、章纲）"
                    style={{ marginBottom: 16 }}
                  />

                  {!planning && !planResult && !planError && (
                    <>
                      {/* 输入区域 */}
                      <div style={{
                        background: 'rgba(15,23,42,0.5)',
                        borderRadius: 16,
                        border: '1px solid rgba(99,102,241,0.25)',
                        padding: '20px',
                        marginBottom: 16,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <RobotOutlined style={{ color: '#818cf8', fontSize: 18 }} />
                          <span style={{ color: '#cbd5e1', fontWeight: 500 }}>描述你的创作想法</span>
                        </div>
                        <Input.TextArea
                          value={planInput}
                          onChange={(e) => setPlanInput(e.target.value)}
                          rows={5}
                          placeholder={`例如：
- "帮我策划一部都市异能网络爆款小说，主角在大学宿舍觉醒超能力，发现室友都是隐藏大佬"
- "写一部穿越到古代经商的小说，女主用现代商业思维在古代创业，轻松搞笑风格"
- "创作一部科幻悬疑小说，核心创意是'记忆可以交易'，主打反转和烧脑"

💡 提示：描述越详细，AI 生成的方案越精准`}
                          disabled={planning}
                          onPressEnter={(e) => {
                            if (!e.shiftKey) {
                              e.preventDefault();
                              handleStartPlanning();
                            }
                          }}
                          style={{
                            fontSize: 14,
                            background: 'rgba(15,23,42,0.6)',
                            borderColor: 'rgba(99,102,241,0.3)',
                            color: '#f1f5f9',
                            borderRadius: 12,
                            lineHeight: 1.8,
                          }}
                        />
                      </div>

                      {/* 示例快捷输入 */}
                      <div style={{ marginBottom: 20 }}>
                        <span style={{ color: '#64748b', fontSize: 12, marginBottom: 8, display: 'block' }}>
                          <BulbOutlined /> 试试这些方向：
                        </span>
                        <Space wrap size={[8, 8]}>
                          {[
                            { icon: <RocketOutlined />, label: '都市异能爆款', prompt: '写一部都市异能网络爆款小说，金手指要新颖，节奏要快，爽点密集' },
                            { icon: <SearchOutlined />, label: '穿越经商致富', prompt: '写一部穿越到古代经商的小说，女主视角，轻松搞笑风格，融入现代商业知识' },
                            { icon: <ThunderboltOutlined />, label: '科幻悬疑反转', prompt: '创作一部科幻悬疑小说，核心创意是"记忆可以交易"，每个章节结尾都要有反转' },
                          ].map((item, idx) => (
                            <Button
                              key={idx}
                              size="small"
                              icon={item.icon}
                              onClick={() => setPlanInput(item.prompt)}
                              style={{
                                background: 'rgba(99,102,241,0.1)',
                                borderColor: 'rgba(99,102,241,0.2)',
                                color: '#94a3b8',
                                borderRadius: 20,
                                fontSize: 12,
                              }}
                            >
                              {item.label}
                            </Button>
                          ))}
                        </Space>
                      </div>

                      {/* 开始按钮 */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          type="primary"
                          onClick={handleStartPlanning}
                          disabled={planInput.trim().length < 5}
                          icon={<RocketOutlined />}
                          style={{
                            height: 48,
                            paddingInline: 32,
                            fontSize: 16,
                            fontWeight: 600,
                            background: planInput.trim().length >= 5
                              ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)'
                              : 'rgba(71,85,105,0.3)',
                            border: 'none',
                            borderRadius: 12,
                            boxShadow: planInput.trim().length >= 5
                              ? '0 4px 20px rgba(99,102,241,0.4)'
                              : 'none',
                            color: planInput.trim().length >= 5 ? '#fff' : '#64748b',
                            transition: 'all 0.3s ease',
                          }}
                        >
                          开始智能规划
                        </Button>
                      </div>
                    </>
                  )}

                  {/* 规划中：显示对话消息 */}
                  {(planning || planResult) && (
                    <div style={{
                      background: 'rgba(15,23,42,0.5)',
                      borderRadius: 16,
                      border: '1px solid rgba(99,102,241,0.2)',
                      padding: '16px 20px',
                      maxHeight: isMobile ? 260 : 420,
                      overflowY: 'auto',
                      marginBottom: 16,
                    }}>
                      {/* 用户输入消息 */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginBottom: 12,
                      }}>
                        <div style={{
                          maxWidth: '75%',
                          background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)',
                          borderRadius: '16px 4px 16px 16px',
                          padding: '10px 16px',
                          border: '1px solid rgba(99,102,241,0.15)',
                        }}>
                          <span style={{ color: '#cbd5e1', fontSize: 13 }}>{planInput}</span>
                        </div>
                      </div>

                      {/* AI 消息 */}
                      {planMessages.map((msg, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          marginBottom: 8,
                        }}>
                          <div style={{
                            maxWidth: '85%',
                            background: msg.type === 'tool'
                              ? 'rgba(245,158,11,0.08)'
                              : msg.type === 'result'
                              ? 'rgba(16,185,129,0.08)'
                              : 'rgba(30,41,59,0.6)',
                            borderRadius: '4px 16px 16px 16px',
                            padding: '8px 14px',
                            border: msg.type === 'tool'
                              ? '1px solid rgba(245,158,11,0.2)'
                              : msg.type === 'result'
                              ? '1px solid rgba(16,185,129,0.2)'
                              : '1px solid rgba(148,163,184,0.1)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {msg.type === 'tool' ? (
                                <SearchOutlined style={{ color: '#f59e0b', fontSize: 12 }} />
                              ) : msg.type === 'result' ? (
                                <CheckCircleOutlined style={{ color: '#10b981', fontSize: 12 }} />
                              ) : planning ? (
                                <LoadingOutlined style={{ color: '#818cf8', fontSize: 12 }} />
                              ) : (
                                <RobotOutlined style={{ color: '#818cf8', fontSize: 12 }} />
                              )}
                              <span style={{
                                color: msg.type === 'tool' ? '#fbbf24' : msg.type === 'result' ? '#34d399' : '#94a3b8',
                                fontSize: 12,
                              }}>
                                {msg.text}
                                {msg.toolName && (
                                  <Tag color="orange" style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px' }}>
                                    {msg.toolName}
                                  </Tag>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* 流式内容展示 */}
                      {planStreamContent && (
                        <div style={{
                          marginTop: 12,
                          padding: '12px 16px',
                          background: 'rgba(99,102,241,0.05)',
                          borderRadius: 12,
                          border: '1px solid rgba(99,102,241,0.1)',
                          maxHeight: 200,
                          overflowY: 'auto',
                        }}>
                          <div style={{ color: '#e2e8f0', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                            {planStreamContent}
                          </div>
                          {planning && (
                            <span style={{
                              display: 'inline-block',
                              width: 8,
                              height: 16,
                              background: '#818cf8',
                              marginLeft: 2,
                              animation: 'blink 1s infinite',
                              verticalAlign: 'middle',
                            }} />
                          )}
                        </div>
                      )}

                      {/* 方案预览 */}
                      {planResult && (
                        <div style={{
                          marginTop: 12,
                          padding: 16,
                          background: 'rgba(16,185,129,0.06)',
                          borderRadius: 12,
                          border: '1px solid rgba(16,185,129,0.2)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <CheckCircleOutlined style={{ color: '#34d399' }} />
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>方案生成完成</span>
                          </div>
                          <Descriptions column={isMobile ? 1 : 2} size="small" colon={false}>
                            <Descriptions.Item label="书名" span={2}>
                              <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{planResult.title}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label="题材">{planResult.genre}</Descriptions.Item>
                            <Descriptions.Item label="基调">{planResult.tone || '未指定'}</Descriptions.Item>
                            <Descriptions.Item label="目标读者">{planResult.targetAudience || '未指定'}</Descriptions.Item>
                            <Descriptions.Item label="预计章数">{planResult.chapterCount || planResult.chapters?.length || '未知'} 章</Descriptions.Item>
                          </Descriptions>
                          {planResult.theme && (
                            <div style={{ marginTop: 8 }}>
                              <span style={{ color: '#818cf8', fontSize: 11 }}>主题：</span>
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>{planResult.theme}</span>
                            </div>
                          )}
                          {planResult.marketAnalysis && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ color: '#f59e0b', fontSize: 11 }}>市场分析：</span>
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>{planResult.marketAnalysis}</span>
                            </div>
                          )}
                          {planResult.characters && planResult.characters.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <span style={{ color: '#818cf8', fontSize: 11 }}>
                                角色（{planResult.characters.length}人）：
                              </span>
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                                {planResult.characters.map((c: any) => `${c.name}(${c.role})`).join('、')}
                              </span>
                            </div>
                          )}
                          {planResult.innovationPoints && planResult.innovationPoints.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <span style={{ color: '#a78bfa', fontSize: 11 }}>创新点：</span>
                              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                {planResult.innovationPoints.map((p: string, i: number) => (
                                  <li key={i} style={{ color: '#94a3b8', fontSize: 11 }}>{p}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 错误展示 */}
                  {planError && (
                    <Alert
                      type="error"
                      showIcon
                      message={planError}
                      style={{ marginBottom: 16 }}
                      closable
                      onClose={() => setPlanError(null)}
                    />
                  )}

                  {/* 多轮对话聊天历史 */}
                  {planChatHistory.length > 0 && (
                    <div style={{
                      marginTop: 16,
                      marginBottom: 16,
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}>
                      {planChatHistory.map((chat, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: chat.role === 'user' ? 'flex-end' : 'flex-start',
                          marginBottom: 8,
                        }}>
                          <div style={{
                            maxWidth: '80%',
                            background: chat.role === 'user'
                              ? 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)'
                              : 'rgba(30,41,59,0.5)',
                            borderRadius: chat.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                            padding: '8px 14px',
                            border: chat.role === 'user'
                              ? '1px solid rgba(99,102,241,0.15)'
                              : '1px solid rgba(148,163,184,0.1)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              {chat.role === 'assistant' ? (
                                <RobotOutlined style={{ color: '#818cf8', fontSize: 11 }} />
                              ) : (
                                <MessageOutlined style={{ color: '#a78bfa', fontSize: 11 }} />
                              )}
                              <span style={{ color: '#64748b', fontSize: 10 }}>
                                {chat.role === 'user' ? '你' : 'AI 编辑'}
                              </span>
                            </div>
                            <span style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>{chat.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 修订中的流式内容 */}
                  {planRevising && planReviseStreamContent && (
                    <div style={{
                      marginBottom: 16,
                      padding: '12px 16px',
                      background: 'rgba(99,102,241,0.04)',
                      borderRadius: 12,
                      border: '1px solid rgba(99,102,241,0.1)',
                      maxHeight: 150,
                      overflowY: 'auto',
                    }}>
                      <div style={{ color: '#e2e8f0', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                        {planReviseStreamContent}
                      </div>
                      <span style={{
                        display: 'inline-block', width: 8, height: 14,
                        background: '#818cf8', marginLeft: 2,
                        animation: 'blink 1s infinite', verticalAlign: 'middle',
                      }} />
                    </div>
                  )}

                  {/* 操作按钮区域：左侧修订输入 + 右侧操作按钮 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 12,
                    marginTop: 8,
                  }}>
                    {/* 左侧：修订输入框（方案已生成后显示） */}
                    {createdNovelId && !planning && (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Input.TextArea
                          value={planReviseInput}
                          onChange={(e) => setPlanReviseInput(e.target.value)}
                          rows={2}
                          placeholder={planRevising
                            ? 'AI 正在修订方案...'
                            : '对方案不满意？输入修改意见，如"书名不够吸引人，换一个"或"加一个神秘反派角色"...'}
                          disabled={planRevising}
                          onPressEnter={(e) => {
                            if (!e.shiftKey && !planRevising) {
                              e.preventDefault();
                              handleStartPlanRevise();
                            }
                          }}
                          style={{
                            fontSize: 12,
                            background: 'rgba(15,23,42,0.5)',
                            borderColor: 'rgba(99,102,241,0.25)',
                            color: '#f1f5f9',
                            borderRadius: 12,
                            resize: 'none',
                          }}
                        />
                        {planReviseMessages.length > 0 && planRevising && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 4,
                          }}>
                            <LoadingOutlined style={{ color: '#818cf8', fontSize: 11 }} />
                            <span style={{ color: '#64748b', fontSize: 11 }}>
                              {planReviseMessages[planReviseMessages.length - 1]?.text}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 右侧：操作按钮 */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {planning && (
                        <Button onClick={handleCancelPlanning} style={{ borderRadius: 12, height: 40 }}>
                          取消规划
                        </Button>
                      )}
                      {planRevising && (
                        <Button onClick={handleCancelPlanRevise} style={{ borderRadius: 12, height: 40 }}>
                          取消修订
                        </Button>
                      )}
                      {createdNovelId && !planning && !planRevising && planReviseInput.trim().length >= 3 && (
                        <Button
                          type="primary"
                          onClick={handleStartPlanRevise}
                          icon={<MessageOutlined />}
                          style={{
                            height: 40,
                            paddingInline: 16,
                            fontSize: 13,
                            fontWeight: 500,
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            border: 'none',
                            borderRadius: 12,
                            boxShadow: '0 3px 10px rgba(245,158,11,0.25)',
                          }}
                        >
                          发送修订
                        </Button>
                      )}
                      {createdNovelId && !planning && (
                        <Button
                          type="primary"
                          onClick={handleGoToNovel}
                          icon={<EnterOutlined />}
                          style={{
                            height: 48,
                            paddingInline: 24,
                            fontSize: 15,
                            fontWeight: 600,
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            borderRadius: 12,
                            boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                          }}
                        >
                          进入小说工作台
                        </Button>
                      )}
                      {planError && planResult && !createdNovelId && (
                        <Button
                          onClick={handleStartPlanning}
                          icon={<RocketOutlined />}
                          style={{ borderRadius: 12 }}
                        >
                          重新规划
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 闪烁动画 */}
                  <style>{`
                    @keyframes blink {
                      0%, 100% { opacity: 1; }
                      50% { opacity: 0; }
                    }
                  `}</style>
                </div>
              ),
            },
            {
              key: 'smart',
              label: <span><ThunderboltOutlined /> 智能导入</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="粘贴小说前几章内容，或上传 .txt/.md/.docx 等文件，AI 将自动分析并生成角色、大纲和章纲"
                    style={{ marginBottom: 16 }}
                  />

                  {/* 文件选择 */}
                  <Space style={{ marginBottom: 12 }}>
                    <Button
                      icon={<UploadOutlined />}
                      onClick={() => smartFileRef.current?.click()}
                      disabled={analyzing}
                    >
                      选择文件 (.txt/.md/.docx...)
                    </Button>
                    <input
                      ref={smartFileRef}
                      type="file"
                      accept=".txt,.md,.markdown,.log,.rtf,.text,.tex,.csv,.json,.docx,.doc"
                      style={{ display: 'none' }}
                      onChange={handleSmartImportFileSelect}
                    />
                    {smartImportFileName && (
                      <span style={{ color: '#818cf8' }}><FileTextOutlined /> {smartImportFileName}</span>
                    )}
                  </Space>

                  {/* 文本输入 */}
                  <Input.TextArea
                    value={smartImportText}
                    onChange={(e) => { setSmartImportText(e.target.value); setDocxBase64(''); setAnalysisResult(null); setAnalysisPayload(null); setAnalysisError(null); }}
                    rows={10}
                    placeholder="粘贴小说前几章的内容（至少100字），例如：粘贴3-5章正文，AI 会自动识别章节边界并分析..."
                    disabled={analyzing || !!docxBase64}
                    style={{
                      fontSize: 13,
                      background: 'rgba(15,23,42,0.5)',
                      borderColor: 'rgba(99,102,241,0.3)',
                      color: '#f1f5f9',
                      borderRadius: 12,
                    }}
                  />

                  {/* 补充意见 */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <BulbOutlined style={{ color: '#f59e0b', fontSize: 12 }} />
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>补充意见（选填，可引导 AI 分析方向）</span>
                    </div>
                    <Input.TextArea
                      value={smartInstructions}
                      onChange={(e) => setSmartInstructions(e.target.value)}
                      rows={2}
                      placeholder="例如：这是一部都市异能小说，全书预计30章 / 主角是女性，性格冷酷 / 保持轻松搞笑风格..."
                      disabled={analyzing}
                      style={{
                        fontSize: 13,
                        background: 'rgba(15,23,42,0.4)',
                        borderColor: 'rgba(245,158,11,0.2)',
                        color: '#f1f5f9',
                        borderRadius: 10,
                      }}
                    />
                  </div>

                  {/* 分析进度 */}
                  {analyzing && analysisProgress && (
                    <div style={{
                      marginTop: 16, padding: 16,
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: 12,
                      border: '1px solid rgba(99,102,241,0.2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <LoadingOutlined style={{ color: '#818cf8' }} />
                        <span style={{ color: '#cbd5e1' }}>{analysisProgress.message || '分析中...'}</span>
                      </div>
                      {analysisProgress.phase === 'chapters' && analysisProgress.total && (
                        <Progress
                          percent={Math.round(((analysisProgress.current || 0) / analysisProgress.total) * 100)}
                          size="small"
                          strokeColor={{ '0%': '#6366f1', '100%': '#7c3aed' }}
                          format={() => `${analysisProgress.current || 0}/${analysisProgress.total}`}
                        />
                      )}
                    </div>
                  )}

                  {/* 错误展示 */}
                  {analysisError && !analyzing && (
                    <Alert
                      type="error"
                      showIcon
                      message={analysisError}
                      style={{ marginTop: 16 }}
                    />
                  )}

                  {/* 分析结果预览 */}
                  {analysisResult && analysisPayload && !analyzing && (
                    <div style={{
                      marginTop: 16, padding: 16,
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: 12,
                      border: '1px solid rgba(99,102,241,0.2)',
                      maxHeight: 360,
                      overflowY: 'auto',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <CheckCircleOutlined style={{ color: '#34d399' }} />
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>AI 分析完成</span>
                      </div>

                      {/* 小说概览 */}
                      {analysisResult.novel && (
                        <>
                          <Descriptions column={isMobile ? 1 : 2} size="small" colon={false} style={{ marginBottom: 12 }}>
                            <Descriptions.Item label="标题" span={2}>{analysisResult.novel.title || '未命名'}</Descriptions.Item>
                            <Descriptions.Item label="题材">{analysisResult.novel.genre || '未知'}</Descriptions.Item>
                            {analysisResult.novel.theme && (
                              <Descriptions.Item label="主题">{analysisResult.novel.theme}</Descriptions.Item>
                            )}
                          </Descriptions>
                          {analysisResult.novel.main_plot && (
                            <div style={{ marginBottom: 12 }}>
                              <span style={{ color: '#818cf8', fontSize: 12 }}>主线：</span>
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>{analysisResult.novel.main_plot}</span>
                            </div>
                          )}
                          <Divider style={{ margin: '8px 0' }} />
                        </>
                      )}

                      {/* 角色列表 */}
                      {analysisResult.characters && analysisResult.characters.length > 0 && (
                        <>
                          <span style={{ color: '#818cf8', fontWeight: 600, fontSize: 13 }}>
                            角色（{analysisResult.characters.length}人）
                          </span>
                          <List
                            size="small"
                            dataSource={analysisResult.characters}
                            renderItem={(ch: any) => (
                              <List.Item style={{ padding: '4px 0', borderBottom: '1px solid rgba(99,102,241,0.08)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Tag color={ch.importance === 'high' ? 'magenta' : ch.importance === 'medium' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                                    {ch.importance === 'high' ? '核心' : ch.importance === 'medium' ? '重要' : '次要'}
                                  </Tag>
                                  <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{ch.name}</span>
                                  <span style={{ color: '#64748b', fontSize: 12 }}>{ch.role}</span>
                                </div>
                              </List.Item>
                            )}
                          />
                          <Divider style={{ margin: '8px 0' }} />
                        </>
                      )}

                      {/* 章节概要 */}
                      {analysisResult.chapters && analysisResult.chapters.length > 0 && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ color: '#818cf8', fontWeight: 600, fontSize: 13 }}>
                              章纲（{analysisResult.chapters.length}章）
                            </span>
                            {analysisResult.chapters.some((c: any) => c.content) && (
                              <Tag color="green" style={{ fontSize: 10 }}>
                                {analysisResult.chapters.filter((c: any) => c.content).length} 章已生成正文
                              </Tag>
                            )}
                          </div>
                          <List
                            size="small"
                            dataSource={analysisResult.chapters.slice(0, 10)}
                            renderItem={(ch: any) => (
                              <List.Item style={{ padding: '4px 0', borderBottom: '1px solid rgba(99,102,241,0.08)' }}>
                                <div style={{ width: '100%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 12 }}>
                                      {ch.chapter_number}. {ch.title || `第${ch.chapter_number}章`}
                                    </span>
                                    {ch.content && <Tag color="green" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>有正文</Tag>}
                                  </div>
                                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                                    {ch.summary?.substring(0, 80)}{(ch.summary?.length || 0) > 80 ? '...' : ''}
                                  </div>
                                </div>
                              </List.Item>
                            )}
                          />
                          {analysisResult.chapters.length > 10 && (
                            <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                              ... 还有 {analysisResult.chapters.length - 10} 章
                            </div>
                          )}
                        </>
                      )}

                      {/* 警告 */}
                      {analysisResult.warnings && analysisResult.warnings.length > 0 && (
                        <Alert
                          type="warning"
                          showIcon
                          message={analysisResult.warnings.join('；')}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    {analyzing && (
                      <Button onClick={handleCancelAnalysis} style={{ borderRadius: 12 }}>
                        取消分析
                      </Button>
                    )}
                    {!analysisPayload && !analyzing && (
                      <Button
                        type="primary"
                        onClick={handleStartAnalysis}
                        disabled={!docxBase64 && smartImportText.trim().length < 100}
                        icon={<ThunderboltOutlined />}
                        style={{
                          height: 48,
                          paddingInline: 32,
                          fontSize: 16,
                          fontWeight: 600,
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          border: 'none',
                          borderRadius: 12,
                          boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                        }}
                      >
                        开始 AI 分析
                      </Button>
                    )}
                    {analysisPayload && !analyzing && (
                      <Button
                        type="primary"
                        onClick={handleSmartImportSubmit}
                        loading={importing}
                        style={{
                          height: 48,
                          paddingInline: 32,
                          fontSize: 16,
                          fontWeight: 600,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          border: 'none',
                          borderRadius: 12,
                          boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                        }}
                      >
                        确认导入此小说
                      </Button>
                    )}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              background: 'rgba(239,68,68,0.15)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ExclamationCircleOutlined style={{ color: '#f87171', fontSize: 20 }} />
            </div>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>删除小说</span>
          </div>
        }
        open={!!deleteTarget}
        onCancel={resetDeleteState}
        footer={null}
        styles={{
          content: {
            background: 'rgba(30,41,59,0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 20,
          },
          header: {
            background: 'transparent',
            borderBottom: '1px solid rgba(239,68,68,0.15)',
            padding: '20px 24px',
          },
          body: { padding: isMobile ? '16px' : '24px' },
        }}
        width={isMobile ? '92vw' : 480}
      >
        <div style={{
          padding: '20px 16px',
          marginBottom: 20,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12,
        }}>
          <div style={{ color: '#fca5a5', fontSize: 14, lineHeight: 1.8, marginBottom: 8 }}>
            此操作不可恢复！小说 <strong style={{ color: '#f87171', fontSize: 15 }}>《{deleteTarget?.title}》</strong> 及其所有章节、人物设定将被永久删除。
          </div>
          <div style={{ color: '#f87171', fontSize: 13, fontWeight: 500 }}>
            请输入 <span style={{
              background: 'rgba(239,68,68,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.3)',
            }}>确认删除</span> 以继续
          </div>
        </div>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="请输入'确认删除'"
          style={{
            background: 'rgba(15,23,42,0.5)',
            borderColor: confirmText === '确认删除' ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.3)',
            color: '#f1f5f9',
            height: 48,
            fontSize: 15,
            borderRadius: 12,
            marginBottom: 20,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button
            onClick={resetDeleteState}
            disabled={deleting}
            style={{
              height: 40,
              paddingInline: 20,
              borderRadius: 10,
              color: '#94a3b8',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent',
            }}
          >
            取消
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            loading={deleting}
            disabled={confirmText !== '确认删除'}
            style={{
              height: 40,
              paddingInline: 20,
              borderRadius: 10,
              fontWeight: 600,
              border: 'none',
              background: confirmText === '确认删除'
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'rgba(71,85,105,0.3)',
              color: confirmText === '确认删除' ? '#fff' : '#64748b',
              boxShadow: confirmText === '确认删除' ? '0 4px 12px rgba(239,68,68,0.3)' : 'none',
              cursor: confirmText === '确认删除' ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
            }}
          >
            确认删除
          </Button>
        </div>
      </Modal>

      {/* 动画样式 */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default DashboardPage;