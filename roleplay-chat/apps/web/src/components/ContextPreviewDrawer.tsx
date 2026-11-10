import { useEffect, useState } from 'react';
import { Alert, Drawer, Empty, List, Space, Spin, Tag, Typography } from 'antd';
import { api, ApiError } from '../api';
import type { ContextPreview } from '../types';

interface Props {
  open: boolean;
  chatId: string;
  onClose: () => void;
}

const roleLabel: Record<string, string> = { system: '系统', user: '用户', assistant: '角色' };

export function ContextPreviewDrawer({ open, chatId, onClose }: Props) {
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.chats
      .contextPreview(chatId)
      .then((next) => { if (!cancelled) setPreview(next); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : '上下文加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, chatId]);

  return (
    <Drawer title="本次上下文" open={open} onClose={onClose} width={560}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin /></div>
      ) : error ? (
        <Alert type="error" showIcon message="加载失败" description={error} />
      ) : !preview ? (
        <Empty />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            模型 {preview.model} · 估算 {preview.estimatedTokens} / {preview.budget} tokens
          </Typography.Text>
          {preview.warnings.map((warning) => (
            <Alert key={warning} type="warning" showIcon message={warning} />
          ))}
          <List
            size="small"
            dataSource={preview.messages}
            renderItem={(message) => (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <Space size={4} style={{ marginBottom: 4 }}>
                    <Tag color={message.role === 'system' ? 'purple' : message.role === 'user' ? 'blue' : 'green'}>
                      {roleLabel[message.role] ?? message.role}
                    </Tag>
                    {message.content.startsWith('【场景说明') && <Tag color="gold">场景</Tag>}
                  </Space>
                  <div className="context-content">{message.content}</div>
                </div>
              </List.Item>
            )}
          />
        </Space>
      )}
    </Drawer>
  );
}
