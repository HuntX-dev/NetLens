const tabs = requiredSelectorAll('[data-tool]');
const tools = requiredSelectorAll('.tool');
const statusEl = requiredSelector('#status');
const summaryEl = requiredSelector('#summary');
const sectionsEl = requiredSelector('#sections');
const rawEl = requiredSelector('#raw');

for (const tab of tabs) {
  tab.addEventListener('click', () => switchTool(tab.dataset.tool));
}

requiredSelector('[data-form="ip"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ip = String(new FormData(event.currentTarget).get('ip') ?? '').trim();
  await requestJson(ip ? `/api/ip?ip=${encodeURIComponent(ip)}` : '/api/ip');
});

requiredSelector('[data-form="dns"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
  await requestJson(`/api/dns?name=${encodeURIComponent(name)}`);
});

requiredSelector('[data-form="rdap"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = String(new FormData(event.currentTarget).get('query') ?? '').trim();
  await requestJson(`/api/rdap?query=${encodeURIComponent(query)}`);
});

function switchTool(tool) {
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tool === tool));
  tools.forEach((panel) => panel.classList.toggle('is-active', panel.id === `tool-${tool}`));
}

async function requestJson(url) {
  setStatus('loading');
  const started = performance.now();

  try {
    const res = await fetch(url);
    const json = await res.json();
    render(json);

    if (!res.ok || json.ok === false) {
      setStatus(res.ok ? 'error' : `error · ${res.status}`, true);
      return;
    }

    setStatus(`${Math.round(performance.now() - started)}ms`);
  } catch (error) {
    render({
      ok: false,
      error: {
        code: 'request_failed',
        message: error instanceof Error ? error.message : 'Request failed'
      }
    });
    setStatus('error', true);
  }
}

function render(json) {
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
    const pre = document.createElement('pre');
    pre.className = 'raw';
    pre.textContent = `${section.title}\n${JSON.stringify(section.data, null, 2)}`;
    sectionsEl.append(pre);
  }

  rawEl.textContent = JSON.stringify(json.raw ?? json, null, 2);
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

requestJson('/api/ip');
