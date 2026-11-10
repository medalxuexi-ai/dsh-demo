import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, ConfigProvider, Layout, Result, Spin, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { parseCharacterCardBuffer, type Character, type PublicProvider, type Script } from '@roleplay/core';
import { api } from './api';
import type { ChatDetail, ChatSummary } from './types';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { ChatPane } from './components/ChatPane';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ProviderModal } from './components/ProviderModal';
import { CharacterModal } from './components/CharacterModal';
import { NewChatModal } from './components/NewChatModal';
import { ScriptModal } from './components/ScriptModal';

const { Sider, Content } = Layout;

function Shell({ dark, onToggleDark }: { dark: boolean; onToggleDark: (value: boolean) => void }) {
  const { message } = AntApp.useApp();
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
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
  const [initialScriptId, setInitialScriptId] = useState<string | undefined>();
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [characterScriptId, setCharacterScriptId] = useState<string | undefined>();
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const refreshChats = useCallback(async () => {
    const next = await api.chats.list();
    setChats(next);
    setActiveChatId((current) => (current && next.some((chat) => chat.id === current) ? current : next[0]?.id ?? null));
    return next;
  }, []);

  const loadAll = useCallback(async () => {
    const [nextProviders, nextCharacters, nextChats, nextScripts] = await Promise.all([
      api.providers.list(),
      api.characters.list(),
      api.chats.list(),
      api.scripts.list(),
    ]);
    setProviders(nextProviders);
    setCharacters(nextCharacters);
    setChats(nextChats);
    setScripts(nextScripts);
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

  const reloadScripts = useCallback(async () => {
    setScripts(await api.scripts.list());
  }, []);

  const handleImportCharacter = async (file: File) => {
    try {
      const parsed = parseCharacterCardBuffer(await file.arrayBuffer());
      const created = await api.characters.create({
        name: parsed.name,
        scriptId: scripts[0]?.id ?? null,
        description: parsed.description,
        personality: parsed.personality,
        scenario: parsed.scenario,
        firstMessage: parsed.firstMessage,
        systemPrompt: parsed.systemPrompt,
        exampleDialogue: parsed.exampleDialogue,
        alternateGreetings: parsed.alternateGreetings,
        tags: parsed.tags,
        rawExtensions: parsed.rawExtensions,
      });
      if (parsed.characterBook) await api.characters.importBook(created.id, parsed.characterBook);
      await reloadCharacters();
      message.success(`已导入角色「${created.name}」`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '角色卡导入失败');
    }
  };

  const handleImportChat = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const data = parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed;
      const detail = await api.chats.importSession(data);
      await refreshChats();
      setActiveChatId(detail.chat.id);
      message.success(`已导入会话「${detail.chat.title}」`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '会话导入失败');
    }
  };

  const handleExportCharacter = async (character: Character, format: 'json' | 'png') => {
    try {
      const blob = format === 'png'
        ? await api.characters.exportPng(character.id)
        : new Blob([JSON.stringify(await api.characters.export(character.id), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${character.name}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(`已导出「${character.name}」${format.toUpperCase()}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleNewChat = (characterId?: string) => {
    setInitialCharacterId(characterId);
    setInitialScriptId(undefined);
    setNewChatOpen(true);
  };

  const handleNewChatForScript = (scriptId: string) => {
    setInitialCharacterId(undefined);
    setInitialScriptId(scriptId);
    setNewChatOpen(true);
  };

  const handleDeleteScript = async (script: Script) => {
    try {
      await api.scripts.remove(script.id);
      await reloadScripts();
      await reloadCharacters();
      message.success('剧本已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除剧本失败');
    }
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
          scripts={scripts}
          chats={chats}
          activeChatId={activeChatId}
          providerCount={providers.length}
          dark={dark}
          onNewChat={handleNewChat}
          onNewScript={() => { setEditingScript(null); setScriptModalOpen(true); }}
          onEditScript={(script) => { setEditingScript(script); setScriptModalOpen(true); }}
          onDeleteScript={(script) => void handleDeleteScript(script)}
          onNewChatForScript={handleNewChatForScript}
          onAddCharacterToScript={(scriptId) => {
            setEditingCharacter(null);
            setCharacterScriptId(scriptId);
            setCharacterModalOpen(true);
          }}
          onEditCharacter={(character) => {
            setEditingCharacter(character);
            setCharacterModalOpen(true);
          }}
          onNewCharacter={() => {
            setEditingCharacter(null);
            setCharacterScriptId(undefined);
            setCharacterModalOpen(true);
          }}
          onImportCharacter={(file) => void handleImportCharacter(file)}
          onExportCharacter={(character, format) => void handleExportCharacter(character, format)}
          onImportChat={(file) => void handleImportChat(file)}
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
                setCharacterScriptId(undefined);
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
        scripts={scripts}
        initialScriptId={characterScriptId}
        character={editingCharacter}
        onClose={() => setCharacterModalOpen(false)}
        onSaved={() => void reloadCharacters()}
      />

      <ScriptModal
        open={scriptModalOpen}
        script={editingScript}
        onClose={() => setScriptModalOpen(false)}
        onSaved={() => { void reloadScripts(); void reloadCharacters(); }}
      />

      <NewChatModal
        open={newChatOpen}
        characters={characters}
        scripts={scripts}
        providers={providers}
        initialCharacterId={initialCharacterId}
        initialScriptId={initialScriptId}
        onClose={() => setNewChatOpen(false)}
        onCreated={(detail) => void handleChatCreated(detail)}
        onCreateCharacter={(scriptId) => {
          setNewChatOpen(false);
          setEditingCharacter(null);
          setCharacterScriptId(scriptId);
          setCharacterModalOpen(true);
        }}
        onConfigureProvider={() => {
          setNewChatOpen(false);
          setEditingProvider(null);
          setProviderModalOpen(true);
        }}
        onCreateScript={() => { setEditingScript(null); setScriptModalOpen(true); }}
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
