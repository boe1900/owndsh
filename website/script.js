/**
 * [INPUT]: 依赖原生 DOM、ARIA tabs 与可选 Clipboard API，不请求外部服务。
 * [OUTPUT]: 渐进增强导航、键盘可操作的视角/安装 tabs 与复制状态反馈。
 * [POS]: 官网轻量交互层，真实内容和命令仍由 HTML 提供，失败时保留可读文本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
document.documentElement.classList.add('js');

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menu.hidden = false;
function closeMenu() {
  navigation.removeAttribute('data-open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', '打开导航');
  menu.title = '打开导航';
}
menu.addEventListener('click', () => {
  const open = navigation.toggleAttribute('data-open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
  menu.title = open ? '关闭导航' : '打开导航';
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navigation.hasAttribute('data-open')) {
    closeMenu();
    menu.focus();
  }
});

document.querySelectorAll('[data-tabs]').forEach((list) => {
  const tabs = [...list.querySelectorAll('button[data-panel]')];
  list.hidden = false;
  list.setAttribute('role', 'tablist');
  tabs.forEach((tab) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tab.dataset.panel);
    const panel = document.getElementById(tab.dataset.panel);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
  });
  const select = (selected) => {
    tabs.forEach((tab) => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.dataset.panel).hidden = !active;
    });
  };
  select(tabs[0]);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs.at(-1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (!next) return;
      event.preventDefault();
      select(next);
      next.focus();
    });
  });
});

const status = document.querySelector('.copy-status');
let statusTimer;
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      status.textContent = '命令已复制';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = '无法访问剪贴板，命令已选中，可手动复制';
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = '';
    }, 4000);
  });
});
