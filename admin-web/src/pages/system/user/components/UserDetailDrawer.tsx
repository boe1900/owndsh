/**
 * [INPUT]: 依赖 RuoYi 用户详情、企业外部身份摘要 API 与当前 ent:identity:read 权限
 * [OUTPUT]: 提供用户基础事实、角色/部门和脱敏外部身份绑定详情抽屉
 * [POS]: system/user/components 的只读详情视图，不展示 groups、claims、Token 或凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ProDescriptions } from '@ant-design/pro-components';
import { useRequest } from 'ahooks';
import { Divider, Drawer, Switch, Table, Tag } from 'antd';
import { useEffect, useMemo } from 'react';
import type { DictData } from '@/api/system/dict/data/types';
import { getUserExternalIdentitySummary, type ExternalIdentitySummary } from '@/api/enterprise/identity';
import { getUser } from '@/api/system/user';
import { useUserStore } from '@/stores/userStore';
import { hasPermi } from '@/utils/permission';

interface UserDetailDrawerProps {
  open: boolean;
  userId?: string | number;
  genderOptions?: DictData[];
  onClose: () => void;
}

export default function UserDetailDrawer({ open, userId, genderOptions, onClose }: UserDetailDrawerProps) {
  const { data, loading, runAsync: loadUser, mutate } = useRequest(getUser, { manual: true });
  const userInfo = useUserStore(state => state.userInfo);
  const canReadIdentity = hasPermi(userInfo, ['ent:identity:read']);
  const {
    data: identityData,
    loading: identityLoading,
    runAsync: loadIdentities,
    mutate: mutateIdentities
  } = useRequest(getUserExternalIdentitySummary, { manual: true });

  useEffect(() => {
    if (open && userId) {
      loadUser(userId);
      if (canReadIdentity) loadIdentities({ userId: String(userId) });
    }
  }, [canReadIdentity, loadIdentities, loadUser, open, userId]);

  const user = data?.data.user;
  const postIds = useMemo(() => (data?.data.postIds || []).map(String), [data?.data.postIds]);
  const roleIds = useMemo(() => (data?.data.roleIds || []).map(String), [data?.data.roleIds]);
  const postNames = (data?.data.posts || [])
    .filter(post => postIds.includes(String(post.postId)))
    .map(post => post.postName)
    .join('、');
  const roleNames = (data?.data.roles || [])
    .filter(role => roleIds.includes(String(role.roleId)))
    .map(role => role.roleName)
    .join('、');
  const genderDisplay = genderOptions?.find(item => item.dictValue === user?.gender)?.dictLabel || '-';

  const closeDrawer = () => {
    onClose();
    mutate(undefined);
    mutateIdentities(undefined);
  };

  return (
    <Drawer title="用户信息详情" open={open} size={680} onClose={closeDrawer} destroyOnHidden>
      <ProDescriptions
        loading={loading}
        column={2}
        bordered
        dataSource={{
          ...user,
          deptDisplay: user?.deptName || user?.dept?.deptName || '-',
          statusDisplay: user?.status === '0' ? '正常' : '停用',
          postNames: postNames || '-',
          roleNames: roleNames || '-',
          genderDisplay
        }}
        columns={[
          { title: '用户名称', dataIndex: 'nickName' },
          { title: '归属部门', dataIndex: 'deptDisplay' },
          { title: '手机号码', dataIndex: 'phoneNumber' },
          { title: '邮箱', dataIndex: 'email' },
          { title: '登录账号', dataIndex: 'userName' },
          {
            title: '用户状态',
            dataIndex: 'statusDisplay',
            render: (_, record) => (
              <Switch checked={record.status === '0'} checkedChildren="正常" unCheckedChildren="停用" disabled />
            )
          },
          { title: '岗位', dataIndex: 'postNames' },
          { title: '用户性别', dataIndex: 'genderDisplay' },
          { title: '角色', dataIndex: 'roleNames', span: 2 }
        ]}
      />
      <Divider />
      {canReadIdentity && (
        <>
          <Table<ExternalIdentitySummary>
            rowKey="sourceId"
            size="small"
            pagination={false}
            loading={identityLoading}
            dataSource={identityData?.data || []}
            locale={{ emptyText: '未绑定外部身份' }}
            columns={[
              { title: '身份源', dataIndex: 'sourceName' },
              { title: '类型', dataIndex: 'sourceType', width: 90, render: value => <Tag>{value}</Tag> },
              { title: 'External Subject', dataIndex: 'externalSubject', ellipsis: true },
              {
                title: '最后登录',
                dataIndex: 'lastLoginAt',
                width: 180,
                render: value => (value ? new Date(value).toLocaleString() : '-')
              }
            ]}
          />
          <Divider />
        </>
      )}
      <ProDescriptions
        column={2}
        bordered
        dataSource={user}
        columns={[
          { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime' },
          { title: '更新时间', dataIndex: 'updateTime', valueType: 'dateTime' },
          { title: '最后登录IP', dataIndex: 'loginIp' },
          { title: '最后登录时间', dataIndex: 'loginDate', valueType: 'dateTime' },
          { title: '备注', dataIndex: 'remark', span: 2 }
        ]}
      />
    </Drawer>
  );
}
