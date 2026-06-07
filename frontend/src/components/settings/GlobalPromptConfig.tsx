import React, { useEffect, useState } from 'react';
import { Button, Input, message, Switch, Space, Divider, Alert } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { getWritingPromptApi, updateWritingPromptApi } from '../../api/site';

const DEFAULT_PROMPT = `1. 在不大幅改动原文总字数的前提下，调整语序、替换同义词、变换主谓宾结构，补充无主语句的主语，简化语言表达，确保语句逻辑通顺，贴合基础写作规范。
2. 弱化专业感，营造平实普通的文笔效果——避免精炼老练的文风，贴近新手作者写起来略为吃力的状态。删除"我觉得""我认为"等主观表述。
3. 减少句号使用，多用逗号、分号衔接；将长句拆分为短句；高频词汇替换为同义词；专业术语换成通俗易懂的简单表达。
4. 灵活变换句式结构（把字句、被动句互换），调整语序但不改变原文核心语义。删除过于口语化的表达，保持基本语言逻辑。
5. 以上要求必须严格执行，适用于所有写作输出。`;

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
