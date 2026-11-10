import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, ConfigProvider, Layout, Result, Spin, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { parseCharacterCardBuffer, type Character, type PublicProvider } from '@roleplay/core';
import { api } from './api';
import type { ChatDetail, ChatSummary } from './types';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { ChatPane } from './components/ChatPane';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ProviderModal } from './components/ProviderModal';
import { CharacterModal } from './components/CharacterModal';
import { NewChatModal } from './components/NewChatModal';

const { Sider, Content } = Layout;

function Shell({ dark, onToggleDark }: { dark: boolean; onToggleDark: (value: boolean) => void }) {
  const { message } = AntApp.useApp();
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<PublicProvider | null>(null);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [initialCharacterId, setInitialCharacterId] = useState<string | undefined>();
  const refreshChats = useCallback(async () => {
    const next = await api.chats.list();
    setChats(next);
    setActiveChatId((current) => (current && next.some((chat) => chat.id === current) ? current : next[0]?.id ?? null));
    return next;
  }, []);

  const loadAll = useCallback(async () => {
    const [nextProviders, nextCharacters, nextChats] = await Promise.all([
      api.providers.list(),
      api.characters.list(),
      api.chats.list(),
    ]);
    setProviders(nextProviders);
    setCharacters(nextCharacters);
    setChats(nextChats);
    setActiveChatId((current) => (current && nextChats.some((chat) => chat.id === current) ? current : nextChats[0]?.id ?? null));
  }, []);

  useEffect(() => {
    loadAll()
      .catch((error: unknown) => setFatal(error instanceof Error ? error.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [loadAll]);

  const reloadProviders = useCallback(async () => {
    setProviders(await api.providers.list());
  }, []);

  const reloadCharacters = useCallback(async () => {
    setCharacters(await api.characters.list());
  }, []);

  const handleImportCharacter = async (file: File) => {
    try {
      const parsed = parseCharacterCardBuffer(await file.arrayBuffer());
      const created = await api.characters.create({
        name: parsed.name,
        description: parsed.description,
        personality: parsed.personality,
        scenario: parsed.scenario,
        firstMessage: parsed.firstMessage,
        systemPrompt: parsed.systemPrompt,
      });
      await reloadCharacters();
      message.success(`已导入角色「${created.name}」`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '角色卡导入失败');
    }
  };

  const handleNewChat = (characterId?: string) => {
    setInitialCharacterId(characterId);
    setNewChatOpen(true);
  };

  const handleChatCreated = async (detail: ChatDetail) => {
    await refreshChats();
    setActiveChatId(detail.chat.id);
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await api.chats.remove(chatId);
      if (activeChatId === chatId) setActiveChatId(null);
      await refreshChats();
      message.success('会话已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <Spin size="large" tip="正在启动幕间…">
          <div style={{ height: 80 }} />
        </Spin>
      </div>
    );
  }

  if (fatal) {
    return (
      <Result
        status="error"
        title="无法连接本地服务"
        subTitle={`${fatal}。请确认服务端已启动（默认 http://127.0.0.1:8787）。`}
        extra={<Button onClick={() => window.location.reload()}>重试</Button>}
      />
    );
  }

  return (
    <Layout className="app-shell">
      <Sider
        className="sidebar"
        width={300}
        theme={dark ? 'dark' : 'light'}
        breakpoint="lg"
        collapsedWidth={0}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onBreakpoint={(broken) => setCollapsed(broken)}
        trigger={null}
      >
        <Sidebar
          characters={characters}
          chats={chats}
          activeChatId={activeChatId}
          providerCount={providers.length}
          dark={dark}
          onNewChat={handleNewChat}
          onEditCharacter={(character) => {
            setEditingCharacter(character);
            setCharacterModalOpen(true);
          }}
          onNewCharacter={() => {
            setEditingCharacter(null);
            setCharacterModalOpen(true);
          }}
          onImportCharacter={(file) => void handleImportCharacter(file)}
          onSelectChat={setActiveChatId}
          onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleDark={onToggleDark}
        />
      </Sider>

      <Layout className="main-layout">
        <Content className="main-content">
          {activeChatId ? (
            <ChatPane
              key={activeChatId}
              chatId={activeChatId}
              providers={providers}
              onRefreshChats={() => void refreshChats()}
              onToggleSidebar={() => setCollapsed(false)}
            />
          ) : (
            <Welcome
              characters={characters}
              providers={providers}
              onConfigureProvider={() => {
                if (providers.length === 0) {
                  setEditingProvider(null);
                  setProviderModalOpen(true);
                } else {
                  setSettingsOpen(true);
                }
              }}
              onNewCharacter={() => {
                setEditingCharacter(null);
                setCharacterModalOpen(true);
              }}
              onNewChat={handleNewChat}
              onToggleSidebar={() => setCollapsed(false)}
            />
          )}
        </Content>
      </Layout>

      <SettingsDrawer
        open={settingsOpen}
        providers={providers}
        onClose={() => setSettingsOpen(false)}
        onAdd={() => {
          setEditingProvider(null);
          setProviderModalOpen(true);
        }}
        onEdit={(provider) => {
          setEditingProvider(provider);
          setProviderModalOpen(true);
        }}
        onChanged={() => void reloadProviders()}
      />

      <ProviderModal
        open={providerModalOpen}
        provider={editingProvider}
        onClose={() => setProviderModalOpen(false)}
        onSaved={() => void reloadProviders()}
      />

      <CharacterModal
        open={characterModalOpen}
        character={editingCharacter}
        onClose={() => setCharacterModalOpen(false)}
        onSaved={() => void reloadCharacters()}
      />

      <NewChatModal
        open={newChatOpen}
        characters={characters}
        providers={providers}
        initialCharacterId={initialCharacterId}
        onClose={() => setNewChatOpen(false)}
        onCreated={(detail) => void handleChatCreated(detail)}
        onCreateCharacter={() => {
          setNewChatOpen(false);
          setEditingCharacter(null);
          setCharacterModalOpen(true);
        }}
        onConfigureProvider={() => {
          setNewChatOpen(false);
          setEditingProvider(null);
          setProviderModalOpen(true);
        }}
      />

      {providers.length === 0 && (
        <Alert
          className="floating-warning"
          type="warning"
          showIcon
          closable
          message="还没有配置模型服务"
          description="配置一个 OpenAI 兼容端点后即可开始对话。"
          action={
            <Button size="small" type="primary" onClick={() => setProviderModalOpen(true)}>
              去配置
            </Button>
          }
        />
      )}
    </Layout>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('roleplay-theme') === 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('roleplay-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#7c5cff', borderRadius: 12, fontFamily: 'inherit' },
      }}
    >
      <AntApp>
        <Shell dark={dark} onToggleDark={setDark} />
      </AntApp>
    </ConfigProvider>
  );
}
