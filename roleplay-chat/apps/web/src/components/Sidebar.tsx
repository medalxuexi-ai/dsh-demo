import { Avatar, Badge, Button, Divider, Empty, List, Popconfirm, Space, Switch, Tooltip, Typography, Upload } from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  MessageOutlined,
  MoonOutlined,
  PlusOutlined,
  SunOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { Character } from '@roleplay/core';
import type { ChatSummary } from '../types';
import { colorFor } from '../constants';

interface Props {
  characters: Character[];
  chats: ChatSummary[];
  activeChatId: string | null;
  providerCount: number;
  dark: boolean;
  onNewChat: (characterId?: string) => void;
  onEditCharacter: (character: Character) => void;
  onNewCharacter: () => void;
  onImportCharacter: (file: File) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onOpenSettings: () => void;
  onToggleDark: (dark: boolean) => void;
}

export function Sidebar({
  characters,
  chats,
  activeChatId,
  providerCount,
  dark,
  onNewChat,
  onEditCharacter,
  onNewCharacter,
  onImportCharacter,
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
                  description={<span className="muted">{character.description.slice(0, 28) || '未填写设定'}</span>}
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
          <span className="muted">{chats.length}</span>
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
