/**
 * [INPUT]: 依赖 provider/model 业务 API、OpenAPI 推导类型、权限事实与 cursor/revision 公共策略
 * [OUTPUT]: 提供 Provider 配置测试及受管模型 CRUD、排序和启停页面
 * [POS]: pages/enterprise/model-catalog 的模型治理工作台，避开 Umi model 目录约定且绝不回填 credential
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { DeleteOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, PoweroffOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
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
  name: string;
  baseUrl: string;
  credential?: string;
  replaceSecret?: boolean;
  connectTimeoutMs: number;
  readTimeoutMs: number;
}

function providerValues(provider?: ModelProvider): ProviderFormValues {
  return provider
    ? {
        name: provider.name,
        baseUrl: provider.baseUrl,
        replaceSecret: false,
        connectTimeoutMs: provider.connectTimeoutMs,
        readTimeoutMs: provider.readTimeoutMs
      }
    : { name: '', baseUrl: '', connectTimeoutMs: 5000, readTimeoutMs: 120000 };
}

function modelValues(model?: ManagedModel): ManagedModelInput {
  return model
    ? {
        providerId: model.providerId,
        alias: model.alias,
        displayName: model.displayName,
        upstreamModel: model.upstreamModel,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        reasoning: model.reasoning,
        sortOrder: model.sortOrder
      }
    : {
        providerId: '',
        alias: '',
        displayName: '',
        upstreamModel: '',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        reasoning: false,
        sortOrder: 100
      };
}

function statusTag(status: 'ACTIVE' | 'DISABLED') {
  return <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>;
}

function ProviderFormFields({ editing }: { editing: boolean }) {
  const replaceSecret = Form.useWatch<boolean>('replaceSecret');
  return (
    <>
      <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label="类型">
        <Input value="DEEPSEEK_OPENAI" disabled />
      </Form.Item>
      <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, type: 'url' }]}>
        <Input />
      </Form.Item>
      {editing && (
        <Form.Item name="replaceSecret" label="替换密钥" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
      {(!editing || replaceSecret) && (
        <Form.Item name="credential" label={editing ? '新密钥' : '密钥'} rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
      <Form.Item name="connectTimeoutMs" label="连接超时（ms）" rules={[{ required: true }]}>
        <InputNumber min={100} max={60000} precision={0} className="enterprise-number-input" />
      </Form.Item>
      <Form.Item name="readTimeoutMs" label="读取超时（ms）" rules={[{ required: true }]}>
        <InputNumber min={1000} max={600000} precision={0} className="enterprise-number-input" />
      </Form.Item>
    </>
  );
}

export default function ModelsPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canWrite = hasPermi(userInfo, ['ent:model:write']);
  const [providerForm] = Form.useForm<ProviderFormValues>();
  const [modelForm] = Form.useForm<ManagedModelInput>();
  const [providerEditor, setProviderEditor] = useState<ModelProvider>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelEditor, setModelEditor] = useState<ManagedModel>();
  const [modelOpen, setModelOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProviders = useCallback(
    async (cursor?: string) => (await listModelProviders({ cursor, limit: 50 })).data,
    []
  );
  const loadModels = useCallback(async (cursor?: string) => (await listManagedModels({ cursor, limit: 50 })).data, []);
  const providers = useCursorData(loadProviders);
  const models = useCursorData(loadModels);

  const openProvider = (provider?: ModelProvider) => {
    setProviderEditor(provider);
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
          name: values.name.trim(),
          providerType: 'DEEPSEEK_OPENAI',
          baseUrl: values.baseUrl.trim(),
          replaceSecret: Boolean(values.replaceSecret),
          credential: values.replaceSecret ? values.credential : undefined,
          connectTimeoutMs: values.connectTimeoutMs,
          readTimeoutMs: values.readTimeoutMs
        };
        await updateModelProvider(providerEditor.id, providerEditor.revision, input);
      } else {
        const input: ModelProviderInput = {
          name: values.name.trim(),
          providerType: 'DEEPSEEK_OPENAI',
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
    modelForm.setFieldsValue(modelValues(model));
    setModelOpen(true);
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
    setSaving(true);
    try {
      if (modelEditor) await updateManagedModel(modelEditor.id, modelEditor.revision, values);
      else await createManagedModel(values);
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
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'providerType', width: 170 },
    { title: 'Base URL', dataIndex: 'baseUrl' },
    { title: '密钥', dataIndex: 'credentialConfigured', width: 100, render: value => (value ? '已配置' : '未配置') },
    { title: '超时', width: 170, render: (_, row) => `${row.connectTimeoutMs} / ${row.readTimeoutMs} ms` },
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
    { title: '显示名', dataIndex: 'displayName' },
    { title: '上游模型', dataIndex: 'upstreamModel' },
    { title: 'Provider', dataIndex: 'providerName' },
    { title: '上下文', dataIndex: 'contextWindow', width: 110 },
    { title: '最大输出', dataIndex: 'maxOutputTokens', width: 110 },
    { title: '推理', dataIndex: 'reasoning', width: 80, render: value => (value ? '是' : '否') },
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
            label: 'Provider',
            children: (
              <>
                {canWrite && (
                  <div className="enterprise-table-actions">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openProvider()}>
                      新建 Provider
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={providerColumns}
                  dataSource={providers.items}
                  loading={providers.loading}
                  pagination={false}
                  scroll={{ x: 1050 }}
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
        title={providerEditor ? '编辑 Provider' : '新建 Provider'}
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
        <Form form={providerForm} layout="vertical" preserve={false} initialValues={providerValues()}>
          <ProviderFormFields editing={Boolean(providerEditor)} />
        </Form>
      </Drawer>
      <Drawer
        title={modelEditor ? '编辑模型' : '新建模型'}
        size={520}
        open={modelOpen}
        destroyOnHidden
        onClose={() => setModelOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={saveModel}>
            保存
          </Button>
        }
      >
        <Form form={modelForm} layout="vertical" preserve={false} initialValues={modelValues()}>
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}>
            <Select options={providers.items.map(item => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          <Form.Item name="alias" label="Alias" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9._-]*$/ }]}>
            <Input />
          </Form.Item>
          <Form.Item name="displayName" label="显示名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="upstreamModel" label="上游模型" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contextWindow" label="上下文窗口" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} className="enterprise-number-input" />
          </Form.Item>
          <Form.Item name="maxOutputTokens" label="最大输出 Token" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} className="enterprise-number-input" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} className="enterprise-number-input" />
          </Form.Item>
          <Form.Item name="reasoning" label="推理模型" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </PageContainer>
  );
}
