import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Select, Tag, Typography, Space, message, Descriptions, Divider,
  Radio, Card, Popconfirm, Badge, Input, Row, Col, Form,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, SettingOutlined, ReloadOutlined,
  EyeOutlined, PlusOutlined, DeleteOutlined, EditOutlined, TagsOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  getPendingTemplatesApi, getAllTemplatesAdminApi,
  reviewTemplateApi, getReviewModeConfigApi, setReviewModeConfigApi,
  NovelTemplate, TemplateReviewModeConfig, TemplateCategory,
  getAllCategoriesAdminApi, createCategoryApi, updateCategoryApi, deleteCategoryApi,
  getAiReviewConfigApi, setAiReviewConfigApi, AiReviewProviderConfig,
  deleteTemplateAdminApi, updateTemplateAdminApi,
} from '../../api/templates';

const { Text, Paragraph, Title } = Typography;

const paletteColors = ['purple', 'pink', 'cyan', 'blue', 'geekblue', 'magenta', 'orange', 'green', 'gold', 'lime', 'red', 'volcano'];
function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return paletteColors[Math.abs(hash) % paletteColors.length];
}

const iconOptions = [
  'ThunderboltOutlined', 'HeartOutlined', 'RocketOutlined', 'SearchOutlined',
  'AppleOutlined', 'SmileOutlined', 'ReadOutlined', 'EditOutlined', 'BookOutlined',
];

const TemplateReview: React.FC = () => {
  const [pending, setPending] = useState<NovelTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<NovelTemplate[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewConfig, setReviewConfig] = useState<TemplateReviewModeConfig | null>(null);
  const [aiReviewConfig, setAiReviewConfig] = useState<AiReviewProviderConfig | null>(null);
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<NovelTemplate | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // 分类管理
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<TemplateCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSort, setCatSort] = useState(0);
  const [catSaving, setCatSaving] = useState(false);

  // 编辑模板
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NovelTemplate | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm();

  useEffect(() => { loadData(); loadConfig(); loadCategories(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        getPendingTemplatesApi(),
        getAllTemplatesAdminApi(),
      ]);
      setPending(pRes.templates);
      setAllTemplates(aRes.templates);
    } catch {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const [config, aiConfig] = await Promise.all([
        getReviewModeConfigApi(),
        getAiReviewConfigApi(),
      ]);
      setReviewConfig(config);
      setAiReviewConfig(aiConfig);
    } catch { /* ignore */ } finally {
      setConfigLoading(false);
    }
  };

  const handleSetAiConfig = async (providerName: string, modelName: string) => {
    setAiConfigSaving(true);
    try {
      await setAiReviewConfigApi(providerName, modelName);
      message.success('AI审核模型已更新');
      loadConfig();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    } finally { setAiConfigSaving(false); }
  };

  const handleReview = async (id: number, action: 'approve' | 'reject') => {
    try {
      await reviewTemplateApi(id, action, action === 'reject' ? (rejectNote || undefined) : undefined);
      message.success(action === 'approve' ? '已通过审核' : '已拒绝');
      setDetailModal(null);
      setRejectNote('');
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const handleSetMode = async (mode: string) => {
    try {
      await setReviewModeConfigApi(mode);
      message.success('审核模式已更新');
      loadConfig();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    }
  };

  // ---- 分类管理 ----
  const loadCategories = async () => {
    try {
      const { categories: list } = await getAllCategoriesAdminApi();
      setCategories(list);
    } catch { /* ignore */ }
  };

  const handleOpenCatModal = (cat?: TemplateCategory) => {
    if (cat) { setEditingCat(cat); setCatName(cat.name); setCatSort(cat.sort_order); }
    else { setEditingCat(null); setCatName(''); setCatSort(0); }
    setCatModalOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) { message.warning('请输入分类名称'); return; }
    setCatSaving(true);
    try {
      if (editingCat) {
        await updateCategoryApi(editingCat.id, { name: catName.trim(), sort_order: catSort });
        message.success('分类已更新');
      } else {
        await createCategoryApi(catName.trim(), catSort);
        message.success('分类已创建');
      }
      setCatModalOpen(false);
      loadCategories();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    } finally { setCatSaving(false); }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await deleteCategoryApi(id);
      message.success('分类已删除');
      loadCategories();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '删除失败');
    }
  };

  const handleAdminDeleteTemplate = async (id: number) => {
    try {
      await deleteTemplateAdminApi(id);
      message.success('模板已删除');
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '删除失败');
    }
  };

  const handleEditTemplate = (tpl: NovelTemplate) => {
    setEditingTemplate(tpl);
    editForm.setFieldsValue({
      display_name: tpl.display_name,
      description: tpl.description,
      category: tpl.category,
      cover_gradient: tpl.cover_gradient,
      icon: tpl.icon,
      genre: tpl.genre || '',
      title_example: tpl.title_example || '',
      theme: tpl.theme || '',
      setting: tpl.setting || '',
      main_plot: tpl.main_plot || '',
      is_official: tpl.is_official,
      enabled: tpl.enabled,
      sort_order: tpl.sort_order,
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditSaving(true);
      await updateTemplateAdminApi(editingTemplate!.id, values);
      message.success('模板已更新');
      setEditModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '更新失败');
    } finally {
      setEditSaving(false);
    }
  };

  const baseInfoColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '模板名称', dataIndex: 'display_name', width: 120, ellipsis: true },
    {
      title: '分类', dataIndex: 'category', width: 70,
      render: (c: string) => <Tag color={getCategoryColor(c)}>{c}</Tag>,
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '创建者', dataIndex: 'creator_id', width: 100,
      render: (_id: number, record: NovelTemplate) => record.creator_username || (record.is_official ? '官方' : `用户#${record.creator_id}`),
    },
    {
      title: '提交时间', dataIndex: 'updated_at', width: 120,
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
  ];

  const reviewColumns = [
    ...baseInfoColumns,
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: any, record: NovelTemplate) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />}
            onClick={() => { setDetailModal(record); setRejectNote(''); }}>详情</Button>
          <Popconfirm title="确定通过？" onConfirm={() => handleReview(record.id, 'approve')}>
            <Button type="link" size="small" style={{ color: '#22c55e' }}
              icon={<CheckCircleOutlined />}>通过</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const allColumns = [
    ...baseInfoColumns,
    {
      title: '状态', dataIndex: 'review_status', width: 80,
      render: (s: string) => {
        if (s === 'approved') return <Tag color="green">已通过</Tag>;
        if (s === 'pending') return <Tag color="orange">待审核</Tag>;
        if (s === 'rejected') return <Tag color="red">已拒绝</Tag>;
        return <Tag>未提交</Tag>;
      },
    },
    {
      title: '公开', dataIndex: 'is_public', width: 50,
      render: (v: boolean) => v ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    { title: '使用', dataIndex: 'usage_count', width: 50 },
    {
      title: '操作', key: 'actions', width: 130,
      render: (_: any, record: NovelTemplate) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => handleEditTemplate(record)}>编辑</Button>
          <Popconfirm title="确定删除此模板？" onConfirm={() => handleAdminDeleteTemplate(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>模板审核管理</Title>
          <Text type="secondary">
            待审核：<Badge count={pending.length} style={{ backgroundColor: pending.length > 0 ? '#f59e0b' : '#22c55e' }} />
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      </div>

      {/* 审核模式设置 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10, background: 'rgba(15,23,42,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><SettingOutlined /> 审核模式：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Radio.Group value={reviewConfig?.mode} onChange={(e) => handleSetMode(e.target.value)}>
              {reviewConfig?.modes.map(m => (
                <Radio.Button key={m.value} value={m.value}>
                  <div>
                    <Text strong>{m.label}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.desc}</Text>
                  </div>
                </Radio.Button>
              ))}
            </Radio.Group>
          )}
        </div>
      </Card>

      {/* AI 审核模型配置 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10, background: 'rgba(15,23,42,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><RobotOutlined /> AI审核模型：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Space>
              <Select
                placeholder="选择Provider（留空使用默认）"
                allowClear
                style={{ minWidth: 160 }}
                value={aiReviewConfig?.providerName || undefined}
                onChange={(val) => {
                  handleSetAiConfig(val || '', aiReviewConfig?.modelName || '');
                }}
                options={(aiReviewConfig?.providers || []).map(p => ({ value: p.name, label: p.name }))}
              />
              <Select
                placeholder="选择模型"
                allowClear
                style={{ minWidth: 180 }}
                value={aiReviewConfig?.modelName || undefined}
                onChange={(val) => {
                  handleSetAiConfig(aiReviewConfig?.providerName || '', val || '');
                }}
                options={(aiReviewConfig?.providers || [])
                  .find(p => p.name === aiReviewConfig?.providerName)
                  ?.models.map(m => ({ value: m.name, label: m.name })) || []}
                disabled={!aiReviewConfig?.providerName}
              />
            </Space>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>留空则使用默认Provider/Model进行AI审核</Text>
        </div>
      </Card>

      {/* 分类管理 */}
      <Card
        size="small"
        title={<span><TagsOutlined /> 分类管理</span>}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleOpenCatModal()}>新增分类</Button>}
        style={{ marginBottom: 16, borderRadius: 10, background: 'rgba(15,23,42,0.5)' }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <Tag
              key={cat.id}
              color={getCategoryColor(cat.name)}
              closable
              onClose={(e) => { e.preventDefault(); handleDeleteCategory(cat.id); }}
              style={{ cursor: 'pointer', padding: '2px 10px', fontSize: 13 }}
              onClick={() => handleOpenCatModal(cat)}
            >
              {cat.name}
            </Tag>
          ))}
          {categories.length === 0 && <Text type="secondary">暂无分类</Text>}
        </div>
      </Card>

      {/* 审核表格 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Tag color={activeTab === 'pending' ? 'orange' : undefined}
          style={{ cursor: 'pointer', padding: '4px 12px' }}
          onClick={() => setActiveTab('pending')}>
          待审核 ({pending.length})
        </Tag>
        <Tag color={activeTab === 'all' ? 'blue' : undefined}
          style={{ cursor: 'pointer', padding: '4px 12px' }}
          onClick={() => setActiveTab('all')}>
          全部模板 ({allTemplates.length})
        </Tag>
      </div>

      <Table
        columns={activeTab === 'pending' ? reviewColumns : allColumns}
        dataSource={activeTab === 'pending' ? pending : allTemplates}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 15 }}
      />

      {/* 详情弹窗 */}
      <Modal
        title="模板详情审核"
        open={!!detailModal}
        onCancel={() => { setDetailModal(null); setRejectNote(''); }}
        footer={null}
        width={640}
        destroyOnClose
      >
        {detailModal && (
          <div>
            <div style={{
              height: 60, borderRadius: 8, background: detailModal.cover_gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Text strong style={{ color: '#fff', fontSize: 16 }}>{detailModal.display_name}</Text>
            </div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="标识名">{detailModal.name}</Descriptions.Item>
              <Descriptions.Item label="分类">
                <Tag color={getCategoryColor(detailModal.category)}>{detailModal.category}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型">{detailModal.genre || '-'}</Descriptions.Item>
              <Descriptions.Item label="示例标题">{detailModal.title_example || '-'}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detailModal.description}</Descriptions.Item>
              <Descriptions.Item label="核心主题" span={2}>{detailModal.theme || '-'}</Descriptions.Item>
              <Descriptions.Item label="世界观" span={2}>{detailModal.setting || '-'}</Descriptions.Item>
              <Descriptions.Item label="主线剧情" span={2}>{detailModal.main_plot || '-'}</Descriptions.Item>
              <Descriptions.Item label="审核状态">
                {detailModal.review_status === 'pending' ? <Tag color="orange">待审核</Tag>
                  : detailModal.review_status === 'approved' ? <Tag color="green">已通过</Tag>
                    : detailModal.review_status === 'rejected' ? <Tag color="red">已拒绝</Tag>
                      : <Tag>未提交</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="审核备注" span={2}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detailModal.review_note || '-'}
                </Paragraph>
              </Descriptions.Item>
            </Descriptions>

            {detailModal.review_status === 'pending' && (
              <>
                <Divider />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="primary" icon={<CheckCircleOutlined />}
                    style={{ flex: 1, background: '#22c55e', borderColor: '#22c55e' }}
                    onClick={() => handleReview(detailModal.id, 'approve')}>通过审核</Button>
                  <Popconfirm
                    title="拒绝原因（选填）"
                    description={<Input.TextArea rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                      placeholder="请输入拒绝原因..." />}
                    onConfirm={() => handleReview(detailModal.id, 'reject')}
                    okText="确认拒绝"
                  >
                    <Button danger icon={<CloseCircleOutlined />} style={{ flex: 1 }}>拒绝</Button>
                  </Popconfirm>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 分类编辑弹窗 */}
      <Modal
        title={editingCat ? '编辑分类' : '新增分类'}
        open={catModalOpen}
        onOk={handleSaveCategory}
        onCancel={() => setCatModalOpen(false)}
        confirmLoading={catSaving}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>分类名称</Text>
          <Input
            value={catName}
            onChange={e => setCatName(e.target.value)}
            placeholder="如：玄幻、都市、科幻..."
            style={{ marginTop: 4 }}
            onPressEnter={handleSaveCategory}
          />
        </div>
        <div>
          <Text strong>排序权重（越小越靠前）</Text>
          <Input
            type="number"
            value={catSort}
            onChange={e => setCatSort(parseInt(e.target.value) || 0)}
            style={{ marginTop: 4, width: 120 }}
          />
        </div>
      </Modal>

      {/* 编辑模板弹窗 */}
      <Modal
        title="编辑模板"
        open={editModalOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={editSaving}
        width={680}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入' }]}>
                <Input placeholder="如 我的修仙模板" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map(c => ({ value: c.name, label: c.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={2} placeholder="简要描述模板特点和适用场景" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="icon" label="图标">
                <Select options={iconOptions.map(i => ({ value: i, label: i.replace('Outlined', '') }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="genre" label="小说类型">
                <Input placeholder="如：玄幻" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="title_example" label="示例标题">
                <Input placeholder="如：凡人仙途" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="cover_gradient" label="卡片渐变背景 (CSS)">
            <Input placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
          </Form.Item>
          <Divider style={{ margin: '12px 0' }} />
          <Form.Item name="theme" label="核心主题">
            <Input.TextArea rows={2} placeholder="模板预设的核心主题..." />
          </Form.Item>
          <Form.Item name="setting" label="世界观/背景设定">
            <Input.TextArea rows={3} placeholder="模板预设的世界观..." />
          </Form.Item>
          <Form.Item name="main_plot" label="主线剧情框架">
            <Input.TextArea rows={3} placeholder="模板预设的主线剧情..." />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="is_official" label="官方模板">
                <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enabled" label="启用状态">
                <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sort_order" label="排序权重">
                <Input type="number" placeholder="越小越靠前" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateReview;
