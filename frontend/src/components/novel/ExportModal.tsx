import React, { useState } from 'react';
import { Modal, Radio, InputNumber, Space, Typography, App } from 'antd';
import { FileTextOutlined, FileWordOutlined, FilePdfOutlined, ReadOutlined, CodeOutlined } from '@ant-design/icons';
import { exportNovelApi } from '../../api/novels';

const { Text } = Typography;

interface ExportModalProps {
  novelId: number;
  open: boolean;
  onClose: () => void;
  chapterCount: number;
}

const formatOptions = [
  { value: 'docx', label: 'DOCX', desc: 'Word 文档，适合继续编辑', icon: <FileWordOutlined /> },
  { value: 'txt', label: 'TXT', desc: '纯文本，通用性最强', icon: <FileTextOutlined /> },
  { value: 'pdf', label: 'PDF', desc: '适合分享和打印', icon: <FilePdfOutlined /> },
  { value: 'epub', label: 'EPUB', desc: '电子书格式，适合阅读器', icon: <ReadOutlined /> },
  { value: 'json', label: 'JSON', desc: '结构化数据，可重新导入', icon: <CodeOutlined /> },
];

const scopeOptions = [
  { value: 'full', label: '整本小说', desc: '大纲 + 人物设定 + 全部章节' },
  { value: 'outline', label: '大纲与人物设定', desc: '仅大纲和人物介绍' },
  { value: 'chapter', label: '单个章节', desc: '指定某一个章节' },
  { value: 'range', label: '指定范围', desc: '从第X章到第Y章' },
];

const ExportModal: React.FC<ExportModalProps> = ({ novelId, open, onClose, chapterCount }) => {
  const { message } = App.useApp();
  const [format, setFormat] = useState('docx');
  const [scope, setScope] = useState('full');
  const [chapterNum, setChapterNum] = useState<number | null>(1);
  const [rangeFrom, setRangeFrom] = useState<number | null>(1);
  const [rangeTo, setRangeTo] = useState<number | null>(chapterCount);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: { format: string; scope: string; chapters?: string; chapterNum?: number } = { format, scope };
      if (scope === 'chapter' && chapterNum) {
        params.chapterNum = chapterNum;
      }
      if (scope === 'range' && rangeFrom && rangeTo) {
        params.chapters = `${rangeFrom}-${rangeTo}`;
      }

      const response = await exportNovelApi(novelId, params);

      // 检查是否为 JSON 错误响应（后端返回 403 等错误时，blob 实际是 JSON）
      if (response.type === 'application/json' || response.type === '') {
        const text = await response.text();
        try {
          const errData = JSON.parse(text);
          message.error(errData.error || '导出失败');
          return;
        } catch { /* 不是 JSON，继续下载 */ }
      }

      // 触发浏览器下载
      const url = window.URL.createObjectURL(response);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'epub' ? 'epub' : format;
      a.download = `novel_${novelId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      message.success('导出成功');
      onClose();
    } catch (err: any) {
      // 当 responseType 为 blob 时，错误响应体是 Blob，需解析为 JSON
      let msg = '导出失败，请稍后重试';
      try {
        if (err?.response?.data instanceof Blob) {
          const errText = await err.response.data.text();
          const errJson = JSON.parse(errText);
          msg = errJson.error || msg;
        } else if (err?.response?.data?.error) {
          msg = err.response.data.error;
        }
      } catch { /* 解析失败使用默认消息 */ }
      message.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const maxChapters = chapterCount || 1;

  return (
    <Modal
      title="导出小说"
      open={open}
      onOk={handleExport}
      onCancel={onClose}
      confirmLoading={exporting}
      okText="确认导出"
      cancelText="取消"
      width={480}
    >
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>导出格式</Text>
        <Radio.Group value={format} onChange={e => setFormat(e.target.value)} style={{ width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {formatOptions.map(opt => (
              <Radio key={opt.value} value={opt.value} style={{ padding: '6px 0' }}>
                <Space>
                  {opt.icon}
                  <span>{opt.label}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>{opt.desc}</Text>
                </Space>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </div>

      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>导出范围</Text>
        <Radio.Group value={scope} onChange={e => setScope(e.target.value)} style={{ width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {scopeOptions.map(opt => (
              <Radio key={opt.value} value={opt.value} style={{ padding: '6px 0' }}>
                <Space>
                  <span>{opt.label}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>{opt.desc}</Text>
                </Space>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </div>

      {/* 条件输入 */}
      {scope === 'chapter' && (
        <div style={{ marginTop: 12, marginLeft: 24 }}>
          <Text style={{ marginRight: 8 }}>章节编号：</Text>
          <InputNumber
            min={1}
            max={maxChapters}
            value={chapterNum}
            onChange={v => setChapterNum(v)}
            style={{ width: 100 }}
          />
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>共 {maxChapters} 章</Text>
        </div>
      )}

      {scope === 'range' && (
        <div style={{ marginTop: 12, marginLeft: 24 }}>
          <Space>
            <span>从</span>
            <InputNumber
              min={1}
              max={maxChapters}
              value={rangeFrom}
              onChange={v => setRangeFrom(v)}
              style={{ width: 80 }}
              placeholder="起始"
            />
            <span>章到</span>
            <InputNumber
              min={1}
              max={maxChapters}
              value={rangeTo}
              onChange={v => setRangeTo(v)}
              style={{ width: 80 }}
              placeholder="结束"
            />
            <span>章</span>
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>共 {maxChapters} 章</Text>
        </div>
      )}
    </Modal>
  );
};

export default ExportModal;
