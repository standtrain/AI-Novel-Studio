import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ExportModal from './ExportModal';

interface ExportButtonProps {
  novelId: number;
  variant: 'button' | 'cardAction';
  chapterCount?: number;
}

const ExportButton: React.FC<ExportButtonProps> = ({ novelId, variant, chapterCount = 0 }) => {
  const [modalVisible, setModalVisible] = useState(false);

  // Modal 仅在打开时挂载，减少 DOM 节点数量
  const sharedModal = modalVisible ? (
    <ExportModal
      novelId={novelId}
      open={modalVisible}
      onClose={() => setModalVisible(false)}
      chapterCount={chapterCount}
    />
  ) : null;

  if (variant === 'button') {
    return (
      <>
        <Tooltip title="高级用户功能">
          <Button icon={<DownloadOutlined />} onClick={() => setModalVisible(true)}>
            导出
          </Button>
        </Tooltip>
        {sharedModal}
      </>
    );
  }

  // cardAction variant
  return (
    <>
      <Tooltip title="高级用户功能">
        <Button
          size="small"
          type="text"
          icon={<DownloadOutlined />}
          onClick={() => setModalVisible(true)}
          style={{ color: '#818cf8' }}
        >
          导出
        </Button>
      </Tooltip>
      {sharedModal}
    </>
  );
};

export default ExportButton;
