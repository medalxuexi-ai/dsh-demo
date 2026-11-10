import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, Drawer, Empty, Input, Popconfirm, Space, Typography } from 'antd';
import type { StoredMessage } from '@roleplay/core';
import type { ChatRecord } from '../types';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  chat: ChatRecord;
  messages: StoredMessage[];
  onClose: () => void;
  onChanged: () => void;
}

export function MemoryDrawer({ open, chat, messages, onClose, onChanged }: Props) {
  const { message } = AntApp.useApp();
  const [summarizing, setSummarizing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const memory = chat.memory;

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setDraft(memory?.summary ?? '');
  }, [open, memory?.summary]);

  const coveredIndex = memory ? messages.findIndex((item) => item.id === memory.throughMessageId) : -1;

  const summarize = async () => {
    setSummarizing(true);
    try {
      await api.chats.summarizeMemory(chat.id);
      message.success('前情摘要已更新');
      onChanged();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '整理前情失败');
    } finally {
      setSummarizing(false);
    }
  };

  const save = async () => {
    if (!draft.trim()) {
      message.warning('摘要不能为空');
      return;
    }
    setSaving(true);
    try {
      await api.chats.updateMemory(chat.id, draft.trim());
      message.success('前情摘要已保存');
      setEditing(false);
      onChanged();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    try {
      await api.chats.clearMemory(chat.id);
      message.success('前情摘要已清除');
      setEditing(false);
      setDraft('');
      onChanged();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '清除失败');
    }
  };

  return (
    <Drawer
      title="前情摘要"
      open={open}
      onClose={onClose}
      width={520}
      extra={<Button type="primary" loading={summarizing} onClick={() => void summarize()}>{memory ? '更新' : '整理前情'}</Button>}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        参考酒馆类项目的 Summary / Long-term memory：把较早剧情压缩成摘要，生成时只带摘要和最近消息，让长对话仍有连续记忆。
      </Typography.Paragraph>
      {memory ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`已覆盖 ${coveredIndex >= 0 ? coveredIndex + 1 : '?'} 条消息${memory.updatedAt ? ` · ${new Date(memory.updatedAt).toLocaleString('zh-CN')}` : ''}`}
            description={coveredIndex < 0 ? '摘要的截止消息不在当前分支，生成时会保留全部历史并附加摘要。' : '截止消息之前的原始对话会从上下文中移除，只保留摘要。'}
          />
          {editing ? (
            <>
              <Input.TextArea value={draft} onChange={(event) => setDraft(event.target.value)} autoSize={{ minRows: 8, maxRows: 16 }} maxLength={20000} />
              <Space>
                <Button type="primary" loading={saving} onClick={() => void save()}>保存</Button>
                <Button onClick={() => { setEditing(false); setDraft(memory.summary); }}>取消</Button>
              </Space>
            </>
          ) : (
            <>
              <Typography.Paragraph className="memory-summary">{memory.summary}</Typography.Paragraph>
              <Space>
                <Button onClick={() => setEditing(true)}>编辑</Button>
                <Popconfirm title="清除前情摘要？" description="清除后生成会重新带上完整历史（受 token 预算限制）。" onConfirm={() => void clear()}>
                  <Button danger>清除</Button>
                </Popconfirm>
              </Space>
            </>
          )}
        </Space>
      ) : (
        <Empty description="还没有前情摘要">
          <Button type="primary" loading={summarizing} onClick={() => void summarize()}>整理前情</Button>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
            至少需要 10 条消息；会保留最近 8 条，把更早的剧情整理成摘要。
          </Typography.Paragraph>
        </Empty>
      )}
    </Drawer>
  );
}
