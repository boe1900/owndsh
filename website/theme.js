/*
[INPUT]: 依赖 localStorage（键 owndsh-theme）与 matchMedia 系统偏好；消费 styles.css 的 html.dark token 组。
[OUTPUT]: head 同步执行的主题初始化（防首帧闪烁）与顶栏三态循环按钮（自动→亮→暗），偏好持久化。
[POS]: 官网唯一主题真源；无 JS 时回退浅色。CSP 下为同源外链脚本，head 内同步加载。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
(function () {
  var KEY = 'owndsh-theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var LABELS = { auto: '主题：自动（跟随系统）', light: '主题：浅色', dark: '主题：深色' };

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} }
  function isDark(mode) { return mode === 'dark' || (mode !== 'light' && !!mq && mq.matches); }

  function apply(mode) {
    document.documentElement.classList.toggle('dark', isDark(mode));
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('title', LABELS[mode]);
    btn.setAttribute('aria-label', LABELS[mode]);
    ['auto', 'light', 'dark'].forEach(function (m) {
      var icon = document.getElementById('theme-icon-' + m);
      if (icon) icon.hidden = m !== mode;
    });
  }

  var mode = stored() === 'light' || stored() === 'dark' ? stored() : 'auto';
  apply(mode);

  // 自动模式下系统切换实时跟随
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (mode === 'auto') apply(mode); });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      mode = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
      save(mode === 'auto' ? null : mode);
      apply(mode);
    });
    apply(mode);
  });
})();
