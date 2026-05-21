const tabs = requiredSelectorAll('[data-tool]');
const tools = requiredSelectorAll('.tool');
const statusEl = requiredSelector('#status');
const resultsEl = requiredSelector('.results');
const summaryEl = requiredSelector('#summary');
const sectionsEl = requiredSelector('#sections');
const rawEl = requiredSelector('#raw');
let activeTool = 'ip';
let currentRequestId = 0;
const resultsByTool = new Map();

for (const tab of tabs) {
  tab.addEventListener('click', () => switchTool(tab.dataset.tool));
}

requiredSelector('[data-form="ip"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ip = String(new FormData(event.currentTarget).get('ip') ?? '').trim();
  await requestJson('ip', ip ? `/api/ip?ip=${encodeURIComponent(ip)}` : '/api/ip');
});

requiredSelector('[data-form="dns"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
  await requestJson('dns', `/api/dns?name=${encodeURIComponent(name)}`);
});

requiredSelector('[data-form="rdap"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = String(new FormData(event.currentTarget).get('query') ?? '').trim();
  await requestJson('rdap', `/api/rdap?query=${encodeURIComponent(query)}`);
});

function switchTool(tool) {
  activeTool = tool;
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tool === tool));
  tools.forEach((panel) => panel.classList.toggle('is-active', panel.id === `tool-${tool}`));
  showToolResult(tool);
}

async function requestJson(tool, url) {
  activeTool = tool;
  const requestId = currentRequestId + 1;
  currentRequestId = requestId;

  renderLoading(tool);
  setStatus('querying...');
  const started = performance.now();

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (requestId !== currentRequestId || tool !== activeTool) return;

    resultsByTool.set(tool, json);
    render(json);

    if (!res.ok || json.ok === false) {
      setStatus(res.ok ? 'error' : `error · ${res.status}`, true);
      return;
    }

    setStatus(`${Math.round(performance.now() - started)}ms`);
  } catch (error) {
    if (requestId !== currentRequestId || tool !== activeTool) return;

    const json = {
      ok: false,
      error: {
        code: 'request_failed',
        message: error instanceof Error ? error.message : 'Request failed'
      }
    };
    resultsByTool.set(tool, json);
    render(json);
    setStatus('error', true);
  }
}

function render(json) {
  clearLoading();
  summaryEl.innerHTML = '';
  sectionsEl.innerHTML = '';

  const summary = json.ok ? json.summary : json.error;
  for (const [key, value] of Object.entries(summary ?? {})) {
    const div = document.createElement('div');
    div.className = 'kv';
    div.innerHTML = `<span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value ?? ''))}</strong>`;
    summaryEl.append(div);
  }

  for (const section of json.sections ?? []) {
    sectionsEl.append(renderSection(section));
  }

  rawEl.textContent = JSON.stringify(json.raw ?? json, null, 2);
}

function renderLoading(tool) {
  summaryEl.setAttribute('aria-busy', 'true');
  sectionsEl.setAttribute('aria-busy', 'true');

  if (resultsByTool.has(tool)) {
    resultsEl.classList.add('is-updating');
    return;
  }

  summaryEl.innerHTML = '';
  sectionsEl.innerHTML = '';
  rawEl.textContent = '';

  for (let index = 0; index < 4; index += 1) {
    summaryEl.append(createSkeleton('skeleton skeleton-kv'));
  }

  for (let index = 0; index < 3; index += 1) {
    const skeleton = createSkeleton('skeleton skeleton-card');
    sectionsEl.append(skeleton);
  }
}

function clearLoading() {
  summaryEl.removeAttribute('aria-busy');
  sectionsEl.removeAttribute('aria-busy');
  resultsEl.classList.remove('is-updating');
}

function createSkeleton(className) {
  const skeleton = document.createElement('div');
  skeleton.className = className;
  return skeleton;
}

function showToolResult(tool) {
  clearLoading();

  const cached = resultsByTool.get(tool);
  if (cached) {
    render(cached);
    setStatus('ready');
    return;
  }

  renderEmptyTool(tool);
  setStatus('ready');
}

function renderEmptyTool(tool) {
  summaryEl.innerHTML = '';
  sectionsEl.innerHTML = '';
  rawEl.textContent = '';

  const empty = document.createElement('section');
  empty.className = 'empty-panel';

  const title = document.createElement('h2');
  title.textContent = `No ${tool.toUpperCase()} result yet`;

  const copy = document.createElement('p');
  copy.textContent = 'Run a query to populate this view.';

  empty.append(title, copy);
  sectionsEl.append(empty);
}

function renderSection(section) {
  const article = document.createElement('article');
  article.className = 'section-card';

  const header = document.createElement('header');
  header.className = 'section-header';

  const title = document.createElement('h2');
  title.textContent = section.title;

  const count = getItemCount(section.data);
  const meta = document.createElement('span');
  meta.className = count > 0 ? 'section-count' : 'section-count is-empty';
  meta.textContent = count === 1 ? '1 item' : `${count} items`;

  header.append(title, meta);
  article.append(header);

  const content = document.createElement('div');
  content.className = 'section-content';

  if (Array.isArray(section.data)) {
    if (isDnsRecordList(section.data)) {
      content.append(renderDnsRecords(section.data));
    } else {
      content.append(renderRdapItems(section.data));
    }
  } else if (section.data && typeof section.data === 'object') {
    content.append(renderObjectGrid(section.data));
  } else {
    content.append(renderEmpty('No details returned.'));
  }

  article.append(content);
  return article;
}

function renderDnsRecords(records) {
  if (records.length === 0) return renderEmpty('No records found for this type.');

  const list = document.createElement('div');
  list.className = 'record-list';

  for (const record of records) {
    const item = document.createElement('div');
    item.className = 'record-row';

    const name = document.createElement('div');
    name.className = 'record-name';
    name.textContent = record.name ?? 'record';

    const data = document.createElement('code');
    data.className = 'record-data';
    data.textContent = record.data ?? '';

    const ttl = document.createElement('span');
    ttl.className = 'record-ttl';
    ttl.textContent = record.TTL ? `${record.TTL}s` : 'TTL unknown';

    item.append(name, data, ttl);
    list.append(item);
  }

  return list;
}

function renderRdapItems(items) {
  if (items.length === 0) return renderEmpty('No entries returned.');

  const list = document.createElement('div');
  list.className = 'rdap-list';

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      const value = document.createElement('div');
      value.className = 'rdap-item';
      value.textContent = String(item ?? '');
      list.append(value);
      continue;
    }

    const details = document.createElement('details');
    details.className = 'rdap-item';

    const summary = document.createElement('summary');
    summary.textContent = getRdapItemTitle(item);

    details.append(summary, renderObjectGrid(item));
    list.append(details);
  }

  return list;
}

function renderObjectGrid(value) {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '');
  if (entries.length === 0) return renderEmpty('No details returned.');

  const dl = document.createElement('dl');
  dl.className = 'detail-grid';

  for (const [key, entryValue] of entries) {
    const dt = document.createElement('dt');
    dt.textContent = formatLabel(key);

    const dd = document.createElement('dd');
    dd.append(renderValue(entryValue));

    dl.append(dt, dd);
  }

  return dl;
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return document.createTextNode('None');

    const list = document.createElement('ul');
    list.className = 'inline-list';
    for (const item of value) {
      const li = document.createElement('li');
      li.append(renderValue(item));
      list.append(li);
    }
    return list;
  }

  if (value && typeof value === 'object') {
    return renderObjectGrid(value);
  }

  const code = document.createElement('code');
  code.textContent = String(value ?? 'None');
  return code;
}

function renderEmpty(message) {
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = message;
  return empty;
}

function isDnsRecordList(items) {
  return items.some((item) => item && typeof item === 'object' && 'TTL' in item && 'data' in item);
}

function getItemCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value ? 1 : 0;
}

function getRdapItemTitle(item) {
  const candidate =
    item.eventAction ??
    item.ldhName ??
    item.unicodeName ??
    item.handle ??
    item.name ??
    item.objectClassName;

  if (candidate) return String(candidate);
  return 'Entry';
}

function formatLabel(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', isError);
}

function requiredSelector(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing required UI element: ${selector}`);
  return element;
}

function requiredSelectorAll(selector) {
  const elements = document.querySelectorAll(selector);
  if (elements.length === 0) throw new Error(`Missing required UI elements: ${selector}`);
  return elements;
}

requestJson('ip', '/api/ip');
