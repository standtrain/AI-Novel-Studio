import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, Tag, Button, Modal, Spin, Empty, Input, message, Form, Select, Tabs, Popconfirm, Divider, Alert } from 'antd';
import {
  ThunderboltOutlined, HeartOutlined, RocketOutlined, SearchOutlined,
  AppleOutlined, SmileOutlined, ReadOutlined, EditOutlined, BookOutlined,
  PlusOutlined, CrownOutlined, UserOutlined, SendOutlined, LockOutlined,
  GlobalOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  QuestionCircleOutlined, DeleteOutlined, ShopOutlined,
} from '@ant-design/icons';
import {
  getTemplatesApi, getTemplateCategoriesApi, createNovelFromTemplateApi,
  getMyTemplatesApi, createMyTemplateApi, updateMyTemplateApi,
  deleteMyTemplateApi, submitTemplateForReviewApi,
  NovelTemplate,
} from '../api/templates';
import { useAuthStore } from '../store/authStore';
import useMobile from '../hooks/useMobile';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 图标映射
const iconMap: Record<string, React.ReactNode> = {
  ThunderboltOutlined: <ThunderboltOutlined />,
  HeartOutlined: <HeartOutlined />,
  RocketOutlined: <RocketOutlined />,
  SearchOutlined: <SearchOutlined />,
  AppleOutlined: <AppleOutlined />,
  SmileOutlined: <SmileOutlined />,
  ReadOutlined: <ReadOutlined />,
  EditOutlined: <EditOutlined />,
  BookOutlined: <BookOutlined />,
};

const paletteColors = ['purple', 'pink', 'cyan', 'blue', 'geekblue', 'magenta', 'orange', 'green', 'gold', 'lime', 'red', 'volcano'];
function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return paletteColors[Math.abs(hash) % paletteColors.length];
}

const reviewStatusMap: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending: { color: 'orange', label: '审核中', icon: <ClockCircleOutlined /> },
  approved: { color: 'green', label: '已通过', icon: <CheckCircleOutlined /> },
  rejected: { color: 'red', label: '已拒绝', icon: <CloseCircleOutlined /> },
};

const iconOptions = [
  'ThunderboltOutlined', 'HeartOutlined', 'RocketOutlined', 'SearchOutlined',
  'AppleOutlined', 'SmileOutlined', 'ReadOutlined', 'EditOutlined', 'BookOutlined',
];

const TemplateStorePage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const isAuth = useAuthStore(s => s.isAuthenticated);

  const [templates, setTemplates] = useState<NovelTemplate[]>([]);
  const [myTemplates, setMyTemplates] = useState<NovelTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [activeStoreTab, setActiveStoreTab] = useState<'store' | 'mine'>('store');
  const [creating, setCreating] = useState<number | null>(null);
  const [detailModal, setDetailModal] = useState<NovelTemplate | null>(null);
  const [customTitle, setCustomTitle] = useState('');

  // 创建/编辑模板
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NovelTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [templateForm] = Form.useForm();

  // 审核提交
  const [submitting, setSubmitting] = useState<number | null>(null);
  const submittingRef = useRef(false);

  // 删除
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isAuth && activeStoreTab === 'mine') loadMyTemplates();
  }, [isAuth, activeStoreTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        getTemplatesApi(),
        getTemplateCategoriesApi(),
      ]);
      setTemplates(tRes.templates);
      setCategories(cRes.categories);
    } catch {
      message.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMyTemplates = async () => {
    try {
      const { templates: list } = await getMyTemplatesApi();
      setMyTemplates(list);
    } catch { /* ignore */ }
  };

  const filteredTemplates = activeCategory === '全部'
    ? templates : templates.filter(t => t.category === activeCategory);

  const handleUseTemplate = async (template: NovelTemplate) => {
    setCreating(template.id);
    try {
      const result = await createNovelFromTemplateApi(template.id);
      message.success(`已从「${template.display_name}」模板创建小说`);
      setDetailModal(null);
      navigate(`/novel/${result.novel.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建失败');
    } finally {
      setCreating(null);
    }
  };

  const handleUseWithTitle = async (template: NovelTemplate) => {
    if (!customTitle.trim()) { message.warning('请输入小说标题'); return; }
    setCreating(template.id);
    try {
      const result = await createNovelFromTemplateApi(template.id, { title: customTitle.trim() });
      message.success(`已创建小说「${customTitle.trim()}」`);
      setDetailModal(null); setCustomTitle('');
      navigate(`/novel/${result.novel.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建失败');
    } finally {
      setCreating(null);
    }
  };

  // ---- 创建/编辑模板 ----
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    templateForm.resetFields();
    templateForm.setFieldsValue({ category: '其他', icon: 'BookOutlined', cover_gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' });
    setEditModalOpen(true);
  };

  const handleEditTemplate = (tpl: NovelTemplate) => {
    setEditingTemplate(tpl);
    templateForm.setFieldsValue({
      name: tpl.name,
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
    });
    setEditModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const values = await templateForm.validateFields();
      if (editingTemplate) {
        await updateMyTemplateApi(editingTemplate.id, values);
        message.success('模板已更新');
      } else {
        await createMyTemplateApi(values);
        message.success('模板创建成功');
      }
      setEditModalOpen(false);
      loadMyTemplates();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      setDeleting(id);
      await deleteMyTemplateApi(id);
      message.success('模板已删除');
      loadMyTemplates();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const handleSubmitReview = async (id: number) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(id);
    try {
      const result = await submitTemplateForReviewApi(id);
      message.success(result.message);
      loadMyTemplates();
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '提交失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  // 渲染模板卡片
  const renderTemplateCard = (tpl: NovelTemplate, showStatus?: boolean) => (
    <Card
      key={tpl.id}
      hoverable
      style={{ height: '100%', borderRadius: 12, overflow: 'hidden', borderColor: '#1f2937', background: '#0d1117' }}
      bodyStyle={{ padding: 0 }}
      onClick={() => { if (activeStoreTab === 'store') setDetailModal(tpl); else handleEditTemplate(tpl); }}
    >
      <div style={{
        height: 100, background: tpl.cover_gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <span style={{ fontSize: 36, color: 'rgba(255,255,255,0.85)' }}>{iconMap[tpl.icon] || <BookOutlined />}</span>
        {tpl.is_official ? (
          <Tag color="gold" style={{ position: 'absolute', top: 8, right: 8, fontSize: 11 }}>官方</Tag>
        ) : tpl.creator_username && (
          <Tag color="cyan" style={{ position: 'absolute', top: 8, right: 8, fontSize: 11 }}>@{tpl.creator_username}</Tag>
        )}
        {showStatus && tpl.review_status && (
          <Tag color={reviewStatusMap[tpl.review_status]?.color} style={{ position: 'absolute', top: 8, left: 8, fontSize: 11 }}>
            {reviewStatusMap[tpl.review_status]?.icon} {reviewStatusMap[tpl.review_status]?.label}
          </Tag>
        )}
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text strong style={{ fontSize: 15, flex: 1 }} ellipsis>{tpl.display_name}</Text>
          <Tag color={getCategoryColor(tpl.category) || 'default'} style={{ fontSize: 11 }}>{tpl.category}</Tag>
        </div>
        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12, fontSize: 13, minHeight: 40 }}>
          {tpl.description}
        </Paragraph>

        {activeStoreTab === 'store' ? (
          <Button type="primary" size="small" block icon={<PlusOutlined />}
            loading={creating === tpl.id}
            onClick={(e) => { e.stopPropagation(); handleUseTemplate(tpl); }}>
            使用此模板
          </Button>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <Button size="small" type="primary" icon={<PlusOutlined />}
                loading={creating === tpl.id}
                onClick={(e) => { e.stopPropagation(); handleUseTemplate(tpl); }}
                style={{ flex: 1 }}>
                使用
              </Button>
              <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); handleDeleteTemplate(tpl.id); }}>
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === tpl.id}
                  onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            </div>
            {tpl.review_status === 'approved' ? (
              <Tag color="green" style={{ width: '100%', textAlign: 'center', margin: 0 }}>已公开发布</Tag>
            ) : tpl.review_status === 'pending' ? (
              <Tag color="orange" style={{ width: '100%', textAlign: 'center', margin: 0 }}>审核中</Tag>
            ) : tpl.review_status === 'rejected' ? (
              <div>
                <Tag color="red" style={{ marginBottom: 4, whiteSpace: 'normal', wordBreak: 'break-all' }}>
                  已拒绝：{tpl.review_note || ''}
                </Tag>
                <Button size="small" icon={<EditOutlined />} block
                  onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl); }}>
                  修改后重新提交
                </Button>
              </div>
            ) : (
              <Button size="small" icon={<SendOutlined />} type="primary" ghost block
                loading={submitting === tpl.id}
                onClick={(e) => { e.stopPropagation(); handleSubmitReview(tpl.id); }}>
                提交公开
              </Button>
            )}
          </div>
        )}
        {showStatus && tpl.review_note && tpl.review_status !== 'rejected' && (
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }} ellipsis>{tpl.review_note}</Text>
        )}
      </div>
    </Card>
  );

  if (loading) {
    return <div style={{ textAlign: 'center', paddingTop: 120 }}><Spin size="large" tip="加载模板商店..." /></div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <CrownOutlined style={{ color: '#f59e0b', marginRight: 8 }} />模板商店
          </Title>
          <Text type="secondary">选择一个模板快速开始创作，或创建属于自己的模板</Text>
        </div>
        {isAuth && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTemplate}>创建模板</Button>
        )}
      </div>

      <Tabs
        activeKey={activeStoreTab}
        onChange={(key) => setActiveStoreTab(key as 'store' | 'mine')}
        items={[
          {
            key: 'store',
            label: <span><ShopOutlined /> 模板商店</span>,
            children: (
              <>
                <div style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['全部', ...categories].map(cat => (
                    <Tag key={cat} color={activeCategory === cat ? (getCategoryColor(cat) || 'default') : undefined}
                      style={{ cursor: 'pointer', padding: '4px 14px', fontSize: 14, borderColor: activeCategory === cat ? undefined : '#30363d', opacity: activeCategory === cat ? 1 : 0.7 }}
                      onClick={() => setActiveCategory(cat)}>{cat}</Tag>
                  ))}
                </div>
                {filteredTemplates.length === 0 ? (
                  <Empty description="暂无模板" style={{ marginTop: 60 }} />
                ) : (
                  <Row gutter={[16, 16]}>
                    {filteredTemplates.map((tpl, index) => (
                      <Col key={tpl.id} xs={24} sm={12} md={8} lg={6}>
                        <div style={{ animation: `slideUp 0.5s ease-out ${index * 0.1}s both` }}>
                          {renderTemplateCard(tpl)}
                        </div>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          },
          ...(isAuth ? [{
            key: 'mine' as const,
            label: <span><UserOutlined /> 我的模板</span>,
            children: (
              <>
                {myTemplates.length === 0 ? (
                  <Empty description="还没有创建模板" style={{ marginTop: 60 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTemplate}>创建第一个模板</Button>
                  </Empty>
                ) : (
                  <Row gutter={[16, 16]}>
                    {myTemplates.map((tpl, index) => (
                      <Col key={tpl.id} xs={24} sm={12} md={8} lg={6}>
                        <div style={{ animation: `slideUp 0.5s ease-out ${index * 0.1}s both` }}>
                          {renderTemplateCard(tpl, true)}
                        </div>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          }] : []),
        ]}
      />

      {/* 模板详情弹窗 */}
      <Modal title={null} open={!!detailModal} onCancel={() => { setDetailModal(null); setCustomTitle(''); }} footer={null} width={isMobile ? '95vw' : 640} destroyOnClose>
        {detailModal && (
          <div>
            <div style={{ height: 80, borderRadius: 8, background: detailModal.cover_gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>{iconMap[detailModal.icon] || <BookOutlined />}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Title level={4} style={{ margin: 0 }}>{detailModal.display_name}</Title>
              <Tag color={getCategoryColor(detailModal.category) || 'default'}>{detailModal.category}</Tag>
              {detailModal.is_official ? (
                <Tag color="gold">官方</Tag>
              ) : detailModal.creator_username && (
                <Tag color="cyan">@{detailModal.creator_username}</Tag>
              )}
            </div>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>{detailModal.description}</Paragraph>
            {detailModal.genre && <div style={{ marginBottom: 8 }}><Text strong>类型：</Text><Tag>{detailModal.genre}</Tag></div>}
            {detailModal.theme && (
              <div style={{ marginBottom: 12, padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 6 }}>
                <Text strong style={{ color: '#818cf8' }}>核心主题</Text>
                <Paragraph style={{ margin: '4px 0 0', fontSize: 13 }}>{detailModal.theme}</Paragraph>
              </div>
            )}
            {detailModal.setting && (
              <div style={{ marginBottom: 12, padding: 12, background: 'rgba(34,197,94,0.06)', borderRadius: 6 }}>
                <Text strong style={{ color: '#4ade80' }}>世界观/背景</Text>
                <Paragraph style={{ margin: '4px 0 0', fontSize: 13 }}>{detailModal.setting}</Paragraph>
              </div>
            )}
            {detailModal.main_plot && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(250,173,20,0.06)', borderRadius: 6 }}>
                <Text strong style={{ color: '#fbbf24' }}>主线剧情框架</Text>
                <Paragraph style={{ margin: '4px 0 0', fontSize: 13 }}>{detailModal.main_plot}</Paragraph>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Input placeholder={detailModal.title_example ? `自定义标题（留空使用"${detailModal.title_example}"）` : '请输入小说标题'}
                value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                onPressEnter={() => handleUseWithTitle(detailModal)} style={{ flex: 1 }} />
              <Button type="primary" icon={<PlusOutlined />} loading={creating === detailModal.id}
                onClick={() => handleUseWithTitle(detailModal)}>创建小说</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 创建/编辑模板弹窗 */}
      <Modal
        title={editingTemplate ? '编辑模板' : '创建模板'}
        open={editModalOpen}
        onOk={handleSaveTemplate}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={saving}
        width={isMobile ? '95vw' : 680}
        destroyOnClose
      >
        <Form form={templateForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="标识名" rules={[{ required: true, message: '请输入' }]}
                extra="英文标识，创建后不可修改">
                <Input placeholder="如 my_xianxia_template" disabled={!!editingTemplate} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入' }]}>
                <Input placeholder="如 我的修仙模板" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
            <TextArea rows={2} placeholder="简要描述模板特点和适用场景" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map(c => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
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
          </Row>
          <Form.Item name="title_example" label="示例标题">
            <Input placeholder="如：凡人仙途" />
          </Form.Item>
          <Form.Item name="cover_gradient" label="卡片渐变背景 (CSS)">
            <Input placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
          </Form.Item>
          <Divider style={{ margin: '12px 0' }} />
          <Form.Item name="theme" label="核心主题">
            <TextArea rows={2} placeholder="模板预设的核心主题..." />
          </Form.Item>
          <Form.Item name="setting" label="世界观/背景设定">
            <TextArea rows={3} placeholder="模板预设的世界观..." />
          </Form.Item>
          <Form.Item name="main_plot" label="主线剧情框架">
            <TextArea rows={3} placeholder="模板预设的主线剧情..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
export default TemplateStorePage;
