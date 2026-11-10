import { useRef, useState } from 'react';
import { Button, Col, Input, Row, Segmented } from 'antd';
import type { InputRef } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { MessageOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { composeUserMessage, type UserMessageParts } from '@roleplay/core';

interface Props {
  disabled: boolean;
  loading: boolean;
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
}

type Mode = 'structured' | 'free';

const STORAGE_KEY = 'roleplay-composer-mode';
const EMPTY_PARTS: UserMessageParts = { scene: '', action: '', expression: '', dialogue: '' };

export function Composer({ disabled, loading, onSend, onStop }: Props) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(STORAGE_KEY) === 'free' ? 'free' : 'structured'));
  const [parts, setParts] = useState<UserMessageParts>(EMPTY_PARTS);
  const [freeText, setFreeText] = useState('');
  const [sending, setSending] = useState(false);

  const sceneRef = useRef<InputRef>(null);
  const actionRef = useRef<InputRef>(null);
  const expressionRef = useRef<InputRef>(null);
  const dialogueRef = useRef<TextAreaRef>(null);
  const freeRef = useRef<TextAreaRef>(null);

  const content = mode === 'structured' ? composeUserMessage(parts) : freeText.trim();
  const canSend = content.length > 0 && !disabled && !loading && !sending;

  const update = (key: keyof UserMessageParts, value: string) => {
    setParts((current) => ({ ...current, [key]: value }));
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'free') {
      setFreeText((current) => (current.trim() ? current : composeUserMessage(parts)));
      setParts(EMPTY_PARTS);
    } else {
      setParts((current) => ({
        ...EMPTY_PARTS,
        dialogue: current.dialogue?.trim() ? current.dialogue : freeText,
      }));
      setFreeText('');
    }
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const ok = await onSend(content);
      if (ok) {
        setParts(EMPTY_PARTS);
        setFreeText('');
      }
    } finally {
      setSending(false);
    }
  };

  const handleCtrlEnter = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="composer-card">
      <div className="composer-toolbar">
        <Segmented
          size="small"
          value={mode}
          onChange={(value) => switchMode(value as Mode)}
          options={[
            { label: '分段输入', value: 'structured' },
            { label: '自由输入', value: 'free' },
          ]}
        />
        <span className="muted">
          {mode === 'structured' ? '场景 / 动作 / 表情 / 对话 会组合成一条消息' : '想到什么就写什么'}
        </span>
      </div>

      {mode === 'structured' ? (
        <div className="structured-fields">
          <Input
            ref={sceneRef}
            addonBefore="场景"
            value={parts.scene ?? ''}
            onChange={(event) => update('scene', event.target.value)}
            onPressEnter={() => actionRef.current?.focus()}
            placeholder="现在在哪、天气、氛围…（可选）"
            maxLength={2000}
          />
          <Row gutter={[8, 8]}>
            <Col xs={24} md={12}>
              <Input
                ref={actionRef}
                addonBefore="动作"
                value={parts.action ?? ''}
                onChange={(event) => update('action', event.target.value)}
                onPressEnter={() => expressionRef.current?.focus()}
                placeholder="你做了什么…（可选）"
                maxLength={2000}
              />
            </Col>
            <Col xs={24} md={12}>
              <Input
                ref={expressionRef}
                addonBefore="表情"
                value={parts.expression ?? ''}
                onChange={(event) => update('expression', event.target.value)}
                onPressEnter={() => dialogueRef.current?.focus()}
                placeholder="你的神情 / 情绪…（可选）"
                maxLength={2000}
              />
            </Col>
          </Row>
          <div className="dialogue-field">
            <div className="field-label">
              <MessageOutlined />
              <span>对话</span>
              <span className="muted">你说出口的话</span>
            </div>
            <Input.TextArea
              ref={dialogueRef}
              value={parts.dialogue ?? ''}
              onChange={(event) => update('dialogue', event.target.value)}
              onKeyDown={handleCtrlEnter}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder="……（可选）"
              maxLength={20000}
            />
          </div>
        </div>
      ) : (
        <Input.TextArea
          ref={freeRef}
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
          onKeyDown={handleCtrlEnter}
          autoSize={{ minRows: 3, maxRows: 8 }}
          placeholder="想到什么就写什么…（Ctrl / ⌘ + Enter 发送）"
          maxLength={20000}
        />
      )}

      <div className="composer-actions">
        <span className="muted">
          {content.length > 0 ? `${content.length} 字` : '至少填写一项'} · Ctrl / ⌘ + Enter 发送
        </span>
        {loading ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!canSend} onClick={() => void send()}>
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
