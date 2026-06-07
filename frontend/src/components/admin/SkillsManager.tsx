import React, { useEffect, useState, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, Tag, Space, message, Typography, Radio, Upload, Divider, Alert, Descriptions, Spin, Progress } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, UploadOutlined, FileTextOutlined, FolderOpenOutlined, InboxOutlined } from '@ant-design/icons';
import { getAdminSkillsApi, createSkillApi, updateSkillApi, deleteSkillApi, batchImportSkillsApi, Skill } from '../../api/skills';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

const phaseOptions = [
  { value: 'all', label: '全部阶段' },
  { value: 'outline', label: '整书大纲' },
  { value: 'characters', label: '人物设定' },
  { value: 'chapters_outline', label: '章节大纲' },
  { value: 'write_chapter', label: '章节写作（含审查/润色/提取）' },
  { value: 'context_assembly', label: '写前任务书' },
  { value: 'review', label: '章节审查' },
  { value: 'polish', label: '章节润色' },
  { value: 'data_extraction', label: '数据提取' },
];

const phaseColorMap: Record<string, string> = {
  all: 'purple',
  outline: 'blue',
  characters: 'green',
  chapters_outline: 'orange',
  write_chapter: 'red',
  context_assembly: 'cyan',
  review: 'gold',
  polish: 'magenta',
  data_extraction: 'geekblue',
};

type SkillPhase = 'outline' | 'characters' | 'chapters_outline' | 'write_chapter' | 'context_assembly' | 'review' | 'polish' | 'data_extraction' | 'all';
const validPhases: SkillPhase[] = ['outline', 'characters', 'chapters_outline', 'write_chapter', 'context_assembly', 'review', 'polish', 'data_extraction', 'all'];

function castPhase(p: string): SkillPhase {
  return validPhases.includes(p as SkillPhase) ? (p as SkillPhase) : 'all';
}

// ========== 增强版 SKILL.md 解析器（参考 Claude Code skill 格式） ==========

interface ParsedSkillMd {
  name: string;
  display_name: string;
  description: string;
  system_prompt: string;     // 完整 SKILL.md 内容（frontmatter + body）
  phase: SkillPhase;
  allowed_tools?: string;
  parameters_schema?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * 解析 YAML frontmatter + Markdown 格式的 SKILL.md
 * 支持：
 * - 简单 key: value 格式
 * - 多值 key: value1 value2 value3 (如 allowed-tools)
 * - 引号包裹的 value
 * - 嵌套 JSON 值 (如 parameters_schema)
 */
function parseSkillMd(content: string): ParsedSkillMd | null {
  try {
    const trimmed = content.trim();
    if (!trimmed) return null;

    // 未以 --- 开头：整个内容作为纯文本 SKILL.md
    if (!trimmed.startsWith('---')) {
      const firstLine = trimmed.split('\n')[0].replace(/^#\s*/, '');
      const name = firstLine.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().substring(0, 50) || 'imported_skill';
      return {
        name,
        display_name: firstLine.substring(0, 100) || name,
        description: firstLine,
        system_prompt: trimmed,
        phase: 'all',
        allowed_tools: undefined,
      };
    }

    // 查找 YAML frontmatter 结束标记
    const endOfFrontmatter = trimmed.indexOf('---', 3);
    if (endOfFrontmatter === -1) return null;

    const frontmatterStr = trimmed.substring(3, endOfFrontmatter).trim();
    const markdownBody = trimmed.substring(endOfFrontmatter + 3).trim();

    // 解析 frontmatter（基于行级解析，处理 key: value / list）
    const fm = parseFrontmatter(frontmatterStr);

    // 提取标题
    const titleMatch = markdownBody.match(/^#\s+(.+)/m);
    const displayName = fm.display_name || fm.title || (titleMatch ? titleMatch[1] : fm.name || '未命名技能');
    const skillName = fm.name || displayName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().substring(0, 50);

    // 解析 allowed-tools（可能是字符串或数组）
    let allowedTools: string | undefined;
    if (fm['allowed-tools'] !== undefined) {
      allowedTools = Array.isArray(fm['allowed-tools'])
        ? (fm['allowed-tools'] as string[]).join(', ')
        : String(fm['allowed-tools']);
    }

    // 解析 parameters_schema（JSON 字符串）
    let paramSchema: Record<string, any> | undefined;
    if (fm.parameters_schema) {
      try {
        paramSchema = typeof fm.parameters_schema === 'string'
          ? JSON.parse(fm.parameters_schema)
          : fm.parameters_schema;
      } catch { /* 解析失败则忽略 */ }
    }

    // 构建 metadata：保存原始 frontmatter 中的额外字段
    const knownKeys = new Set(['name', 'display_name', 'title', 'description', 'allowed-tools', 'allowed_tools',
      'phase', 'parameters_schema', 'parameters-schema']);
    const extraMeta: Record<string, any> = {};
    Object.entries(fm).forEach(([k, v]) => {
      const normalized = k.replace(/-/g, '_');
      if (!knownKeys.has(k) && !knownKeys.has(normalized)) {
        extraMeta[k] = v;
      }
    });

    // 完整 SKILL.md 内容作为 system_prompt（保留 frontmatter + body）
    const fullContent = trimmed;

    return {
      name: skillName,
      display_name: displayName.substring(0, 200),
      description: fm.description || displayName,
      system_prompt: fullContent,
      phase: castPhase(fm.phase || 'all'),
      allowed_tools: allowedTools,
      parameters_schema: paramSchema,
      metadata: Object.keys(extraMeta).length > 0 ? extraMeta : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 轻量级 YAML frontmatter 解析器
 * 支持：简单 key:value、key: val1 val2 val3（列表）、字符串引号、基本嵌套
 */
function parseFrontmatter(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split('\n');

  let currentKey = '';
  let currentIndent = 0;

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const colonIdx = line.indexOf(':');

    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      let value = line.substring(colonIdx + 1).trim();

      // 去除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value === '' || value === '|' || value === '>') {
        // 多行值占位符
        currentKey = key;
        currentIndent = indent;
        result[key] = value === '|' || value === '>' ? '' : '';
        continue;
      }

      // 尝试解析为 JSON
      if (value.startsWith('{') || value.startsWith('[')) {
        try { result[key] = JSON.parse(value); } catch { result[key] = value; }
      } else {
        result[key] = value;
      }

      currentKey = key;
      currentIndent = indent;
    } else if (currentKey && indent > currentIndent) {
      // 续行或多行内容的追加
      const trimmedLine = line.trim();
      if (Array.isArray(result[currentKey])) {
        (result[currentKey] as string[]).push(trimmedLine.replace(/^-\s*/, ''));
      } else if (typeof result[currentKey] === 'string') {
        result[currentKey] += '\n' + line;
      }
    }
  }

  return result;
}

// ========== 组件 ==========

const SkillsManager: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [form] = Form.useForm();

  // 导入相关状态
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importFormat, setImportFormat] = useState<'skill_md' | 'json' | 'text'>('skill_md');
  const [parsedSkill, setParsedSkill] = useState<ParsedSkillMd | null>(null);
  const [parsedBatchSkills, setParsedBatchSkills] = useState<ParsedSkillMd[]>([]);
  const [importMode, setImportMode] = useState<'single' | 'batch'>('single');
  const [importing, setImporting] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [readingProgress, setReadingProgress] = useState({ current: 0, total: 0 });
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const { skills } = await getAdminSkillsApi();
      setSkills(skills);
    } catch {
      message.error('获取技能列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSkills(); }, []);

  // ========== 创建/编辑 ==========
  const handleCreate = () => {
    setEditingSkill(null);
    form.resetFields();
    form.setFieldsValue({ phase: 'all', enabled: true, sort_order: 0 });
    setModalOpen(true);
  };

  const handleEdit = (skill: Skill) => {
    setEditingSkill(skill);
    form.setFieldsValue({
      name: skill.name,
      display_name: skill.display_name,
      description: skill.description,
      icon: skill.icon || '',
      system_prompt: skill.system_prompt,
      phase: skill.phase,
      parameters_schema: skill.parameters_schema ? JSON.stringify(skill.parameters_schema, null, 2) : '',
      enabled: skill.enabled,
      sort_order: skill.sort_order,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        icon: values.icon || null,
        parameters_schema: values.parameters_schema ? JSON.parse(values.parameters_schema) : null,
      };

      if (editingSkill) {
        await updateSkillApi(editingSkill.id, data);
        message.success('技能已更新');
      } else {
        await createSkillApi(data);
        message.success('技能已创建');
      }
      setModalOpen(false);
      loadSkills();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (skillId: number) => {
    try {
      await deleteSkillApi(skillId);
      message.success('技能已删除');
      loadSkills();
    } catch {
      message.error('删除失败');
    }
  };

  // ========== 增强版导入功能 ==========

  const resetImportState = () => {
    setImportContent('');
    setParsedSkill(null);
    setParsedBatchSkills([]);
    setImportMode('single');
    setFileName('');
    setReadingFiles(false);
    setReadingProgress({ current: 0, total: 0 });
  };

  const handleImportOpen = () => {
    resetImportState();
    setImportFormat('skill_md');
    setImportModalOpen(true);
  };

  /** 解析粘贴/输入的内容 */
  const handleParse = () => {
    if (!importContent.trim()) {
      message.warning('请输入要导入的内容');
      return;
    }

    let parsed: ParsedSkillMd | null = null;

    if (importFormat === 'skill_md' || importFormat === 'text') {
      parsed = parseSkillMd(importContent);
    } else if (importFormat === 'json') {
      try {
        const json = JSON.parse(importContent);
        // 支持单条和批量 JSON
        if (Array.isArray(json)) {
          const skills = json.map((item: any) => ({
            name: item.name || '',
            display_name: item.display_name || item.name || '',
            description: item.description || '',
            system_prompt: item.system_prompt || item.content || '',
            phase: castPhase(item.phase || 'all'),
            allowed_tools: item.allowed_tools || item['allowed-tools'] || undefined,
            parameters_schema: item.parameters_schema || null,
            metadata: item.metadata || undefined,
          }));
          setParsedBatchSkills(skills);
          setImportMode('batch');
          setParsedSkill(null);
          message.success(`已解析 ${skills.length} 个技能`);
          return;
        }
        parsed = {
          name: json.name || '',
          display_name: json.display_name || json.name || '',
          description: json.description || '',
          system_prompt: json.system_prompt || json.content || '',
          phase: castPhase(json.phase || 'all'),
          allowed_tools: json.allowed_tools || json['allowed-tools'] || undefined,
          parameters_schema: json.parameters_schema || null,
          metadata: json.metadata || undefined,
        };
      } catch {
        message.error('JSON 格式无效');
        return;
      }
    }

    if (!parsed || !parsed.system_prompt) {
      message.error('无法解析技能内容，请检查格式');
      return;
    }

    setParsedSkill(parsed);
    setImportMode('single');
    setParsedBatchSkills([]);
    message.success('解析成功！请确认后导入');
  };

  /** 单个导入提交 */
  const handleImportSubmit = async () => {
    if (!parsedSkill) return;
    setImporting(true);
    try {
      await createSkillApi({
        name: parsedSkill.name,
        display_name: parsedSkill.display_name || parsedSkill.name || '导入技能',
        description: parsedSkill.description || '',
        system_prompt: parsedSkill.system_prompt || '',
        phase: castPhase(parsedSkill.phase || 'all'),
        parameters_schema: parsedSkill.parameters_schema,
        allowed_tools: parsedSkill.allowed_tools,
        metadata: parsedSkill.metadata,
        enabled: true,
        sort_order: skills.length + 1,
      });
      message.success('技能导入成功');
      setImportModalOpen(false);
      loadSkills();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  /** 批量导入提交 */
  const handleBatchImportSubmit = async () => {
    if (parsedBatchSkills.length === 0) return;
    setImporting(true);
    try {
      const result = await batchImportSkillsApi(parsedBatchSkills);
      const { created, skipped, errors } = result;
      const msgParts: string[] = [];
      if (created.length > 0) msgParts.push(`成功导入 ${created.length} 个`);
      if (skipped.length > 0) msgParts.push(`跳过 ${skipped.length} 个（已存在）`);
      if (errors.length > 0) msgParts.push(`失败 ${errors.length} 个`);
      message.success(msgParts.join('，'));
      setImportModalOpen(false);
      loadSkills();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  /** 文件/文件夹选择处理 */
  const handleFileOrFolderSelect = (files: FileList | null, isFolder: boolean) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    if (isFolder) {
      // 文件夹导入：查找所有 SKILL.md 文件
      const skillMdFiles = fileList.filter(f => f.name === 'SKILL.md' || f.name.endsWith('/SKILL.md'));

      if (skillMdFiles.length === 0) {
        message.warning('所选目录中未找到 SKILL.md 文件');
        return;
      }

      setReadingFiles(true);
      setReadingProgress({ current: 0, total: skillMdFiles.length });

      const parsedSkills: ParsedSkillMd[] = [];
      let processedCount = 0;
      const totalFiles = skillMdFiles.length;

      skillMdFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          const parsed = parseSkillMd(text);
          processedCount++;
          setReadingProgress({ current: processedCount, total: totalFiles });

          if (parsed && parsed.system_prompt) {
            // 查找同目录下的 references 文件
            const dirPath = file.webkitRelativePath.replace(/\/?SKILL\.md$/, '');
            const refFiles = fileList.filter(f =>
              f.webkitRelativePath.startsWith(dirPath + '/') &&
              f.name !== 'SKILL.md'
            );
            if (refFiles.length > 0) {
              parsed.metadata = {
                ...(parsed.metadata || {}),
                reference_files: refFiles.map(r => r.webkitRelativePath.replace(dirPath + '/', '')),
              };
            }
            parsedSkills.push(parsed);
          }

          if (processedCount === totalFiles) {
            setReadingFiles(false);
            if (parsedSkills.length === 0) {
              message.warning('未能解析任何技能');
              return;
            }
            setParsedBatchSkills(parsedSkills);
            setParsedSkill(null);
            setImportMode('batch');
            setFileName(`${parsedSkills.length} 个技能目录`);
            message.success(`已解析 ${parsedSkills.length} 个技能`);
          }
        };
        reader.onerror = () => {
          processedCount++;
          setReadingProgress({ current: processedCount, total: totalFiles });
          if (processedCount === totalFiles) {
            setReadingFiles(false);
            if (parsedSkills.length > 0) {
              setParsedBatchSkills(parsedSkills);
              setParsedSkill(null);
              setImportMode('batch');
              setFileName(`${parsedSkills.length} 个技能目录`);
            }
          }
        };
        reader.readAsText(file);
      });
    } else {
      // 单文件导入
      const file = fileList[0];
      if (!file) return;

      const ext = file.name.toLowerCase();
      if (ext.endsWith('.md')) {
        setImportFormat('skill_md');
      } else if (ext.endsWith('.json')) {
        setImportFormat('json');
      }

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setImportContent(text);
        // 自动解析
        let parsed: ParsedSkillMd | null = null;
        if (ext.endsWith('.json')) {
          try {
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
              const skills = json.map((item: any) => ({
                name: item.name || '',
                display_name: item.display_name || item.name || '',
                description: item.description || '',
                system_prompt: item.system_prompt || item.content || '',
                phase: castPhase(item.phase || 'all'),
                allowed_tools: item.allowed_tools || item['allowed-tools'] || undefined,
                parameters_schema: item.parameters_schema || null,
                metadata: item.metadata || undefined,
              }));
              setParsedBatchSkills(skills);
              setImportMode('batch');
              setParsedSkill(null);
              message.success(`已解析 ${skills.length} 个技能`);
              return;
            }
            parsed = {
              name: json.name || '',
              display_name: json.display_name || json.name || '',
              description: json.description || '',
              system_prompt: json.system_prompt || json.content || '',
              phase: castPhase(json.phase || 'all'),
              allowed_tools: json.allowed_tools || json['allowed-tools'] || undefined,
              parameters_schema: json.parameters_schema || null,
              metadata: json.metadata || undefined,
            };
          } catch { /* ignore */ }
        } else {
          parsed = parseSkillMd(text);
        }
        if (parsed && parsed.system_prompt) {
          setParsedSkill(parsed);
          setImportMode('single');
          message.success(`已加载文件：${file.name}`);
        } else {
          message.warning('无法自动解析文件，请手动粘贴内容');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileOrFolderSelect(e.target.files, false);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileOrFolderSelect(e.target.files, true);
  };

  // ========== 表格列 ==========
  const columns = [
    { title: '名称', dataIndex: 'display_name', key: 'display_name', width: 120, ellipsis: true },
    {
      title: '阶段', dataIndex: 'phase', key: 'phase',
      render: (phase: string) => <Tag color={phaseColorMap[phase] || 'default'}>{phaseOptions.find(p => p.value === phase)?.label || phase}</Tag>,
    },
    {
      title: '描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (text: string) => <Text ellipsis>{text}</Text>,
    },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 60,
      render: (enabled: boolean, record: Skill) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={async (val) => {
            try {
              await updateSkillApi(record.id, { enabled: val });
              message.success(val ? '已启用' : '已停用');
              loadSkills();
            } catch {
              message.error('操作失败');
            }
          }}
        />
      ),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: any, record: Skill) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建技能</Button>
        <Button icon={<ImportOutlined />} onClick={handleImportOpen}>导入 Skill</Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.json"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          /* @ts-ignore - webkitdirectory 支持 Chrome/Edge */
          webkitdirectory=""
          multiple
          style={{ display: 'none' }}
          onChange={handleFolderSelect}
        />
      </div>
      <Table columns={columns} dataSource={skills} rowKey="id" loading={loading} size="small" />

      {/* 创建/编辑 Modal */}
      <Modal
        title={editingSkill ? '编辑技能' : '创建技能'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="标识名" rules={[{ required: true, message: '请输入技能标识名' }]}>
            <Input placeholder="英文标识，如 enhance_dialogue" />
          </Form.Item>
          <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input placeholder="如：对话增强" />
          </Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
            <TextArea rows={2} placeholder="技能功能说明" />
          </Form.Item>
          <Form.Item name="icon" label="图标（Ant Design 图标名）">
            <Input placeholder="如 UserOutlined，留空使用默认图标" />
          </Form.Item>
          <Form.Item name="phase" label="适用阶段" rules={[{ required: true }]}>
            <Select options={phaseOptions} />
          </Form.Item>
          <Form.Item name="system_prompt" label="系统提示词" rules={[{ required: true, message: '请输入提示词' }]}>
            <TextArea rows={6} placeholder="支持 {{变量}} 占位符，如：特别注意角色 {{characterFocus}} 的内心冲突" />
          </Form.Item>
          <Form.Item name="parameters_schema" label="参数 Schema（JSON）" extra="定义用户可配置的参数及默认值">
            <TextArea rows={4} placeholder='{"type":"object","properties":{"characterFocus":{"type":"string","default":"主角"}}}' />
          </Form.Item>
          <Form.Item name="enabled" label="全局启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="sort_order" label="排序权重">
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入 Modal（增强版） */}
      <Modal
        title="导入 Skill"
        open={importModalOpen}
        onOk={
          importMode === 'batch' && parsedBatchSkills.length > 0
            ? handleBatchImportSubmit
            : parsedSkill
              ? handleImportSubmit
              : handleParse
        }
        onCancel={() => setImportModalOpen(false)}
        width={840}
        confirmLoading={importing}
        okText={
          importMode === 'batch' && parsedBatchSkills.length > 0
            ? `确认导入（${parsedBatchSkills.length} 个）`
            : parsedSkill
              ? '确认导入'
              : '解析内容'
        }
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="支持的导入格式"
          description={
            <span>
              <strong>单文件：</strong>选择 .md（SKILL.md 格式）或 .json 文件<br />
              <strong>文件夹：</strong>选择包含 SKILL.md 的技能目录（支持批量导入 skills/ 父目录）<br />
              <strong>粘贴：</strong>直接粘贴 SKILL.md 或 JSON 内容，支持 Claude Code skill 完整格式
            </span>
          }
          style={{ marginBottom: 16 }}
        />

        {/* 操作按钮区 */}
        <Space style={{ marginBottom: 12 }}>
          <Radio.Group value={importFormat} onChange={(e) => { setImportFormat(e.target.value); setParsedSkill(null); setParsedBatchSkills([]); setImportMode('single'); }}>
            <Radio.Button value="skill_md">SKILL.md</Radio.Button>
            <Radio.Button value="json">JSON</Radio.Button>
            <Radio.Button value="text">纯文本</Radio.Button>
          </Radio.Group>
          <Button
            icon={<UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
          >
            选择文件
          </Button>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => folderInputRef.current?.click()}
          >
            导入目录
          </Button>
        </Space>

        {fileName && (
          <div style={{ marginBottom: 8, color: '#818cf8' }}>
            <FileTextOutlined /> {fileName}
          </div>
        )}

        {/* 文本输入区 */}
        <TextArea
          value={importContent}
          onChange={(e) => { setImportContent(e.target.value); setParsedSkill(null); setParsedBatchSkills([]); setImportMode('single'); }}
          rows={12}
          placeholder={
            importFormat === 'skill_md'
              ? '---\nname: my-skill\ndescription: 技能描述\nallowed-tools: Read Write Bash\nphase: write_chapter\n---\n\n# 技能标题\n\n技能提示词内容...'
              : importFormat === 'json'
                ? '{"name":"my_skill","display_name":"我的技能","description":"...","system_prompt":"...","phase":"all"}'
                : '# 技能标题\n\n技能提示词内容...'
          }
          style={{ fontFamily: 'var(--font-mono)' }}
        />

        {/* 文件读取进度提示 */}
        {readingFiles && (
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(250,173,20,0.08)', borderRadius: 8, border: '1px solid rgba(250,173,20,0.2)', textAlign: 'center' }}>
            <Spin tip="">
              <div style={{ padding: 20 }}>
                <Text strong style={{ color: '#f59e0b', fontSize: 15 }}>
                  正在读取文件...
                </Text>
                <Progress
                  percent={readingProgress.total > 0 ? Math.round((readingProgress.current / readingProgress.total) * 100) : 0}
                  format={() => `${readingProgress.current} / ${readingProgress.total}`}
                  status="active"
                  style={{ maxWidth: 300, margin: '12px auto 0' }}
                />
              </div>
            </Spin>
          </div>
        )}

        {/* 单条解析预览 */}
        {parsedSkill && importMode === 'single' && (
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
            <Text strong style={{ color: '#818cf8' }}>解析结果预览</Text>
            <Divider style={{ margin: '8px 0' }} />
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="标识名">{parsedSkill.name}</Descriptions.Item>
              <Descriptions.Item label="显示名称">{parsedSkill.display_name}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{parsedSkill.description}</Descriptions.Item>
              <Descriptions.Item label="阶段">
                <Tag color={phaseColorMap[parsedSkill.phase || 'all']}>
                  {phaseOptions.find(p => p.value === parsedSkill.phase)?.label || parsedSkill.phase}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="提示词长度">{parsedSkill.system_prompt?.length || 0} 字符</Descriptions.Item>
              {parsedSkill.allowed_tools && (
                <Descriptions.Item label="允许工具" span={2}>
                  {parsedSkill.allowed_tools.split(/, ?/).map(t => <Tag key={t} color="blue">{t.trim()}</Tag>)}
                </Descriptions.Item>
              )}
              {parsedSkill.metadata && Object.keys(parsedSkill.metadata).length > 0 && (
                <Descriptions.Item label="额外元数据" span={2}>
                  <Text code>{JSON.stringify(parsedSkill.metadata)}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}

        {/* 批量解析预览 */}
        {importMode === 'batch' && parsedBatchSkills.length > 0 && (
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
            <Text strong style={{ color: '#22c55e' }}>批量导入预览（共 {parsedBatchSkills.length} 个技能）</Text>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {parsedBatchSkills.map((skill, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px', marginBottom: 4,
                  background: 'rgba(15,23,42,0.6)', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Tag color="blue">{idx + 1}</Tag>
                  <Text strong style={{ minWidth: 100 }}>{skill.display_name}</Text>
                  <Text type="secondary" ellipsis style={{ flex: 1 }}>{skill.description}</Text>
                  <Tag color={phaseColorMap[skill.phase || 'all']}>
                    {phaseOptions.find(p => p.value === skill.phase)?.label || skill.phase}
                  </Tag>
                  {skill.allowed_tools && (
                    <Text type="secondary" style={{ fontSize: 12 }}>工具: {skill.allowed_tools}</Text>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>{skill.system_prompt?.length || 0} 字符</Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SkillsManager;
