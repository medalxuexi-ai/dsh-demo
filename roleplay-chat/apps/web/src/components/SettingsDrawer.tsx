import { useState } from 'react';
import { App as AntApp, Button, Drawer, Empty, List, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { PublicProvider } from '@roleplay/core';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  providers: PublicProvider[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (provider: PublicProvider) => void;
  onChanged: () => void;
}

export function SettingsDrawer({ open, providers, onClose, onAdd, onEdit, onChanged }: Props) {
  const { message } = AntApp.useApp();
  const [testingId, setTestingId] = useState<string | null>(null);

  const test = async (provider: PublicProvider) => {
    setTestingId(provider.id);
    try {
      const result = await api.providers.test(provider.id);
      if (result.ok) message.success(`${provider.name} 连接成功${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`);
      else message.error(result.error?.message ?? '连接失败');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '连接失败');
    } finally {
      setTestingId(null);
    }
  };

  const remove = async (provider: PublicProvider) => {
    try {
      await api.providers.remove(provider.id);
      message.success('已删除模型服务');
      onChanged();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  return (
    <Drawer
      title="模型服务"
      open={open}
      onClose={onClose}
      width={460}
      extra={
        <Button icon={<PlusOutlined />} onClick={onAdd}>
          添加
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        支持任何 OpenAI 兼容的 <code>/chat/completions</code> 服务：官方 API、中转站、Ollama、LM Studio、自建服务。
      </Typography.Paragraph>
      {providers.length === 0 ? (
        <Empty description="还没有配置模型服务" />
      ) : (
        <List
          dataSource={providers}
          renderItem={(provider) => (
            <List.Item
              actions={[
                <Button key="test" size="small" loading={testingId === provider.id} onClick={() => void test(provider)}>
                  测试
                </Button>,
                <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => onEdit(provider)} />,
                <Popconfirm key="delete" title="删除这个模型服务？" onConfirm={() => void remove(provider)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{provider.name}</span>
                    <Tag>{provider.defaultModel}</Tag>
                  </Space>
                }
                description={
                  <div>
                    <div className="muted">{provider.baseUrl}</div>
                    <div className="muted">密钥：{provider.apiKeyMasked}</div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}
