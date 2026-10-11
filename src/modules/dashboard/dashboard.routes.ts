import type { FastifyInstance } from 'fastify';

const dashboardHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Vagas Agent</title>
  <style>
    :root { color-scheme:dark; font-family:Inter,ui-sans-serif,system-ui,sans-serif; --bg:#09121a; --surface:#111f2b; --border:#263846; --text:#edf5f8; --muted:#abc0cc; --accent:#63dfbd; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; scroll-padding-top:80px; }
    body { margin:0; background:radial-gradient(ellipse at top right,#163b3b 0,transparent 45%),var(--bg); color:var(--text); line-height:1.55; }
    main { max-width:1280px; margin:auto; padding:32px; }
    h1 { margin:0 0 8px; font-size:clamp(26px,4vw,40px); line-height:1.15; letter-spacing:-.04em; }
    h2 { margin:0 0 16px; font-size:20px; letter-spacing:-.02em; }
    p { margin:0 0 16px; }
    .eyebrow { color:var(--accent); font-size:12px; letter-spacing:.16em; font-weight:800; margin-bottom:12px; }
    .hero { padding:16px 0 24px; }
    .muted { color:var(--muted); }
    a { color:var(--accent); text-underline-offset:3px; overflow-wrap:anywhere; }
    .section-nav { display:flex; gap:8px; overflow-x:auto; padding:12px 0; margin-bottom:24px; }
    .section-nav a { flex:0 0 auto; text-decoration:none; color:var(--muted); padding:8px 14px; border:1px solid var(--border); border-radius:999px; font-size:13px; background:var(--surface); }
    .section-nav a:hover { color:var(--accent); border-color:var(--accent); }
    .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:16px 0; }
    .connection-bar { padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:16px; }
    input,button,select,textarea { font:inherit; color:var(--text); border:1px solid var(--border); background:#0c1923; border-radius:10px; padding:10px 12px; min-height:44px; max-width:100%; }
    input { min-width:0; flex:1; width:100%; }
    textarea { width:100%; min-height:110px; resize:vertical; }
    input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
    button { cursor:pointer; font-weight:650; white-space:normal; }
    button:hover { border-color:var(--accent); background:#1a3541; }
    button:disabled { opacity:.55; cursor:wait; }
    #saveKey,#runAllSources,#manualImport,#connectGmail { background:var(--accent); border-color:var(--accent); color:#082b24; }
    #apiKey { flex:1 1 240px; width:auto; }
    #status { flex-basis:100%; font-size:13px; overflow-wrap:anywhere; }
    .form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:16px; }
    .form-grid label { display:flex; flex-direction:column; gap:7px; min-width:0; color:var(--muted); font-size:14px; }
    .form-grid select { width:100%; }
    .check,.form-grid label.check { display:flex; flex-direction:row; gap:10px; align-items:flex-start; margin-top:12px; color:var(--muted); }
    .check input { width:20px; min-width:20px; min-height:20px; flex:0 0 20px; margin-top:3px; accent-color:var(--accent); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:14px; }
    .action-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:14px; margin-top:16px; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; min-width:0; overflow-wrap:anywhere; }
    #cards .card { border-top:3px solid var(--accent); }
    .action-card { display:flex; flex-direction:column; gap:12px; }
    .action-card .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:auto; }
    .queue-title { font-size:17px; font-weight:750; line-height:1.4; }
    .value { font-size:32px; font-weight:800; margin-top:8px; letter-spacing:-.04em; }
    section { margin-top:32px; padding-top:8px; min-width:0; }
    table { width:100%; border-collapse:separate; border-spacing:0; background:var(--surface); border:1px solid var(--border); border-radius:14px; }
    th,td { text-align:left; padding:14px 12px; border-bottom:1px solid var(--border); vertical-align:top; overflow-wrap:anywhere; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; background:#162733; }
    th:first-child { border-top-left-radius:14px; } th:last-child { border-top-right-radius:14px; }
    tbody tr:last-child td { border-bottom:0; }
    td { font-size:13px; } td button,td select { margin:3px 0; font-size:12px; }
    .ok { color:#7ce6b2; } .warn { color:#f2cf78; } .bad { color:#ff9e99; }
    .hidden,.modal-backdrop.hidden { display:none; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(3,10,16,.86); display:flex; align-items:center; justify-content:center; padding:20px; z-index:20; backdrop-filter:blur(6px); }
    .modal { width:min(760px,100%); max-height:90vh; max-height:90dvh; overflow:auto; overscroll-behavior:contain; background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:24px; overflow-wrap:anywhere; }
    .modal-head { display:flex; justify-content:space-between; gap:12px; align-items:center; position:sticky; top:-24px; background:var(--surface); padding:12px 0; z-index:1; }
    .modal-head h2 { margin:0; }
    .modal-head button { flex-shrink:0; }
    .modal-actions { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0; }
    .answer,.timeline-event { padding:14px 0; border-bottom:1px solid var(--border); }
    .timeline-event:last-child { border-bottom:0; }
    code { color:#b4e5dd; overflow-wrap:anywhere; }
    summary { cursor:pointer; color:var(--accent); padding:12px 0; }
    details[open] summary { margin-bottom:12px; }
    @media (max-width:1100px) and (min-width:701px) {
      table { display:block; overflow-x:auto; }
      th,td { min-width:100px; } td:first-child { min-width:180px; }
    }
    @media (max-width:700px) {
      main { padding:20px 14px max(24px,env(safe-area-inset-bottom)); }
      .hero { padding:8px 0 16px; }
      .section-nav { margin-bottom:16px; }
      section { margin-top:26px; }
      .connection-bar { gap:8px; } #apiKey { flex-basis:100%; }
      .connection-bar button { flex:1; }
      input,select,textarea { font-size:16px; }
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .card { padding:16px; } .value { font-size:28px; }
      .action-grid,.form-grid { grid-template-columns:minmax(0,1fr); }
      .bar button,.modal-actions button { flex:1 1 140px; }
      table,tbody { display:block; width:100%; border:0; background:transparent; }
      thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
      tbody tr { display:block; margin-bottom:12px; padding:8px 14px; border:1px solid var(--border); border-radius:16px; background:var(--surface); }
      td { display:block; padding:10px 0; font-size:14px; border-bottom:1px solid var(--border); min-width:0; }
      td[data-label]::before { content:attr(data-label); display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.07em; margin-bottom:4px; }
      tbody tr td:last-child { border-bottom:0; }
      td[colspan] { border:0; }
      .modal-backdrop { padding:10px; }
      .modal { padding:18px; max-height:calc(100dvh - 20px); border-radius:16px; }
      .modal-head { top:-18px; } .modal-head h2 { font-size:18px; }
    }
    @media (max-width:360px) { .grid { grid-template-columns:minmax(0,1fr); } }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
  </style>
</head>
<body>
<main>
  <header class="hero">
    <div class="eyebrow">VAGAS AGENT · SEU PRÓXIMO PASSO</div>
    <h1>Suas oportunidades, em um só lugar.</h1>
    <div class="muted">Painel web do pipeline de vagas e candidaturas</div>
  </header>
  <nav class="section-nav" aria-label="Seções do painel">
    <a href="#actionSection">Próximas ações</a><a href="#pipelineSection">Candidaturas</a><a href="#searchSection">Buscar vagas</a><a href="#gmailSection">Gmail</a><a href="#sourcesSection">Fontes</a>
  </nav>

  <div class="bar connection-bar">
    <input aria-label="Chave de acesso ao painel" id="apiKey" type="password" autocomplete="off" placeholder="X-Admin-Key" />
    <button id="saveKey">Salvar chave</button>
    <button id="refresh">Atualizar</button>
    <span id="status" class="muted" role="status" aria-live="polite">Aguardando chave</span>
  </div>

  <div id="cards" class="grid"></div>

  <section>
    <h2>Seu perfil e a automação</h2>
    <div id="readiness" class="card muted">Sem dados.</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="exportProfile" type="button">Exportar backup do perfil</button>
      <button id="importProfile" type="button">Importar backup do perfil</button>
      <input id="profileBackupFile" class="hidden" type="file" accept="application/json,.json" />
    </div>
  </section>

  <section id="gmailSection">
    <h2>Candidaturas por Gmail</h2>
    <div class="card">
      <p id="gmailStatus" class="muted">Salve a chave para consultar a conexão.</p>
      <div class="bar">
        <button id="connectGmail" type="button">Conectar Gmail</button>
        <button id="uploadResume" type="button">Enviar currículo PDF (PT)</button>
        <button id="uploadResumeEnglish" type="button">Enviar currículo PDF (EN)</button>
        <button id="disconnectGmail" type="button">Desconectar Gmail</button>
        <input id="resumePdf" class="hidden" type="file" accept="application/pdf,.pdf" />
        <input id="resumePdfEnglish" class="hidden" type="file" accept="application/pdf,.pdf" />
      </div>
      <details>
        <summary>Confirmar uma vaga que recebe currículo por e-mail</summary>
        <p class="muted">Use o endereço e as instruções publicados no anúncio. Vagas que exigem candidatura no portal continuam no fluxo assistido.</p>
        <form id="emailTargetForm" class="form-grid">
          <label>Vaga<select id="emailApplication" required><option value="">Atualize o painel primeiro</option></select></label>
          <label>E-mail do anúncio<input id="emailRecipient" type="email" required /></label>
          <label>Link do anúncio<input id="emailEvidenceUrl" type="url" required /></label>
          <label>Assunto exigido pelo anúncio<input id="emailSubject" maxlength="200" required /></label>
          <label>Idioma do currículo<select id="emailResumeLanguage"><option value="PT">Português</option><option value="EN">Inglês</option></select></label>
          <label>Trecho que indica candidatura por e-mail<textarea id="emailEvidenceQuote" required maxlength="4000"></textarea></label>
          <label>Mensagem da candidatura<textarea id="emailBody" required maxlength="8000"></textarea></label>
          <label class="check"><input id="emailChannelConfirmed" type="checkbox" required />Confirmo que o anúncio aceita candidaturas neste e-mail e autorizo esta mensagem.</label>
          <button type="submit">Salvar para envio automático</button>
        </form>
      </details>
    </div>
  </section>

  <section>
    <h2>Portais principais</h2>
    <div class="grid">
      <div class="card"><div><strong>Gupy</strong></div><div class="ok">Automático</div><div class="muted">Coleta read-only pelo MCP oficial de candidatos.</div></div>
      <div class="card"><div><strong>Sólides</strong></div><div class="ok">Automático</div><div class="muted">Coleta pública com metadados estruturados das vagas.</div></div>
      <div class="card"><div><strong>LinkedIn</strong></div><div class="warn">Parceiro oficial</div><div class="muted">Sem API pública de busca para candidato configurada; Easy Apply continua assistido/manual.</div></div>
      <div class="card"><div><strong>Indeed</strong></div><div class="warn">Parceiro oficial</div><div class="muted">Busca oficial para publishers exige credenciais de parceiro; Indeed Apply continua assistido/manual.</div></div>
      <div class="card"><div><strong>Glassdoor</strong></div><div class="warn">Manual</div><div class="muted">Canal reconhecido no pipeline, sem scraping ou submissão automática presumida.</div></div>
      <div class="card"><div><strong>Vagas.com.br</strong></div><div class="warn">Assistido</div><div class="muted">Busca pública por cargo/localização e importação da vaga escolhida.</div></div>
      <div class="card"><div><strong>InfoJobs</strong></div><div class="warn">Assistido</div><div class="muted">Busca pública; a candidatura pode exigir conta no portal.</div></div>
      <div class="card"><div><strong>Catho</strong></div><div class="warn">Assistido</div><div class="muted">Busca pública; candidatura e alguns detalhes podem exigir cadastro.</div></div>
    </div>
  </section>

  <section id="searchSection">
    <h2>Buscas assistidas</h2>
    <div class="muted">Links gerados a partir do perfil salvo. Abra a busca, escolha a vaga e cole a URL em “Adicionar vaga externa”.</div>
    <div id="portalSearchPlan" class="action-grid" style="margin-top:12px">
      <div class="card muted">Salve a Admin Key para gerar as buscas.</div>
    </div>
    <h3>Publicações recentes do Seja Trainee</h3>
    <div class="muted">Fontes editoriais. Antes de se candidatar, confira no site da empresa se a vaga está aberta e se atende seus requisitos.</div>
    <div id="sejaTraineeUpdates" class="action-grid" style="margin-top:12px">
      <div class="card muted">Consulte o painel com a Admin Key para carregar as publicações.</div>
    </div>
  </section>

  <section>
    <h2>Adicionar vaga externa</h2>
    <div class="card">
      <div class="form-grid">
        <label>Cargo<input id="manualTitle" placeholder="Ex.: Analista de Suporte" /></label>
        <label>Empresa<input id="manualCompany" placeholder="Empresa" /></label>
        <label>URL<input id="manualUrl" type="url" placeholder="Link da vaga" /></label>
        <label>Localização<input id="manualLocation" placeholder="Remoto, Belém, Brasil..." /></label>
        <label>Contratação<input id="manualEmploymentType" placeholder="Ex.: CLT, estágio, FULL_TIME" /></label>
        <label>Publicado em<input id="manualPublishedAt" type="date" /></label>
        <label>Modalidade<select id="manualRemoteType"><option value="UNSPECIFIED">Não informada</option><option value="REMOTE">Remota</option><option value="HYBRID">Híbrida</option><option value="ONSITE">Presencial</option></select></label>
      </div>
      <label class="check"><input id="manualFastApply" type="checkbox" /> A vaga indica candidatura rápida</label>
      <div style="margin-top:10px"><textarea id="manualDescription" placeholder="Cole a descrição da vaga"></textarea></div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button id="resolveUrl" type="button">Buscar dados do link</button><button id="manualImport">Importar e analisar</button></div>
    </div>
  </section>

  <section id="actionSection">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h2 style="margin-bottom:4px">Próximas ações</h2>
        <div id="actionQueueSummary" class="muted">Sem dados.</div>
      </div>
    </div>
    <div id="actionQueue" class="action-grid">
      <div class="card muted">Sem candidaturas acionáveis.</div>
    </div>
  </section>

  <section id="pipelineSection">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h2>Pipeline de candidaturas</h2>
      <label class="muted">Filtro
        <select id="applicationFilter">
          <option value="ALL">Todas</option>
          <option value="ACTIONABLE">Próximas ações</option>
          <option value="READY">READY</option>
          <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
          <option value="SUBMITTED">SUBMITTED</option>
          <option value="PROGRESS">Entrevista / oferta</option>
          <option value="CLOSED">Encerradas</option>
        </select>
      </label>
    </div>
    <table>
      <thead><tr><th>Vaga</th><th>Empresa</th><th>Fonte</th><th>Score</th><th>Status</th><th>Canal</th><th>Pacote</th><th>Ações</th><th>Atualizado</th></tr></thead>
      <tbody id="applications"><tr><td colspan="9" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>

  <section id="sourcesSection">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h2>Fontes de vagas</h2>
      <button id="runAllSources" type="button">Executar coleta agora</button>
    </div>
    <table>
      <thead><tr><th>Fonte</th><th>Estado</th><th>Falhas</th><th>Último sucesso</th><th>Última falha</th><th>Ação</th></tr></thead>
      <tbody id="sources"><tr><td colspan="6" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>

  <section>
    <h2>Coletas recentes</h2>
    <table>
      <thead><tr><th>Fonte</th><th>Status</th><th>Encontradas</th><th>Inseridas</th><th>Erros</th><th>Início</th></tr></thead>
      <tbody id="runs"><tr><td colspan="6" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>

  <div id="kitModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-head"><h2>Kit de candidatura</h2><button id="closeKit" type="button">Fechar</button></div>
      <div id="kitContent" class="muted">Carregando...</div>
    </div>
  </div>

  <div id="timelineModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-head"><h2>Histórico da candidatura</h2><button id="closeTimeline" type="button">Fechar</button></div>
      <div id="timelineContent" class="muted">Carregando...</div>
    </div>
  </div>

  <section>
    <h2>Auditoria recente</h2>
    <table>
      <thead><tr><th>Evento</th><th>Entidade</th><th>ID</th><th>Quando</th></tr></thead>
      <tbody id="audit"><tr><td colspan="4" class="muted">Sem dados.</td></tr></tbody>
    </table>
  </section>
</main>
<script>
  const keyInput = document.getElementById('apiKey');
  const statusEl = document.getElementById('status');
  let resolvedApplicationQuestions = [];
  let resolvedQuestionsUrl = '';
  let resolveRequestVersion = 0;
  let cachedApplications = [];
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

  function sourceLabel(value) {
    const labels = {
      remoteok: 'Remote OK',
      weworkremotely: 'We Work Remotely',
      himalayas: 'Himalayas',
      jobicy: 'Jobicy',
      remotive: 'Remotive',
      arbeitnow: 'Arbeitnow',
      gupy: 'Gupy',
      solides: 'Sólides',
      linkedin: 'LinkedIn',
      indeed: 'Indeed',
      glassdoor: 'Glassdoor',
      vagascom: 'Vagas.com.br',
      infojobs: 'InfoJobs',
      catho: 'Catho',
      mock: 'Mock',
    };
    return labels[value] || value || '—';
  }

  const statusTransitions = {
    READY: ['SUBMITTED', 'WITHDRAWN'],
    REVIEW_REQUIRED: ['READY', 'WITHDRAWN'],
    SUBMITTED: ['INTERVIEW', 'REJECTED', 'FAILED', 'WITHDRAWN'],
    FAILED: ['READY', 'WITHDRAWN'],
    INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
    OFFER: ['ACCEPTED', 'WITHDRAWN'],
  };

  function statusAction(item) {
    const options = statusTransitions[item.status] || [];
    if (!options.length) return '';
    const select = '<select data-status-select="' + esc(item.id) + '">' +
      options.map(status => '<option value="' + esc(status) + '">' + esc(status) + '</option>').join('') +
      '</select>';
    return select + ' <button type="button" data-update-status="' + esc(item.id) + '">Atualizar</button>';
  }

  function applicationPriority(item) {
    const priorities = {
      READY: 0,
      REVIEW_REQUIRED: 1,
      SUBMITTED: 2,
      INTERVIEW: 3,
      OFFER: 4,
      FAILED: 5,
      DISCOVERED: 6,
      ANALYZED: 7,
      REJECTED: 8,
      WITHDRAWN: 9,
      ACCEPTED: 10,
    };
    return priorities[item.status] ?? 99;
  }

  function sortedApplications(items) {
    return [...items].sort((left, right) => {
      const priority = applicationPriority(left) - applicationPriority(right);
      if (priority !== 0) return priority;
      const score = Number(right.matchScore || 0) - Number(left.matchScore || 0);
      if (score !== 0) return score;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }

  function renderPortalSearchPlan(plan) {
    const links = Array.isArray(plan?.links) ? plan.links : [];
    const portals = [
      { id: 'LINKEDIN', label: 'LinkedIn' },
      { id: 'INDEED', label: 'Indeed' },
      { id: 'GLASSDOOR', label: 'Glassdoor' },
      { id: 'VAGASCOM', label: 'Vagas.com.br' },
      { id: 'INFOJOBS', label: 'InfoJobs' },
      { id: 'CATHO', label: 'Catho' },
      { id: 'SEJATRAINEE', label: 'Seja Trainee' },
    ];
    document.getElementById('portalSearchPlan').innerHTML = portals.map(portal => {
      const portalLinks = links.filter(item => item.portal === portal.id).slice(0, 4);
      return '<div class="card action-card"><div class="queue-title">' + esc(portal.label) + '</div>' +
        (portalLinks.length
          ? '<div class="actions">' + portalLinks.map(item => {
              const url = safeHttpUrl(item.url);
              return url
                ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><button type="button">' + esc(item.label) + '</button></a>'
                : '';
            }).join('') + '</div>'
          : '<div class="muted">Nenhuma busca disponível para este portal.</div>') +
        '</div>';
    }).join('');
  }

  function renderSejaTraineeUpdates(feed) {
    const items = Array.isArray(feed?.articles) ? feed.articles : [];
    document.getElementById('sejaTraineeUpdates').innerHTML = items.length
      ? items.slice(0, 10).map(item => {
          const url = safeHttpUrl(item.url);
          if (!url) return '';
          const published = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('pt-BR') : 'Data não informada';
          return '<div class="card action-card"><div class="queue-title">' +
            esc(item.title || 'Publicação') + '</div><div class="muted">' +
            esc(published) + ' · Inscrição não verificada</div>' +
            (item.excerpt ? '<p class="muted">' + esc(item.excerpt) + '</p>' : '') +
            '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Ler matéria e conferir edital oficial</a></div>';
        }).join('')
      : '<div class="card muted">Nenhuma publicação disponível agora; use os links acima.</div>';
  }

  function applicationMatchesFilter(item, filter) {
    if (filter === 'ACTIONABLE') return ['READY', 'REVIEW_REQUIRED'].includes(item.status);
    if (filter === 'PROGRESS') return ['INTERVIEW', 'OFFER'].includes(item.status);
    if (filter === 'CLOSED') return ['REJECTED', 'WITHDRAWN', 'ACCEPTED'].includes(item.status);
    if (filter === 'ALL') return true;
    return item.status === filter;
  }

  function applicationActions(item, compact = false) {
    const preparation = item.preparation;
    const applicationUrl = safeHttpUrl(item.job?.applicationUrl);
    const sourceUrl = safeHttpUrl(item.job?.originalUrl);
    const channel = item.applicationChannel || { label: 'Externa', flow: 'MANUAL' };
    const openLabel = channel.flow === 'FAST_APPLY' ? 'Abrir candidatura rápida' : 'Abrir vaga';
    const actions = [
      applicationUrl
        ? '<a href="' + esc(applicationUrl) + '" target="_blank" rel="noopener noreferrer"><button type="button">' + esc(openLabel) + '</button></a>'
        : '',
      sourceUrl && sourceUrl !== applicationUrl
        ? '<a href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer"><button type="button">Ver na fonte</button></a>'
        : '',
      preparation
        ? '<button type="button" data-download-resume="' + esc(item.id) + '">Currículo</button>'
        : '<button type="button" data-prepare="' + esc(item.id) + '">Preparar</button>',
      preparation ? '<button type="button" data-fast-kit="' + esc(item.id) + '">Kit rápido</button>' : '',
      compact ? '' : '<button type="button" data-timeline="' + esc(item.id) + '">Histórico</button>',
      compact || !['SUBMITTED', 'INTERVIEW', 'OFFER'].includes(item.status)
        ? ''
        : '<button type="button" data-follow-up="' + esc(item.id) + '">Follow-up</button>' +
          (item.nextFollowUpAt
            ? ' <button type="button" data-complete-follow-up="' + esc(item.id) + '">Concluir follow-up</button>'
            : ''),
      compact ? '' : statusAction(item),
    ];
    return actions.filter(Boolean).join(' ');
  }

  function renderActionQueue() {
    const actionable = sortedApplications(
      cachedApplications.filter(item => ['READY', 'REVIEW_REQUIRED'].includes(item.status)),
    );
    const ready = actionable.filter(item => item.status === 'READY').length;
    const review = actionable.filter(item => item.status === 'REVIEW_REQUIRED').length;
    document.getElementById('actionQueueSummary').textContent = actionable.length
      ? ready + ' READY · ' + review + ' REVIEW_REQUIRED'
      : 'Nenhuma ação pendente agora.';

    document.getElementById('actionQueue').innerHTML = actionable.length
      ? actionable.slice(0, 6).map(item => {
          const preparation = item.preparation;
          const missing = preparation?.missingInformation?.length ?? 0;
          const channel = item.applicationChannel || { label: 'Externa', flow: 'MANUAL' };
          const statusClass = item.status === 'READY' ? 'ok' : 'warn';
          const prepText = preparation
            ? (missing ? missing + ' pendência(s) no pacote' : 'pacote pronto')
            : 'pacote ainda não preparado';
          return '<div class="card action-card">' +
            '<div><span class="' + statusClass + '"><strong>' + esc(item.status) + '</strong></span>' +
            ' · score <strong>' + esc(item.matchScore) + '</strong></div>' +
            '<div class="queue-title">' + esc(item.job?.title) + '</div>' +
            '<div>' + esc(item.job?.company) + '</div>' +
            '<div class="muted">' + esc(sourceLabel(item.job?.source)) + ' · ' + esc(channel.label) +
            ' · ' + esc(prepText) + '</div>' +
            '<div class="actions">' + applicationActions(item, true) + '</div>' +
            '</div>';
        }).join('')
      : '<div class="card muted">Sem candidaturas acionáveis.</div>';
  }

  function renderApplications() {
    const filter = document.getElementById('applicationFilter').value;
    const visible = sortedApplications(
      cachedApplications.filter(item => applicationMatchesFilter(item, filter)),
    );
    const appRows = visible.map(item => {
      const preparation = item.preparation;
      const missing = preparation?.missingInformation?.length ?? 0;
      const prepLabel = preparation
        ? (missing
            ? '<span class="warn">' + missing + ' pendência(s)</span>'
            : '<span class="ok">pronto</span>')
        : '<span class="warn">pendente</span>';
      const channel = item.applicationChannel || { label: 'Externa', flow: 'MANUAL' };
      const channelLabel = channel.flow === 'FAST_APPLY'
        ? '<span class="ok">' + esc(channel.label) + '</span>'
        : esc(channel.label);
      return '<tr><td>' + esc(item.job?.title) + '</td><td>' + esc(item.job?.company) +
        '</td><td>' + esc(sourceLabel(item.job?.source)) + '</td><td>' + esc(item.matchScore) +
        '</td><td><strong>' + esc(item.status) + '</strong></td><td>' + channelLabel +
        '</td><td>' + prepLabel + '</td><td>' + applicationActions(item) + '</td><td>' +
        esc(new Date(item.updatedAt).toLocaleString('pt-BR')) + '</td></tr>';
    });
    document.getElementById('applications').innerHTML =
      appRows.join('') || '<tr><td colspan="9" class="muted">Nenhuma candidatura neste filtro.</td></tr>';
    labelTableCells();
  }

  function labelTableCells() {
    document.querySelectorAll('table').forEach(table => {
      const labels = Array.from(table.querySelectorAll('thead th'), cell => cell.textContent);
      table.querySelectorAll('tbody tr').forEach(row => {
        Array.from(row.cells).forEach((cell, index) => {
          if (cell.colSpan === 1) cell.dataset.label = labels[index] || '';
        });
      });
    });
  }

  async function refresh() {
    statusEl.textContent = 'Carregando...';
    statusEl.className = 'muted';
    try {
      const [health, stats, readiness, applications, sources, runs, audit, portalSearchPlan, gmail, traineeFeed] =
        await Promise.all([
          api('/health'),
          api('/stats'),
          api('/profile/readiness'),
          api('/applications?pageSize=25'),
          api('/job-sources?pageSize=50'),
          api('/collection-runs?pageSize=10'),
          api('/audit-logs?pageSize=12'),
          api('/portal-search-plan').catch(() => ({ links: [] })),
          api('/integrations/gmail/status').catch(() => null),
          api('/seja-trainee/articles').catch(() => ({ articles: [] })),
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
        card('Ofertas', stats.offers ?? 0),
        card('Aceitas', stats.accepted ?? 0),
        card('Follow-ups', stats.followUpsDue ?? 0, (stats.followUpsDue ?? 0) > 0 ? 'warn' : 'ok'),
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

      cachedApplications = Array.isArray(applications.data) ? applications.data : [];
      document.getElementById('gmailStatus').textContent = !gmail ? 'Não foi possível consultar a conexão Gmail.' : !gmail.configured
        ? 'A configuração OAuth do Gmail ainda precisa ser concluída no servidor.'
        : (gmail.connected ? 'Conta conectada: ' + gmail.account.accountEmail : 'Conecte a conta Gmail usada no perfil.') +
          (gmail.resumeReady ? ' Currículo PT carregado.' : ' Envie o currículo PT.') +
          (gmail.resumeEnglishReady ? ' Currículo EN carregado.' : ' Envie o currículo EN.') +
          (gmail.safeMode || !gmail.sendEnabled || !gmail.automaticEnabled ? ' Envio automático ainda desabilitado no servidor.' : ' Envio automático habilitado para vagas elegíveis com canal de e-mail confirmado.');
      document.getElementById('emailApplication').innerHTML = '<option value="">Selecione a vaga</option>' +
        cachedApplications.filter(item => !item.submittedAt && !item.submissionAttempt).map(item => '<option value="' + esc(item.id) + '">' + esc(item.job.title + ' · ' + item.job.company) + '</option>').join('');
      renderPortalSearchPlan(portalSearchPlan);
      renderSejaTraineeUpdates(traineeFeed);
      renderActionQueue();
      renderApplications();

      const sourceRows = (sources.data || []).map(item => {
        const cooldownUntil = item.cooldownUntil ? new Date(item.cooldownUntil) : null;
        const cooldownActive = cooldownUntil && cooldownUntil.getTime() > Date.now();
        const failures = Number(item.consecutiveFailures || 0);
        const stateClass = !item.enabled || cooldownActive || failures > 0 ? 'warn' : 'ok';
        const stateLabel = !item.enabled
          ? 'desativada'
          : cooldownActive
            ? 'cooldown até ' + cooldownUntil.toLocaleString('pt-BR')
            : failures > 0
              ? 'atenção'
              : 'saudável';
        const lastSuccess = item.lastSuccessfulRunAt
          ? new Date(item.lastSuccessfulRunAt).toLocaleString('pt-BR')
          : '—';
        const lastFailure = item.lastFailedRunAt
          ? new Date(item.lastFailedRunAt).toLocaleString('pt-BR')
          : '—';
        const action = item.enabled
          ? '<button type="button" data-run-source="' + esc(item.id) + '">Executar</button>'
          : '<span class="muted">Desativada</span>';
        return '<tr><td>' + esc(item.name || sourceLabel(item.slug)) +
          '</td><td><span class="' + stateClass + '">' + esc(stateLabel) + '</span></td><td>' +
          esc(failures) + '</td><td>' + esc(lastSuccess) + '</td><td>' + esc(lastFailure) +
          '</td><td>' + action + '</td></tr>';
      });
      document.getElementById('sources').innerHTML =
        sourceRows.join('') || '<tr><td colspan="6" class="muted">Nenhuma fonte registrada.</td></tr>';

      const runRows = (runs.data || []).map(item =>
        '<tr><td>' + esc(item.source?.name || item.source?.slug) + '</td><td>' + esc(item.status) + '</td><td>' +
        esc(item.jobsFetched) + '</td><td>' + esc(item.jobsInserted) + '</td><td>' +
        esc(item.errorCount) + '</td><td>' + esc(new Date(item.startedAt).toLocaleString('pt-BR')) + '</td></tr>'
      );
      document.getElementById('runs').innerHTML =
        runRows.join('') || '<tr><td colspan="6" class="muted">Nenhuma coleta registrada.</td></tr>';

      const auditRows = (audit.data || []).map(item =>
        '<tr><td>' + esc(item.event) + '</td><td>' + esc(item.entityType) + '</td><td><code>' +
        esc(item.entityId || '—') + '</code></td><td>' + esc(new Date(item.createdAt).toLocaleString('pt-BR')) + '</td></tr>'
      );
      document.getElementById('audit').innerHTML =
        auditRows.join('') || '<tr><td colspan="4" class="muted">Nenhum evento registrado.</td></tr>';

      labelTableCells();
      statusEl.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
      statusEl.className = 'ok';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao carregar';
      statusEl.className = 'bad';
    }
  }

  document.getElementById('manualUrl').addEventListener('input', () => {
    resolveRequestVersion += 1;
    resolvedApplicationQuestions = [];
    resolvedQuestionsUrl = '';
    document.getElementById('manualEmploymentType').value = '';
    document.getElementById('manualPublishedAt').value = '';
  });

  document.getElementById('resolveUrl').addEventListener('click', async () => {
    const button = document.getElementById('resolveUrl');
    const applicationUrl = document.getElementById('manualUrl').value.trim();
    if (!applicationUrl) {
      statusEl.textContent = 'Informe a URL da vaga.';
      statusEl.className = 'warn';
      return;
    }

    const requestVersion = ++resolveRequestVersion;
    resolvedApplicationQuestions = [];
    resolvedQuestionsUrl = '';
    try {
      button.setAttribute('disabled', 'true');
      button.textContent = 'Buscando...';
      const result = await api('/jobs/resolve-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: applicationUrl }),
      });

      if (requestVersion !== resolveRequestVersion ||
          document.getElementById('manualUrl').value.trim() !== applicationUrl) return;

      resolvedApplicationQuestions = Array.isArray(result.applicationQuestions)
        ? result.applicationQuestions
        : [];
      if (result.data) {
        if (result.data.title) document.getElementById('manualTitle').value = result.data.title;
        if (result.data.company) document.getElementById('manualCompany').value = result.data.company;
        if (result.data.description) document.getElementById('manualDescription').value = result.data.description;
        if (result.data.location) document.getElementById('manualLocation').value = result.data.location;
        if (result.data.remoteType) document.getElementById('manualRemoteType').value = result.data.remoteType;
        if (result.data.applicationUrl) document.getElementById('manualUrl').value = result.data.applicationUrl;
        document.getElementById('manualEmploymentType').value = result.data.employmentType || '';
        const publishedAt = result.data.publishedAt ? new Date(result.data.publishedAt) : null;
        document.getElementById('manualPublishedAt').value = publishedAt && Number.isFinite(publishedAt.getTime())
          ? publishedAt.toISOString().slice(0, 10)
          : '';
      }
      resolvedQuestionsUrl = document.getElementById('manualUrl').value.trim();

      statusEl.textContent = result.supported
        ? 'Dados carregados de ' + (result.platform || 'ATS') + '.'
        : (result.message || 'Esse link precisa de preenchimento manual.');
      statusEl.className = result.supported ? 'ok' : 'warn';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao buscar dados do link';
      statusEl.className = 'bad';
    } finally {
      button.removeAttribute('disabled');
      button.textContent = 'Buscar dados do link';
    }
  });

  document.getElementById('manualImport').addEventListener('click', async () => {
    const button = document.getElementById('manualImport');
    const title = document.getElementById('manualTitle').value.trim();
    const company = document.getElementById('manualCompany').value.trim();
    const applicationUrl = document.getElementById('manualUrl').value.trim();
    const description = document.getElementById('manualDescription').value.trim();
    if (!title || !company || !applicationUrl || !description) {
      statusEl.textContent = 'Preencha cargo, empresa, URL e descrição.';
      statusEl.className = 'warn';
      return;
    }

    try {
      button.setAttribute('disabled', 'true');
      button.textContent = 'Analisando...';
      const result = await api('/jobs/import/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          company,
          description,
          applicationUrl,
          location: document.getElementById('manualLocation').value.trim() || undefined,
          remoteType: document.getElementById('manualRemoteType').value,
          employmentType: document.getElementById('manualEmploymentType').value.trim() || undefined,
          publishedAt: document.getElementById('manualPublishedAt').value || undefined,
          fastApply: document.getElementById('manualFastApply').checked,
          applicationQuestions: resolvedQuestionsUrl === applicationUrl ? resolvedApplicationQuestions : [],
        }),
      });
      statusEl.textContent = 'Vaga analisada: ' + (result.channel?.label || 'canal externo');
      statusEl.className = 'ok';
      document.getElementById('manualTitle').value = '';
      document.getElementById('manualCompany').value = '';
      document.getElementById('manualUrl').value = '';
      document.getElementById('manualDescription').value = '';
      document.getElementById('manualLocation').value = '';
      document.getElementById('manualEmploymentType').value = '';
      document.getElementById('manualPublishedAt').value = '';
      document.getElementById('manualFastApply').checked = false;
      resolvedApplicationQuestions = [];
      resolvedQuestionsUrl = '';
      resolveRequestVersion += 1;
      await refresh();
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao importar vaga';
      statusEl.className = 'bad';
    } finally {
      button.removeAttribute('disabled');
      button.textContent = 'Importar e analisar';
    }
  });

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const applicationId =
      target.dataset.prepare ||
      target.dataset.downloadResume ||
      target.dataset.fastKit ||
      target.dataset.timeline ||
      target.dataset.followUp ||
      target.dataset.completeFollowUp ||
      target.dataset.updateStatus;
    if (!applicationId) return;

    try {
      if (target.dataset.updateStatus) {
        const select = Array.from(document.querySelectorAll('[data-status-select]')).find(
          element => element instanceof HTMLSelectElement && element.dataset.statusSelect === applicationId,
        );
        if (!(select instanceof HTMLSelectElement)) throw new Error('Status de destino não encontrado');
        target.setAttribute('disabled', 'true');
        target.textContent = 'Salvando...';
        await api('/applications/' + encodeURIComponent(applicationId) + '/status', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: select.value }),
        });
        await refresh();
        return;
      }

      if (target.dataset.completeFollowUp) {
        await api('/applications/' + encodeURIComponent(applicationId) + '/follow-up', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        });
        statusEl.textContent = 'Follow-up concluído.';
        statusEl.className = 'ok';
        await refresh();
        return;
      }

      if (target.dataset.followUp) {
        const daysText = window.prompt('Daqui a quantos dias deseja acompanhar novamente?', '7');
        if (daysText === null) return;
        const days = Number.parseInt(daysText, 10);
        if (!Number.isFinite(days) || days < 0 || days > 365) throw new Error('Informe um número de dias entre 0 e 365');
        const nextFollowUpAt = new Date(Date.now() + days * 86400000);
        await api('/applications/' + encodeURIComponent(applicationId) + '/follow-up', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nextFollowUpAt: nextFollowUpAt.toISOString() }),
        });
        statusEl.textContent = 'Follow-up agendado para ' + nextFollowUpAt.toLocaleDateString('pt-BR');
        statusEl.className = 'ok';
        await refresh();
        return;
      }

      if (target.dataset.timeline) {
        const timeline = await api('/applications/' + encodeURIComponent(applicationId) + '/timeline');
        const events = Array.isArray(timeline.data) ? timeline.data : [];
        document.getElementById('timelineContent').innerHTML = events.length
          ? events.map(item =>
              '<div class="timeline-event"><div><strong>' + esc(item.fromStatus || 'INÍCIO') +
              ' → ' + esc(item.toStatus) + '</strong></div><div class="muted">' +
              esc(new Date(item.occurredAt).toLocaleString('pt-BR')) + ' · ' + esc(item.source) + '</div>' +
              (item.notes ? '<div style="margin-top:6px">' + esc(item.notes) + '</div>' : '') +
              (item.externalApplicationId ? '<div class="muted">ID externo: <code>' + esc(item.externalApplicationId) + '</code></div>' : '') +
              '</div>'
            ).join('')
          : '<div class="muted">Nenhuma mudança de estágio registrada ainda.</div>';
        document.getElementById('timelineModal').classList.remove('hidden');
        return;
      }

      if (target.dataset.prepare) {
        target.setAttribute('disabled', 'true');
        target.textContent = 'Preparando...';
        await api('/applications/' + encodeURIComponent(applicationId) + '/prepare', { method: 'POST' });
        await refresh();
        return;
      }

      if (target.dataset.fastKit) {
        const kit = await api('/applications/' + encodeURIComponent(applicationId) + '/fast-apply-kit');
        const answers = Array.isArray(kit.reusableAnswers) ? kit.reusableAnswers : [];
        const questions = Array.isArray(kit.applicationQuestions) ? kit.applicationQuestions : [];
        const questionReadiness = Array.isArray(kit.questionReadiness) ? kit.questionReadiness : [];
        const missing = Array.isArray(kit.missingInformation) ? kit.missingInformation : [];
        const preparedQuestionText = questionReadiness.flatMap(question => {
          if (question.answer) return [question.label + ': ' + question.answer];
          const profileValues = Array.isArray(question.profileValues) ? question.profileValues : [];
          if (question.status === 'PROFILE_READY' && profileValues.length) {
            return [
              question.label + ': ' +
                profileValues.map(value => (value.field ? value.field + '=' : '') + value.value).join(' | '),
            ];
          }
          return [];
        });
        const reusableAnswerText = answers.map(
          answer => (answer.question || answer.questionKey || 'Pergunta') + ': ' + (answer.answer || ''),
        );
        const answerText = (preparedQuestionText.length ? preparedQuestionText : reusableAnswerText).join(
          '\\n\\n',
        );
        const content = document.getElementById('kitContent');
        content.innerHTML =
          '<div><strong>Canal:</strong> ' + esc(kit.channel?.label || 'Externa') + '</div>' +
          '<div><strong>Fluxo:</strong> ' + esc(kit.channel?.flow || 'MANUAL') + '</div>' +
          (missing.length ? '<p class="warn"><strong>Pendências:</strong> ' + missing.map(esc).join(' · ') + '</p>' : '<p class="ok">Sem pendências conhecidas no pacote.</p>') +
          '<div class="modal-actions">' +
          '<button type="button" id="copyKitAnswers">Copiar respostas preparadas</button>' +
          '<button type="button" id="downloadKitResume">Baixar currículo</button>' +
          '</div>' +
          '<h3>Perguntas do ATS</h3>' +
          (questions.length
            ? '<p class="' + (kit.readyForAssistedApply ? 'ok' : 'warn') + '">' +
              (kit.readyForAssistedApply
                ? 'Todas as perguntas obrigatórias conhecidas têm dados preparados.'
                : esc(kit.requiredQuestionsPending || 0) + ' pergunta(s) obrigatória(s) ainda precisam de resposta manual.') +
              '</p>' + questionReadiness.map((question, index) => {
                const statusLabel = question.status === 'PROFILE_READY'
                  ? '<span class="ok">No perfil</span>'
                  : question.status === 'SAVED_ANSWER_READY'
                    ? '<span class="ok">Resposta autorizada</span>'
                    : question.status === 'MANUAL_SENSITIVE'
                      ? '<span class="warn">Manual — sensível/consentimento</span>'
                      : '<span class="warn">Responder manualmente</span>';
                const profileValues = Array.isArray(question.profileValues) ? question.profileValues : [];
                const preparedValue = question.answer
                  ? question.answer
                  : profileValues.map(value => value.value).filter(Boolean).join(' | ');
                const sourceQuestion = questions[index];
                const fields = Array.isArray(sourceQuestion?.fields) ? sourceQuestion.fields : [];
                const options = fields.flatMap(field => Array.isArray(field.values) ? field.values : []);
                const singleSelect = fields.some(field => field.type === 'multi_value_single_select');
                const optionLabels = [...new Set(options.map(option => option.label).filter(Boolean))];
                const editorControl = singleSelect && optionLabels.length
                  ? '<select data-question-answer="' + index + '"><option value="">Selecione...</option>' +
                    optionLabels.map(label => '<option value="' + esc(label) + '">' + esc(label) + '</option>').join('') +
                    '</select>'
                  : '<textarea data-question-answer="' + index + '" placeholder="Digite sua resposta"></textarea>' +
                    (optionLabels.length
                      ? '<div class="muted" style="margin-top:6px">Opções conhecidas: ' + optionLabels.map(esc).join(' · ') + '</div>'
                      : '');
                const manualEditor = question.status === 'MANUAL_REQUIRED'
                  ? '<div style="margin-top:8px">' +
                    editorControl +
                    '<div style="margin-top:8px"><button type="button" data-save-question="' + index + '">Salvar e reutilizar</button></div>' +
                    '</div>'
                  : '';
                return '<div class="answer"><strong>' + esc(question.label) + '</strong><div>' +
                  (question.required ? '<span class="warn">Obrigatória</span> · ' : '<span class="muted">Opcional</span> · ') +
                  statusLabel + '</div>' +
                  (preparedValue ? '<div><code>' + esc(preparedValue) + '</code></div>' : '') +
                  manualEditor +
                  '</div>';
              }).join('')
            : '<div class="muted">O ATS não expôs perguntas públicas para esta vaga.</div>') +
          '<h3>Respostas reutilizáveis autorizadas</h3>' +
          (answers.length
            ? answers.map(answer => '<div class="answer"><strong>' + esc(answer.question || answer.questionKey) + '</strong><div>' + esc(answer.answer) + '</div></div>').join('')
            : '<div class="muted">Nenhuma resposta reutilizável cadastrada.</div>');
        const modal = document.getElementById('kitModal');
        modal.classList.remove('hidden');
        document.getElementById('copyKitAnswers').addEventListener('click', async () => {
          await navigator.clipboard.writeText(answerText || 'Nenhuma resposta reutilizável cadastrada.');
          statusEl.textContent = 'Respostas copiadas.';
          statusEl.className = 'ok';
        });
        document.getElementById('downloadKitResume').addEventListener('click', () => {
          const blob = new Blob([kit.resumeMarkdown || ''], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'curriculo-' + applicationId + '.md';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        });
        content.querySelectorAll('[data-save-question]').forEach(button => {
          button.addEventListener('click', async () => {
            if (!(button instanceof HTMLButtonElement)) return;
            const index = Number(button.dataset.saveQuestion);
            const question = questionReadiness[index];
            const editor = content.querySelector('[data-question-answer="' + index + '"]');
            if (
              !question ||
              (!(editor instanceof HTMLTextAreaElement) && !(editor instanceof HTMLSelectElement))
            ) return;
            const answer = editor.value.trim();
            if (!answer) {
              statusEl.textContent = 'Digite a resposta antes de salvar.';
              statusEl.className = 'warn';
              return;
            }

            try {
              button.disabled = true;
              button.textContent = 'Salvando...';
              await api('/applications/' + encodeURIComponent(applicationId) + '/questions/answers', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  question: question.label,
                  answer,
                  allowedForAutomaticUse: true,
                }),
              });
              statusEl.textContent = 'Resposta salva e autorizada para perguntas iguais.';
              statusEl.className = 'ok';
              modal.classList.add('hidden');
              await refresh();
              const reopen = Array.from(document.querySelectorAll('[data-fast-kit]')).find(
                element => element instanceof HTMLElement && element.dataset.fastKit === applicationId,
              );
              if (reopen instanceof HTMLElement) reopen.click();
            } catch (error) {
              statusEl.textContent = error instanceof Error ? error.message : 'Falha ao salvar resposta';
              statusEl.className = 'bad';
              button.disabled = false;
              button.textContent = 'Salvar e reutilizar';
            }
          });
        });
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

  document.getElementById('connectGmail').addEventListener('click', async () => {
    try {
      const result = await api('/integrations/gmail/authorize', { method: 'POST' });
      const url = new URL(result.url);
      if (url.origin !== 'https://accounts.google.com') throw new Error('Endereço de autorização inválido');
      window.location.assign(url.toString());
    } catch (error) { statusEl.textContent = error.message; statusEl.className = 'bad'; }
  });
  document.getElementById('disconnectGmail').addEventListener('click', async () => {
    try { await api('/integrations/gmail', { method: 'DELETE' }); await refresh(); }
    catch (error) { statusEl.textContent = error.message; statusEl.className = 'bad'; }
  });
  document.getElementById('uploadResume').addEventListener('click', () => document.getElementById('resumePdf').click());
  document.getElementById('uploadResumeEnglish').addEventListener('click', () => document.getElementById('resumePdfEnglish').click());
  document.getElementById('resumePdf').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 2 MB');
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Não foi possível ler o PDF'));
        reader.readAsDataURL(file);
      });
      await api('/integrations/gmail/resume', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentBase64 }) });
      await refresh();
      statusEl.textContent = 'Currículo PDF carregado.';
    } catch (error) { statusEl.textContent = error.message; statusEl.className = 'bad'; }
    finally { event.target.value = ''; }
  });
  document.getElementById('resumePdfEnglish').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 2 MB');
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Não foi possível ler o PDF'));
        reader.readAsDataURL(file);
      });
      await api('/integrations/gmail/resume/en', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentBase64 }) });
      await refresh();
      statusEl.textContent = 'Currículo PDF em inglês carregado.';
    } catch (error) { statusEl.textContent = error.message; statusEl.className = 'bad'; }
    finally { event.target.value = ''; }
  });
  document.getElementById('emailTargetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/applications/' + encodeURIComponent(document.getElementById('emailApplication').value) + '/email-target', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          recipient: document.getElementById('emailRecipient').value.trim(),
          subject: document.getElementById('emailSubject').value.trim(), body: document.getElementById('emailBody').value.trim(),
          evidenceUrl: document.getElementById('emailEvidenceUrl').value.trim(),
          evidenceQuote: document.getElementById('emailEvidenceQuote').value.trim(),
          confirmedEmailChannel: document.getElementById('emailChannelConfirmed').checked,
          resumeLanguage: document.getElementById('emailResumeLanguage').value,
        }),
      });
      await refresh();
      statusEl.textContent = 'Canal e mensagem salvos. A rotina enviará quando todas as condições estiverem prontas.';
      statusEl.className = 'ok';
    } catch (error) { statusEl.textContent = error.message; statusEl.className = 'bad'; }
    finally { button.disabled = false; }
  });

  document.getElementById('exportProfile').addEventListener('click', async () => {
    try {
      const response = await request('/profile/export');
      const bundle = await response.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'vagas-profile-backup.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      statusEl.textContent = 'Backup privado do perfil exportado.';
      statusEl.className = 'ok';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao exportar perfil';
      statusEl.className = 'bad';
    }
  });

  document.getElementById('importProfile').addEventListener('click', () => {
    document.getElementById('profileBackupFile').click();
  });
  document.getElementById('profileBackupFile').addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    try {
      const bundle = JSON.parse(await input.files[0].text());
      await api('/profile/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bundle),
      });
      statusEl.textContent = 'Backup do perfil importado com sucesso.';
      statusEl.className = 'ok';
      await refresh();
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao importar perfil';
      statusEl.className = 'bad';
    } finally {
      input.value = '';
    }
  });

  document.getElementById('closeTimeline').addEventListener('click', () => {
    document.getElementById('timelineModal').classList.add('hidden');
  });
  document.getElementById('timelineModal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('timelineModal')) {
      document.getElementById('timelineModal').classList.add('hidden');
    }
  });

  document.getElementById('closeKit').addEventListener('click', () => {
    document.getElementById('kitModal').classList.add('hidden');
  });
  document.getElementById('kitModal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('kitModal')) {
      document.getElementById('kitModal').classList.add('hidden');
    }
  });

  document.getElementById('runAllSources').addEventListener('click', async () => {
    const button = document.getElementById('runAllSources');
    try {
      button.setAttribute('disabled', 'true');
      button.textContent = 'Agendando...';
      const result = await api('/job-sources/run', { method: 'POST' });
      const count = Array.isArray(result.collectionRunIds) ? result.collectionRunIds.length : 0;
      statusEl.textContent = 'Coleta agendada para ' + count + ' fonte(s).';
      statusEl.className = 'ok';
      window.setTimeout(() => void refresh(), 1500);
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao agendar coleta';
      statusEl.className = 'bad';
    } finally {
      button.removeAttribute('disabled');
      button.textContent = 'Executar coleta agora';
    }
  });

  document.getElementById('sources').addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.runSource) return;
    try {
      target.disabled = true;
      target.textContent = 'Agendando...';
      await api('/job-sources/' + encodeURIComponent(target.dataset.runSource) + '/run', {
        method: 'POST',
      });
      statusEl.textContent = 'Coleta da fonte agendada.';
      statusEl.className = 'ok';
      window.setTimeout(() => void refresh(), 1500);
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Falha ao agendar fonte';
      statusEl.className = 'bad';
      target.disabled = false;
      target.textContent = 'Executar';
    }
  });

  document.getElementById('applicationFilter').addEventListener('change', renderApplications);

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
