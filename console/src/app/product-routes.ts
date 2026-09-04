/**
 * [INPUT]: 依赖 OpenAPI 固定角色类型与 Lucide 免费图标。
 * [OUTPUT]: 提供五个导航页面、隐藏用户中心的静态元数据、路径判断和多角色页面并集。
 * [POS]: app 的唯一控制台路由与前端页面可见性真源，Server ent:* 权限仍独立裁决 API。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Activity, Boxes, CircleUserRound, Puzzle, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import type { AuthBuiltInRole } from '@/api/generated/types.gen';

type ProductRouteDefinition = {
  to: '/' | '/access' | '/plugins' | '/members' | '/activity';
  label: string;
  icon: LucideIcon;
  allowedRoles: readonly AuthBuiltInRole[];
};

export const PRODUCT_ROUTES = [
  { to: '/', label: '模型', icon: Boxes, allowedRoles: ['enterprise_admin', 'model_admin'] },
  { to: '/access', label: '访问策略', icon: ShieldCheck, allowedRoles: ['enterprise_admin', 'model_admin'] },
  { to: '/plugins', label: '插件', icon: Puzzle, allowedRoles: ['enterprise_admin', 'plugin_admin'] },
  { to: '/members', label: '成员', icon: Users, allowedRoles: ['enterprise_admin'] },
  { to: '/activity', label: '活动记录', icon: Activity, allowedRoles: ['enterprise_admin', 'model_admin', 'plugin_admin', 'auditor'] }
] as const satisfies readonly ProductRouteDefinition[];

export const ACCOUNT_ROUTE = { to: '/account', label: '用户中心', icon: CircleUserRound } as const;
export const CONSOLE_ROUTES = [...PRODUCT_ROUTES, ACCOUNT_ROUTE] as const;

export type ProductRoute = (typeof CONSOLE_ROUTES)[number]['to'];

export function isProductRoute(pathname: string): pathname is ProductRoute {
  return CONSOLE_ROUTES.some((route) => route.to === pathname);
}

export function isAccountRoute(pathname: string) {
  return pathname === ACCOUNT_ROUTE.to || pathname === `${ACCOUNT_ROUTE.to}/security`;
}

export function productRoutesFor(roles: readonly AuthBuiltInRole[]) {
  return PRODUCT_ROUTES.filter((route) => route.allowedRoles.some((role) => roles.includes(role)));
}
