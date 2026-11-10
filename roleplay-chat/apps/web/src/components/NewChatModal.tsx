import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Form, Input, Modal, Select, Space } from 'antd';
import type { Character, PublicProvider } from '@roleplay/core';
import { api, ApiError } from '../api';
import type { ChatDetail } from '../types';

interface Props {
  open: boolean;
  characters: Character[];
  providers: PublicProvider[];
  initialCharacterId?: string;
  onClose: () => void;
  onCreated: (detail: ChatDetail) => void;
  onCreateCharacter: () => void;
  onConfigureProvider: () => void;
}

interface FormValues {
  characterId: string;
  providerId: string;
  model: string;
}

export function NewChatModal({
  open,
  characters,
  providers,
  initialCharacterId,
  onClose,
  onCreated,
  onCreateCharacter,
  onConfigureProvider,
}: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const characterId = initialCharacterId ?? characters[0]?.id;
    const provider = providers[0];
    form.resetFields();
    form.setFieldsValue({
      characterId,
      providerId: provider?.id,
      model: provider?.defaultModel,
    });
  }, [open, initialCharacterId, characters, providers, form]);

  const onValuesChange = (changed: Partial<FormValues>) => {
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
        characterId: values.characterId,
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

  const hasCharacters = characters.length > 0;
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
      okButtonProps={{ disabled: !hasCharacters || !hasProviders }}
      destroyOnClose
    >
      {!hasCharacters && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="还没有角色"
          description="先创建一个角色，或者使用内置的示例角色。"
          action={<a onClick={onCreateCharacter}>新建角色</a>}
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
        <Form.Item name="characterId" label="角色" rules={[{ required: true, message: '选择角色' }]}>
          <Select
            placeholder="选择角色"
            options={characters.map((character) => ({ value: character.id, label: character.name }))}
          />
        </Form.Item>
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
