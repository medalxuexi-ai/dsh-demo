import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import type { PublicProvider } from '@roleplay/core';
import { api, ApiError } from '../api';
import { PROVIDER_PRESETS } from '../constants';
import type { TestResult } from '../types';

interface Props {
  open: boolean;
  provider?: PublicProvider | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  preset?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  contextWindow?: number;
}

export function ProviderModal({ open, provider, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    form.resetFields();
    if (provider) {
      form.setFieldsValue({
        name: provider.name,
        baseUrl: provider.baseUrl,
        defaultModel: provider.defaultModel,
        contextWindow: provider.contextWindow,
      });
    } else {
      const preset = PROVIDER_PRESETS[0];
      form.setFieldsValue({
        preset: preset.value,
        name: preset.name,
        baseUrl: preset.baseUrl,
        defaultModel: preset.defaultModel,
        apiKey: '',
      });
    }
  }, [open, provider, form]);

  const onValuesChange = (changed: Partial<FormValues>) => {
    if (!changed.preset) return;
    const preset = PROVIDER_PRESETS.find((item) => item.value === changed.preset);
    if (!preset) return;
    form.setFieldsValue({
      name: preset.name,
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel,
    });
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields(['baseUrl', 'apiKey', 'defaultModel']);
      setTesting(true);
      setTestResult(null);
      const result = await api.providers.testDraft({
        baseUrl: values.baseUrl,
        apiKey: values.apiKey ?? '',
        model: values.defaultModel,
      });
      setTestResult(result);
    } catch (error) {
      if (error instanceof ApiError) setTestResult({ ok: false, error: { code: error.code ?? 'UNKNOWN', message: error.message } });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (provider) {
        await api.providers.update(provider.id, {
          name: values.name,
          baseUrl: values.baseUrl,
          defaultModel: values.defaultModel,
          contextWindow: values.contextWindow,
          ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
        });
      } else {
        await api.providers.create({
          name: values.name,
          baseUrl: values.baseUrl,
          apiKey: values.apiKey?.trim() ?? '',
          defaultModel: values.defaultModel,
          contextWindow: values.contextWindow,
        });
      }
      message.success('模型服务已保存');
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
      title={provider ? '编辑模型服务' : '添加模型服务'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onValuesChange={onValuesChange} preserve={false}>
        <Form.Item name="preset" label="服务预设">
          <Select
            options={PROVIDER_PRESETS.map((preset) => ({ value: preset.value, label: `${preset.label} · ${preset.hint}` }))}
          />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '给这个服务起个名字' }]}>
          <Input placeholder="例如：DeepSeek" />
        </Form.Item>
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[{ required: true, message: '填写 OpenAI 兼容的 Base URL' }]}
          extra="以 /v1 结尾的 OpenAI 兼容地址；本地模型填 http://127.0.0.1:端口/v1"
        >
          <Input placeholder="https://api.deepseek.com/v1" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
          extra={provider ? `当前密钥：${provider.apiKeyMasked}；留空表示不修改` : '只保存在本机，不会上传到任何地方'}
        >
          <Input.Password autoComplete="new-password" placeholder={provider ? '留空保持不变' : 'sk-...'} />
        </Form.Item>
        <Form.Item name="defaultModel" label="默认模型" rules={[{ required: true, message: '填写模型名' }]}>
          <Input placeholder="deepseek-chat" />
        </Form.Item>
        <Form.Item name="contextWindow" label="上下文窗口（可选）" extra="不确定可以留空，默认按 8192 估算">
          <InputNumber min={1024} max={10_000_000} step={1024} style={{ width: '100%' }} placeholder="例如：65536" />
        </Form.Item>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button onClick={handleTest} loading={testing} htmlType="button">
            测试连接
          </Button>
          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              message={testResult.ok ? `连接成功${testResult.latencyMs ? ` · ${testResult.latencyMs}ms` : ''}` : '连接失败'}
              description={
                testResult.ok
                  ? testResult.models?.length
                    ? `读取到 ${testResult.models.length} 个模型：${testResult.models.slice(0, 6).map((m) => m.id).join('、')}`
                    : '服务可达'
                  : testResult.error?.message
              }
            />
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            提示：测试会请求 <code>/models</code>；部分中转站不提供该接口，会退化为一次最小对话请求。
          </Typography.Text>
        </Space>
      </Form>
    </Modal>
  );
}
