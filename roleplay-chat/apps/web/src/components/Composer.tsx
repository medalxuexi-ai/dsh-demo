import { useRef, useState } from 'react';
import { Alert, Button, Input, Popover, Segmented, Skeleton, Tag } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import {
  BulbOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  MessageOutlined,
  SendOutlined,
  SmileOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { composeUserMessage, type SuggestionParts, type UserMessageParts } from '@roleplay/core';

interface Props {
  disabled: boolean;
  loading: boolean;
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
  onSuggest: () => Promise<SuggestionParts[]>;
}

type Mode = 'structured' | 'free';
type OptionalKey = 'scene' | 'action' | 'expression';

const STORAGE_KEY = 'roleplay-composer-mode';
const EMPTY_PARTS: UserMessageParts = { scene: '', action: '', expression: '', dialogue: '' };
const CLOSED: Record<OptionalKey, boolean> = { scene: false, action: false, expression: false };

export function Composer({ disabled, loading, onSend, onStop, onSuggest }: Props) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(STORAGE_KEY) === 'free' ? 'free' : 'structured'));
  const [parts, setParts] = useState<UserMessageParts>(EMPTY_PARTS);
  const [open, setOpen] = useState<Record<OptionalKey, boolean>>(CLOSED);
  const [freeText, setFreeText] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionParts[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const sceneRef = useRef<TextAreaRef>(null);
  const actionRef = useRef<TextAreaRef>(null);
  const expressionRef = useRef<TextAreaRef>(null);
  const dialogueRef = useRef<TextAreaRef>(null);
  const freeRef = useRef<TextAreaRef>(null);

  const content = mode === 'structured' ? composeUserMessage(parts) : freeText.trim();
  const canSend = content.length > 0 && !disabled && !loading && !sending;
  const filledCount = mode === 'structured'
    ? [parts.scene, parts.action, parts.expression, parts.dialogue].filter((value) => value?.trim()).length
    : content
      ? 1
      : 0;

  const focus = (key: OptionalKey) => {
    requestAnimationFrame(() => {
      if (key === 'scene') sceneRef.current?.focus();
      else if (key === 'action') actionRef.current?.focus();
      else expressionRef.current?.focus();
    });
  };

  const openField = (key: OptionalKey) => {
    setOpen((current) => ({ ...current, [key]: true }));
    focus(key);
  };

  const update = (key: keyof UserMessageParts, value: string) => {
    setParts((current) => ({ ...current, [key]: value }));
  };

  const clearField = (key: OptionalKey) => {
    update(key, '');
    setOpen((current) => ({ ...current, [key]: false }));
  };

  const handleCtrlEnter = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  };

  const keyHandler = (next: () => void) => (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void send();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      next();
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'free') {
      setFreeText((current) => (current.trim() ? current : composeUserMessage(parts)));
      setParts(EMPTY_PARTS);
      setOpen(CLOSED);
    } else {
      setParts((current) => ({
        ...EMPTY_PARTS,
        dialogue: current.dialogue?.trim() ? current.dialogue : freeText,
      }));
      setFreeText('');
      setOpen(CLOSED);
      requestAnimationFrame(() => dialogueRef.current?.focus());
    }
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const loadSuggestions = async () => {
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      setSuggestions(await onSuggest());
    } catch (error) {
      setSuggestError(error instanceof Error ? error.message : 'AI 推荐失败，请重试');
    } finally {
      setSuggestLoading(false);
    }
  };

  const applySuggestion = (suggestion: SuggestionParts) => {
    if (mode === 'free') {
      setFreeText(composeUserMessage({
        dialogue: suggestion.dialogue,
        action: suggestion.action,
        expression: suggestion.expression,
      }));
    } else {
      setParts((current) => ({
        ...current,
        dialogue: suggestion.dialogue,
        action: suggestion.action ?? '',
        expression: suggestion.expression ?? '',
      }));
      setOpen({ scene: false, action: Boolean(suggestion.action), expression: Boolean(suggestion.expression) });
    }
    setSuggestOpen(false);
    requestAnimationFrame(() => dialogueRef.current?.focus());
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const ok = await onSend(content);
      if (ok) {
        setParts(EMPTY_PARTS);
        setOpen(CLOSED);
        setFreeText('');
        requestAnimationFrame(() => dialogueRef.current?.focus());
      }
    } finally {
      setSending(false);
    }
  };

  const suggestionContent = (
    <div className="suggestion-popover">
      <div className="suggestion-popover-head">
        <span className="muted">点数字填入，不自动发送</span>
        <Button type="text" size="small" loading={suggestLoading} onClick={() => void loadSuggestions()}>
          换一批
        </Button>
      </div>
      {suggestLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      ) : suggestError ? (
        <Alert
          type="error"
          showIcon
          message="AI 推荐失败"
          description={suggestError}
          action={<Button size="small" onClick={() => void loadSuggestions()}>重试</Button>}
        />
      ) : suggestions.length === 0 ? (
        <div className="muted">还没有建议</div>
      ) : (
        <div className="suggestion-options">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${index}-${suggestion.dialogue}`}
              type="button"
              className="suggestion-option"
              onClick={() => applySuggestion(suggestion)}
            >
              <span className="suggestion-index">{index + 1}</span>
              <span className="suggestion-option-body">
                <span className="suggestion-dialogue">{suggestion.dialogue}</span>
                {(suggestion.action || suggestion.expression) && (
                  <span className="suggestion-detail">
                    {[
                      suggestion.action ? `动作：${suggestion.action}` : '',
                      suggestion.expression ? `神态：${suggestion.expression}` : '',
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

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
        <div className="composer-tools">
          {mode === 'structured' ? (
            <div className="composer-chips">
              <Button
                size="small"
                type={open.scene ? 'primary' : 'default'}
                icon={<EnvironmentOutlined />}
                onClick={() => openField('scene')}
              >
                场景
              </Button>
              <Button
                size="small"
                type={open.action ? 'primary' : 'default'}
                icon={<ThunderboltOutlined />}
                onClick={() => openField('action')}
              >
                动作
              </Button>
              <Button
                size="small"
                type={open.expression ? 'primary' : 'default'}
                icon={<SmileOutlined />}
                onClick={() => openField('expression')}
              >
                神态
              </Button>
            </div>
          ) : (
            <span className="muted">想到什么就写什么</span>
          )}
          <Popover
            open={suggestOpen}
            onOpenChange={(next) => {
              setSuggestOpen(next);
              if (next) void loadSuggestions();
            }}
            trigger="click"
            placement="topRight"
            title="接下来可以发…"
            content={suggestionContent}
          >
            <Button size="small" icon={<BulbOutlined />} disabled={loading || disabled}>
              帮我想想
            </Button>
          </Popover>
        </div>
      </div>

      {mode === 'structured' ? (
        <div className="structured-fields">
          {open.scene && (
            <div className="optional-field">
              <div className="optional-field-head">
                <span className="field-label">
                  <EnvironmentOutlined /> 本轮场景
                </span>
                <Tag color="purple">导演注记</Tag>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="清空场景"
                  onClick={() => clearField('scene')}
                />
              </div>
              <Input.TextArea
                ref={sceneRef}
                value={parts.scene ?? ''}
                onChange={(event) => update('scene', event.target.value)}
                onKeyDown={keyHandler(() => dialogueRef.current?.focus())}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder="时间、地点、天气、氛围…（随这条消息发送）"
                maxLength={2000}
              />
            </div>
          )}

          {open.action && (
            <div className="optional-field">
              <div className="optional-field-head">
                <span className="field-label">
                  <ThunderboltOutlined /> 动作
                </span>
                <span className="muted">你做了什么</span>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="清空动作"
                  onClick={() => clearField('action')}
                />
              </div>
              <Input.TextArea
                ref={actionRef}
                value={parts.action ?? ''}
                onChange={(event) => update('action', event.target.value)}
                onKeyDown={keyHandler(() => dialogueRef.current?.focus())}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder="推开门，抖了抖伞…"
                maxLength={2000}
              />
            </div>
          )}

          {open.expression && (
            <div className="optional-field">
              <div className="optional-field-head">
                <span className="field-label">
                  <SmileOutlined /> 神态 / 心理
                </span>
                <span className="muted">神情、语气、心里在想</span>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="清空神态"
                  onClick={() => clearField('expression')}
                />
              </div>
              <Input.TextArea
                ref={expressionRef}
                value={parts.expression ?? ''}
                onChange={(event) => update('expression', event.target.value)}
                onKeyDown={keyHandler(() => dialogueRef.current?.focus())}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder="有点心虚，视线避开…"
                maxLength={2000}
              />
            </div>
          )}

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
              placeholder="……（至少填写一项）"
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
        <div className="composer-meta">
          {content ? (
            <>
              <Popover
                title="将发送"
                trigger="click"
                content={<pre className="compose-preview">{content}</pre>}
              >
                <Button type="text" size="small" icon={<EyeOutlined />}>
                  预览
                </Button>
              </Popover>
              <span className="muted">
                {filledCount} 段 · {content.length} 字
              </span>
            </>
          ) : (
            <span className="muted">至少填写一项</span>
          )}
          <span className="muted">Ctrl / ⌘ + Enter 发送</span>
        </div>
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
