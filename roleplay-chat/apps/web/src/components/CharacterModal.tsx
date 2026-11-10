import { useEffect, useState } from 'react';
import { App as AntApp, Form, Input, Modal } from 'antd';
import type { Character } from '@roleplay/core';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  character?: Character | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  systemPrompt?: string;
}

export function CharacterModal({ open, character, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (character) {
      form.setFieldsValue({
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        firstMessage: character.firstMessage,
        systemPrompt: character.systemPrompt,
      });
    } else {
      form.setFieldsValue({ name: '', description: '', personality: '', scenario: '', firstMessage: '', systemPrompt: '' });
    }
  }, [open, character, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name.trim(),
        description: values.description ?? '',
        personality: values.personality ?? '',
        scenario: values.scenario ?? '',
        firstMessage: values.firstMessage ?? '',
        systemPrompt: values.systemPrompt ?? '',
      };
      if (character) await api.characters.update(character.id, payload);
      else await api.characters.create(payload);
      message.success('角色已保存');
      onSaved();
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
      title={character ? '编辑角色' : '新建角色'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="name" label="角色名" rules={[{ required: true, message: '填写角色名' }]}>
          <Input placeholder="例如：林晚" maxLength={80} />
        </Form.Item>
        <Form.Item name="description" label="角色设定" extra="外貌、身份、经历；支持 {{char}} / {{user}} 宏">
          <Input.TextArea rows={4} placeholder="她是谁？住在哪里？经历过什么？" />
        </Form.Item>
        <Form.Item name="personality" label="性格" extra="用几句话概括说话方式与行为习惯">
          <Input.TextArea rows={3} placeholder="克制、敏锐，偶尔毒舌……" />
        </Form.Item>
        <Form.Item name="scenario" label="初始场景" extra="可留空；也可以之后用「场景」随时插入">
          <Input.TextArea rows={3} placeholder="雨夜的旧城咖啡馆……" />
        </Form.Item>
        <Form.Item name="firstMessage" label="开场白" extra="新建会话时作为角色的第一条消息">
          <Input.TextArea rows={5} placeholder="风铃响了一声……" />
        </Form.Item>
        <Form.Item name="systemPrompt" label="角色系统提示词（可选）" extra="高级：对角色口吻、格式的额外要求">
          <Input.TextArea rows={3} placeholder="称呼用户为「你」；不要替用户做决定。" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
