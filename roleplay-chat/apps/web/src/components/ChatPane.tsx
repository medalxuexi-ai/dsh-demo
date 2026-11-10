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
import { MenuOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { Bubble } from '@ant-design/x';
import type { PublicProvider, StoredMessage } from '@roleplay/core';
import { api, ApiError } from '../api';
import { colorFor } from '../constants';
import type { ChatDetail } from '../types';
import { ChatSettingsModal } from './ChatSettingsModal';
import { Composer } from './Composer';
import { Markdown } from './Markdown';

interface Props {
  chatId: string;
  providers: PublicProvider[];
  onRefreshChats: () => void;
  onToggleSidebar: () => void;
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

  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await api.chats.get(chatId);
    setDetail(next);
    onRefreshChats();
  }, [chatId, onRefreshChats]);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    setLoading(true);
    setDetail(null);
    setError(null);
    setWarnings([]);
    setStreaming(false);
    setStreamContent('');
    api.chats
      .get(chatId)
      .then((next) => {
        if (!cancelled) setDetail(next);
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
  const items = detail.messages.map((item: StoredMessage) => ({
    key: item.id,
    role: item.role === 'user' ? 'user' : 'assistant',
    content: item.content,
  }));
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
    </div>
  );
}
