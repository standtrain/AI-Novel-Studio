import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Typography, App, Spin, Modal, Tooltip } from 'antd';
import {
  SendOutlined, StopOutlined, RobotOutlined, DeleteOutlined,
  PlusOutlined, MessageOutlined, ExclamationCircleOutlined,
  FileAddOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useMobile from '../hooks/useMobile';
import { startChatStream } from '../api/chat';
import { startImportAnalysisStream } from '../api/agents';
import { importNovelApi } from '../api/novels';
import { listConversationsApi, getConversationApi, deleteConversationApi } from '../api/conversations';
import type { ChatMessage, Conversation, ImportNovelData } from '../types';

const { TextArea } = Input;
const { Title, Text } = Typography;

const SUGGESTED_PROMPTS = [
  '帮我构思一个奇幻小说的世界观',
  '如何写出有深度的人物弧光？',
  '给我的主角设计一个背景故事',
  '分析一下悬疑小说的节奏把控技巧',
];

const ChatPage: React.FC = () => {
  const isMobile = useMobile();
  const navigate = useNavigate();
  const { message: msgApi } = App.useApp();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [convsLoading, setConvsLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<number | null>(null);

  // 自增 key 确保同一对话切换时组件强制刷新
  const [chatKey, setChatKey] = useState(0);

  // 智能导入状态
  const [importingMsgIdx, setImportingMsgIdx] = useState<number | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  const showImportConfirm = (payload: ImportNovelData) => {
    const chapters = payload.chapters || [];
    const characters = payload.characters || [];
    const wordCount = chapters.reduce((sum, ch) => sum + (ch.content ? ch.content.length : 0), 0);
    const title = payload.novel?.title || payload.title || '导入的小说';

    Modal.confirm({
      title: <span style={{ color: '#f1f5f9' }}>确认导入为小说</span>,
      icon: <FileAddOutlined style={{ color: '#818cf8' }} />,
      content: (
        <div style={{ color: '#cbd5e1', lineHeight: 1.8 }}>
          <div>标题：{title}</div>
          <div>章节：{chapters.length} 章</div>
          <div>角色：{characters.length} 个</div>
          <div>正文：约 {wordCount} 字</div>
        </div>
      ),
      okText: '确认导入',
      cancelText: '取消',
      onOk: async () => {
        try {
          const { novel } = await importNovelApi(payload);
          msgApi.success(`小说《${novel.title}》导入成功`);
          navigate(`/novel/${novel.id}`);
        } catch (err: any) {
          msgApi.error(err.response?.data?.error || '导入失败');
          throw err;
        } finally {
          setImportingMsgIdx(null);
        }
      },
      onCancel: () => {
        setImportingMsgIdx(null);
      },
    });
  };

  // 导入 AI 回复为小说
  const handleImportAsNovel = (msgIdx: number, content: string) => {
    if (importingMsgIdx !== null) return;
    if (!content || content.trim().length < 100) {
      msgApi.warning('内容过短，至少需要100字以上才能导入');
      return;
    }

    setImportingMsgIdx(msgIdx);

    importAbortRef.current = startImportAnalysisStream(content, '', (event, data) => {
      switch (event) {
        case 'progress':
          // 静默等待分析完成
          break;
        case 'import_payload':
          showImportConfirm(data);
          break;
        case 'error':
          msgApi.error(data.message || '分析失败');
          setImportingMsgIdx(null);
          break;
        case 'abort':
          setImportingMsgIdx(null);
          break;
      }
    });
  };

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    try {
      setConvsLoading(true);
      const result = await listConversationsApi(1, 50);
      setConversations(result.rows);
    } catch {
      // 静默失败
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 切换对话时加载消息
  useEffect(() => {
    if (!activeConvId) {
      convIdRef.current = null;
      setMessages([]);
      setChatKey((k) => k + 1);
      return;
    }
    convIdRef.current = activeConvId;
    (async () => {
      try {
        setMsgsLoading(true);
        const conv = await getConversationApi(activeConvId);
        if (convIdRef.current === activeConvId) {
          const msgs: ChatMessage[] = (conv.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
          }));
          setMessages(msgs);
          setChatKey((k) => k + 1);
        }
      } catch {
        msgApi.error('加载对话失败');
      } finally {
        setMsgsLoading(false);
      }
    })();
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      importAbortRef.current?.abort();
    };
  }, []);

  // 新建对话
  const handleNewConversation = () => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setActiveConvId(null);
    convIdRef.current = null;
    setMessages([]);
    setStreamContent('');
    setIsStreaming(false);
    streamingRef.current = false;
  };

  // 选择对话
  const handleSelectConversation = (id: number) => {
    if (isStreaming && activeConvId === id) return;
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
      streamingRef.current = false;
    }
    setActiveConvId(id);
    setStreamContent('');
  };

  // 删除对话
  const handleDeleteConversation = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: <span style={{ color: '#f1f5f9' }}>确认删除</span>,
      icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
      content: <span style={{ color: '#ef4444' }}>删除后对话记录不可恢复，确定删除？</span>,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteConversationApi(id);
          if (activeConvId === id) {
            setActiveConvId(null);
            setMessages([]);
            setStreamContent('');
          }
          await loadConversations();
          msgApi.success('已删除');
        } catch {
          msgApi.error('删除失败');
        }
      },
    });
  };

  const appendAssistant = (content: string) => {
    if (!content) return;
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
  };

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInputValue('');
    setIsStreaming(true);
    setStreamContent('');
    streamingRef.current = true;

    const convId = convIdRef.current;

    abortRef.current = startChatStream(trimmed, (event, data) => {
      switch (event) {
        case 'conversation':
          if (data.conversationId && !convId) {
            setActiveConvId(data.conversationId);
            convIdRef.current = data.conversationId;
          }
          break;
        case 'chunk':
          setStreamContent((prev) => prev + (data.text || ''));
          break;
        case 'model_fallback':
          msgApi.warning(`模型已切换：${data.actualModel || '备选'}`);
          break;
        case 'error':
          msgApi.error(data.message || '对话失败');
          setIsStreaming(false);
          streamingRef.current = false;
          break;
        case 'abort':
          setStreamContent('');
          setIsStreaming(false);
          streamingRef.current = false;
          loadConversations();
          break;
        case 'done':
          setStreamContent((prev) => {
            appendAssistant(prev);
            return '';
          });
          setIsStreaming(false);
          streamingRef.current = false;
          loadConversations();
          break;
      }
    }, convId);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const convList = conversations;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0 }}>
      {/* ====== 对话列表侧边栏（常驻） ====== */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid rgba(99,102,241,0.12)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 12px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text strong style={{ color: '#cbd5e1', fontSize: 13 }}>
            对话列表
          </Text>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleNewConversation}
          >
            新建
          </Button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 8px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(99,102,241,0.3) transparent',
          }}
        >
          {convsLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Spin size="small" />
            </div>
          ) : convList.length === 0 ? (
            <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', display: 'block', padding: 20 }}>
              暂无对话
            </Text>
          ) : (
            convList.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: activeConvId === conv.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: activeConvId === conv.id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    activeConvId === conv.id ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    activeConvId === conv.id ? 'rgba(99,102,241,0.15)' : 'transparent';
                }}
              >
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <Text
                    ellipsis
                    style={{ color: '#cbd5e1', fontSize: 13, display: 'block' }}
                  >
                    <MessageOutlined style={{ marginRight: 6, fontSize: 12, color: '#6366f1' }} />
                    {conv.title}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 11 }}>
                    {new Date(conv.updated_at).toLocaleDateString('zh-CN')}
                  </Text>
                </div>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    style={{ color: '#64748b', flexShrink: 0, opacity: 0.6 }}
                  />
                </Tooltip>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ====== 聊天区域 ====== */}
      <div
        key={chatKey}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 800,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 0 14px',
            borderBottom: '1px solid rgba(99,102,241,0.15)',
            marginBottom: 14,
            flexShrink: 0,
          }}
        >
          <div>
            <Title level={4} style={{ color: '#f1f5f9', margin: 0 }}>
              <RobotOutlined style={{ marginRight: 8, color: '#6366f1' }} />
              AI 对话助手
            </Title>
          </div>
          {messages.length > 0 && (
            <Button
              icon={<DeleteOutlined />}
              onClick={handleNewConversation}
              style={{ color: '#94a3b8', borderColor: 'rgba(99,102,241,0.2)' }}
            >
              新建对话
            </Button>
          )}
        </div>

        {/* 消息区域 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingRight: 8,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(99,102,241,0.3) transparent',
          }}
        >
          {msgsLoading ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <Spin size="large" />
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <RobotOutlined
                style={{ fontSize: 48, color: '#6366f1', marginBottom: 16, opacity: 0.6 }}
              />
              <Title level={5} style={{ color: '#94a3b8' }}>
                开始对话
              </Title>
              <Text style={{ color: '#64748b', fontSize: 13 }}>
                输入你想讨论的话题，或点击下方快捷提问
              </Text>
              <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <Button
                    key={i}
                    size="small"
                    style={{
                      borderColor: 'rgba(99,102,241,0.3)',
                      color: '#cbd5e1',
                      background: 'rgba(30,41,59,0.6)',
                    }}
                    onClick={() => setInputValue(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      maxWidth: isMobile ? '92%' : '75%',
                      padding: '10px 16px',
                      borderRadius: 14,
                      background:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                          : 'rgba(30,41,59,0.85)',
                      border:
                        msg.role === 'user'
                          ? 'none'
                          : '1px solid rgba(99,102,241,0.15)',
                      color: '#f1f5f9',
                      fontSize: 14,
                      lineHeight: 1.75,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.content.length >= 100 && (
                    <div style={{ marginTop: 6 }}>
                      <Button
                        type="link"
                        size="small"
                        icon={importingMsgIdx === i ? <LoadingOutlined /> : <FileAddOutlined />}
                        onClick={() => handleImportAsNovel(i, msg.content)}
                        disabled={importingMsgIdx !== null}
                        style={{ color: '#818cf8', padding: 0, fontSize: 12 }}
                      >
                        {importingMsgIdx === i ? '正在导入…' : '导入为小说'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {/* 流式输出气泡 */}
              {isStreaming && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      maxWidth: isMobile ? '92%' : '75%',
                      padding: '10px 16px',
                      borderRadius: 14,
                      background: 'rgba(30,41,59,0.85)',
                      border: '1px solid rgba(99,102,241,0.15)',
                      color: '#f1f5f9',
                      fontSize: 14,
                      lineHeight: 1.75,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {streamContent || <Spin size="small" />}
                    {streamContent && <span className="stream-cursor" />}
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div
          style={{
            paddingTop: 12,
            borderTop: '1px solid rgba(99,102,241,0.15)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行…"
            disabled={isStreaming}
            autoSize={{ minRows: 1, maxRows: 5 }}
            style={{
              background: 'rgba(15,23,42,0.5)',
              borderColor: 'rgba(99,102,241,0.3)',
              color: '#f1f5f9',
              resize: 'none',
            }}
          />
          {isStreaming ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              style={{ height: 40, flexShrink: 0 }}
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!inputValue.trim()}
              style={{ height: 40, flexShrink: 0 }}
            >
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
