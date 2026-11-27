/**
 * [INPUT]: 依赖 React、OwnDsh 品牌资源与 coss UI Button/ToggleGroup 主题切换器。
 * [OUTPUT]: 提供登录、账号授权与返回应用页面共用的双栏品牌布局和原生 coss 深浅主题切换控件。
 * [POS]: auth 的纯呈现外壳，页面各自拥有认证状态，不复制凭据表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Moon, Sun } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bui-theme') !== 'light';
    } catch {
      return typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true;
    }
  });

  useEffect(() => {
    try {
      setDark(localStorage.getItem('bui-theme') !== 'light');
    } catch {
      setDark(document.documentElement.classList.contains('dark'));
    }
  }, []);

  function apply(next: boolean) {
    if (next === dark) return;
    setDark(next);
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.classList.toggle('dark', next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
    try {
      localStorage.setItem('bui-theme', next ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }

  return (
    <ToggleGroup
      aria-label="主题切换"
      size="sm"
      variant="outline"
      value={[dark ? 'dark' : 'light']}
      onValueChange={(values) => {
        const next = values[0];
        if (next === 'light') apply(false);
        else if (next === 'dark') apply(true);
      }}
    >
      <ToggleGroupItem aria-label="Light mode" title="浅色模式" value="light">
        <Sun aria-hidden className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem aria-label="Dark mode" title="深色模式" value="dark">
        <Moon aria-hidden className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[100dvh] bg-background text-foreground lg:grid-cols-2">
      <section className="relative hidden flex-col overflow-hidden bg-[#081523] p-10 text-white lg:flex">
        <img
          src="/owndsh-whale-bg-navy.png"
          alt=""
          className="login-brand-art pointer-events-none absolute inset-0 size-full object-cover object-center"
        />
        <div aria-hidden className="login-brand-grid pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex items-center gap-2 text-[15px] font-semibold">
          <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="size-[22px] rounded-[6px] object-cover ring-1 ring-white/10" />
          OwnDsh
        </div>
        <div className="relative z-10 my-auto max-w-[560px]">
          <h2 className="text-balance text-[34px] font-semibold leading-[1.18]">
            OwnDsh · Truly Own Your DeepSeek-Harness.
          </h2>
          <p className="mt-5 text-[15px] italic leading-6 text-white/65">
            The Self-Hosted Control Plane for DeepSeek-Harness.
          </p>
          <div className="mt-8 space-y-1 text-[17px] leading-7 text-white/85">
            <p>真正拥有属于你的 DeepSeek-Harness。</p>
            <p>DeepSeek-Harness 的私有化控制面。</p>
          </div>
        </div>
        <div className="relative z-10 text-white/55">
          <p className="text-[13px] font-medium">OwnDsh</p>
          <p className="mt-1 text-[16px] font-medium text-white/75">企业账号</p>
        </div>
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center px-6 py-16 lg:p-8">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="flex w-full max-w-[410px] flex-col">
          <div className="mb-8 flex items-center justify-center gap-2 text-[14px] font-semibold lg:hidden">
            <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="size-5 rounded-[6px] object-cover" />
            OwnDsh
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
