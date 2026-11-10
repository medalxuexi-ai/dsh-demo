import { useCallback, useEffect, useState } from 'react';
import { App as AntApp, Button, Drawer, Empty, List, Popconfirm, Space, Switch, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ProfileOutlined } from '@ant-design/icons';
import type { StoredMessage } from '@roleplay/core';
import { api, ApiError } from '../api';
import type { SceneView } from '../types';
import { SceneModal } from './SceneModal';

interface Props {
  open: boolean;
  chatId: string;
  messages: StoredMessage[];
  onClose: () => void;
  onOpenContext: () => void;
}

function placementLabel(scene: SceneView, messages: StoredMessage[]): string {
  const placement = scene.placement;
  if (placement.mode === 'system-top') return '当前场景';
  if (placement.mode === 'depth') return `深度 ${placement.depth}`;
  const index = messages.findIndex((message) => message.id === placement.messageId);
  return index >= 0 ? `第 ${index + 1} 条之后` : '锚定消息之后';
}

export function SceneDrawer({ open, chatId, messages, onClose, onOpenContext }: Props) {
  const { message } = AntApp.useApp();
  const [scenes, setScenes] = useState<SceneView[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SceneView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setScenes(await api.scenes.list(chatId));
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '场景加载失败');
    } finally {
      setLoading(false);
    }
  }, [chatId, message]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = async (scene: SceneView, enabled: boolean) => {
    try {
      await api.scenes.update(scene.id, { enabled });
      await load();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '更新失败');
    }
  };

  const remove = async (scene: SceneView) => {
    try {
      await api.scenes.remove(scene.id);
      message.success('场景已删除');
      await load();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  return (
    <>
      <Drawer
        title="场景 / 导演指令"
        open={open}
        onClose={onClose}
        width={480}
        extra={
          <Space>
            <Button icon={<ProfileOutlined />} onClick={onOpenContext}>上下文</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>新建</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          场景会在下一次请求时进入上下文。当前场景常驻；插入剧情跟随消息位置；这一轮要求成功后自动停用。
        </Typography.Paragraph>
        {scenes.length === 0 && !loading ? (
          <Empty description="还没有场景">
            <Button type="primary" onClick={() => { setEditing(null); setModalOpen(true); }}>新建场景</Button>
          </Empty>
        ) : (
          <List
            loading={loading}
            dataSource={scenes}
            renderItem={(scene) => (
              <List.Item
                actions={[
                  <Switch key="toggle" size="small" checked={scene.enabled} onChange={(checked) => void toggle(scene, checked)} />,
                  <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditing(scene); setModalOpen(true); }} />,
                  <Popconfirm key="delete" title="删除这个场景？" onConfirm={() => void remove(scene)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap size={4}>
                      <span>{scene.title || '未命名场景'}</span>
                      <Tag color="purple">{placementLabel(scene, messages)}</Tag>
                      <Tag>{scene.lifetime === 'once' ? '一次性' : '持续'}</Tag>
                      {!scene.placementValid && <Tag color="warning">锚点不在当前分支</Tag>}
                    </Space>
                  }
                  description={
                    <span className="muted scene-preview">
                      {scene.content.replace(/\s+/g, ' ').slice(0, 90)}
                      {scene.content.length > 90 ? '…' : ''}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
      <SceneModal
        open={modalOpen}
        chatId={chatId}
        messages={messages}
        scene={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />
    </>
  );
}
