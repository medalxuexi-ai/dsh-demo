import { useEffect, useState } from 'react';
import { App as AntApp, Form, Input, Modal, Radio, Select, Space, Typography } from 'antd';
import type { StoredMessage } from '@roleplay/core';
import type { SceneInput, SceneView } from '../types';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  chatId: string;
  messages: StoredMessage[];
  scene?: SceneView | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  title?: string;
  content: string;
  intent: 'current' | 'event' | 'oneTurn';
  anchorMessageId?: string;
}

function intentFor(scene?: SceneView | null): FormValues['intent'] {
  if (!scene) return 'current';
  if (scene.placement.mode === 'anchored') return 'event';
  if (scene.placement.mode === 'depth' && scene.lifetime === 'once') return 'oneTurn';
  return 'current';
}

export function SceneModal({ open, chatId, messages, scene, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const intent = Form.useWatch('intent', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      title: scene?.title ?? '',
      content: scene?.content ?? '',
      intent: intentFor(scene),
      anchorMessageId: scene?.placement.mode === 'anchored' ? scene.placement.messageId : messages.at(-1)?.id,
    });
  }, [open, scene, messages, form]);

  const anchorOptions = messages.slice(-40).map((item, index) => ({
    value: item.id,
    label: `#${index + 1} ${item.role === 'user' ? '你' : '角色'}：${item.content.replace(/\s+/g, ' ').slice(0, 48)}`,
  }));

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      let placement: SceneInput['placement'];
      let lifetime: SceneInput['lifetime'];
      if (values.intent === 'current') {
        placement = { mode: 'system-top' };
        lifetime = 'persistent';
      } else if (values.intent === 'event') {
        if (!values.anchorMessageId) throw new ApiError('请选择插入位置');
        placement = { mode: 'anchored', messageId: values.anchorMessageId };
        lifetime = 'persistent';
      } else {
        placement = { mode: 'depth', depth: 0 };
        lifetime = 'once';
      }
      const payload: SceneInput = {
        title: values.title?.trim() || values.content.trim().slice(0, 20),
        content: values.content.trim(),
        placement,
        lifetime,
        role: scene?.role ?? 'system',
        enabled: true,
      };
      if (scene) await api.scenes.update(scene.id, payload);
      else await api.scenes.create(chatId, payload);
      message.success('场景已保存');
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
      title={scene ? '编辑场景' : '新建场景'}
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
        <Form.Item name="title" label="标题（可选）">
          <Input placeholder="例如：雨夜停电" maxLength={200} />
        </Form.Item>
        <Form.Item
          name="content"
          label="场景内容"
          rules={[{ required: true, message: '写点场景内容' }]}
          extra="会作为舞台说明进入上下文，不会被当成角色台词"
        >
          <Input.TextArea rows={4} placeholder="深夜，暴雨，咖啡馆突然断电……" maxLength={20000} />
        </Form.Item>
        <Form.Item name="intent" label="怎么用" rules={[{ required: true }]}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="current">
                <strong>当前场景</strong>
                <Typography.Text type="secondary"> · 系统常驻，持续生效</Typography.Text>
              </Radio>
              <Radio value="event">
                <strong>插入剧情</strong>
                <Typography.Text type="secondary"> · 在某条消息之后，持续生效</Typography.Text>
              </Radio>
              <Radio value="oneTurn">
                <strong>这一轮要求</strong>
                <Typography.Text type="secondary"> · 只影响下一轮，成功后自动停用</Typography.Text>
              </Radio>
            </Space>
          </Radio.Group>
        </Form.Item>
        {intent === 'event' && (
          <Form.Item name="anchorMessageId" label="插入在哪条消息之后" rules={[{ required: true, message: '选择插入位置' }]}>
            <Select options={anchorOptions} showSearch optionFilterProp="label" placeholder="选择消息" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
