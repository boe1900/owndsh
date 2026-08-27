/**
 * [INPUT]: 依赖 provider/model 业务 API、OpenAPI 推导类型、权限事实与 cursor/revision 公共策略
 * [OUTPUT]: 提供 DeepSeek 官方/自定义三协议 Provider、模型发现、容量与 reasoningEfforts/compat 治理页面
 * [POS]: pages/enterprise/model-catalog 的 Harness 对齐模型治理工作台，只采纳脱敏模型候选且绝不回填 credential
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  PoweroffOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  type TableColumnsType
} from 'antd';
import { useCallback, useState } from 'react';
import {
  createManagedModel,
  createModelProvider,
  deleteManagedModel,
  getManagedModel,
  getModelProvider,
  listManagedModels,
  listModelProviders,
  setManagedModelEnabled,
  setModelProviderEnabled,
  testModelProvider,
  updateManagedModel,
  updateModelProvider,
  type ManagedModel,
  type ManagedModelInput,
  type ModelProvider,
  type ModelProviderInput,
  type ModelProviderUpdateInput
} from '@/api/enterprise/model';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { recoverRevisionConflict } from '../shared/revision';
import { useCursorData } from '../shared/useCursorData';
import { validatedFormValues } from '../shared/validateForm';

interface ProviderFormValues {
  providerType: ModelProviderInput['providerType'];
  providerKey: string;
  name: string;
  apiProtocol: ModelProviderInput['apiProtocol'];
  baseUrl: string;
  credential?: string;
  replaceSecret?: boolean;
  connectTimeoutMs: number;
  readTimeoutMs: number;
}

type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type ReasoningMap = Exclude<ManagedModelInput['reasoningEfforts'], boolean | undefined>;
type ThinkingFormat = NonNullable<ManagedModelInput['compat']>['thinkingFormat'];

interface ModelFormValues extends Omit<ManagedModelInput, 'reasoningEfforts' | 'compat'> {
  reasoningMode: 'omitted' | 'disabled' | 'explicit';
  reasoningLevels?: ReasoningLevel[];
  reasoningWireValues?: Partial<Record<ReasoningLevel, string>>;
  thinkingFormat?: ThinkingFormat;
  supportsReasoningEffort?: 'auto' | 'true' | 'false';
}

const DEEPSEEK_OFFICIAL_URL = 'https://api.deepseek.com';
const OPENAI_COMPLETIONS = 'openai-completions' as const;
const API_PROTOCOL_OPTIONS = [
  { value: OPENAI_COMPLETIONS, label: OPENAI_COMPLETIONS },
  { value: 'openai-responses', label: 'openai-responses' },
  { value: 'anthropic-messages', label: 'anthropic-messages' }
] satisfies Array<{ value: ModelProviderInput['apiProtocol']; label: string }>;
const REASONING_LEVELS: ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'zai', 'qwen', 'string-thinking', 'ant-ling'] as const;

function newProviderValues(providerType: ProviderFormValues['providerType']): ProviderFormValues {
  return {
    providerType,
    providerKey: providerType === 'DEEPSEEK_OFFICIAL' ? 'deepseek-official' : '',
    name: providerType === 'DEEPSEEK_OFFICIAL' ? 'DeepSeek' : '',
    apiProtocol: OPENAI_COMPLETIONS,
    baseUrl: providerType === 'DEEPSEEK_OFFICIAL' ? DEEPSEEK_OFFICIAL_URL : '',
    connectTimeoutMs: 5000,
    readTimeoutMs: 120000
  };
}

function providerValues(provider?: ModelProvider): ProviderFormValues {
  return provider
    ? {
        providerType: provider.providerType,
        providerKey: provider.providerKey,
        name: provider.name,
        apiProtocol: provider.apiProtocol,
        baseUrl: provider.baseUrl,
        replaceSecret: false,
        connectTimeoutMs: provider.connectTimeoutMs,
        readTimeoutMs: provider.readTimeoutMs
      }
    : newProviderValues('DEEPSEEK_OFFICIAL');
}

function modelValues(model?: ManagedModel): ModelFormValues {
  const explicit = typeof model?.reasoningEfforts === 'object' ? model.reasoningEfforts : undefined;
  return model
    ? {
        providerId: model.providerId,
        alias: model.alias,
        modelId: model.modelId,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoningMode: model.reasoningEfforts === undefined
          ? 'omitted'
          : model.reasoningEfforts === false ? 'disabled' : 'explicit',
        reasoningLevels: explicit ? Object.keys(explicit) as ReasoningLevel[] : undefined,
        reasoningWireValues: explicit
          ? Object.fromEntries(Object.entries(explicit).filter(([, value]) => value !== null))
          : undefined,
        thinkingFormat: model.compat?.thinkingFormat,
        supportsReasoningEffort: model.compat?.supportsReasoningEffort === undefined
          ? 'auto'
          : String(model.compat.supportsReasoningEffort) as 'true' | 'false',
        sortOrder: model.sortOrder
      }
    : {
        providerId: '',
        alias: '',
        modelId: '',
        reasoningMode: 'omitted',
        supportsReasoningEffort: 'auto',
        sortOrder: 100
      };
}

function modelInput(values: ModelFormValues, protocol?: ModelProvider['apiProtocol']): ManagedModelInput {
  let reasoningEfforts: ManagedModelInput['reasoningEfforts'];
  if (values.reasoningMode === 'disabled') reasoningEfforts = false;
  if (values.reasoningMode === 'explicit') {
    const levels = values.reasoningLevels ?? [];
    reasoningEfforts = Object.fromEntries(levels.map(level => [
      level,
      level === 'off' && !values.reasoningWireValues?.off
        ? null
        : values.reasoningWireValues?.[level]?.trim()
    ])) as ReasoningMap;
  }
  const compat = protocol === OPENAI_COMPLETIONS && values.reasoningMode === 'explicit'
    && (values.thinkingFormat !== undefined || values.supportsReasoningEffort !== 'auto')
    ? {
        ...values.thinkingFormat === undefined ? {} : { thinkingFormat: values.thinkingFormat },
        ...values.supportsReasoningEffort === 'auto'
          ? {}
          : { supportsReasoningEffort: values.supportsReasoningEffort === 'true' }
      }
    : undefined;
  return {
    providerId: values.providerId,
    alias: values.alias.trim(),
    modelId: values.modelId.trim(),
    name: values.name?.trim() || undefined,
    contextWindow: values.contextWindow,
    maxTokens: values.maxTokens,
    reasoningEfforts,
    compat,
    sortOrder: values.sortOrder
  };
}

function statusTag(status: 'ACTIVE' | 'DISABLED') {
  return <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>;
}

function ProviderFormFields({ editing }: { editing: boolean }) {
  const replaceSecret = Form.useWatch<boolean>('replaceSecret');
  const providerType = Form.useWatch<ProviderFormValues['providerType']>('providerType');
  const custom = providerType === 'CUSTOM';
  return (
    <>
      <Form.Item name="providerType" label="提供商类型" rules={[{ required: true }]}>
        <Select
          disabled={editing}
          options={[
            { value: 'DEEPSEEK_OFFICIAL', label: 'DeepSeek 官方' },
            { value: 'CUSTOM', label: '自定义提供商' }
          ]}
        />
      </Form.Item>
      {custom && (
        <>
          <Form.Item
            name="providerKey"
            label="Provider ID"
            rules={[
              { required: true },
              { max: 120 },
              { pattern: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, message: '以小写字母开头，仅支持小写字母、数字和连字符' }
            ]}
          >
            <Input placeholder="acme-gateway" disabled={editing} />
          </Form.Item>
          <Form.Item name="name" label="显示名称" rules={[{ required: true, whitespace: true, max: 120 }]}>
            <Input />
          </Form.Item>
        </>
      )}
      <Form.Item name="baseUrl" label="API 地址" rules={[{ required: true, type: 'url' }]}>
        <Input placeholder={custom ? 'https://gateway.example/v1' : DEEPSEEK_OFFICIAL_URL} />
      </Form.Item>
      {custom && (
        <Form.Item name="apiProtocol" label="API 协议" rules={[{ required: true }]}>
          <Select options={API_PROTOCOL_OPTIONS} />
        </Form.Item>
      )}
      {editing && (
        <Form.Item name="replaceSecret" label="替换 API 密钥" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
      {(!editing || replaceSecret) && (
        <Form.Item name="credential" label={editing ? '新 API 密钥' : 'API 密钥'} rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
      {!custom && (
        <>
          <Form.Item name="providerKey" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="name" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="apiProtocol" hidden>
            <Input />
          </Form.Item>
        </>
      )}
      <Form.Item name="connectTimeoutMs" hidden>
        <InputNumber />
      </Form.Item>
      <Form.Item name="readTimeoutMs" hidden>
        <InputNumber />
      </Form.Item>
    </>
  );
}

export default function ModelsPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canWrite = hasPermi(userInfo, ['ent:model:write']);
  const [providerForm] = Form.useForm<ProviderFormValues>();
  const [modelForm] = Form.useForm<ModelFormValues>();
  const [providerEditor, setProviderEditor] = useState<ModelProvider>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelEditor, setModelEditor] = useState<ManagedModel>();
  const [modelOpen, setModelOpen] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<
    Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>
  >([]);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProviders = useCallback(
    async (cursor?: string) => (await listModelProviders({ cursor, limit: 50 })).data,
    []
  );
  const loadModels = useCallback(async (cursor?: string) => (await listManagedModels({ cursor, limit: 50 })).data, []);
  const providers = useCursorData(loadProviders);
  const models = useCursorData(loadModels);
  const selectedProviderId = Form.useWatch<string>('providerId', modelForm);
  const selectedProvider = providers.items.find(provider => provider.id === selectedProviderId);
  const discoverySupported = selectedProvider?.apiProtocol !== 'anthropic-messages';
  const reasoningMode = Form.useWatch<ModelFormValues['reasoningMode']>('reasoningMode', modelForm);
  const reasoningLevels = Form.useWatch<ReasoningLevel[]>('reasoningLevels', modelForm) ?? [];

  const openProvider = (provider?: ModelProvider) => {
    setProviderEditor(provider);
    providerForm.resetFields();
    providerForm.setFieldsValue(providerValues(provider));
    setProviderOpen(true);
  };

  const recoverProvider = async (id: string) => {
    const latest = (await getModelProvider({ providerId: id })).data;
    setProviderEditor(latest);
    providerForm.setFieldsValue(providerValues(latest));
    await providers.reload();
  };

  const saveProvider = async () => {
    const values = await validatedFormValues(providerForm);
    if (!values) return;
    setSaving(true);
    try {
      if (providerEditor) {
        const input: ModelProviderUpdateInput = {
          providerKey: values.providerKey.trim(),
          name: values.name.trim(),
          providerType: values.providerType,
          apiProtocol: values.apiProtocol,
          baseUrl: values.baseUrl.trim(),
          replaceSecret: Boolean(values.replaceSecret),
          credential: values.replaceSecret ? values.credential : undefined,
          connectTimeoutMs: values.connectTimeoutMs,
          readTimeoutMs: values.readTimeoutMs
        };
        await updateModelProvider(providerEditor.id, providerEditor.revision, input);
      } else {
        const input: ModelProviderInput = {
          providerKey: values.providerKey.trim(),
          name: values.name.trim(),
          providerType: values.providerType,
          apiProtocol: values.apiProtocol,
          baseUrl: values.baseUrl.trim(),
          credential: values.credential || '',
          connectTimeoutMs: values.connectTimeoutMs,
          readTimeoutMs: values.readTimeoutMs
        };
        await createModelProvider(input);
      }
      message.success(providerEditor ? 'Provider 已更新' : 'Provider 已创建');
      setProviderOpen(false);
      providerForm.resetFields();
      await Promise.all([providers.reload(), models.reload()]);
    } catch (error) {
      if (providerEditor) await recoverRevisionConflict(error, () => recoverProvider(providerEditor.id));
    } finally {
      setSaving(false);
    }
  };

  const testProvider = async () => {
    if (!providerEditor) return;
    const values = await validatedFormValues(providerForm, ['baseUrl', 'connectTimeoutMs', 'readTimeoutMs']);
    if (!values) return;
    const result = await testModelProvider(providerEditor.id, {
      baseUrl: values.baseUrl,
      credential: values.replaceSecret ? values.credential : undefined,
      connectTimeoutMs: values.connectTimeoutMs,
      readTimeoutMs: values.readTimeoutMs
    });
    message.success(`连接测试 ${result.data.upstreamStatus}，${result.data.latencyMs} ms`);
  };

  const openModel = (model?: ManagedModel) => {
    setModelEditor(model);
    setDiscoveredModels(
      model
        ? [{ id: model.modelId, name: model.name, contextWindow: model.contextWindow, maxTokens: model.maxTokens }]
        : []
    );
    modelForm.resetFields();
    modelForm.setFieldsValue(modelValues(model));
    setModelOpen(true);
  };

  const discoverModels = async () => {
    if (!selectedProvider) {
      message.warning('请先选择 Provider');
      return;
    }
    setDiscovering(true);
    try {
      const result = await testModelProvider(selectedProvider.id, {
        baseUrl: selectedProvider.baseUrl,
        connectTimeoutMs: selectedProvider.connectTimeoutMs,
        readTimeoutMs: selectedProvider.readTimeoutMs
      });
      if (!result.data.success) {
        message.warning(`模型发现失败：${result.data.upstreamStatus}`);
        return;
      }
      setDiscoveredModels(result.data.models);
      message.success(`发现 ${result.data.models.length} 个模型`);
    } finally {
      setDiscovering(false);
    }
  };

  const recoverModel = async (id: string) => {
    const latest = (await getManagedModel({ modelId: id })).data;
    setModelEditor(latest);
    modelForm.setFieldsValue(modelValues(latest));
    await models.reload();
  };

  const saveModel = async () => {
    const values = await validatedFormValues(modelForm);
    if (!values) return;
    if (values.reasoningMode === 'explicit' && !(values.reasoningLevels ?? []).some(level => level !== 'off')) {
      message.error('reasoningEfforts 至少选择一个非 off 档位');
      return;
    }
    const input = modelInput(values, selectedProvider?.apiProtocol);
    setSaving(true);
    try {
      if (modelEditor) await updateManagedModel(modelEditor.id, modelEditor.revision, input);
      else await createManagedModel(input);
      message.success(modelEditor ? '模型已更新' : '模型已创建');
      setModelOpen(false);
      modelForm.resetFields();
      await models.reload();
    } catch (error) {
      if (modelEditor) await recoverRevisionConflict(error, () => recoverModel(modelEditor.id));
    } finally {
      setSaving(false);
    }
  };

  const providerColumns: TableColumnsType<ModelProvider> = [
    { title: 'Provider ID', dataIndex: 'providerKey' },
    { title: '显示名称', dataIndex: 'name' },
    {
      title: '类型',
      dataIndex: 'providerType',
      width: 150,
      render: value => (value === 'DEEPSEEK_OFFICIAL' ? 'DeepSeek 官方' : '自定义提供商')
    },
    { title: 'API 协议', dataIndex: 'apiProtocol', width: 180 },
    { title: 'API 地址', dataIndex: 'baseUrl' },
    { title: '密钥', dataIndex: 'credentialConfigured', width: 100, render: value => (value ? '已配置' : '未配置') },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    {
      title: '操作',
      width: 200,
      render: (_, row) =>
        canWrite ? (
          <Space>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openProvider(row)}>
              编辑
            </Button>
            <Popconfirm
              title={`确认${row.status === 'ACTIVE' ? '停用' : '启用'}该 Provider？`}
              onConfirm={async () => {
                try {
                  await setModelProviderEnabled(row.id, row.revision, row.status !== 'ACTIVE');
                  await providers.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, providers.reload);
                }
              }}
            >
              <Button type="link" size="small" danger={row.status === 'ACTIVE'} icon={<PoweroffOutlined />}>
                {row.status === 'ACTIVE' ? '停用' : '启用'}
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          '-'
        )
    }
  ];

  const modelColumns: TableColumnsType<ManagedModel> = [
    { title: 'Alias', dataIndex: 'alias' },
    { title: '模型 ID', dataIndex: 'modelId' },
    { title: '名称', dataIndex: 'name', render: (value, row) => value ?? row.modelId },
    { title: 'Provider', dataIndex: 'providerName' },
    { title: 'contextWindow', dataIndex: 'contextWindow', width: 140, render: value => value ?? '默认 262144' },
    { title: 'maxTokens', dataIndex: 'maxTokens', width: 130, render: value => value ?? '默认 32768' },
    {
      title: 'reasoningEfforts',
      dataIndex: 'reasoningEfforts',
      width: 180,
      render: value => value === undefined ? '未声明' : value === false ? 'false' : Object.keys(value).join(', ')
    },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    {
      title: '操作',
      width: 260,
      render: (_, row) =>
        canWrite ? (
          <Space>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModel(row)}>
              编辑
            </Button>
            <Popconfirm
              title={`确认${row.status === 'ACTIVE' ? '停用' : '启用'}该模型？`}
              onConfirm={async () => {
                try {
                  await setManagedModelEnabled(row.id, row.revision, row.status !== 'ACTIVE');
                  await models.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, models.reload);
                }
              }}
            >
              <Button type="link" size="small" danger={row.status === 'ACTIVE'} icon={<PoweroffOutlined />}>
                {row.status === 'ACTIVE' ? '停用' : '启用'}
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认删除该模型？"
              onConfirm={async () => {
                try {
                  await deleteManagedModel(row.id, row.revision);
                  await models.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, models.reload);
                }
              }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          '-'
        )
    }
  ];

  return (
    <PageContainer title="模型">
      <Tabs
        items={[
          {
            key: 'providers',
            label: '模型提供商',
            children: (
              <>
                {canWrite && (
                  <div className="enterprise-table-actions">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openProvider()}>
                      新建提供商
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={providerColumns}
                  dataSource={providers.items}
                  loading={providers.loading}
                  pagination={false}
                  scroll={{ x: 1200 }}
                  footer={
                    providers.hasMore
                      ? () => (
                          <Button block onClick={providers.loadMore}>
                            加载更多
                          </Button>
                        )
                      : undefined
                  }
                />
              </>
            )
          },
          {
            key: 'models',
            label: '受管模型',
            children: (
              <>
                {canWrite && (
                  <div className="enterprise-table-actions">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openModel()}>
                      新建模型
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={modelColumns}
                  dataSource={models.items}
                  loading={models.loading}
                  pagination={false}
                  scroll={{ x: 1280 }}
                  footer={
                    models.hasMore
                      ? () => (
                          <Button block onClick={models.loadMore}>
                            加载更多
                          </Button>
                        )
                      : undefined
                  }
                />
              </>
            )
          }
        ]}
      />
      <Drawer
        title={providerEditor ? '编辑提供商' : '新建提供商'}
        size={520}
        open={providerOpen}
        destroyOnHidden
        onClose={() => setProviderOpen(false)}
        extra={
          <Space>
            {providerEditor && (
              <Button icon={<ExperimentOutlined />} onClick={testProvider}>
                测试连接
              </Button>
            )}
            <Button type="primary" loading={saving} onClick={saveProvider}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          form={providerForm}
          layout="vertical"
          preserve={false}
          initialValues={providerValues()}
          onValuesChange={changed => {
            if (changed.providerType) providerForm.setFieldsValue(newProviderValues(changed.providerType));
          }}
        >
          <ProviderFormFields editing={Boolean(providerEditor)} />
        </Form>
      </Drawer>
      <Drawer
        title={modelEditor ? '编辑模型' : '新建模型'}
        size={600}
        open={modelOpen}
        destroyOnHidden
        onClose={() => setModelOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={saveModel}>
            保存
          </Button>
        }
      >
        <Form
          form={modelForm}
          layout="vertical"
          preserve={false}
          initialValues={modelValues()}
          onValuesChange={changed => {
            if (changed.providerId) {
              setDiscoveredModels([]);
              modelForm.setFieldValue('modelId', undefined);
              modelForm.setFieldsValue({ thinkingFormat: undefined, supportsReasoningEffort: 'auto' });
            }
          }}
        >
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}>
            <Select options={providers.items.map(item => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          {discoverySupported ? (
            <Form.Item label="模型 ID" required>
              <Space.Compact block>
                <Form.Item name="modelId" noStyle rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={discoveredModels.map(model => ({
                      value: model.id,
                      label: model.name ? `${model.id} (${model.name})` : model.id
                    }))}
                    placeholder="先获取可用模型"
                    notFoundContent="暂无候选模型"
                    onChange={modelId => {
                      const model = discoveredModels.find(item => item.id === modelId);
                      modelForm.setFieldsValue({
                        modelId,
                        ...modelEditor ? {} : { alias: modelId },
                        name: model?.name,
                        contextWindow: model?.contextWindow,
                        maxTokens: model?.maxTokens
                      });
                    }}
                  />
                </Form.Item>
                <Button icon={<CloudDownloadOutlined />} loading={discovering} onClick={discoverModels}>
                  获取可用模型
                </Button>
              </Space.Compact>
            </Form.Item>
          ) : (
            <Form.Item name="modelId" label="模型 ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="alias"
            label="Alias"
            rules={[{ required: true, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="name" label="名称（可选）" rules={[{ whitespace: true, max: 120 }]}>
            <Input placeholder="留空使用模型 ID" />
          </Form.Item>
          <Collapse
            ghost
            items={[
              {
                key: 'capacity',
                label: '容量',
                children: (
                  <>
                    <Form.Item name="contextWindow" label="contextWindow（可选）">
                      <InputNumber min={1} precision={0} placeholder="262144" className="enterprise-number-input" />
                    </Form.Item>
                    <Form.Item name="maxTokens" label="maxTokens（可选）">
                      <InputNumber min={1} precision={0} placeholder="32768" className="enterprise-number-input" />
                    </Form.Item>
                  </>
                )
              },
              {
                key: 'reasoning',
                label: '推理',
                children: (
                  <>
                    <Form.Item name="reasoningMode" label="reasoningEfforts" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: 'omitted', label: '未声明' },
                          { value: 'disabled', label: 'false' },
                          { value: 'explicit', label: '显式档位映射' }
                        ]}
                      />
                    </Form.Item>
                    {reasoningMode === 'explicit' && (
                      <>
                        <Form.Item name="reasoningLevels" label="支持档位" rules={[{ required: true }]}>
                          <Checkbox.Group
                            options={REASONING_LEVELS.map(level => ({ label: level, value: level }))}
                            onChange={values => {
                              const levels = values as ReasoningLevel[];
                              const current = modelForm.getFieldValue('reasoningWireValues') ?? {};
                              modelForm.setFieldValue('reasoningWireValues', Object.fromEntries(
                                levels.map(level => [level, current[level] ?? (level === 'off' ? undefined : level)])
                              ));
                            }}
                          />
                        </Form.Item>
                        {reasoningLevels.map(level => (
                          <Form.Item
                            key={level}
                            name={['reasoningWireValues', level]}
                            label={`${level} wire 值`}
                            rules={level === 'off' ? [] : [{ required: true, whitespace: true }]}
                          >
                            <Input maxLength={255} placeholder={level === 'off' ? 'null' : level} />
                          </Form.Item>
                        ))}
                        {selectedProvider?.apiProtocol === OPENAI_COMPLETIONS && (
                          <>
                            <Form.Item name="thinkingFormat" label="compat.thinkingFormat">
                              <Select
                                allowClear
                                options={THINKING_FORMATS.map(value => ({ value, label: value }))}
                                placeholder="自动检测"
                              />
                            </Form.Item>
                            <Form.Item name="supportsReasoningEffort" label="compat.supportsReasoningEffort">
                              <Select
                                options={[
                                  { value: 'auto', label: '自动检测' },
                                  { value: 'true', label: 'true' },
                                  { value: 'false', label: 'false' }
                                ]}
                              />
                            </Form.Item>
                          </>
                        )}
                      </>
                    )}
                  </>
                )
              }
            ]}
          />
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} className="enterprise-number-input" />
          </Form.Item>
        </Form>
      </Drawer>
    </PageContainer>
  );
}
