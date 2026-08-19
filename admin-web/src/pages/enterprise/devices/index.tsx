/**
 * [INPUT]: 依赖设备业务 API、服务端 cursor、heartbeat 脱敏摘要、RuoYi 权限事实与 revision 冲突恢复
 * [OUTPUT]: 提供企业设备清单、插件/同步摘要和单设备撤销操作
 * [POS]: pages/enterprise 的设备治理工作台，不在浏览器推断 owner 或有效会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { StopOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Popconfirm, Space, Table, Tag, Tooltip, type TableColumnsType } from 'antd';
import { useCallback } from 'react';
import { listDevices, revokeDevice, type EnterpriseDevice } from '@/api/enterprise/device';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { recoverRevisionConflict } from '../shared/revision';
import { useCursorData } from '../shared/useCursorData';

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function DevicesPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canRevoke = hasPermi(userInfo, ['ent:device:revoke']);
  const loadDevices = useCallback(async (cursor?: string) => (await listDevices({ cursor, limit: 50 })).data, []);
  const devices = useCursorData(loadDevices);

  const columns: TableColumnsType<EnterpriseDevice> = [
    {
      title: '用户',
      render: (_, device) => (
        <Space direction="vertical" size={0}>
          <span>{device.displayName}</span>
          <span className="enterprise-secondary">{device.username}</span>
        </Space>
      )
    },
    {
      title: '设备',
      render: (_, device) => (
        <Space direction="vertical" size={0}>
          <span>{device.name}</span>
          <Tooltip title={device.installationId}>
            <span className="enterprise-monospace">{device.installationId}</span>
          </Tooltip>
        </Space>
      )
    },
    { title: '平台', dataIndex: 'platform', width: 120 },
    { title: 'Harness', dataIndex: 'harnessVersion', width: 120, render: value => value || '-' },
    { title: 'Bundle', dataIndex: 'enterpriseBundleVersion', width: 120, render: value => value || '-' },
    {
      title: '插件摘要',
      width: 180,
      render: (_, device) => (
        <Space direction="vertical" size={0}>
          <span>期望 revision {device.desiredRevision}</span>
          {device.pluginInventoryDigest ? (
            <Tooltip title={device.pluginInventoryDigest}>
              <span className="enterprise-monospace">{device.pluginInventoryDigest.slice(0, 12)}...</span>
            </Tooltip>
          ) : (
            <span className="enterprise-secondary">尚未上报</span>
          )}
        </Space>
      )
    },
    {
      title: '同步摘要',
      width: 190,
      render: (_, device) => (
        <Space direction="vertical" size={0}>
          <span>待同步 {device.pendingSessionEvents}</span>
          <span className="enterprise-secondary">成功：{dateTime(device.lastSuccessfulSyncAt)}</span>
        </Space>
      )
    },
    { title: '最后在线', dataIndex: 'lastSeenAt', width: 180, render: dateTime },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: status => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
    },
    {
      title: '操作',
      width: 100,
      render: (_, device) =>
        canRevoke && device.status === 'ACTIVE' ? (
          <Popconfirm
            title={`确认撤销设备“${device.name}”？`}
            onConfirm={async () => {
              try {
                await revokeDevice(device.id, device.revision);
                await devices.reload();
              } catch (error) {
                await recoverRevisionConflict(error, devices.reload);
              }
            }}
          >
            <Button type="link" danger size="small" icon={<StopOutlined />}>
              撤销
            </Button>
          </Popconfirm>
        ) : (
          '-'
        )
    }
  ];

  return (
    <PageContainer title="设备">
      <Table
        rowKey="id"
        columns={columns}
        dataSource={devices.items}
        loading={devices.loading}
        pagination={false}
        scroll={{ x: 1500 }}
        footer={
          devices.hasMore
            ? () => (
                <Button block onClick={devices.loadMore}>
                  加载更多
                </Button>
              )
            : undefined
        }
      />
    </PageContainer>
  );
}
