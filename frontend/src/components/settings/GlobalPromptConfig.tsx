import React, { useEffect, useState } from 'react';
import { Button, Input, message, Switch, Space, Divider, Alert } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { getWritingPromptApi, updateWritingPromptApi } from '../../api/site';

const GlobalPromptConfig: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
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
      const nextDefault = data.defaultPrompt || data.prompt || '';
      setDefaultPrompt(nextDefault);
      setPrompt(data.prompt || nextDefault);
      setEnabled(data.enabled !== false);
    } catch (err: any) {
      // 非管理员用户可能无法访问，静默处理
      if (err.response?.status !== 401) {
        message.error('加载个人提示词失败');
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
      const data = await updateWritingPromptApi(text);
      setDefaultPrompt(data.defaultPrompt || defaultPrompt);
      setPrompt(data.prompt || data.defaultPrompt || defaultPrompt);
      setEnabled(data.enabled !== false);
      message.success('个人提示词已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(defaultPrompt);
    setEnabled(true);
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="个人全局提示词只对当前账号生效，会在每次 AI 写作、润色、修订时自动注入到系统指令中"
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 500 }}>启用个人提示词</span>
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
        placeholder="自定义个人写作风格指令..."
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
