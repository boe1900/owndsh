/**
 * [INPUT]: 依赖 Umi Max、共享 Vite 环境解析与仓库唯一 enterprise OpenAPI 真源
 * [OUTPUT]: 提供管理端路由、构建代理及生成式 enterprise API 配置
 * [POS]: admin-web 的编译组合根，固定管理 PKCE 回调和协议生成入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resolve } from 'node:path';
import { defineConfig } from '@umijs/max';
import { createUmiAppConfig } from '../vite.config';

const appConfig = createUmiAppConfig();

export default defineConfig({
  title: appConfig.title,
  plugins: ['@umijs/max-plugin-openapi'],
  antd: {},
  access: {},
  model: {},
  initialState: {},
  vite: appConfig.vite,
  npmClient: 'pnpm',
  hash: true,
  esbuildMinifyIIFE: true,
  history: {
    type: 'browser'
  },
  base: appConfig.base,
  publicPath: appConfig.publicPath,
  routes: [
    { path: '/login', component: './login', layout: false },
    { path: '/enterprise/auth/callback', component: './enterprise/auth/callback', layout: false },
    { path: '/register', component: './register', layout: false },
    { path: '/social-callback', component: './socialCallback', layout: false },
    { path: '/401', component: './error/401', layout: false },
    { path: '/404', component: './error/404', layout: false },
    { path: '/redirect/*', component: './redirect', layout: false },
    {
      path: '/',
      component: '../layouts/BasicLayout',
      routes: [
        { path: '/', redirect: '/index' },
        { path: '/index', component: './index' },
        { path: '/user/profile', component: './system/user/profile' },
        { path: '*', component: './dynamicPage' }
      ]
    }
  ],
  openAPI: {
    projectName: 'enterprise',
    schemaPath: resolve(process.cwd(), '../contracts/generated/enterprise-openapi.json'),
    requestLibPath: '@/api/enterprise/generated-request'
  },
  proxy: appConfig.proxy
});
