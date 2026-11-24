window.__ModuleLoader__.load({
  id: 'anban-harness-web',
  factory(require) {
    const React = require('react');
    const { createElement: h, useState } = React;
    const panelId = 'anban';
    const storageKey = 'anban-harness-web.endpoint';

    function isLoopback(hostname) {
      return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    }

    function defaultEndpoint() {
      const host = isLoopback(window.location.hostname) ? window.location.hostname : '127.0.0.1';
      return `http://${host}:8794/`;
    }

    function normalizeEndpoint(value) {
      try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash) return null;
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) return null;
        if (url.origin === window.location.origin) return null;
        if (!url.pathname.endsWith('/')) url.pathname += '/';
        return url.href;
      } catch {
        return null;
      }
    }

    function savedEndpoint() {
      try {
        return normalizeEndpoint(window.localStorage.getItem(storageKey)) ?? defaultEndpoint();
      } catch {
        return defaultEndpoint();
      }
    }

    function PanelIcon() {
      return h('span', { 'aria-hidden': true, style: { fontWeight: 700 } }, '安');
    }

    function AnbanPanel() {
      const [endpoint, setEndpoint] = useState(savedEndpoint);
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(endpoint);
      const [error, setError] = useState('');
      const [frameRevision, setFrameRevision] = useState(0);

      function save(event) {
        event.preventDefault();
        const url = normalizeEndpoint(draft.trim());
        if (!url) {
          setError('请输入 HTTPS 地址或本机 HTTP 地址，并使用与 Harness 不同的端口或站点。');
          return;
        }
        try {
          window.localStorage.setItem(storageKey, url);
        } catch {
          // The endpoint still works for this panel when storage is unavailable.
        }
        setEndpoint(url);
        setEditing(false);
        setError('');
      }

      return h('section', {
        'aria-label': '安伴',
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' },
      },
      h('header', {
        style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px' },
      },
      h('strong', { style: { marginInlineEnd: 'auto' } }, '安伴'),
      h('a', { href: endpoint, target: '_blank', rel: 'noopener noreferrer' }, '在新标签页打开'),
      h('button', { type: 'button', onClick: () => setFrameRevision(i => i + 1) }, '重新加载'),
      h('button', {
        type: 'button', 'aria-expanded': editing,
        onClick: () => { setDraft(endpoint); setError(''); setEditing(!editing); },
      }, '服务地址')),
      editing && h('form', {
        onSubmit: save,
        style: { display: 'grid', gap: 8, padding: '0 16px 12px' },
      },
      h('label', null, '安伴服务地址',
        h('input', { type: 'url', required: true, value: draft,
          onChange: event => setDraft(event.target.value),
          style: { display: 'block', color: 'inherit', background: 'transparent', width: '100%' } })),
      h('p', null, '请先启动安伴后端。本机默认端口为 8794。'),
      error && h('p', { role: 'alert' }, error),
      h('div', { style: { display: 'flex', gap: 10 } },
        h('button', { type: 'submit' }, '保存地址'),
        h('button', { type: 'button', onClick: () => setDraft(defaultEndpoint()) }, '使用本机地址'))),
      h('iframe', {
        key: endpoint + ':' + frameRevision,
        title: '安伴健康助手',
        src: endpoint,
        referrerPolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox',
        allow: 'autoplay; microphone',
        style: { display: 'block', border: 0, flex: '1 1 auto', minHeight: 0, width: '100%' },
      }));
    }

    function apply(ctx) {
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: panelId,
      }, AnbanPanel)), 'Anban main panel');
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: panelId, order: 30, label: () => '安伴',
      }, PanelIcon)), 'Anban sidebar entry');
    }

    return { inject: ['slots'], apply };
  },
});
