import { Button, Card, Result, Space, Typography } from 'antd';
import { ApiOutlined, MenuOutlined, MessageOutlined, UserAddOutlined } from '@ant-design/icons';
import type { Character, PublicProvider } from '@roleplay/core';
import { colorFor } from '../constants';

interface Props {
  characters: Character[];
  providers: PublicProvider[];
  onConfigureProvider: () => void;
  onNewCharacter: () => void;
  onNewChat: (characterId?: string) => void;
  onToggleSidebar: () => void;
}

export function Welcome({
  characters,
  providers,
  onConfigureProvider,
  onNewCharacter,
  onNewChat,
  onToggleSidebar,
}: Props) {
  if (providers.length === 0) {
    return (
      <div className="welcome">
        <Button type="text" icon={<MenuOutlined />} className="sidebar-toggle welcome-menu" onClick={onToggleSidebar} />
        <Result
          icon={<ApiOutlined style={{ color: '#7c5cff' }} />}
          title="先接入一个模型"
          subTitle="支持 DeepSeek、OpenAI、OpenRouter、Ollama、LM Studio 或任何 OpenAI 兼容端点。"
          extra={
            <Button type="primary" size="large" onClick={onConfigureProvider}>
              配置模型服务
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="welcome">
      <Button type="text" icon={<MenuOutlined />} className="sidebar-toggle welcome-menu" onClick={onToggleSidebar} />
      <div className="welcome-inner">
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          开始一段新故事
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          选择一个角色开始对话。想改戏时，随时在输入框里插入场景或这一轮的要求。
        </Typography.Paragraph>
        <Space style={{ marginBottom: 24 }} wrap>
          <Button type="primary" icon={<MessageOutlined />} onClick={() => onNewChat()}>
            新建会话
          </Button>
          <Button icon={<UserAddOutlined />} onClick={onNewCharacter}>
            新建角色
          </Button>
          <Button onClick={onConfigureProvider}>管理模型服务</Button>
        </Space>
        <div className="character-grid">
          {characters.map((character) => (
            <Card
              key={character.id}
              hoverable
              className="character-card"
              onClick={() => onNewChat(character.id)}
              cover={
                <div className="character-cover" style={{ background: `linear-gradient(135deg, ${colorFor(character.name)}, #7c5cff)` }}>
                  <span>{character.name.slice(0, 1)}</span>
                </div>
              }
            >
              <Card.Meta
                title={character.name}
                description={<span className="muted">{character.description.slice(0, 48) || '未填写设定'}</span>}
              />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
