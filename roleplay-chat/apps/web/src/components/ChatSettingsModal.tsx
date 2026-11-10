import { useEffect, useState } from 'react';
import { App as AntApp, Button, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { Persona, PublicProvider } from '@roleplay/core';
import { api, ApiError } from '../api';
import type { ChatDetail, ChatRecord } from '../types';
import { PersonaManagerModal } from './PersonaManagerModal';

interface Props {
  open: boolean;
  chat: ChatRecord;
  providers: PublicProvider[];
  onClose: () => void;
  onSaved: (detail: ChatDetail) => void;
}

interface FormValues {
  providerId: string;
  model: string;
  personaId?: string;
  temperature: number;
  maxTokens: number;
}

export function ChatSettingsModal({ open, chat, providers, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaManagerOpen, setPersonaManagerOpen] = useState(false);

  const loadPersonas = async () => {
    try {
      setPersonas(await api.personas.list());
    } catch {
      // The select can stay empty; saving does not depend on the list.
    }
  };

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      providerId: chat.providerId ?? undefined,
      model: chat.model,
      personaId: chat.personaId ?? undefined,
      temperature: chat.params.temperature,
      maxTokens: chat.params.maxTokens,
    });
    void loadPersonas();
  }, [open, chat, form]);

  const onValuesChange = (changed: Partial<FormValues>) => {
    if (changed.providerId) {
      const provider = providers.find((item) => item.id === changed.providerId);
      if (provider) form.setFieldsValue({ model: provider.defaultModel });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const detail = await api.chats.update(chat.id, {
        providerId: values.providerId,
        model: values.model,
        personaId: values.personaId ?? null,
        params: { temperature: values.temperature, maxTokens: values.maxTokens },
      });
      message.success('会话设置已更新');
      onSaved(detail);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message);
      else if (error && typeof error === 'object' && 'errorFields' in error) return;
      else message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="会话模型设置"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onValuesChange={onValuesChange} preserve={false}>
        <Form.Item name="providerId" label="模型服务" rules={[{ required: true }]}>
          <Select options={providers.map((provider) => ({ value: provider.id, label: provider.name }))} />
        </Form.Item>
        <Form.Item name="model" label="模型" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="personaId"
          label="用户人设"
          extra={<Button type="link" size="small" style={{ padding: 0 }} onClick={() => setPersonaManagerOpen(true)}>管理人设</Button>}
        >
          <Select
            allowClear
            placeholder="不指定人设"
            options={personas.map((persona) => ({ value: persona.id, label: persona.name }))}
          />
        </Form.Item>
        <Form.Item name="temperature" label="Temperature" extra="越高越发散，角色扮演常用 0.7–1.0">
          <InputNumber min={0} max={2} step={0.05} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="maxTokens" label="单次回复上限（tokens）">
          <InputNumber min={64} max={32_000} step={128} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
      <PersonaManagerModal
        open={personaManagerOpen}
        onClose={() => setPersonaManagerOpen(false)}
        onChanged={() => {
          void loadPersonas();
          if (form.getFieldValue('personaId') && !personas.some((persona) => persona.id === form.getFieldValue('personaId'))) {
            form.setFieldsValue({ personaId: undefined });
          }
        }}
      />
    </Modal>
  );
}
