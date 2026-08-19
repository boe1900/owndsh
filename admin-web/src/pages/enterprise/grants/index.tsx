/**
 * [INPUT]: 依赖授权/配额/用量业务 API、模型目录、权限事实与 cursor/revision 公共策略
 * [OUTPUT]: 提供模型分配、默认标记、配额 CRUD/窗口和带用户/部门/模型语义的用量筛选页面
 * [POS]: pages/enterprise 的授权与消费治理工作台，最终有效规则始终由服务端解析
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Dayjs } from 'dayjs';
import { DeleteOutlined, EditOutlined, PlusOutlined, PoweroffOutlined, SearchOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
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
import { listManagedModels, type ManagedModel } from '@/api/enterprise/model';
import {
  createModelGrant,
  createQuotaPolicy,
  deleteModelGrant,
  deleteQuotaPolicy,
  getQuotaPolicy,
  getQuotaPolicyWindows,
  listModelGrants,
  listQuotaPolicies,
  listUsageLedger,
  setQuotaPolicyEnabled,
  updateModelGrant,
  updateQuotaPolicy,
  type ModelGrant,
  type ModelGrantInput,
  type QuotaPolicy,
  type QuotaPolicyInput,
  type UsageLedgerItem
} from '@/api/enterprise/quota';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { recoverRevisionConflict } from '../shared/revision';
import { useCursorData } from '../shared/useCursorData';
import { validatedFormValues } from '../shared/validateForm';

interface UsageFilter {
  userId?: string;
  departmentId?: string;
  modelId?: string;
  requestId?: string;
  range?: [Dayjs, Dayjs];
}

function statusTag(status: 'ACTIVE' | 'DISABLED') {
  return <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>;
}

function GrantFields({ models }: { models: ManagedModel[] }) {
  const subjectType = Form.useWatch<ModelGrantInput['subjectType']>('subjectType');
  return (
    <>
      <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
        <Select options={models.map(model => ({ value: model.id, label: `${model.displayName} (${model.alias})` }))} />
      </Form.Item>
      <Form.Item name="subjectType" label="对象类型" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'USER', label: '用户' },
            { value: 'DEPT', label: '部门' }
          ]}
        />
      </Form.Item>
      <Form.Item
        name="subjectId"
        label={`${subjectType === 'DEPT' ? '部门' : '用户'} ID`}
        rules={[{ required: true, pattern: /^\d+$/ }]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="isDefault" label="默认模型" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="status" label="状态" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'DISABLED', label: 'DISABLED' }
          ]}
        />
      </Form.Item>
    </>
  );
}

function QuotaFields() {
  const subjectType = Form.useWatch<QuotaPolicyInput['subjectType']>('subjectType');
  return (
    <>
      <Form.Item name="name" label="策略名称" rules={[{ required: true, whitespace: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="subjectType" label="对象类型" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'DEFAULT', label: '默认' },
            { value: 'DEPT', label: '部门' },
            { value: 'USER', label: '用户' }
          ]}
        />
      </Form.Item>
      {subjectType !== 'DEFAULT' && (
        <Form.Item
          name="subjectId"
          label={`${subjectType === 'DEPT' ? '部门' : '用户'} ID`}
          rules={[{ required: true, pattern: /^\d+$/ }]}
        >
          <Input />
        </Form.Item>
      )}
      <Form.Item name="dailyTokenLimit" label="每日 Token">
        <InputNumber min={1} precision={0} className="enterprise-number-input" />
      </Form.Item>
      <Form.Item name="monthlyTokenLimit" label="每月 Token">
        <InputNumber min={1} precision={0} className="enterprise-number-input" />
      </Form.Item>
      <Form.Item name="rpm" label="每分钟请求">
        <InputNumber min={1} precision={0} className="enterprise-number-input" />
      </Form.Item>
      <Form.Item name="concurrency" label="并发数">
        <InputNumber min={1} precision={0} className="enterprise-number-input" />
      </Form.Item>
      <Form.Item name="status" label="状态" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'DISABLED', label: 'DISABLED' }
          ]}
        />
      </Form.Item>
    </>
  );
}

export default function GrantsPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canWrite = hasPermi(userInfo, ['ent:grant:write']);
  const [grantForm] = Form.useForm<ModelGrantInput>();
  const [quotaForm] = Form.useForm<QuotaPolicyInput>();
  const [usageForm] = Form.useForm<UsageFilter>();
  const [grantEditor, setGrantEditor] = useState<ModelGrant>();
  const [grantOpen, setGrantOpen] = useState(false);
  const [quotaEditor, setQuotaEditor] = useState<QuotaPolicy>();
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>({});
  const [windows, setWindows] = useState<Awaited<ReturnType<typeof getQuotaPolicyWindows>>['data']>();

  const loadModels = useCallback(async (cursor?: string) => (await listManagedModels({ cursor, limit: 200 })).data, []);
  const loadGrants = useCallback(async (cursor?: string) => (await listModelGrants({ cursor, limit: 50 })).data, []);
  const loadQuotas = useCallback(async (cursor?: string) => (await listQuotaPolicies({ cursor, limit: 50 })).data, []);
  const loadUsage = useCallback(
    async (cursor?: string) => {
      const { range, ...filters } = usageFilter;
      return (
        await listUsageLedger({
          cursor,
          limit: 50,
          ...filters,
          from: range?.[0].toISOString(),
          to: range?.[1].toISOString()
        })
      ).data;
    },
    [usageFilter]
  );
  const models = useCursorData(loadModels);
  const grants = useCursorData(loadGrants);
  const quotas = useCursorData(loadQuotas);
  const usage = useCursorData(loadUsage);

  const saveGrant = async () => {
    const values = await validatedFormValues(grantForm);
    if (!values) return;
    setSaving(true);
    try {
      if (grantEditor) await updateModelGrant(grantEditor.id, grantEditor.revision, values);
      else await createModelGrant(values);
      message.success(grantEditor ? '模型授权已更新' : '模型授权已创建');
      setGrantOpen(false);
      await grants.reload();
    } catch (error) {
      await recoverRevisionConflict(error, grants.reload);
    } finally {
      setSaving(false);
    }
  };

  const recoverQuota = async (id: string) => {
    const latest = (await getQuotaPolicy({ quotaId: id })).data;
    setQuotaEditor(latest);
    quotaForm.setFieldsValue({ ...latest });
    await quotas.reload();
  };

  const saveQuota = async () => {
    const values = await validatedFormValues(quotaForm);
    if (!values) return;
    const input = { ...values, subjectId: values.subjectType === 'DEFAULT' ? null : values.subjectId || null };
    setSaving(true);
    try {
      if (quotaEditor) await updateQuotaPolicy(quotaEditor.id, quotaEditor.revision, input);
      else await createQuotaPolicy(input);
      message.success(quotaEditor ? '配额策略已更新' : '配额策略已创建');
      setQuotaOpen(false);
      await quotas.reload();
    } catch (error) {
      if (quotaEditor) await recoverRevisionConflict(error, () => recoverQuota(quotaEditor.id));
    } finally {
      setSaving(false);
    }
  };

  const grantColumns: TableColumnsType<ModelGrant> = [
    { title: '模型', dataIndex: 'modelAlias' },
    { title: '对象类型', dataIndex: 'subjectType', width: 100 },
    { title: '对象', dataIndex: 'subjectName' },
    { title: '对象 ID', dataIndex: 'subjectId' },
    { title: '默认', dataIndex: 'isDefault', width: 80, render: value => (value ? '是' : '否') },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    { title: 'Revision', dataIndex: 'revision', width: 90 },
    {
      title: '操作',
      width: 160,
      render: (_, row) =>
        canWrite ? (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setGrantEditor(row);
                grantForm.setFieldsValue({
                  modelId: row.modelId,
                  subjectType: row.subjectType,
                  subjectId: row.subjectId,
                  isDefault: row.isDefault,
                  status: row.status
                });
                setGrantOpen(true);
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认撤销该模型授权？"
              onConfirm={async () => {
                try {
                  await deleteModelGrant(row.id, row.revision);
                  await grants.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, grants.reload);
                }
              }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                撤销
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          '-'
        )
    }
  ];

  const quotaColumns: TableColumnsType<QuotaPolicy> = [
    { title: '策略', dataIndex: 'name' },
    { title: '对象类型', dataIndex: 'subjectType', width: 100 },
    { title: '对象', dataIndex: 'subjectName', render: value => value || '全部用户' },
    {
      title: '日 / 月 Token',
      render: (_, row) => `${row.dailyTokenLimit ?? '不限'} / ${row.monthlyTokenLimit ?? '不限'}`
    },
    { title: 'RPM / 并发', render: (_, row) => `${row.rpm ?? '不限'} / ${row.concurrency ?? '不限'}` },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    {
      title: '操作',
      width: 280,
      render: (_, row) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={async () => setWindows((await getQuotaPolicyWindows({ quotaId: row.id })).data)}
          >
            窗口
          </Button>
          {canWrite && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setQuotaEditor(row);
                quotaForm.setFieldsValue({ ...row });
                setQuotaOpen(true);
              }}
            >
              编辑
            </Button>
          )}
          {canWrite && (
            <Popconfirm
              title={`确认${row.status === 'ACTIVE' ? '停用' : '启用'}该策略？`}
              onConfirm={async () => {
                try {
                  await setQuotaPolicyEnabled(row.id, row.revision, row.status !== 'ACTIVE');
                  await quotas.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, quotas.reload);
                }
              }}
            >
              <Button type="link" danger={row.status === 'ACTIVE'} size="small" icon={<PoweroffOutlined />}>
                {row.status === 'ACTIVE' ? '停用' : '启用'}
              </Button>
            </Popconfirm>
          )}
          {canWrite && row.subjectType !== 'DEFAULT' && (
            <Popconfirm
              title="确认删除该配额策略？"
              onConfirm={async () => {
                try {
                  await deleteQuotaPolicy(row.id, row.revision);
                  await quotas.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, quotas.reload);
                }
              }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const usageColumns: TableColumnsType<UsageLedgerItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 190, render: value => new Date(value).toLocaleString() },
    {
      title: '用户',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.userDisplayName}</span>
          <span className="enterprise-secondary">{row.username} · {row.userId}</span>
        </Space>
      )
    },
    {
      title: '部门',
      width: 150,
      render: (_, row) => row.departmentName ? `${row.departmentName} · ${row.departmentId}` : '-'
    },
    {
      title: '模型',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.modelDisplayName}</span>
          <span className="enterprise-secondary">{row.modelAlias} · {row.modelId}</span>
        </Space>
      )
    },
    { title: 'Input', dataIndex: 'inputTokens', width: 90 },
    { title: 'Output', dataIndex: 'outputTokens', width: 90 },
    { title: 'Cache', dataIndex: 'cacheTokens', width: 90 },
    { title: 'Total', dataIndex: 'totalTokens', width: 90 },
    { title: '结果', dataIndex: 'result', width: 130 },
    { title: 'Request ID', dataIndex: 'requestId', width: 260, className: 'enterprise-monospace' }
  ];

  return (
    <PageContainer title="授权与配额">
      <Tabs
        items={[
          {
            key: 'grants',
            label: '模型授权',
            children: (
              <>
                {canWrite && (
                  <div className="enterprise-table-actions">
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setGrantEditor(undefined);
                        grantForm.setFieldsValue({
                          modelId: '',
                          subjectType: 'USER',
                          subjectId: '',
                          isDefault: false,
                          status: 'ACTIVE'
                        });
                        setGrantOpen(true);
                      }}
                    >
                      新建授权
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={grantColumns}
                  dataSource={grants.items}
                  loading={grants.loading}
                  pagination={false}
                  scroll={{ x: 1000 }}
                  footer={
                    grants.hasMore
                      ? () => (
                          <Button block onClick={grants.loadMore}>
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
            key: 'quotas',
            label: '配额策略',
            children: (
              <>
                {canWrite && (
                  <div className="enterprise-table-actions">
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setQuotaEditor(undefined);
                        quotaForm.setFieldsValue({
                          name: '',
                          subjectType: 'USER',
                          subjectId: '',
                          dailyTokenLimit: null,
                          monthlyTokenLimit: null,
                          rpm: null,
                          concurrency: null,
                          status: 'ACTIVE'
                        });
                        setQuotaOpen(true);
                      }}
                    >
                      新建配额
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={quotaColumns}
                  dataSource={quotas.items}
                  loading={quotas.loading}
                  pagination={false}
                  scroll={{ x: 1180 }}
                  footer={
                    quotas.hasMore
                      ? () => (
                          <Button block onClick={quotas.loadMore}>
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
            key: 'usage',
            label: '用量',
            children: (
              <>
                <Form form={usageForm} layout="inline" className="enterprise-filter" onFinish={setUsageFilter}>
                  <Form.Item name="userId">
                    <Input placeholder="用户 ID" />
                  </Form.Item>
                  <Form.Item name="departmentId">
                    <Input placeholder="部门 ID" />
                  </Form.Item>
                  <Form.Item name="modelId">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="模型"
                      options={models.items.map(model => ({ value: model.id, label: model.displayName }))}
                    />
                  </Form.Item>
                  <Form.Item name="requestId">
                    <Input placeholder="Request ID" />
                  </Form.Item>
                  <Form.Item name="range">
                    <DatePicker.RangePicker showTime />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                    查询
                  </Button>
                </Form>
                <Table
                  rowKey="id"
                  columns={usageColumns}
                  dataSource={usage.items}
                  loading={usage.loading}
                  pagination={false}
                  scroll={{ x: 1560 }}
                  footer={
                    usage.hasMore
                      ? () => (
                          <Button block onClick={usage.loadMore}>
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
        title={grantEditor ? '编辑模型授权' : '新建模型授权'}
        size={480}
        open={grantOpen}
        destroyOnHidden
        onClose={() => setGrantOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={saveGrant}>
            保存
          </Button>
        }
      >
        <Form form={grantForm} layout="vertical" preserve={false}>
          <GrantFields models={models.items} />
        </Form>
      </Drawer>
      <Drawer
        title={quotaEditor ? '编辑配额策略' : '新建配额策略'}
        size={480}
        open={quotaOpen}
        destroyOnHidden
        onClose={() => setQuotaOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={saveQuota}>
            保存
          </Button>
        }
      >
        <Form form={quotaForm} layout="vertical" preserve={false}>
          <QuotaFields />
        </Form>
      </Drawer>
      <Modal title="当前配额窗口" open={Boolean(windows)} footer={null} onCancel={() => setWindows(undefined)}>
        <Table
          rowKey="windowType"
          pagination={false}
          dataSource={windows || []}
          columns={[
            { title: '窗口', dataIndex: 'windowType' },
            { title: '已用', dataIndex: 'usedTokens' },
            { title: '预留', dataIndex: 'reservedTokens' },
            { title: '上限', dataIndex: 'limit' },
            { title: '重置时间', dataIndex: 'resetsAt', render: value => new Date(value).toLocaleString() }
          ]}
        />
      </Modal>
    </PageContainer>
  );
}
