import type { FastifyInstance } from 'fastify';

const dashboardHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Vagas Agent</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #eef2ff; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    .muted { color: #9aa4bf; }
    .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin: 18px 0 24px; }
    input, button { border:1px solid #29324a; background:#11182b; color:#eef2ff; border-radius:10px; padding:10px 12px; }
    input { min-width: 280px; flex:1; }
    button { cursor:pointer; font-weight:700; }
    button:hover { background:#17213a; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; }
    .card { background:#11182b; border:1px solid #222b42; border-radius:14px; padding:16px; }
    .value { font-size:28px; font-weight:800; margin-top:8px; }
    section { margin-top:24px; }
    table { width:100%; border-collapse:collapse; background:#11182b; border-radius:14px; overflow:hidden; }
    th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #222b42; vertical-align:top; }
    th { color:#aeb8d4; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
    .ok { color:#7ee787; }
    .warn { color:#f2cc60; }
    .bad { color:#ff7b72; }
    .hidden { display:none; }
    code { color:#c9d1ff; }
  </style>
</head>
<body>
<main>
  <h1>Job Application Agent</h1>
  <div class="muted">Painel local da Fase 3</div>

  <div class="bar">
    <input id="apiKey" type="password" autocomplete="off" placeholder="X-Admin-Key" />
    <button id="saveKey">Salvar chave</button>
    <button id="refresh">Atualizar</button>
    <span id="status" class="muted">Aguardando chave</span>
  </div>

  <div id="cards" class="grid"></div>

  <section>
    <h2>Readiness</h2>
    <div id="readiness" class="card muted">Sem dados.</div>
  </section>

  <section>
    <h2>Candidaturas READY</h2>
    <table>
      <thead><tr><th>Vaga</th><th>Empresa</th><th>Score</th><th>Pacote</th><th>Ações</th><th>Atualizado</th></tr></thead>
      <tbody id="applications"><tr><td colspan="6" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>

  <section>
    <h2>Coletas recentes</h2>
    <table>
      <thead><tr><th>Fonte</th><th>Status</th><th>Encontradas</th><th>Inseridas</th><th>Erros</th><th>Início</th></tr></thead>
      <tbody id="runs"><tr><td colspan="6" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>
</main>
<script>
  const keyInput = document.getElementById('apiKey');
  const statusEl = document.getElementById('status');
  keyInput.value = sessionStorage.getItem('vagas-admin-key') || '';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function request(path, options = {}) {
    const key = sessionStorage.getItem('vagas-admin-key') || keyInput.value;
    const headers = { ...(options.headers || {}), ...(key ? { 'X-Admin-Key': key } : {}) };
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      let message = response.statusText;
      try { message = (await response.json()).message || message; } catch {}
      throw new Error(response.status + ' ' + message);
    }
    return response;
  }

  async function api(path, options = {}) {
    return (await request(path, options)).json();
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch { return null; }
  }

  function card(label, value, cls='') {
    return '<div class="card"><div class="muted">' + esc(label) + '</div><div class="value ' + cls + '">' + esc(value) + '</div></div>';
  }
  async function refresh() {
    statusEl.textContent = 'Carregando...';
    statusEl.className = 'muted';
    try {
      const [health, stats, readiness, applications, runs] = await Promise.all([
        api('/health'),
        api('/stats'),
        api('/profile/readiness'),
        api('/applications?status=READY&pageSize=10'),
        api('/collection-runs?pageSize=10'),
      ]);

      document.getElementById('cards').innerHTML = [
        card('Worker', health.worker?.status ?? 'n/a', health.worker?.status === 'healthy' ? 'ok' : 'bad'),
        card('Vagas', stats.jobsDiscovered ?? 0),
        card('Analisadas', stats.jobsAnalyzed ?? 0),
        card('APPLY', stats.apply ?? 0, 'ok'),
        card('REVIEW', stats.review ?? 0, 'warn'),
        card('READY', stats.applicationsReady ?? 0, 'ok'),
        card('SUBMITTED', stats.applicationsSubmitted ?? 0),
        card('Entrevistas', stats.interviews ?? 0),
      ].join('');

      const blockers = readiness.blocking || [];
      const recommendations = readiness.recommended || [];
      document.getElementById('readiness').innerHTML =
        '<div><strong>Matching:</strong> <span class="' + (readiness.matchingReady ? 'ok' : 'bad') + '">' +
        (readiness.matchingReady ? 'pronto' : 'bloqueado') + '</span></div>' +
        '<div><strong>Coleta:</strong> <span class="' + (readiness.collectionReady ? 'ok' : 'bad') + '">' +
        (readiness.collectionReady ? 'pronta' : 'bloqueada') + '</span></div>' +
        (blockers.length ? '<p class="bad"><strong>Bloqueios:</strong> ' + blockers.map(esc).join(' · ') + '</p>' : '') +
        (recommendations.length ? '<p class="warn"><strong>Recomendado:</strong> ' + recommendations.map(esc).join(' · ') + '</p>' : '');

      const appRows = (applications.data || []).map(item => {
        const preparation = item.preparation;
        const missing = preparation?.missingInformation?.length ?? 0;
        const prepLabel = preparation
          ? (missing ? '<span class="warn">' + missing + ' pendência(s)</span>' : '<span class="ok">pronto</span>')
          : '<span class="warn">pendente</span>';
        const applicationUrl = safeHttpUrl(item.job?.applicationUrl);
        const actions = [
          applicationUrl ? '<a href="' + esc(applicationUrl) + '" target="_blank" rel="noopener noreferrer"><button type="button">Abrir vaga</button></a>' : '',
          preparation ? '<button type="button" data-download-resume="' + esc(item.id) + '">Currículo</button>' : '<button type="button" data-prepare="' + esc(item.id) + '">Preparar</button>',
        ].filter(Boolean).join(' ');
        return '<tr><td>' + esc(item.job?.title) + '</td><td>' + esc(item.job?.company) + '</td><td>' +
          esc(item.matchScore) + '</td><td>' + prepLabel + '</td><td>' + actions + '</td><td>' +
          esc(new Date(item.updatedAt).toLocaleString('pt-BR')) + '</td></tr>';
      });
      document.getElementById('applications').innerHTML =
        appRows.join('') || '<tr><td colspan="6" class="muted">Nenhuma candidatura READY.</td></tr>';

      const runRows = (runs.data || []).map(item =>
        '<tr><td>' + esc(item.source?.name || item.source?.slug) + '</td><td>' + esc(item.status) + '</td><td>' +
        esc(item.jobsFetched) + '</td><td>' + esc(item.jobsInserted) + '</td><td>' +
        esc(item.errorCount) + '</td><td>' + esc(new Date(item.startedAt).toLocaleString('pt-BR')) + '</td></tr>'
      );
      document.getElementById('runs').innerHTML =
        runRows.join('') || '<tr><td colspan="6" class="muted">Nenhuma coleta registrada.</td></tr>';

      statusEl.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
      statusEl.className = 'ok';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao carregar';
      statusEl.className = 'bad';
    }
  }

  document.getElementById('applications').addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const applicationId = target.dataset.prepare || target.dataset.downloadResume;
    if (!applicationId) return;

    try {
      if (target.dataset.prepare) {
        target.setAttribute('disabled', 'true');
        target.textContent = 'Preparando...';
        await api('/applications/' + encodeURIComponent(applicationId) + '/prepare', { method: 'POST' });
        await refresh();
        return;
      }

      const response = await request('/applications/' + encodeURIComponent(applicationId) + '/resume.md');
      const markdown = await response.text();
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'curriculo-' + applicationId + '.md';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha na ação';
      statusEl.className = 'bad';
      target.removeAttribute('disabled');
    }
  });

  document.getElementById('saveKey').addEventListener('click', () => {
    sessionStorage.setItem('vagas-admin-key', keyInput.value);
    refresh();
  });
  document.getElementById('refresh').addEventListener('click', refresh);
  if (keyInput.value) refresh();
</script>
</body>
</html>`;

export function dashboardRoutes(app: FastifyInstance): void {
  app.get(
    '/dashboard',
    {
      schema: {
        hide: true,
      },
    },
    async (_request, reply) => reply.type('text/html; charset=utf-8').send(dashboardHtml),
  );
}
