/**
 * [INPUT]: 依赖插件业务 API、OpenAPI 推导类型、权限事实与 cursor/revision 公共策略
 * [OUTPUT]: 提供 tgz 上传、版本发布/退休、全量分配/回滚和设备 inventory 管理页面
 * [POS]: pages/enterprise/plugins 的插件分发工作台，服务端始终裁决制品、分配与设备事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Drawer,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Upload,
  type TableColumnsType,
  type UploadFile
} from 'antd';
import { useCallback, useState } from 'react';
import {
  listPluginInventory,
  listPluginPackages,
  publishPluginVersion,
  replacePluginAssignments,
  retirePluginVersion,
  uploadPluginVersion,
  type PluginAssignmentInput,
  type PluginCompatibility,
  type PluginInventoryItem,
  type PluginPackage,
  type PluginVersion
} from '@/api/enterprise/plugin';
import { isHandledRequestError } from '@/api/request';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { recoverRevisionConflict } from '../shared/revision';
import { useCursorData } from '../shared/useCursorData';
import { validatedFormValues } from '../shared/validateForm';

const LOCKED_HARNESS_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca';
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

interface UploadFormValues {
  artifact: UploadFile[];
  harnessCommits: string;
  enterpriseBundleRange: string;
  operatingSystems: PluginCompatibility['operatingSystems'];
}

interface AssignmentFormValues {
  items: PluginAssignmentInput[];
}

const statusColors: Record<string, string> = {
  ACTIVE: 'green',
  PUBLISHED: 'green',
  VALIDATED: 'blue',
  UPLOADED: 'processing',
  RETIRED: 'default',
  DISABLED: 'default',
  FAILED: 'red',
  RESTART_REQUIRED: 'gold',
  ROLLBACK: 'orange'
};

function statusTag(status: string) {
  return <Tag color={statusColors[status] || 'processing'}>{status}</Tag>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function parseCommits(value: string) {
  return [...new Set(value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean))];
}

function reportUnhandled(error: unknown, fallback: string) {
  if (!isHandledRequestError(error)) message.error(fallback);
}

function versionLabel(version: PluginVersion) {
  return `${version.version} · ${version.status}`;
}

function AssignmentRow({
  field,
  form,
  pluginPackage,
  remove
}: {
  field: { key: number; name: number };
  form: ReturnType<typeof Form.useForm<AssignmentFormValues>>[0];
  pluginPackage: PluginPackage;
  remove: (index: number) => void;
}) {
  const subjectType = Form.useWatch(['items', field.name, 'subjectType'], form);
  const desiredState = Form.useWatch(['items', field.name, 'desiredState'], form);

  return (
    <div className="enterprise-assignment-row">
      <Form.Item
        name={[field.name, 'pluginVersionId']}
        label="版本"
        rules={[{ required: true, message: '请选择版本' }]}
      >
        <Select
          options={pluginPackage.versions.map(version => ({
            value: version.id,
            label: versionLabel(version),
            disabled: version.status !== 'PUBLISHED'
          }))}
        />
      </Form.Item>
      <Form.Item name={[field.name, 'subjectType']} label="对象类型" rules={[{ required: true }]}>
        <Select
          onChange={value => {
            if (value === 'ALL') form.setFieldValue(['items', field.name, 'subjectId'], null);
          }}
          options={[
            { value: 'ALL', label: '全部' },
            { value: 'DEPT', label: '部门' },
            { value: 'USER', label: '用户' }
          ]}
        />
      </Form.Item>
      {subjectType === 'ALL' ? (
        <Form.Item label="对象 ID">
          <Input value="全部" disabled />
        </Form.Item>
      ) : (
        <Form.Item
          name={[field.name, 'subjectId']}
          label="对象 ID"
          rules={[{ required: true, pattern: /^[1-9]\d*$/, message: '请输入有效 ID' }]}
        >
          <Input />
        </Form.Item>
      )}
      <Form.Item name={[field.name, 'desiredState']} label="期望状态" rules={[{ required: true }]}>
        <Select
          onChange={value => {
            if (value === 'ABSENT') form.setFieldValue(['items', field.name, 'required'], false);
          }}
          options={[
            { value: 'INSTALLED', label: '安装' },
            { value: 'ABSENT', label: '移除' }
          ]}
        />
      </Form.Item>
      <Form.Item name={[field.name, 'required']} label="强制" valuePropName="checked">
        <Switch disabled={desiredState === 'ABSENT'} />
      </Form.Item>
      <Button aria-label="删除分配" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
    </div>
  );
}

function AssignmentRows({
  form,
  pluginPackage
}: {
  form: ReturnType<typeof Form.useForm<AssignmentFormValues>>[0];
  pluginPackage: PluginPackage;
}) {
  return (
    <Form.List
      name="items"
      rules={[
        {
          validator: async (_, items: PluginAssignmentInput[] = []) => {
            const subjects = items.map(item => `${item.subjectType}:${item.subjectId ?? ''}`);
            if (new Set(subjects).size !== subjects.length) throw new Error('同一对象只能存在一条分配');
          }
        }
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <>
          {fields.map(field => (
            <AssignmentRow
              key={field.key}
              field={field}
              form={form}
              pluginPackage={pluginPackage}
              remove={remove}
            />
          ))}
          <Form.ErrorList errors={errors} />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            disabled={fields.length >= 200}
            onClick={() =>
              add({
                pluginVersionId: pluginPackage.versions.find(version => version.status === 'PUBLISHED')?.id,
                subjectType: 'ALL',
                subjectId: null,
                desiredState: 'INSTALLED',
                required: false
              })
            }
          >
            添加分配
          </Button>
        </>
      )}
    </Form.List>
  );
}

export default function PluginsPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canWrite = hasPermi(userInfo, ['ent:plugin:write']);
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [assignmentForm] = Form.useForm<AssignmentFormValues>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignmentEditor, setAssignmentEditor] = useState<PluginPackage>();
  const [saving, setSaving] = useState(false);

  const loadPackages = useCallback(
    async (cursor?: string) => (await listPluginPackages({ cursor, limit: 50 })).data,
    []
  );
  const loadInventory = useCallback(
    async (cursor?: string) => (await listPluginInventory({ cursor, limit: 50 })).data,
    []
  );
  const packages = useCursorData(loadPackages);
  const inventory = useCursorData(loadInventory);

  const openUpload = () => {
    uploadForm.setFieldsValue({
      artifact: [],
      harnessCommits: LOCKED_HARNESS_COMMIT,
      enterpriseBundleRange: '>=0.1.0 <0.2.0',
      operatingSystems: ['darwin', 'linux', 'win32']
    });
    setUploadOpen(true);
  };

  const submitUpload = async () => {
    const values = await validatedFormValues(uploadForm);
    if (!values) return;
    const artifact = values.artifact[0]?.originFileObj;
    if (!artifact) return;
    setSaving(true);
    try {
      await uploadPluginVersion(artifact, {
        harnessCommits: parseCommits(values.harnessCommits),
        enterpriseBundleRange: values.enterpriseBundleRange.trim(),
        operatingSystems: values.operatingSystems
      });
      message.success('插件版本已验证');
      setUploadOpen(false);
      uploadForm.resetFields();
      await packages.reload();
    } catch (error) {
      reportUnhandled(error, '插件上传失败');
    } finally {
      setSaving(false);
    }
  };

  const mutateVersion = async (version: PluginVersion, action: 'publish' | 'retire') => {
    try {
      if (action === 'publish') await publishPluginVersion(version.id, version.revision);
      else await retirePluginVersion(version.id, version.revision);
      message.success(action === 'publish' ? '插件版本已发布' : '插件版本已退休');
      await packages.reload();
    } catch (error) {
      const recovered = await recoverRevisionConflict(error, packages.reload);
      if (!recovered) reportUnhandled(error, '版本状态更新失败');
    }
  };

  const openAssignments = (pluginPackage: PluginPackage) => {
    setAssignmentEditor(pluginPackage);
    assignmentForm.setFieldsValue({
      items: pluginPackage.assignments.map(assignment => ({
        pluginVersionId: assignment.pluginVersionId,
        subjectType: assignment.subjectType,
        subjectId: assignment.subjectId,
        desiredState: assignment.desiredState,
        required: assignment.required
      }))
    });
  };

  const recoverPackage = async (packageId: string) => {
    const response = await listPluginPackages({ limit: 200 });
    const latest = response.data.items.find(item => item.id === packageId);
    if (latest) openAssignments(latest);
    else setAssignmentEditor(undefined);
    await packages.reload();
  };

  const submitAssignments = async () => {
    if (!assignmentEditor) return;
    const values = await validatedFormValues(assignmentForm);
    if (!values) return;
    const items = values.items.map(item => ({
      ...item,
      subjectId: item.subjectType === 'ALL' ? null : item.subjectId?.trim() || null,
      required: item.desiredState === 'ABSENT' ? false : Boolean(item.required)
    }));
    setSaving(true);
    try {
      await replacePluginAssignments(assignmentEditor.id, assignmentEditor.revision, items);
      message.success('插件分配已更新');
      setAssignmentEditor(undefined);
      await packages.reload();
    } catch (error) {
      const recovered = await recoverRevisionConflict(error, () => recoverPackage(assignmentEditor.id));
      if (!recovered) reportUnhandled(error, '插件分配更新失败');
    } finally {
      setSaving(false);
    }
  };

  const assignmentColumns = (pluginPackage: PluginPackage): TableColumnsType<PluginPackage['assignments'][number]> => [
    {
      title: '版本',
      dataIndex: 'pluginVersionId',
      render: value => pluginPackage.versions.find(version => version.id === value)?.version || value
    },
    { title: '对象类型', dataIndex: 'subjectType', width: 100 },
    { title: '对象 ID', dataIndex: 'subjectId', render: value => value || '全部' },
    { title: '期望状态', dataIndex: 'desiredState', width: 110, render: statusTag },
    { title: '强制', dataIndex: 'required', width: 80, render: value => (value ? '是' : '否') },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag }
  ];

  const versionColumns: TableColumnsType<PluginVersion> = [
    { title: '版本', dataIndex: 'version', width: 130 },
    { title: '状态', dataIndex: 'status', width: 120, render: statusTag },
    { title: '大小', dataIndex: 'sizeBytes', width: 110, render: formatBytes },
    {
      title: '兼容系统',
      dataIndex: ['compatibility', 'operatingSystems'],
      render: value => (value as string[]).join(' / ')
    },
    { title: 'Bundle 范围', dataIndex: ['compatibility', 'enterpriseBundleRange'] },
    { title: 'Revision', dataIndex: 'revision', width: 90 },
    {
      title: '操作',
      width: 130,
      render: (_, version) => {
        if (!canWrite) return '-';
        if (version.status === 'VALIDATED') {
          return (
            <Button type="link" size="small" icon={<CloudUploadOutlined />} onClick={() => void mutateVersion(version, 'publish')}>
              发布
            </Button>
          );
        }
        if (version.status === 'PUBLISHED') {
          return (
            <Popconfirm title="确认退休该版本？" onConfirm={() => mutateVersion(version, 'retire')}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>退休</Button>
            </Popconfirm>
          );
        }
        return '-';
      }
    }
  ];

  const packageColumns: TableColumnsType<PluginPackage> = [
    {
      title: '插件',
      render: (_, item) => (
        <Space orientation="vertical" size={0}>
          <span>{item.displayName}</span>
          <span className="enterprise-secondary enterprise-monospace">{item.packageName}</span>
        </Space>
      )
    },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    { title: '版本', dataIndex: 'versions', width: 90, render: value => value.length },
    { title: '分配', dataIndex: 'assignments', width: 90, render: value => value.length },
    { title: 'Revision', dataIndex: 'revision', width: 90 },
    {
      title: '操作',
      width: 160,
      render: (_, item) =>
        canWrite ? (
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openAssignments(item)}>
            分配与回滚
          </Button>
        ) : (
          '-'
        )
    }
  ];

  const inventoryColumns: TableColumnsType<PluginInventoryItem> = [
    {
      title: '设备',
      width: 190,
      render: (_, item) => (
        <Space orientation="vertical" size={0}>
          <span>{item.username}</span>
          <span className="enterprise-secondary enterprise-monospace">{item.deviceId}</span>
        </Space>
      )
    },
    { title: '插件', dataIndex: 'packageName' },
    { title: '本地版本', dataIndex: 'version', width: 130, render: value => value || '-' },
    { title: '期望 Revision', dataIndex: 'desiredRevision', width: 130 },
    { title: '状态', dataIndex: 'state', width: 160, render: statusTag },
    { title: 'Loader', dataIndex: 'loaderPhase', width: 120, render: value => value || '-' },
    { title: '错误码', dataIndex: 'lastErrorCode', render: value => value || '-' },
    { title: '上报时间', dataIndex: 'observedAt', width: 190, render: value => new Date(value).toLocaleString() }
  ];

  return (
    <PageContainer title="插件分发">
      <Tabs
        items={[
          {
            key: 'catalog',
            label: '插件目录',
            children: (
              <>
                <div className="enterprise-table-actions">
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => void packages.reload()} loading={packages.loading}>
                      刷新
                    </Button>
                    {canWrite && <Button type="primary" icon={<UploadOutlined />} onClick={openUpload}>上传插件</Button>}
                  </Space>
                </div>
                <Table
                  rowKey="id"
                  columns={packageColumns}
                  dataSource={packages.items}
                  loading={packages.loading}
                  pagination={false}
                  expandable={{
                    expandedRowRender: item => (
                      <>
                        <Table rowKey="id" size="small" columns={versionColumns} dataSource={item.versions} pagination={false} />
                        <Table
                          className="enterprise-subtable"
                          rowKey="id"
                          size="small"
                          columns={assignmentColumns(item)}
                          dataSource={item.assignments}
                          pagination={false}
                        />
                      </>
                    )
                  }}
                />
                {packages.hasMore && <Button className="enterprise-load-more" onClick={() => void packages.loadMore()}>加载更多</Button>}
              </>
            )
          },
          {
            key: 'inventory',
            label: '设备状态',
            children: (
              <>
                <div className="enterprise-table-actions">
                  <Button icon={<ReloadOutlined />} onClick={() => void inventory.reload()} loading={inventory.loading}>刷新</Button>
                </div>
                <Table
                  rowKey={item => `${item.deviceId}:${item.packageName}`}
                  columns={inventoryColumns}
                  dataSource={inventory.items}
                  loading={inventory.loading}
                  pagination={false}
                  scroll={{ x: 1200 }}
                />
                {inventory.hasMore && <Button className="enterprise-load-more" onClick={() => void inventory.loadMore()}>加载更多</Button>}
              </>
            )
          }
        ]}
      />

      <Drawer
        title="上传插件"
        size={560}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        extra={<Button type="primary" loading={saving} onClick={() => void submitUpload()}>上传</Button>}
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item
            name="artifact"
            label="Bundle"
            valuePropName="fileList"
            getValueFromEvent={event => event?.fileList?.slice(-1)}
            rules={[
              { required: true, message: '请选择 tgz 文件' },
              {
                validator: async (_, files: UploadFile[] = []) => {
                  const file = files[0]?.originFileObj;
                  if (file && !file.name.toLowerCase().endsWith('.tgz')) throw new Error('只接受 .tgz 文件');
                  if (file && file.size > MAX_ARTIFACT_BYTES) throw new Error('文件不得超过 50 MiB');
                }
              }
            ]}
          >
            <Upload accept=".tgz,application/gzip" beforeUpload={() => false} maxCount={1}>
              <Button icon={<UploadOutlined />}>选择 tgz</Button>
            </Upload>
          </Form.Item>
          <Form.Item
            name="harnessCommits"
            label="Harness commits"
            rules={[
              { required: true },
              {
                validator: async (_, value: string) => {
                  const commits = parseCommits(value || '');
                  if (!commits.length || commits.some(commit => !/^[0-9a-f]{40}$/.test(commit))) {
                    throw new Error('每项必须是 40 位小写 commit');
                  }
                }
              }
            ]}
          >
            <Input.TextArea rows={3} maxLength={820} />
          </Form.Item>
          <Form.Item name="enterpriseBundleRange" label="Enterprise bundle 范围" rules={[{ required: true, whitespace: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="operatingSystems" label="操作系统" rules={[{ required: true, type: 'array', min: 1 }]}>
            <Select
              mode="multiple"
              options={[
                { value: 'darwin', label: 'macOS' },
                { value: 'linux', label: 'Linux' },
                { value: 'win32', label: 'Windows' }
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={assignmentEditor ? `分配与回滚 · ${assignmentEditor.packageName}` : '分配与回滚'}
        size={1120}
        open={Boolean(assignmentEditor)}
        onClose={() => setAssignmentEditor(undefined)}
        extra={<Button type="primary" loading={saving} onClick={() => void submitAssignments()}>保存分配</Button>}
      >
        {assignmentEditor && (
          <Form form={assignmentForm} layout="vertical">
            <AssignmentRows form={assignmentForm} pluginPackage={assignmentEditor} />
          </Form>
        )}
      </Drawer>
    </PageContainer>
  );
}
