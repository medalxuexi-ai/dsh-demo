import { Avatar, Badge, Button, Divider, Dropdown, Empty, List, Popconfirm, Space, Switch, Tooltip, Typography, Upload } from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  MessageOutlined,
  MoonOutlined,
  PlusOutlined,
  SunOutlined,
  UploadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { Character, Script } from '@roleplay/core';
import type { ChatSummary } from '../types';
import { colorFor } from '../constants';

interface Props {
  characters: Character[];
  scripts: Script[];
  chats: ChatSummary[];
  activeChatId: string | null;
  providerCount: number;
  dark: boolean;
  onNewChat: (characterId?: string) => void;
  onEditCharacter: (character: Character) => void;
  onNewCharacter: () => void;
  onNewScript: () => void;
  onEditScript: (script: Script) => void;
  onDeleteScript: (script: Script) => void;
  onNewChatForScript: (scriptId: string) => void;
  onAddCharacterToScript: (scriptId: string) => void;
  onImportCharacter: (file: File) => void;
  onExportCharacter: (character: Character, format: 'json' | 'png') => void;
  onImportChat: (file: File) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onOpenSettings: () => void;
  onToggleDark: (dark: boolean) => void;
}

export function Sidebar({
  characters,
  scripts,
  chats,
  activeChatId,
  providerCount,
  dark,
  onNewChat,
  onEditCharacter,
  onNewCharacter,
  onNewScript,
  onEditScript,
  onDeleteScript,
  onNewChatForScript,
  onAddCharacterToScript,
  onImportCharacter,
  onExportCharacter,
  onImportChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
  onToggleDark,
}: Props) {
  return (
    <div className="sidebar-inner">
      <div className="brand">
        <div>
          <div className="brand-title">幕间</div>
          <div className="brand-sub">沉浸式角色扮演</div>
        </div>
        <Tooltip title={dark ? '切换浅色' : '切换深色'}>
          <Switch
            checked={dark}
            onChange={onToggleDark}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
          />
        </Tooltip>
      </div>

      <Button type="primary" block icon={<PlusOutlined />} onClick={() => onNewChat()} style={{ marginBottom: 16 }}>
        新建会话
      </Button>

      <div className="sidebar-section scripts-section">
        <div className="section-title">
          <span>剧本</span>
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={onNewScript} />
        </div>
        {scripts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先创建剧本" />
        ) : (
          <List
            size="small"
            dataSource={scripts}
            renderItem={(script) => {
              const cast = characters.filter((character) => character.scriptId === script.id);
              return (
                <List.Item
                  className="script-item"
                  onClick={() => onNewChatForScript(script.id)}
                  actions={[
                    <Button
                      key="add-character"
                      type="text"
                      size="small"
                      icon={<UserAddOutlined />}
                      title="添加角色到剧本"
                      onClick={(event) => { event.stopPropagation(); onAddCharacterToScript(script.id); }}
                    />,
                    <Button
                      key="edit"
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(event) => { event.stopPropagation(); onEditScript(script); }}
                    />,
                    <Popconfirm
                      key="delete"
                      title="删除这个剧本？角色会变为未分组，已有会话不受影响。"
                      onConfirm={(event) => { event?.stopPropagation(); onDeleteScript(script); }}
                      onCancel={(event) => event?.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={script.name}
                    description={<span className="muted">{cast.length ? cast.map((character) => character.name).join(' · ') : '还没有角色'}</span>}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <div className="sidebar-section">
        <div className="section-title">
          <span>角色</span>
          <Space size={0}>
            <Upload
              accept=".json,.png,image/png,application/json"
              showUploadList={false}
              beforeUpload={(file) => { onImportCharacter(file); return false; }}
            >
              <Tooltip title="导入 SillyTavern 角色卡（JSON / PNG）">
                <Button type="text" size="small" icon={<ImportOutlined />} />
              </Tooltip>
            </Upload>
            <Button type="text" size="small" icon={<UserAddOutlined />} onClick={onNewCharacter} />
          </Space>
        </div>
        {characters.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有角色" />
        ) : (
          <List
            size="small"
            dataSource={characters}
            renderItem={(character) => (
              <List.Item
                className="character-item"
                onClick={() => onNewChat(character.id)}
                actions={[
                  <Dropdown
                    key="export"
                    menu={{
                      items: [
                        { key: 'json', label: '导出 V2 JSON' },
                        { key: 'png', label: '导出 V2 PNG' },
                      ],
                      onClick: ({ key }) => onExportCharacter(character, key as 'json' | 'png'),
                    }}
                    trigger={['click']}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DownloadOutlined />}
                      title="导出角色卡"
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Dropdown>,
                  <Button
                    key="edit"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditCharacter(character);
                    }}
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar style={{ background: colorFor(character.name) }}>{character.name.slice(0, 1)}</Avatar>
                  }
                  title={character.name}
                  description={<span className="muted">{[scripts.find((script) => script.id === character.scriptId)?.name, character.description.slice(0, 24) || '未填写设定'].filter(Boolean).join(' · ')}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <div className="sidebar-section chats-section">
        <div className="section-title">
          <span>会话</span>
          <Space size={4}>
            <span className="muted">{chats.length}</span>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => { onImportChat(file); return false; }}
            >
              <Tooltip title="导入会话 JSON">
                <Button type="text" size="small" icon={<UploadOutlined />} />
              </Tooltip>
            </Upload>
          </Space>
        </div>
        {chats.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
        ) : (
          <List
            size="small"
            dataSource={chats}
            renderItem={(chat) => (
              <List.Item
                className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => onSelectChat(chat.id)}
                actions={[
                  <Popconfirm
                    key="delete"
                    title="删除这个会话？"
                    onConfirm={(event) => {
                      event?.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    onCancel={(event) => event?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar size="small" icon={<MessageOutlined />} />}
                  title={<span className="chat-title">{chat.title}</span>}
                  description={<span className="muted chat-preview">{chat.preview || '还没有消息'}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <div className="sidebar-footer">
        <Button block icon={<ApiOutlined />} onClick={onOpenSettings}>
          模型服务
          {providerCount === 0 ? <Badge status="warning" style={{ marginLeft: 8 }} /> : <span className="muted" style={{ marginLeft: 8 }}>{providerCount}</span>}
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          数据与密钥只保存在本机
        </Typography.Text>
      </div>
    </div>
  );
}
