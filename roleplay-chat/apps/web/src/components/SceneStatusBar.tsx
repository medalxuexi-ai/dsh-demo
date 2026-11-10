import { useState } from 'react';
import { App as AntApp, Button, Form, Input, Modal, Space, Tag } from 'antd';
import { EditOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { SceneView } from '../types';
import { api, ApiError } from '../api';

interface Props {
  chatId: string;
  scenes: SceneView[];
  onChanged: () => void;
}

interface StatusFields {
  time?: string;
  place?: string;
  present?: string;
}

const STATUS_TITLE = '当前状态';

function parseStatus(content: string): StatusFields {
  const get = (label: string) => {
    const match = content.match(new RegExp(`^${label}[：:]\\s*(.*)$`, 'm'));
    return match?.[1]?.trim() ?? '';
  };
  return { time: get('时间'), place: get('地点'), present: get('在场') };
}

export function SceneStatusBar({ chatId, scenes, onChanged }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<StatusFields>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const statusScene = scenes.find((scene) => scene.title === STATUS_TITLE && scene.placement.mode === 'system-top');
  const fields = parseStatus(statusScene?.content ?? '');

  const edit = () => {
    form.setFieldsValue(fields);
    setOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      const content = [
        values.time?.trim() ? `时间：${values.time.trim()}` : '',
        values.place?.trim() ? `地点：${values.place.trim()}` : '',
        values.present?.trim() ? `在场：${values.present.trim()}` : '',
      ].filter(Boolean).join('\n');
      if (!content) {
        message.warning('至少填写一项');
        return;
      }
      setSaving(true);
      const payload = {
        title: STATUS_TITLE,
        content,
        placement: { mode: 'system-top' as const },
        lifetime: 'persistent' as const,
        role: 'system' as const,
        enabled: true,
      };
      if (statusScene) await api.scenes.update(statusScene.id, payload);
      else await api.scenes.create(chatId, payload);
      message.success('当前状态已更新');
      setOpen(false);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message);
      else if (error && typeof error === 'object' && 'errorFields' in error) return;
      else message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={`scene-status-bar ${statusScene ? '' : 'empty'}`}>
        <Space size={[8, 4]} wrap>
          <Tag color="purple" icon={<EnvironmentOutlined />}>当前状态</Tag>
          {fields.time && <span>时间：{fields.time}</span>}
          {fields.place && <span>地点：{fields.place}</span>}
          {fields.present && <span>在场：{fields.present}</span>}
          {!statusScene && <span className="muted">设置时间 / 地点 / 在场人物，会作为系统常驻场景进入上下文</span>}
        </Space>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={edit}>
          {statusScene ? '编辑' : '设置'}
        </Button>
      </div>
      <Modal
        title="当前场景状态"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="time" label="时间">
            <Input placeholder="例如：晚上九点，雨刚停" maxLength={200} />
          </Form.Item>
          <Form.Item name="place" label="地点">
            <Input placeholder="例如：旧城「夜航」咖啡馆" maxLength={200} />
          </Form.Item>
          <Form.Item name="present" label="在场">
            <Input placeholder="例如：林晚、你" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
