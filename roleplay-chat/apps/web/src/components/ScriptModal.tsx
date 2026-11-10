import { useEffect, useState } from 'react';
import { App as AntApp, Form, Input, Modal } from 'antd';
import type { Script } from '@roleplay/core';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  script?: Script | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  name: string;
  description?: string;
  opening?: string;
}

export function ScriptModal({ open, script, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      name: script?.name ?? '',
      description: script?.description ?? '',
      opening: script?.opening ?? '',
    });
  }, [open, script, form]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name.trim(),
        description: values.description ?? '',
        opening: values.opening ?? '',
      };
      if (script) await api.scripts.update(script.id, payload);
      else await api.scripts.create(payload);
      message.success('剧本已保存');
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
      title={script ? '编辑剧本' : '新建剧本'}
      open={open}
      onCancel={onClose}
      onOk={save}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="name" label="剧本名" rules={[{ required: true, message: '填写剧本名' }]}>
          <Input placeholder="例如：雨夜咖啡馆" maxLength={120} />
        </Form.Item>
        <Form.Item name="description" label="世界观 / 场景" extra="会作为系统常驻场景进入这个剧本的每个新会话">
          <Input.TextArea rows={5} placeholder="旧城「夜航」咖啡馆，雨夜。店里只剩唱机、吧台后的林晚，和刚推门进来的你。" maxLength={20000} />
        </Form.Item>
        <Form.Item name="opening" label="开场旁白（可选）" extra="和上面的场景一起进入上下文；不会替代角色开场白">
          <Input.TextArea rows={3} placeholder="雨顺着玻璃往下淌……" maxLength={20000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
