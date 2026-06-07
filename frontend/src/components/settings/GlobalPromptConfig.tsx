import React, { useEffect, useState } from 'react';
import { Button, Input, message, Switch, Space, Divider, Alert } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { getWritingPromptApi, updateWritingPromptApi } from '../../api/site';

const DEFAULT_PROMPT = `1. 保持原文核心语义与情节走向不变，在此基础上提升表达质量，尊重作者的创作意图与角色个性。
2. 语句通顺、逻辑清晰：补充缺失主语，修正语法错误，消除歧义表达。短句与长句交替使用，保持自然的阅读节奏。
3. 句式灵活多变，避免同一句式连续重复；相邻句段中的高频词汇使用恰当近义词替换，专业术语辅以通俗解释。
4. 叙事语言流畅自然不堆砌修饰；对话贴合角色身份与性格，口语化但不粗俗；描写注重画面感与沉浸感，避免空洞形容词罗列。
5. 根据小说类型（玄幻/都市/科幻/言情等）适当调整用词与修辞风格，不同类型场景（动作/抒情/悬疑）采用对应的语言节奏。
6. 使用规范中文标点，避免中英符号混用；段落间保持逻辑衔接，段落长度适中以维持视觉呼吸感。
7. 以上要求适用于所有写作输出阶段，请严格执行。`;

const GlobalPromptConfig: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    setLoading(true);
    try {
      const data = await getWritingPromptApi();
      const saved = data?.prompt;
      if (saved) {
        setPrompt(saved);
        setEnabled(true);
      } else {
        setPrompt(DEFAULT_PROMPT);
        setEnabled(true);
      }
    } catch (err: any) {
      // 非管理员用户可能无法访问，静默处理
      if (err.response?.status !== 401) {
        message.error('加载全局提示词失败');
      }
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  };

  const handleSave = async () => {
    const text = enabled ? prompt.trim() : '';
    setSaving(true);
    try {
      await updateWritingPromptApi(text);
      message.success('全局提示词已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT);
    setEnabled(true);
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="全局提示词会在每次 AI 写作、润色、修订时自动注入到系统指令中，影响所有章节的写作风格"
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 500 }}>启用全局提示词</span>
        <Switch
          checked={enabled}
          onChange={(v) => setEnabled(v)}
          disabled={loading || saving}
        />
      </div>

      <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 12 }}>
        提示词内容（将要附加到 AI 写作指令的末尾）
      </div>
      <Input.TextArea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={14}
        disabled={!enabled || saving}
        placeholder="自定义全局写作风格指令..."
        style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          background: 'rgba(15,23,42,0.5)',
          borderColor: 'rgba(99,102,241,0.3)',
          color: '#f1f5f9',
          borderRadius: 12,
        }}
      />

      <Divider style={{ margin: '16px 0' }} />

      <Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!initialized}
          style={{
            height: 40,
            fontSize: 14,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            border: 'none',
            borderRadius: 12,
          }}
        >
          保存提示词
        </Button>
        <Button
          icon={<UndoOutlined />}
          onClick={handleReset}
          disabled={saving}
          style={{ borderRadius: 12 }}
        >
          恢复默认
        </Button>
      </Space>
    </div>
  );
};

export default GlobalPromptConfig;
