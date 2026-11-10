import { useEffect, useState } from 'react';
import { App as AntApp, Button, Form, Input, List, Modal, Popconfirm, Space, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { Persona } from '@roleplay/core';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

interface FormValues {
  name: string;
  description?: string;
}

export function PersonaManagerModal({ open, onClose, onChanged }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setPersonas(await api.personas.list());
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '人设加载失败');
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  const openEditor = (persona: Persona | null) => {
    setEditing(persona);
    form.resetFields();
    form.setFieldsValue({ name: persona?.name ?? '', description: persona?.description ?? '' });
    setEditorOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) await api.personas.update(editing.id, { name: values.name.trim(), description: values.description ?? '' });
      else await api.personas.create({ name: values.name.trim(), description: values.description ?? '' });
      message.success('人设已保存');
      setEditorOpen(false);
      await load();
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message);
      else if (error && typeof error === 'object' && 'errorFields' in error) return;
      else message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (persona: Persona) => {
    try {
      await api.personas.remove(persona.id);
      message.success('人设已删除');
      await load();
      onChanged();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  return (
    <>
      <Modal title="用户人设" open={open} onCancel={onClose} footer={null} width={560}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          人设会作为「用户」的身份进入提示词；每个会话可以选择不同人设。
        </Typography.Paragraph>
        <Button icon={<PlusOutlined />} onClick={() => openEditor(null)} style={{ marginBottom: 12 }}>
          新建人设
        </Button>
        <List
          dataSource={personas}
          locale={{ emptyText: '还没有人设' }}
          renderItem={(persona) => (
            <List.Item
              actions={[
                <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => openEditor(persona)} />,
                <Popconfirm key="delete" title="删除这个人设？使用它的会话会变为未指定。" onConfirm={() => void remove(persona)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={persona.name}
                description={<span className="muted">{persona.description.slice(0, 80) || '未填写描述'}</span>}
              />
            </List.Item>
          )}
        />
      </Modal>
      <Modal
        title={editing ? '编辑人设' : '新建人设'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="称呼" rules={[{ required: true, message: '填写人设称呼' }]}>
            <Input placeholder="例如：旅人 / 阿澈" maxLength={120} />
          </Form.Item>
          <Form.Item name="description" label="人设描述" extra="身份、性格、与角色的关系；会进入系统提示词">
            <Input.TextArea rows={5} placeholder="一个在雨夜走进咖啡馆的旅人……" maxLength={20000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
