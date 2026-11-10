import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { WorldInfoEntry } from '@roleplay/core';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  chatId: string;
  scriptId: string | null;
  onClose: () => void;
}

interface FormValues {
  name?: string;
  keys?: string[];
  secondaryKeys?: string[];
  content: string;
  constant?: boolean;
  position?: number;
  depth?: number;
  role?: number;
  order?: number;
  scanDepth?: number;
  probability?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
}

const positionLabel = (position: number) => (position === 4 ? '深度插入' : '系统常驻');
const roleLabel = (role: number) => (role === 1 ? '用户' : role === 2 ? '角色' : '系统');

export function WorldInfoDrawer({ open, chatId, scriptId, onClose }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [entries, setEntries] = useState<WorldInfoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WorldInfoEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const position = Form.useWatch('position', form);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await api.worldInfo.listForChat(chatId));
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '世界书加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, chatId]);

  const openEditor = (entry: WorldInfoEntry | null) => {
    setEditing(entry);
    form.resetFields();
    form.setFieldsValue(entry ? {
      name: entry.name,
      keys: entry.keys,
      secondaryKeys: entry.secondaryKeys,
      content: entry.content,
      constant: entry.constant,
      position: entry.position,
      depth: entry.depth,
      role: entry.role,
      order: entry.order,
      scanDepth: entry.scanDepth,
      probability: entry.probability,
      caseSensitive: entry.caseSensitive,
      matchWholeWords: entry.matchWholeWords,
    } : {
      name: '',
      keys: [],
      secondaryKeys: [],
      content: '',
      constant: false,
      position: 0,
      depth: 4,
      role: 0,
      order: 100,
      scanDepth: 2,
      probability: 100,
      caseSensitive: false,
      matchWholeWords: true,
    });
    setEditorOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name?.trim() || values.content.trim().slice(0, 20),
        keys: values.keys ?? [],
        secondaryKeys: values.secondaryKeys ?? [],
        content: values.content.trim(),
        constant: values.constant ?? false,
        position: values.position ?? 0,
        depth: values.depth ?? 4,
        role: values.role ?? 0,
        order: values.order ?? 100,
        scanDepth: values.scanDepth ?? 2,
        probability: values.probability ?? 100,
        caseSensitive: values.caseSensitive ?? false,
        matchWholeWords: values.matchWholeWords ?? true,
      };
      if (editing) await api.worldInfo.update(editing.id, payload);
      else {
        if (!scriptId) throw new ApiError('当前会话没有绑定剧本');
        await api.worldInfo.create(scriptId, payload);
      }
      message.success('世界书条目已保存');
      setEditorOpen(false);
      await load();
    } catch (error) {
      if (error instanceof ApiError) message.error(error.message);
      else if (error && typeof error === 'object' && 'errorFields' in error) return;
      else message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (entry: WorldInfoEntry, enabled: boolean) => {
    try {
      await api.worldInfo.update(entry.id, { enabled });
      await load();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '更新失败');
    }
  };

  const remove = async (entry: WorldInfoEntry) => {
    try {
      await api.worldInfo.remove(entry.id);
      message.success('世界书条目已删除');
      await load();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  const importBook = async (file: File) => {
    if (!scriptId) return;
    setImporting(true);
    try {
      const book = JSON.parse(await file.text()) as unknown;
      const imported = await api.worldInfo.importBook(scriptId, book);
      message.success(`已导入 ${imported.length} 条世界书`);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const exportBook = async () => {
    if (!scriptId) return;
    try {
      const book = await api.worldInfo.exportBook(scriptId);
      const blob = new Blob([JSON.stringify(book, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'world-info.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '导出失败');
    }
  };

  return (
    <>
      <Drawer
        title="世界书"
        open={open}
        onClose={onClose}
        width={520}
        extra={
          <Space>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => { void importBook(file); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={importing}>导入</Button>
            </Upload>
            <Button icon={<DownloadOutlined />} onClick={() => void exportBook()}>导出</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          兼容 SillyTavern 世界书格式；按关键词 / 常驻触发，可选择进入系统提示词或按深度插入。角色卡里的 character_book 会进入这里。
        </Typography.Paragraph>
        {!scriptId && <Alert type="warning" showIcon message="当前会话没有绑定剧本，无法新增世界书条目" style={{ marginBottom: 12 }} />}
        <List
          loading={loading}
          dataSource={entries}
          locale={{ emptyText: '还没有世界书条目' }}
          renderItem={(entry) => (
            <List.Item
              actions={[
                <Switch key="toggle" size="small" checked={entry.enabled} onChange={(checked) => void toggle(entry, checked)} />,
                <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => openEditor(entry)} />,
                <Popconfirm key="delete" title="删除这个条目？" onConfirm={() => void remove(entry)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={4} wrap>
                    <span>{entry.name || '未命名条目'}</span>
                    <Tag color={entry.constant ? 'gold' : 'blue'}>{entry.constant ? '常驻' : positionLabel(entry.position)}</Tag>
                    {entry.position === 4 && <Tag>{`深度 ${entry.depth} · ${roleLabel(entry.role)}`}</Tag>}
                  </Space>
                }
                description={
                  <span className="muted">
                    {entry.keys.length > 0 ? `关键词：${entry.keys.join(' / ')}` : '无关键词'}
                    {' · '}
                    {entry.content.slice(0, 60)}
                    {entry.content.length > 60 ? '…' : ''}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>

      <Modal
        title={editing ? '编辑世界书条目' : '新建世界书条目'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={save}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="条目名（可选）">
            <Input placeholder="例如：咖啡馆规则" maxLength={200} />
          </Form.Item>
          <Form.Item name="keys" label="关键词" extra="命中任意一个关键词时触发；常驻条目可留空">
            <Select mode="tags" placeholder="输入后回车添加" tokenSeparators={[',', '，']} />
          </Form.Item>
          <Form.Item name="secondaryKeys" label="次要关键词（可选）" extra="填写后需要同时命中一个次要关键词">
            <Select mode="tags" placeholder="输入后回车添加" tokenSeparators={[',', '，']} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '写点内容' }]}>
            <Input.TextArea rows={5} placeholder="这条设定会进入模型上下文……" maxLength={50000} />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="constant" label="常驻" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="position" label="位置">
              <Select
                style={{ width: 140 }}
                options={[
                  { value: 0, label: '系统常驻' },
                  { value: 4, label: '深度插入' },
                ]}
              />
            </Form.Item>
            {position === 4 && (
              <>
                <Form.Item name="depth" label="深度">
                  <InputNumber min={0} max={2000} />
                </Form.Item>
                <Form.Item name="role" label="身份">
                  <Select
                    style={{ width: 100 }}
                    options={[
                      { value: 0, label: '系统' },
                      { value: 1, label: '用户' },
                      { value: 2, label: '角色' },
                    ]}
                  />
                </Form.Item>
              </>
            )}
          </Space>
          <Space size={16} wrap>
            <Form.Item name="order" label="优先级">
              <InputNumber min={-10000} max={10000} />
            </Form.Item>
            <Form.Item name="scanDepth" label="扫描消息数">
              <InputNumber min={0} max={200} />
            </Form.Item>
            <Form.Item name="probability" label="触发概率 %">
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item name="caseSensitive" label="区分大小写" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="matchWholeWords" label="整词匹配" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
