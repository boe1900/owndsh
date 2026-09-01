/**
 * [INPUT]: 依赖身份源/组映射业务 API、RuoYi 权限事实与 cursor/revision 公共策略
 * [OUTPUT]: 提供身份源、JIT/LINK_ONLY、连接测试、启停和旧外部组映射回退页面
 * [POS]: pages/enterprise 的身份治理工作台，secret 只在创建或替换提交时短暂存在于表单
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ApartmentOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, PoweroffOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  type TableColumnsType
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  checkIdentitySource,
  createGroupMapping,
  createIdentitySource,
  deleteGroupMapping,
  getIdentitySource,
  listGroupMappings,
  listIdentitySources,
  setIdentitySourceEnabled,
  updateIdentitySource,
  type GroupMapping,
  type IdentitySource,
  type IdentitySourceUpdateInput
} from '@/api/enterprise/identity';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { recoverRevisionConflict } from '../shared/revision';
import { useCursorData } from '../shared/useCursorData';
import { validatedFormValues } from '../shared/validateForm';

interface SourceFormValues {
  type: 'OIDC' | 'LDAP' | 'LOCAL';
  provisioningMode: 'JIT' | 'LINK_ONLY';
  name: string;
  issuer?: string;
  clientId?: string;
  secret?: string;
  scopes?: string;
  usernameClaim?: string;
  displayNameClaim?: string;
  emailClaim?: string;
  groupsClaim?: string;
  ldapUrl?: string;
  baseDn?: string;
  managerDn?: string;
  userFilter?: string;
  stableIdAttribute?: string;
  usernameAttribute?: string;
  displayNameAttribute?: string;
  emailAttribute?: string;
  groupAttribute?: string;
  startTls?: boolean;
}

interface MappingFormValues {
  externalGroup: string;
  departmentId: string;
}

function sourceInitialValues(source?: IdentitySource): SourceFormValues {
  if (!source) {
    return {
      type: 'OIDC',
      provisioningMode: 'JIT',
      name: '',
      scopes: 'openid profile email',
      usernameClaim: 'preferred_username',
      displayNameClaim: 'name',
      emailClaim: 'email',
      groupsClaim: 'groups',
      userFilter: '(uid={0})',
      stableIdAttribute: 'entryUUID',
      usernameAttribute: 'uid',
      displayNameAttribute: 'displayName',
      emailAttribute: 'mail',
      groupAttribute: 'memberOf',
      startTls: false
    };
  }
  return {
    type: source.type,
    provisioningMode: source.provisioningMode,
    name: source.name,
    issuer: source.issuer || undefined,
    clientId: source.clientId || undefined,
    scopes: source.oidc?.scopes?.join(' '),
    usernameClaim: source.oidc?.claims?.username,
    displayNameClaim: source.oidc?.claims?.displayName,
    emailClaim: source.oidc?.claims?.email,
    groupsClaim: source.oidc?.claims?.groups,
    ldapUrl: source.ldap?.url,
    baseDn: source.ldap?.baseDn,
    managerDn: source.ldap?.managerDn,
    userFilter: source.ldap?.userFilter,
    stableIdAttribute: source.ldap?.stableIdAttribute,
    usernameAttribute: source.ldap?.usernameAttribute,
    displayNameAttribute: source.ldap?.displayNameAttribute,
    emailAttribute: source.ldap?.emailAttribute,
    groupAttribute: source.ldap?.groupAttribute,
    startTls: source.ldap?.startTls
  };
}

function lastTest(source: IdentitySource) {
  if (!source.lastTestedAt || source.lastTestOk === undefined) return '-';
  return (
    <Space direction="vertical" size={0}>
      <Tag color={source.lastTestOk ? 'green' : 'red'}>{source.lastTestDiagnostic || (source.lastTestOk ? '通过' : '失败')}</Tag>
      <span className="enterprise-secondary">{new Date(source.lastTestedAt).toLocaleString()}</span>
    </Space>
  );
}

function sourceInput(values: SourceFormValues): IdentitySourceUpdateInput {
  const common = {
    type: values.type,
    provisioningMode: values.provisioningMode,
    name: values.name.trim(),
    secret: values.secret || undefined
  };
  if (values.type === 'OIDC') {
    return {
      ...common,
      issuer: values.issuer?.trim(),
      clientId: values.clientId?.trim(),
      oidc: {
        scopes: (values.scopes || '').split(/\s+/).filter(Boolean),
        claims: {
          username: values.usernameClaim?.trim() || 'preferred_username',
          displayName: values.displayNameClaim?.trim() || 'name',
          email: values.emailClaim?.trim() || undefined,
          groups: values.groupsClaim?.trim() || undefined
        }
      }
    };
  }
  if (values.type === 'LDAP') {
    return {
      ...common,
      ldap: {
        url: values.ldapUrl?.trim() || '',
        baseDn: values.baseDn?.trim() || '',
        managerDn: values.managerDn?.trim() || '',
        userFilter: values.userFilter?.trim() || '',
        stableIdAttribute: values.stableIdAttribute?.trim() || '',
        usernameAttribute: values.usernameAttribute?.trim() || '',
        displayNameAttribute: values.displayNameAttribute?.trim() || '',
        emailAttribute: values.emailAttribute?.trim() || undefined,
        groupAttribute: values.groupAttribute?.trim() || undefined,
        startTls: Boolean(values.startTls)
      }
    };
  }
  return common;
}

function SourceFields({ editing }: { editing: boolean }) {
  const type = Form.useWatch<SourceFormValues['type']>('type');
  const sourceTypes = editing && type === 'LOCAL' ? ['LOCAL'] : ['OIDC', 'LDAP'];
  return (
    <>
      <Form.Item name="type" label="类型" rules={[{ required: true }]}>
        <Select options={sourceTypes.map(value => ({ value, label: value }))} disabled={editing} />
      </Form.Item>
      <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, max: 128 }]}>
        <Input />
      </Form.Item>
      {type !== 'LOCAL' && (
        <Form.Item name="provisioningMode" label="首次登录" rules={[{ required: true }]}>
          <Select options={[
            { value: 'JIT', label: 'JIT 自动创建成员' },
            { value: 'LINK_ONLY', label: '仅允许绑定已有成员' }
          ]} />
        </Form.Item>
      )}
      {type === 'OIDC' && (
        <>
          <Form.Item name="issuer" label="Issuer" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://id.example.com" />
          </Form.Item>
          <Form.Item name="clientId" label="Client ID" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="scopes" label="Scopes" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="usernameClaim" label="用户名 claim" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="displayNameClaim" label="显示名 claim" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="emailClaim" label="邮箱 claim">
            <Input />
          </Form.Item>
          <Form.Item name="groupsClaim" label="组 claim">
            <Input />
          </Form.Item>
        </>
      )}
      {type === 'LDAP' && (
        <>
          <Form.Item name="ldapUrl" label="LDAP URL" rules={[{ required: true }]}>
            <Input placeholder="ldaps://ldap.example.com:636" />
          </Form.Item>
          <Form.Item name="baseDn" label="Base DN" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="managerDn" label="Manager DN" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="userFilter" label="用户过滤器" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stableIdAttribute" label="稳定 ID 属性" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="usernameAttribute" label="用户名属性" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="displayNameAttribute" label="显示名属性" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="emailAttribute" label="邮箱属性">
            <Input />
          </Form.Item>
          <Form.Item name="groupAttribute" label="组属性">
            <Input />
          </Form.Item>
          <Form.Item name="startTls" label="StartTLS" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}
      {type !== 'LOCAL' && (
        <Form.Item
          name="secret"
          label={editing ? '替换密钥' : type === 'OIDC' ? 'Client Secret' : 'Manager Password'}
          rules={editing ? [] : [{ required: true }]}
          extra={editing ? '留空保留当前密钥' : undefined}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
    </>
  );
}

export default function IdentitySourcesPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canWrite = hasPermi(userInfo, ['ent:identity:write']);
  const [form] = Form.useForm<SourceFormValues>();
  const [mappingForm] = Form.useForm<MappingFormValues>();
  const [editing, setEditing] = useState<IdentitySource>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingSource, setMappingSource] = useState<IdentitySource>();
  const [mappings, setMappings] = useState<GroupMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  const loadSources = useCallback(
    async (cursor?: string) => (await listIdentitySources({ cursor, limit: 50 })).data,
    []
  );
  const sources = useCursorData(loadSources);

  const reloadMappings = useCallback(async () => {
    if (!mappingSource) return;
    setMappingsLoading(true);
    try {
      setMappings((await listGroupMappings({ sourceId: mappingSource.id, limit: 200 })).data.items);
    } finally {
      setMappingsLoading(false);
    }
  }, [mappingSource]);

  useEffect(() => {
    void reloadMappings();
  }, [reloadMappings]);

  const openEditor = (source?: IdentitySource) => {
    setEditing(source);
    form.setFieldsValue(sourceInitialValues(source));
    setDrawerOpen(true);
  };

  const recoverSource = async (sourceId: string) => {
    const latest = (await getIdentitySource({ sourceId })).data;
    setEditing(latest);
    form.setFieldsValue(sourceInitialValues(latest));
    await sources.reload();
  };

  const saveSource = async () => {
    const values = await validatedFormValues(form);
    if (!values) return;
    const input = sourceInput(values);
    setSaving(true);
    try {
      if (editing) await updateIdentitySource(editing.id, editing.revision, input);
      else await createIdentitySource({ ...input, secret: values.secret || '' });
      message.success(editing ? '身份源已更新' : '身份源已创建');
      setDrawerOpen(false);
      form.resetFields();
      await sources.reload();
    } catch (error) {
      if (editing) await recoverRevisionConflict(error, () => recoverSource(editing.id));
    } finally {
      setSaving(false);
    }
  };

  const sourceColumns: TableColumnsType<IdentitySource> = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type', width: 90 },
    { title: '首次登录', dataIndex: 'provisioningMode', width: 130 },
    { title: '端点', render: (_, source) => source.issuer || source.ldap?.url || '-' },
    {
      title: '密钥',
      dataIndex: 'secretConfigured',
      width: 100,
      render: configured => (configured ? '已配置' : '未配置')
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: status => <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>
    },
    { title: '最近测试', width: 180, render: (_, source) => lastTest(source) },
    { title: 'Revision', dataIndex: 'revision', width: 90 },
    {
      title: '操作',
      width: 290,
      render: (_, source) => (
        <Space wrap>
          {canWrite && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(source)}>
              编辑
            </Button>
          )}
          {canWrite && source.type !== 'LOCAL' && (
            <Button
              type="link"
              size="small"
              icon={<ExperimentOutlined />}
              onClick={async () => {
                const result = await checkIdentitySource(source.id);
                message.success(`连接测试通过：${result.data.diagnostic}`);
                await sources.reload();
              }}
            >
              测试
            </Button>
          )}
          <Button type="link" size="small" icon={<ApartmentOutlined />} onClick={() => setMappingSource(source)}>
            组映射
          </Button>
          {canWrite && (
            <Popconfirm
              title={`确认${source.status === 'ACTIVE' ? '停用' : '启用'}该身份源？`}
              onConfirm={async () => {
                try {
                  await setIdentitySourceEnabled(source.id, source.revision, source.status !== 'ACTIVE');
                  await sources.reload();
                } catch (error) {
                  await recoverRevisionConflict(error, sources.reload);
                }
              }}
            >
              <Button type="link" size="small" danger={source.status === 'ACTIVE'} icon={<PoweroffOutlined />}>
                {source.status === 'ACTIVE' ? '停用' : '启用'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <PageContainer title="身份源">
      {canWrite && (
        <div className="enterprise-table-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新建身份源
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        columns={sourceColumns}
        dataSource={sources.items}
        loading={sources.loading}
        pagination={false}
        scroll={{ x: 1160 }}
        footer={
          sources.hasMore
            ? () => (
                <Button block onClick={sources.loadMore}>
                  加载更多
                </Button>
              )
            : undefined
        }
      />
      <Drawer
        title={editing ? '编辑身份源' : '新建身份源'}
        size={520}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => setDrawerOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={saveSource}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical" preserve={false} initialValues={sourceInitialValues()}>
          <SourceFields editing={Boolean(editing)} />
        </Form>
      </Drawer>
      <Modal
        title={mappingSource ? `${mappingSource.name} · 组映射` : '组映射'}
        open={Boolean(mappingSource)}
        width={760}
        footer={null}
        destroyOnHidden
        onCancel={() => setMappingSource(undefined)}
      >
        {canWrite && (
          <Form
            form={mappingForm}
            layout="inline"
            onFinish={async values => {
              if (!mappingSource) return;
              await createGroupMapping({ sourceId: mappingSource.id, ...values });
              mappingForm.resetFields();
              await reloadMappings();
            }}
          >
            <Form.Item name="externalGroup" rules={[{ required: true, message: '请输入外部组' }]}>
              <Input placeholder="外部组" />
            </Form.Item>
            <Form.Item name="departmentId" rules={[{ required: true, pattern: /^\d+$/, message: '请输入部门 ID' }]}>
              <Input placeholder="部门 ID" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              添加映射
            </Button>
          </Form>
        )}
        <Table<GroupMapping>
          className="enterprise-subtable"
          rowKey="id"
          loading={mappingsLoading}
          pagination={false}
          dataSource={mappings}
          columns={[
            { title: '外部组', dataIndex: 'externalGroup' },
            { title: '部门', dataIndex: 'departmentName' },
            { title: '部门 ID', dataIndex: 'departmentId' },
            { title: 'Revision', dataIndex: 'revision', width: 90 },
            ...(canWrite
              ? [
                  {
                    title: '操作',
                    width: 80,
                    render: (_: unknown, mapping: GroupMapping) => (
                      <Popconfirm
                        title="确认删除该映射？"
                        onConfirm={async () => {
                          try {
                            await deleteGroupMapping(mapping.id, mapping.revision);
                            await reloadMappings();
                          } catch (error) {
                            await recoverRevisionConflict(error, reloadMappings);
                          }
                        }}
                      >
                        <Button type="link" danger size="small">
                          删除
                        </Button>
                      </Popconfirm>
                    )
                  }
                ]
              : [])
          ]}
        />
      </Modal>
    </PageContainer>
  );
}
