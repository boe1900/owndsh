/**
 * [INPUT]: 依赖严格 audit API facade、Ant Design 表单/表格/抽屉与企业 cursor 状态机
 * [OUTPUT]: 提供 actor/action/resource/result/reason/requestId/时间筛选和 metadata 查看页面
 * [POS]: pages/enterprise/audit 的只读管理入口，不接触 IP/user-agent hash 或任意 metadata
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, Select, Space, Table, Tag, Typography, type TableColumnsType } from 'antd';
import type { Dayjs } from 'dayjs';
import { useCallback, useState } from 'react';
import { AUDIT_ACTIONS, listAuditEvents, type AuditAction, type AuditEvent, type AuditFilters, type AuditResult } from '@/api/enterprise/audit';
import { useCursorData } from '../shared/useCursorData';

interface FilterForm {
  actorId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  reasonCode?: string;
  requestId?: string;
  timeRange?: [Dayjs, Dayjs];
}

function normalized(value?: string) {
  const text = value?.trim();
  return text ? text : undefined;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}

export default function AuditPage() {
  const [form] = Form.useForm<FilterForm>();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selected, setSelected] = useState<AuditEvent>();
  const loader = useCallback(
    async (cursor?: string) => (await listAuditEvents(filters, cursor, 50)).data,
    [filters]
  );
  const events = useCursorData(loader);

  const applyFilters = (values: FilterForm) => {
    setFilters({
      actorId: normalized(values.actorId),
      action: values.action,
      resourceType: normalized(values.resourceType)?.toUpperCase(),
      resourceId: normalized(values.resourceId),
      result: values.result,
      reasonCode: normalized(values.reasonCode)?.toUpperCase(),
      requestId: normalized(values.requestId),
      from: values.timeRange?.[0].toISOString(),
      to: values.timeRange?.[1].toISOString()
    });
  };

  const columns: TableColumnsType<AuditEvent> = [
    { title: '时间', dataIndex: 'occurredAt', width: 180, render: dateTime },
    {
      title: 'Actor', width: 150,
      render: (_, event) => `${event.actorType}${event.actorId ? ` · ${event.actorId}` : ''}`
    },
    { title: 'Action', dataIndex: 'action', width: 230, render: value => <Tag>{value}</Tag> },
    {
      title: 'Resource', width: 230,
      render: (_, event) => (
        <Space orientation="vertical" size={0}>
          <span>{event.resourceType}</span>
          <span className="enterprise-secondary enterprise-monospace">{event.resourceId}</span>
        </Space>
      )
    },
    {
      title: '结果', dataIndex: 'result', width: 100,
      render: value => <Tag color={value === 'SUCCESS' ? 'green' : 'red'}>{value}</Tag>
    },
    { title: 'Reason', dataIndex: 'reasonCode', width: 180, render: value => value || '-' },
    {
      title: 'Request ID', dataIndex: 'requestId', width: 300,
      render: value => <Typography.Text code copyable>{value}</Typography.Text>
    },
    {
      title: '操作', width: 110,
      render: (_, event) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setSelected(event)}>
          Metadata
        </Button>
      )
    }
  ];

  const metadataItems = selected
    ? Object.entries(selected.metadata).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({
        key,
        label: key,
        children: (
          <Typography.Text className="enterprise-monospace" style={{ overflowWrap: 'anywhere' }}>
            {String(value)}
          </Typography.Text>
        )
      }))
    : [];

  return (
    <PageContainer
      title="审计"
      extra={<Button icon={<ReloadOutlined />} loading={events.loading} onClick={events.reload}>刷新</Button>}
    >
      <Form form={form} layout="inline" onFinish={applyFilters} className="enterprise-filter-form">
        <Form.Item name="actorId" label="Actor ID"><Input allowClear inputMode="numeric" /></Form.Item>
        <Form.Item name="action" label="Action">
          <Select allowClear showSearch style={{ width: 230 }} options={AUDIT_ACTIONS.map(value => ({ value }))} />
        </Form.Item>
        <Form.Item name="resourceType" label="资源类型"><Input allowClear /></Form.Item>
        <Form.Item name="resourceId" label="资源 ID"><Input allowClear /></Form.Item>
        <Form.Item name="result" label="结果">
          <Select allowClear style={{ width: 120 }} options={[{ value: 'SUCCESS' }, { value: 'FAILURE' }]} />
        </Form.Item>
        <Form.Item name="reasonCode" label="Reason"><Input allowClear /></Form.Item>
        <Form.Item name="requestId" label="Request ID"><Input allowClear style={{ width: 280 }} /></Form.Item>
        <Form.Item name="timeRange" label="时间"><DatePicker.RangePicker showTime /></Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
            <Button onClick={() => { form.resetFields(); setFilters({}); }}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={events.items}
        loading={events.loading}
        pagination={false}
        scroll={{ x: 1500 }}
        footer={events.hasMore ? () => <Button block onClick={events.loadMore}>加载更多</Button> : undefined}
      />
      <Drawer
        title={selected ? `${selected.action} Metadata` : 'Metadata'}
        open={selected !== undefined}
        size={560}
        destroyOnHidden
        onClose={() => setSelected(undefined)}
      >
        {selected && metadataItems.length > 0 ? (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={metadataItems}
            styles={{ label: { width: 170 }, content: { minWidth: 0, overflowWrap: 'anywhere' } }}
          />
        ) : <Empty description="无附加 metadata" />}
      </Drawer>
    </PageContainer>
  );
}
