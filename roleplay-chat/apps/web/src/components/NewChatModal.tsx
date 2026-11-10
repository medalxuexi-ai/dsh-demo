import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Form, Input, Modal, Select, Space } from 'antd';
import type { Character, PublicProvider, Script } from '@roleplay/core';
import { api, ApiError } from '../api';
import type { ChatDetail } from '../types';

interface Props {
  open: boolean;
  characters: Character[];
  scripts: Script[];
  providers: PublicProvider[];
  initialCharacterId?: string;
  initialScriptId?: string;
  onClose: () => void;
  onCreated: (detail: ChatDetail) => void;
  onCreateCharacter: (scriptId?: string) => void;
  onCreateScript: () => void;
  onConfigureProvider: () => void;
}

interface FormValues {
  scriptId: string;
  characterId: string;
  greetingIndex?: number;
  providerId: string;
  model: string;
}

export function NewChatModal({
  open,
  characters,
  scripts,
  providers,
  initialCharacterId,
  initialScriptId,
  onClose,
  onCreated,
  onCreateCharacter,
  onCreateScript,
  onConfigureProvider,
}: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [creating, setCreating] = useState(false);
  const selectedScriptId = Form.useWatch('scriptId', form);
  const selectedScript = scripts.find((script) => script.id === selectedScriptId);
  const cast = characters.filter((character) => character.scriptId === selectedScriptId);
  const selectedCharacterId = Form.useWatch('characterId', form);
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
  const greetings = selectedCharacter?.alternateGreetings ?? [];

  useEffect(() => {
    if (!open) return;
    const initialCharacter = characters.find((character) => character.id === initialCharacterId);
    const scriptId = initialScriptId ?? initialCharacter?.scriptId ?? scripts[0]?.id;
    const nextCast = characters.filter((character) => character.scriptId === scriptId);
    const characterId = initialCharacter && initialCharacter.scriptId === scriptId ? initialCharacter.id : nextCast[0]?.id;
    const provider = providers[0];
    form.resetFields();
    form.setFieldsValue({
      scriptId,
      characterId,
      greetingIndex: 0,
      providerId: provider?.id,
      model: provider?.defaultModel,
    });
  }, [open, initialCharacterId, initialScriptId, characters, scripts, providers, form]);

  const onValuesChange = (changed: Partial<FormValues>) => {
    if (changed.scriptId) {
      const nextCast = characters.filter((character) => character.scriptId === changed.scriptId);
      form.setFieldsValue({ characterId: nextCast[0]?.id, greetingIndex: 0 });
    }
    if (changed.characterId) {
      form.setFieldsValue({ greetingIndex: 0 });
    }
    if (changed.providerId) {
      const provider = providers.find((item) => item.id === changed.providerId);
      if (provider) form.setFieldsValue({ model: provider.defaultModel });
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const detail = await api.chats.create({
        scriptId: values.scriptId,
        characterId: values.characterId,
        greetingIndex: values.greetingIndex ?? 0,
        providerId: values.providerId,
        model: values.model,
      });
      message.success('会话已创建');
      onCreated(detail);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message);
      else if (error && typeof error === 'object' && 'errorFields' in error) return;
      else message.error('创建失败');
    } finally {
      setCreating(false);
    }
  };

  const hasScripts = scripts.length > 0;
  const hasCharacters = cast.length > 0;
  const hasProviders = providers.length > 0;

  return (
    <Modal
      title="新建会话"
      open={open}
      onCancel={onClose}
      onOk={handleCreate}
      okText="开始聊天"
      cancelText="取消"
      confirmLoading={creating}
      okButtonProps={{ disabled: !hasScripts || !hasCharacters || !hasProviders }}
      destroyOnClose
    >
      {!hasScripts && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="还没有剧本"
          description="先创建一个剧本，再把角色放进去。"
          action={<a onClick={onCreateScript}>新建剧本</a>}
        />
      )}
      {hasScripts && !hasCharacters && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="这个剧本还没有角色"
          description="给剧本添加一个角色，或者换一个剧本。"
          action={<a onClick={() => onCreateCharacter(selectedScriptId)}>新建角色</a>}
        />
      )}
      {!hasProviders && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="还没有模型服务"
          description="需要先配置一个 OpenAI 兼容的模型服务才能开始聊天。"
          action={<a onClick={onConfigureProvider}>去配置</a>}
        />
      )}
      <Form form={form} layout="vertical" onValuesChange={onValuesChange} preserve={false}>
        <Form.Item name="scriptId" label="剧本" rules={[{ required: true, message: '选择剧本' }]}>
          <Select
            placeholder="选择剧本"
            options={scripts.map((script) => ({ value: script.id, label: script.name }))}
          />
        </Form.Item>
        {selectedScript?.description && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={selectedScript.name}
            description={selectedScript.description}
          />
        )}
        <Form.Item name="characterId" label="角色" rules={[{ required: true, message: '选择角色' }]}>
          <Select
            placeholder={hasCharacters ? '选择角色' : '这个剧本还没有角色'}
            disabled={!hasCharacters}
            options={cast.map((character) => ({ value: character.id, label: character.name }))}
          />
        </Form.Item>
        {greetings.length > 0 && (
          <Form.Item name="greetingIndex" label="开场白">
            <Select
              options={[
                { value: 0, label: '默认开场' },
                ...greetings.map((greeting, index) => ({
                  value: index + 1,
                  label: `备选 ${index + 1}：${greeting.replace(/\s+/g, ' ').slice(0, 42)}`,
                })),
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="providerId" label="模型服务" rules={[{ required: true, message: '选择模型服务' }]}>
          <Select
            placeholder="选择模型服务"
            options={providers.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.defaultModel}` }))}
          />
        </Form.Item>
        <Form.Item name="model" label="模型" rules={[{ required: true, message: '填写模型名' }]}>
          <Input placeholder="deepseek-chat" />
        </Form.Item>
        <Space>
          <a onClick={onConfigureProvider}>管理模型服务</a>
        </Space>
      </Form>
    </Modal>
  );
}
