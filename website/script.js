/*
[INPUT]: 依赖 navigator.userAgentData / WebGL 渲染器做平台识别，api.github.com releases/latest 做最新版接管；HTML 钉住版本兜底。
[OUTPUT]: 提供两处同构三平台下载菜单的开关、当前平台置顶推荐与 GitHub Releases 最新版接管。
[POS]: 官网唯一脚本；无 JS 时按钮退化为 Releases 页外链。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/* 下载体验：hero 与员工卡两处同构的三平台弹出菜单（当前平台置顶推荐）+ GitHub Releases 最新版接管。
     HTML 钉住当前版本保底；无 JS 时按钮退化为 Releases 页外链，任何平台都能找到安装包。 */
(function () {
  var detected = null;

  // ── 平台识别：UAData 高熵架构 → WebGL 渲染器 → 不标记 ──
  function detect(cb) {
    var pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/win/i.test(pf)) return cb('win');
    if (!/mac/i.test(pf)) return cb(null);
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['architecture'])
        .then(function (v) { cb(v.architecture === 'arm' ? 'mac-arm' : 'mac-x64'); })
        .catch(function () { cb('mac-arm'); });
      return;
    }
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      cb(/intel|amd|radeon/i.test(r) ? 'mac-x64' : 'mac-arm');
    } catch (e) { cb('mac-arm'); }
  }
  // 推荐：菜单与下载带两处同步置顶 + 标记
  function mark(os) {
    detected = os;
    if (!os) return;
    var els = document.querySelectorAll('[data-os="' + os + '"]');
    Array.prototype.forEach.call(els, function (el) {
      el.classList.add('rec');
      var g = el.parentNode;
      if (g) g.insertBefore(el, g.firstChild);
    });
  }
  detect(mark);

  // ── 下载菜单开关（两处同构）：点击展开 / 外点与 Esc 收起 / 选中即下并收起 ──
  var pops = document.querySelectorAll('.dl-pop');
  function closeAll() {
    Array.prototype.forEach.call(pops, function (pop) {
      var m = pop.querySelector('.dl-menu'), t = pop.querySelector('.dl-toggle');
      if (m) m.hidden = true;
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }
  Array.prototype.forEach.call(pops, function (pop) {
    var toggle = pop.querySelector('.dl-toggle'), menu = pop.querySelector('.dl-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var open = menu.hidden;
      closeAll();
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) closeAll(); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.dl-pop')) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  // ── GitHub Releases 最新版接管（失败静默回退钉住版本）──
  var ASSET_RE = { 'mac-arm': /mac-arm64[^\s]*\.dmg$/i, 'mac-x64': /mac-x64[^\s]*\.dmg$/i, 'win': /win-x64[^\s]*\.exe$/i };
  fetch('https://api.github.com/repos/boe1900/owndsh-desktop/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !Array.isArray(rel.assets)) return;
      Object.keys(ASSET_RE).forEach(function (os) {
        var asset = null;
        for (var i = 0; i < rel.assets.length; i++) if (ASSET_RE[os].test(rel.assets[i].name)) { asset = rel.assets[i]; break; }
        if (!asset) return;
        var els = document.querySelectorAll('[data-os="' + os + '"]');
        Array.prototype.forEach.call(els, function (el) {
          el.href = asset.browser_download_url;
          var meta = el.querySelector('.dl-meta');
          if (meta) meta.textContent = '.' + asset.name.split('.').pop() + ' · ' + Math.round(asset.size / 1048576) + ' MB';
        });
      });
    })
    .catch(function () { /* 网络或限额失败：保持钉住版本 */ });
})();
