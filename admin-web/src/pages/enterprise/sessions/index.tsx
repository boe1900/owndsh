/**
 * [INPUT]: 依赖 Session API facade、RuoYi 权限事实与企业 cursor 状态机
 * [OUTPUT]: 提供管理 Session metadata 列表、分页正文时间线和 ACTIVE tombstone 删除页面
 * [POS]: pages/enterprise/sessions 的管理入口，正文权限独立裁剪且浏览器只保存解码后的最小事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  message,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
  type TableColumnsType
} from 'antd';
import { useCallback, useState } from 'react';
import {
  deleteAdminSession,
  listAdminSessions,
  readAdminSessionContent,
  type AdminSession,
  type AdminSessionContentPage,
  type AdminSessionEvent
} from '@/api/enterprise/session';
import { isHandledRequestError } from '@/api/request';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';
import { useCursorData } from '../shared/useCursorData';

const CONTENT_PAGE_SIZE = 100;

const statusColors: Record<AdminSession['status'], string> = {
  ACTIVE: 'green',
  DELETED: 'default',
  EXPIRED: 'gold'
};

interface EventPresentation {
  color: string;
  title: string;
  recognized: boolean;
}

function dateTime(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}

function eventPresentation(type: string): EventPresentation {
  if (type === 'user/message') return { color: 'green', title: '用户消息', recognized: true };
  if (type === 'assistant/message') return { color: 'blue', title: '助手消息', recognized: true };
  if (type === 'tool/call') return { color: 'purple', title: '工具调用', recognized: true };
  if (type === 'tool/result') return { color: 'gold', title: '工具结果', recognized: true };
  if (type.startsWith('turn/')) return { color: 'gray', title: 'Turn 生命周期', recognized: true };
  if (type.startsWith('step/')) return { color: 'cyan', title: 'Step 生命周期', recognized: true };
  return { color: 'red', title: '当前管理端未识别', recognized: false };
}

function messageContent(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const content = (data as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : undefined;
}

function EventBody({ event }: { event: AdminSessionEvent }) {
  const presentation = eventPresentation(event.type);
  const content = messageContent(event.data);
  const json = JSON.stringify(event.data, null, 2) ?? 'null';
  return (
    <div>
      <Space wrap>
        <Tag color={presentation.color}>{presentation.title}</Tag>
        <Typography.Text code>{event.type}</Typography.Text>
        <Typography.Text type="secondary">seq {event.seq} · {dateTime(event.time)}</Typography.Text>
      </Space>
      {content === undefined ? null : (
        <Typography.Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{content}</Typography.Paragraph>
      )}
      {presentation.recognized && content !== undefined ? null : (
        <Collapse
          ghost
          size="small"
          items={[{
            key: 'json',
            label: presentation.recognized ? '查看事件 JSON' : '展开经授权返回的 JSON',
            children: <pre className="enterprise-monospace" style={{ margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{json}</pre>
          }]}
        />
      )}
    </div>
  );
}

function reportUnhandled(error: unknown, fallback: string) {
  if (!isHandledRequestError(error)) message.error(fallback);
}

export default function SessionsPage() {
  const userInfo = useUserStore(state => state.userInfo);
  const canReadContent = hasPermi(userInfo, ['ent:session:content:read']);
  const canDelete = hasPermi(userInfo, ['ent:session:delete']);
  const [selected, setSelected] = useState<AdminSession>();
  const [content, setContent] = useState<AdminSessionContentPage>();
  const [events, setEvents] = useState<readonly AdminSessionEvent[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const loadSessions = useCallback(
    async (cursor?: string) => (await listAdminSessions({ cursor, limit: 50 })).data,
    []
  );
  const sessions = useCursorData(loadSessions);

  const loadContent = async (session: AdminSession, fromSeq = 0, append = false) => {
    setContentLoading(true);
    try {
      const page = await readAdminSessionContent(session.replicaId, fromSeq, CONTENT_PAGE_SIZE);
      setContent(page);
      setEvents(current => (append ? [...current, ...page.events] : page.events));
    } catch (error) {
      reportUnhandled(error, 'Session 正文读取失败');
    } finally {
      setContentLoading(false);
    }
  };

  const openContent = (session: AdminSession) => {
    setSelected(session);
    setContent(undefined);
    setEvents([]);
    void loadContent(session);
  };

  const remove = async (session: AdminSession) => {
    try {
      await deleteAdminSession(session.replicaId);
      message.success('Session 已删除');
      if (selected?.replicaId === session.replicaId) setSelected(undefined);
      await sessions.reload();
    } catch (error) {
      reportUnhandled(error, 'Session 删除失败');
    }
  };

  const columns: TableColumnsType<AdminSession> = [
    {
      title: 'Owner',
      width: 180,
      render: (_, session) => (
        <Space orientation="vertical" size={0}>
          <span>{session.ownerUsername}</span>
          <span className="enterprise-secondary enterprise-monospace">{session.ownerUserId}</span>
        </Space>
      )
    },
    {
      title: '设备',
      width: 190,
      render: (_, session) => (
        <Space orientation="vertical" size={0}>
          <span>{session.sourceDeviceName}</span>
          <span className="enterprise-secondary enterprise-monospace">{session.sourceDeviceId}</span>
        </Space>
      )
    },
    {
      title: 'Session',
      render: (_, session) => (
        <Space orientation="vertical" size={0}>
          <span className="enterprise-monospace">{session.sessionId}</span>
          <span className="enterprise-secondary">标题需正文权限后查看</span>
        </Space>
      )
    },
    { title: 'Format', dataIndex: 'formatVersion', width: 80, render: value => `v${value}` },
    { title: '事件数', dataIndex: 'eventCount', width: 90 },
    { title: '最后同步', dataIndex: 'updatedAt', width: 180, render: dateTime },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: AdminSession['status']) => <Tag color={statusColors[status]}>{status}</Tag>
    },
    {
      title: '操作',
      width: 170,
      render: (_, session) => (
        <Space size={0}>
          {canReadContent ? (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openContent(session)}>
              查看正文
            </Button>
          ) : null}
          {canDelete && session.status === 'ACTIVE' ? (
            <Popconfirm
              title="确认删除该 Session？"
              description="删除后形成 tombstone，源设备不会自动重传。"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(session)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          ) : null}
          {!canReadContent && !(canDelete && session.status === 'ACTIVE') ? '-' : null}
        </Space>
      )
    }
  ];

  return (
    <PageContainer
      title="Session"
      extra={<Button icon={<ReloadOutlined />} loading={sessions.loading} onClick={sessions.reload}>刷新</Button>}
    >
      <Table
        rowKey="replicaId"
        columns={columns}
        dataSource={sessions.items}
        loading={sessions.loading}
        pagination={false}
        scroll={{ x: 1250 }}
        footer={sessions.hasMore ? () => <Button block onClick={sessions.loadMore}>加载更多</Button> : undefined}
      />
      <Drawer
        title={content?.title || selected?.sessionId || 'Session 正文'}
        open={selected !== undefined}
        size="large"
        destroyOnHidden
        onClose={() => setSelected(undefined)}
      >
        {content === undefined && contentLoading ? <Spin /> : null}
        {content === undefined && !contentLoading ? <Empty description="暂无正文" /> : null}
        {content === undefined ? null : (
          <>
            <Descriptions
              size="small"
              column={2}
              items={[
                { key: 'id', label: 'Session ID', children: content.sessionId, span: 2 },
                { key: 'cwd', label: '工作目录', children: content.header.cwd || '-' },
                { key: 'range', label: '已读取范围', children: `${events[0]?.seq ?? 0} - ${events.at(-1)?.seq ?? 0}` }
              ]}
            />
            <Timeline
              style={{ marginTop: 24 }}
              items={events.map(event => ({ key: event.seq, content: <EventBody event={event} /> }))}
            />
            {events.length === 0 ? <Empty description="Session 没有事件" /> : null}
            {content.hasMore && selected !== undefined ? (
              <Button
                block
                loading={contentLoading}
                onClick={() => void loadContent(selected, content.toSeq + 1, true)}
              >
                加载更多正文
              </Button>
            ) : null}
          </>
        )}
      </Drawer>
    </PageContainer>
  );
}
