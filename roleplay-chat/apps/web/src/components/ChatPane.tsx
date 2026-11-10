import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Empty,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DownloadOutlined, MenuOutlined, ProfileOutlined, ReadOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { Bubble } from '@ant-design/x';
import type { PublicProvider, SceneDirective, StoredMessage } from '@roleplay/core';
import { api, ApiError } from '../api';
import { colorFor } from '../constants';
import type { ChatDetail, SceneView } from '../types';
import { ChatSettingsModal } from './ChatSettingsModal';
import { Composer } from './Composer';
import { SceneDrawer } from './SceneDrawer';
import { ContextPreviewDrawer } from './ContextPreviewDrawer';
import { BranchSwitcher } from './BranchSwitcher';
import { SceneStatusBar } from './SceneStatusBar';
import { Markdown } from './Markdown';

interface Props {
  chatId: string;
  providers: PublicProvider[];
  onRefreshChats: () => void;
  onToggleSidebar: () => void;
}

function SceneTimelineCard({ scene }: { scene: SceneView }) {
  const placement = scene.placement;
  const label = placement.mode === 'system-top'
    ? '当前场景'
    : placement.mode === 'anchored'
      ? '插入剧情'
      : placement.depth === 0
        ? '这一轮要求'
        : `深度 ${placement.depth}`;
  return (
    <div className="timeline-scene">
      <div className="timeline-scene-head">
        <Tag color="purple">场景</Tag>
        <strong>{scene.title || '未命名场景'}</strong>
        <span className="muted">{label}</span>
        {!scene.placementValid && <Tag color="warning">锚点不在当前分支</Tag>}
      </div>
      <div className="timeline-scene-content">{scene.content}</div>
    </div>
  );
}

type StreamMode = 'generate' | 'regenerate';

export function ChatPane({ chatId, providers, onRefreshChats, onToggleSidebar }: Props) {
  const { message } = AntApp.useApp();
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [scenes, setScenes] = useState<SceneView[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const refresh = useCallback(async () => {
    const [next, sceneList] = await Promise.all([api.chats.get(chatId), api.scenes.list(chatId)]);
    setDetail(next);
    setScenes(sceneList);
    onRefreshChats();
  }, [chatId, onRefreshChats]);

  const refreshScenes = useCallback(async () => {
    setScenes(await api.scenes.list(chatId));
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    setLoading(true);
    setDetail(null);
    setError(null);
    setWarnings([]);
    setStreaming(false);
    setStreamContent('');
    Promise.all([api.chats.get(chatId), api.scenes.list(chatId)])
      .then(([next, sceneList]) => {
        if (!cancelled) {
          setDetail(next);
          setScenes(sceneList);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '会话加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [chatId]);

  const runGeneration = async (mode: StreamMode) => {
    if (!detail) return;
    setStreaming(true);
    setError(null);
    setWarnings([]);
    setStreamContent('');
    const controller = new AbortController();
    abortRef.current = controller;
    generationRef.current = null;

    const handlers = {
      onMeta: (meta: { generationId: string; warnings: string[] }) => {
        generationRef.current = meta.generationId;
        if (meta.warnings?.length) setWarnings(meta.warnings);
      },
      onDelta: (text: string) => setStreamContent((prev) => prev + text),
      onError: (payload: { message: string }) => setError(payload.message),
    };

    try {
      if (mode === 'generate') await api.chats.generate(chatId, handlers, controller.signal);
      else {
        const lastAssistant = [...(detail.messages ?? [])].reverse().find((item) => item.role === 'assistant');
        if (!lastAssistant) throw new ApiError('没有可以重新生成的角色回复');
        await api.chats.regenerate(chatId, lastAssistant.id, handlers, controller.signal);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof ApiError ? err.message : '生成失败，请检查模型服务');
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      abortRef.current = null;
      generationRef.current = null;
      try {
        await refresh();
      } catch {
        // The error banner above is enough; the next manual refresh can retry.
      }
    }
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [detail?.messages.length, streamContent]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  const handleSend = async (content: string): Promise<boolean> => {
    const text = content.trim();
    if (!text || streaming || sending || !detail) return false;
    setSending(true);
    setError(null);
    try {
      const stored = await api.chats.addMessage(chatId, text);
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, stored] } : prev));
      void runGeneration('generate');
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发送失败');
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleStop = async () => {
    const generationId = generationRef.current;
    if (generationId) {
      try {
        await api.chats.cancel(generationId);
        setTimeout(() => abortRef.current?.abort(), 1500);
      } catch {
        abortRef.current?.abort();
      }
    } else {
      abortRef.current?.abort();
    }
  };

  const handleExportChat = async () => {
    try {
      const data = await api.chats.exportSession(chatId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${detail?.chat.title ?? 'session'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('会话已导出');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '导出失败');
    }
  };

  const handleRegenerate = async () => {
    if (!detail || streaming) return;
    const lastAssistant = [...detail.messages].reverse().find((item) => item.role === 'assistant');
    if (!lastAssistant) {
      message.info('还没有可以重新生成的角色回复');
      return;
    }
    await runGeneration('regenerate');
  };

  if (loading) {
    return (
      <div className="center-state">
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="center-state">
        <Empty description={error ?? '会话不存在'} />
      </div>
    );
  }

  const character = detail.chat.character;
  const provider = providers.find((item) => item.id === detail.chat.providerId);
  const avatarColor = colorFor(character.name);
  const sceneCard = (scene: SceneView) => <SceneTimelineCard scene={scene} />;
  const systemTop = scenes.filter((scene) => scene.enabled && scene.placement.mode === 'system-top');
  const dynamicScenes = scenes.filter((scene) => scene.enabled && scene.placement.mode !== 'system-top');
  const byDepth = new Map<number, SceneView[]>();
  const byAnchor = new Map<string, SceneView[]>();
  const orphaned: SceneView[] = [];
  const messageIds = new Set(detail.messages.map((item) => item.id));
  for (const scene of dynamicScenes) {
    const placement = scene.placement;
    if (placement.mode === 'anchored') {
      if (messageIds.has(placement.messageId)) {
        const list = byAnchor.get(placement.messageId) ?? [];
        list.push(scene);
        byAnchor.set(placement.messageId, list);
      } else {
        orphaned.push(scene);
      }
    } else if (placement.mode === 'depth') {
      const depth = Math.max(0, Math.min(detail.messages.length, placement.depth));
      const list = byDepth.get(depth) ?? [];
      list.push(scene);
      byDepth.set(depth, list);
    }
  }
  const sorted = (list: SceneView[]) => [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const items: { key: string; role: string; content: unknown }[] = [];
  for (const scene of sorted(systemTop)) items.push({ key: `scene-${scene.id}`, role: 'scene', content: sceneCard(scene) });
  detail.messages.forEach((item: StoredMessage, index) => {
    const depth = detail.messages.length - index;
    for (const scene of sorted(byDepth.get(depth) ?? [])) items.push({ key: `scene-${scene.id}`, role: 'scene', content: sceneCard(scene) });
    items.push({ key: item.id, role: item.role === 'user' ? 'user' : 'assistant', content: item.content });
    for (const scene of sorted(byAnchor.get(item.id) ?? [])) items.push({ key: `scene-${scene.id}`, role: 'scene', content: sceneCard(scene) });
  });
  for (const scene of sorted(byDepth.get(0) ?? [])) items.push({ key: `scene-${scene.id}`, role: 'scene', content: sceneCard(scene) });
  for (const scene of sorted(orphaned)) items.push({ key: `scene-${scene.id}`, role: 'scene', content: sceneCard(scene) });
  if (streaming) {
    items.push({
      key: '__streaming__',
      role: 'assistant',
      content: streamContent || '正在思考…',
    });
  }

  const roles = {
    user: {
      placement: 'end' as const,
      variant: 'filled' as const,
      avatar: <Avatar style={{ background: '#1677ff' }}>你</Avatar>,
      messageRender: (content: unknown) => <div className="plain-text">{String(content ?? '')}</div>,
    },
    assistant: {
      placement: 'start' as const,
      variant: 'outlined' as const,
      avatar: <Avatar style={{ background: avatarColor }}>{character.name.slice(0, 1)}</Avatar>,
      messageRender: (content: unknown) => <Markdown content={String(content ?? '')} />,
    },
    scene: {
      placement: 'start' as const,
      variant: 'borderless' as const,
      avatar: <Avatar style={{ background: '#7c5cff' }}>景</Avatar>,
      messageRender: (content: unknown) => <>{content}</>,
    },
  };

  return (
    <div className="chat-pane">
      <header className="chat-header">
        <Space size={12}>
          <Button type="text" icon={<MenuOutlined />} onClick={onToggleSidebar} className="sidebar-toggle" />
          <Avatar size={40} style={{ background: avatarColor }}>
            {character.name.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {character.name}
            </Typography.Text>
            <div className="muted">{detail.chat.title}</div>
          </div>
        </Space>
        <Space size={8} wrap>
          <Tag color="purple">{detail.chat.model}</Tag>
          {provider && <Tag>{provider.name}</Tag>}
          <Tooltip title="场景 / 导演指令">
            <Button icon={<ReadOutlined />} onClick={() => setSceneOpen(true)}>
              场景
            </Button>
          </Tooltip>
          <Tooltip title="查看本次实际发送的上下文">
            <Button icon={<ProfileOutlined />} onClick={() => setContextOpen(true)}>
              上下文
            </Button>
          </Tooltip>
          <BranchSwitcher
            chatId={chatId}
            activeLeafId={detail.chat.activeLeafId}
            onSwitched={async () => {
              nearBottomRef.current = true;
              await refresh();
            }}
          />
          <Tooltip title="导出会话 JSON（不含 API Key）">
            <Button icon={<DownloadOutlined />} onClick={() => void handleExportChat()} />
          </Tooltip>
          <Tooltip title="会话模型与参数">
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
              模型
            </Button>
          </Tooltip>
          <Tooltip title="用相同上下文再生成一条">
            <Button icon={<ReloadOutlined />} onClick={() => void handleRegenerate()} disabled={streaming || !detail.messages.some((item) => item.role === 'assistant')}>
              重新生成
            </Button>
          </Tooltip>
        </Space>
      </header>

      <SceneStatusBar chatId={chatId} scenes={scenes} onChanged={() => void refreshScenes()} />

      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setWarnings([])}
          message={warnings.join('；')}
          style={{ margin: '0 24px 8px' }}
        />
      )}

      <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        {items.length === 0 ? (
          <div className="center-state">
            <Empty description="开始你们的第一句对话吧" />
          </div>
        ) : (
          <Bubble.List
            items={items}
            roles={roles}
            style={{ maxWidth: 960, margin: '0 auto', padding: '8px 0 24px' }}
          />
        )}
      </div>

      <div className="composer">
        {error && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            message={error}
            style={{ marginBottom: 8 }}
          />
        )}
        <Composer
          disabled={sending}
          loading={streaming}
          onSend={handleSend}
          onStop={() => void handleStop()}
          onSuggest={async () => (await api.chats.suggestions(chatId, 3)).suggestions}
        />
        <div className="composer-hint">
          角色扮演内容由模型生成，请自行判断；API Key 只保存在本机。
        </div>
      </div>

      {detail.chat && (
        <ChatSettingsModal
          open={settingsOpen}
          chat={detail.chat}
          providers={providers}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setDetail(next);
            onRefreshChats();
          }}
        />
      )}

      <SceneDrawer
        open={sceneOpen}
        chatId={chatId}
        messages={detail.messages}
        onClose={() => setSceneOpen(false)}
        onOpenContext={() => {
          setSceneOpen(false);
          setContextOpen(true);
        }}
        onChanged={() => void refreshScenes()}
      />

      <ContextPreviewDrawer
        open={contextOpen}
        chatId={chatId}
        onClose={() => setContextOpen(false)}
      />
    </div>
  );
}
