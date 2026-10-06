# Job Application Agent - Fase 5 completa

Backend auditável que coleta vagas reais autorizadas, normaliza, deduplica, pré-filtra, analisa, reprocessa, prepara e acompanha candidaturas. A submissão automática só ocorre por provider externo explicitamente autorizado, quando configurado e com `SAFE_MODE=false`; por padrão nenhum provider de envio está habilitado. O sistema não automatiza LinkedIn/Indeed, não usa navegador, CAPTCHA bypass ou evasão anti-bot.

## Stack e arquitetura

Node.js 22.12+, TypeScript, Fastify, PostgreSQL, Prisma, Zod, Vitest, Docker Compose e Swagger. Fastify mantém API e worker pequenos, com logs JSON via Pino. Domínio, persistência e integrações ficam separados:

```text
src/
  config/                       ambiente validado
  database/                     Prisma client
  integrations/
    job-sources/
      mock/                     fonte determinística
      providers/                Remotive, Arbeitnow, Jobicy, Himalayas, Remote OK, We Work Remotely, Sólides e Gupy
      shared/                   HTTP, normalização e erros
      job-source.registry.ts
    llm/                        mock/OpenAI e validação
    notifications/              contrato e provider de console
  modules/
    jobs/                       ingestão, dedup e pré-filtro
    matching/                   score, cache, versão e limites
    sources/                    orchestrator, runs e API
    applications, audit, profile, stats
  workers/                      scheduler e workers locais
```

Fluxo detalhado: [docs/pipeline.md](docs/pipeline.md). Regras e termos das fontes: [docs/job-sources.md](docs/job-sources.md).

## Início rápido

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Isso inicia `postgres`, `api` e `worker`. A API aplica migrations e executa o seed idempotente; o worker aguarda o cron configurado. No Compose local, a chave administrativa padrão é `local-admin-key` — altere-a fora do ambiente local.

- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/docs>
- Health/heartbeat: <http://localhost:3000/health>

Para encerrar: `docker compose down`. O volume `postgres_data` preserva o banco.

## Execução local sem Docker para Node

Com PostgreSQL disponível e `DATABASE_URL` configurada:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run build
npm run start:api
```

Em outro processo:

```bash
npm run start:worker
```

Durante desenvolvimento, use `npm run dev` e `npm run dev:worker`.

## Coleta manual

Em `production`, todos os endpoints de dados exigem `X-Admin-Key`; apenas `/health`, `/docs` e a casca pública de `/dashboard` permanecem acessíveis sem credencial. Operações administrativas continuam com rate limit de cinco chamadas por minuto.

```bash
curl -X POST http://localhost:3000/job-sources/run \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

A resposta `202` contém `collectionRunIds`. Consulte o progresso em `GET /collection-runs/:id`. Para uma fonte específica, use `POST /job-sources/:id/run`.

## Endpoints

Compatibilidade da Fase 1 preservada:

- `GET /health`
- `GET|POST|PUT|PATCH /profile`, `GET /profile/readiness`, `GET /profile/export`, `POST /profile/import`
- `GET|POST /candidate-answers`, `PUT|DELETE /candidate-answers/:id`
- `GET /jobs`, `GET /jobs/:id`
- `POST /jobs/import/mock`, `POST /jobs/resolve-url`, `POST /jobs/import/manual`, `POST /jobs/:id/analyze`, `POST /jobs/reprocess`
- `GET /matches`, `GET /matches/:id`
- `GET /applications`, `GET /applications/:id`
- `POST /applications/:id/prepare`, `GET /applications/:id/preparation`, `GET /applications/:id/resume.md`
- `GET /applications/:id/fast-apply-kit` para currículo + respostas reutilizáveis + pendências
- `GET /applications/:id/eligibility` para explicar requisitos e bloqueios de automação
- `POST /applications/:id/submit` para provider de submissão explicitamente autorizado
- `PATCH /applications/:id/status` para acompanhamento manual auditável (também disponível no dashboard)
- `POST /worker/run-once`, `GET /worker/status`
- `GET /audit-logs`, `GET /stats`, `GET /docs`, `GET /dashboard`

Fase 2:

- `GET /job-sources`, `GET /job-sources/:id`
- `POST /job-sources/run`, `POST /job-sources/:id/run`
- `GET /collection-runs`, `GET /collection-runs/:id`
- `GET /job-search-profile`, `PUT /job-search-profile`

Listagens usam `page`/`pageSize`, limitados a 100. Collection runs aceitam `source`, `status`, `from` e `to`. `/stats` inclui métricas agregadas por fonte.

### Backup privado do perfil

`GET /profile/export` gera um JSON portátil com perfil, competências, idiomas, experiências, preferências, política, respostas reutilizáveis e `JobSearchProfile`. `POST /profile/import` restaura esse bundle em uma instalação vazia ou substitui o perfil atual, sem migrar IDs internos, vagas, matches ou histórico de candidaturas. O arquivo contém dados pessoais: mantenha-o privado e não o adicione ao Git. Os nomes `vagas-profile-backup*.json` e `profile-backup*.json` ficam ignorados pelo repositório.

## Scheduler e worker

No Compose/local, o worker contínuo usa cron no próprio processo, sem Redis. `JOB_COLLECTION_CRON` segue o formato cron de cinco campos e o padrão `0 */6 * * *` executa a cada seis horas, respeitando a recomendação da Remotive de no máximo quatro coletas diárias. A opção `protect` impede sobreposição dentro do scheduler e as fontes de uma execução são processadas em sequência para compartilhar corretamente o orçamento diário. No deploy econômico, o GitHub Actions chama `POST /worker/run-once` a cada seis horas; a API agenda um ciclo protegido por lock atômico no PostgreSQL e continua o trabalho após responder `202`.

O heartbeat é atualizado a cada 30 segundos. `/health` considera o worker indisponível após 90 segundos sem atualização e também informa se o perfil ainda é de demonstração. `SIGTERM` e `SIGINT` interrompem scheduler/heartbeat e fecham Prisma. A manutenção diária remove runs/logs expirados e marca vagas reais não vistas como `STALE` e depois `CLOSED` usando janelas configuráveis.

## Pré-filtro, IA e custos

Antes do matching, regras baratas verificam palavras excluídas, senioridade, modalidade, localização de vagas híbridas/presenciais, contratação e idade. Vagas aprovadas recebem `preliminaryScore` e são ordenadas antes da IA. Rejeições geram `JOB_PREFILTER_REJECTED`.

`LLM_MAX_ANALYSES_PER_RUN` e `LLM_MAX_ANALYSES_PER_DAY` deixam excedentes em `PENDING_ANALYSIS`; cada ciclo do worker retoma essa fila por prioridade, mesmo quando nenhuma vaga nova é importada ou a criação de uma coleta falha. A cota diária é reservada por atualização condicional atômica no PostgreSQL, portanto permanece segura com processos concorrentes. Resultados encontrados no cache devolvem a reserva. O hash de vaga + perfil + configuração e `MATCHING_ENGINE_VERSION` evitam nova chamada quando nada mudou. Sem `OPENAI_API_KEY`, o provider mock mantém o pipeline funcional.

Hard constraints continuam soberanas. A IA nunca altera o perfil nem cria competências ou respostas.

## Preparação de candidatura

Antes do enriquecimento ATS, o worker também resolve links intermediários quando existe um caminho público verificável: promove `rawData.applyUrl` de vagas antigas da Remote OK e extrai o link externo de candidatura em páginas públicas da Remotive. O link original da fonte é preservado em `originalUrl`; Jobicy e We Work Remotely continuam manuais quando o destino do empregador exige login. `POST /jobs/resolve-url` enriquece links públicos de ATS suportados sem submeter candidatura. Lever, Greenhouse, Ashby, SmartRecruiters, Recruitee, Workable, Personio e Pinpoint usam endpoints/feeds públicos para preencher o que for verificável; Breezy HR usa o `JobPosting` JSON-LD publicado na própria página pública da vaga; no Greenhouse o resolver também lê as perguntas públicas do formulário com `questions=true` e as preserva no kit da candidatura, sem respondê-las automaticamente. No SmartRecruiters, esta integração usa somente o Posting API público; a Application API exige credencial/autorização própria e por isso não é usada como atalho de submissão. LinkedIn/Indeed continuam no fluxo manual/FAST APPLY porque não há extração por API pública de candidato. `POST /jobs/import/manual` registra a vaga externa, executa o matching e, quando uma candidatura é criada, já prepara o pacote local. O campo `fastApply=true` é apenas um hint explícito para classificar a vaga como candidatura rápida no dashboard; não dispara cliques nem submissão.

`POST /applications/:id/prepare` gera um pacote estruturado a partir exclusivamente do perfil salvo e da vaga: contato, formação, competências, idiomas, experiências priorizadas por relevância, currículo em Markdown e respostas marcadas como reutilizáveis. O pacote registra informações ausentes em vez de inventá-las e permanece local em `ApplicationPreparation`. Com `AUTO_PREPARE_APPLICATIONS=true`, o worker também prepara automaticamente candidaturas `READY`/`REVIEW_REQUIRED` que ainda não possuem pacote, em lotes configuráveis. `GET /applications/:id/fast-apply-kit` cruza perguntas públicas do ATS com campos já existentes no perfil e respostas explicitamente autorizadas, informando o que ainda precisa de intervenção manual. Para perguntas não sensíveis ainda sem resposta, o dashboard permite **Salvar e reutilizar**; `POST /applications/:id/questions/answers` valida que a pergunta realmente pertence ao formulário conhecido daquela candidatura, salva a resposta e atualiza o pacote. Perguntas demográficas, de privacidade ou consentimento nunca podem ser autorizadas para reutilização automática. `GET /applications/:id/eligibility` avalia a política configurada, limite diário, fonte, score, dados faltantes e separa esses requisitos dos bloqueios operacionais (`SAFE_MODE` e ausência de um provider de submissão autorizado).

## HTTP, retry e circuit breaker

Todas as fontes usam um cliente centralizado com:

- timeout configurável;
- `User-Agent` identificável;
- rate limit conservador por adapter;
- retry exponencial em timeout, rede, 5xx e 429;
- respeito a `Retry-After`;
- nenhum retry em 400, 401, 403 ou schema inválido;
- classificação persistida em `CollectionError`.

Após `SOURCE_FAILURE_THRESHOLD`, a fonte entra em cooldown por `SOURCE_COOLDOWN_MINUTES`. Ela não é desabilitada permanentemente.

## Variáveis principais

| Variável                                   | Padrão        | Finalidade                                         |
| ------------------------------------------ | ------------- | -------------------------------------------------- |
| `DATABASE_URL`                             | local         | PostgreSQL padrão/Supabase PostgreSQL              |
| `ADMIN_API_KEY`                            | vazio         | Proteção temporária; obrigatória em production     |
| `SEED_DEMO_DATA`                           | `true`        | Popula perfil/vagas mock apenas em desenvolvimento |
| `WORKER_MODE`                              | `continuous`  | `continuous` local ou `cron` no worker agendado    |
| `WORKER_HEALTH_TTL_SECONDS`                | `90`          | Janela máxima do heartbeat considerada saudável    |
| `WORKER_CYCLE_LOCK_TTL_MINUTES`            | `30`          | Expira lock órfão de um ciclo único                |
| `JOB_COLLECTION_CRON`                      | `0 */6 * * *` | Agenda do worker                                   |
| `JOB_SOURCE_TIMEOUT_MS`                    | `10000`       | Timeout HTTP                                       |
| `JOB_SOURCE_MAX_RETRIES`                   | `3`           | Tentativas adicionais                              |
| `JOB_SOURCE_USER_AGENT`                    | identificável | Identidade da aplicação                            |
| `SOURCE_FAILURE_THRESHOLD`                 | `5`           | Falhas antes do cooldown                           |
| `SOURCE_COOLDOWN_MINUTES`                  | `30`          | Duração do cooldown                                |
| `COLLECTION_RUN_RETENTION_DAYS`            | `30`          | Retenção de execuções finalizadas                  |
| `AUDIT_LOG_RETENTION_DAYS`                 | `90`          | Retenção de logs de auditoria                      |
| `JOB_STALE_AFTER_DAYS`                     | `14`          | Dias sem reaparecer antes de `STALE`               |
| `JOB_CLOSED_AFTER_DAYS`                    | `30`          | Dias sem reaparecer antes de `CLOSED`              |
| `JOB_STATUS_SYNC_INTERVAL_MINUTES`         | `360`         | Intervalo de status explícito quando suportado     |
| `JOB_STATUS_SYNC_BATCH_SIZE`               | `100`         | IDs verificados por fonte/ciclo                    |
| `AUTO_ANALYZE_NEW_JOBS`                    | `true`        | Análise após ingestão                              |
| `LLM_MAX_ANALYSES_PER_RUN`                 | `25`          | Limite por execução                                |
| `LLM_MAX_ANALYSES_PER_DAY`                 | `100`         | Limite diário                                      |
| `MATCHING_ENGINE_VERSION`                  | `3`           | Versão auditável                                   |
| `MAX_JOB_AGE_DAYS`                         | `14`          | Freshness padrão                                   |
| `ENABLE_REAL_JOB_SOURCES`                  | `true`        | Liga adapters reais                                |
| `ENABLE_AUTO_ANALYSIS`                     | `true`        | Feature flag de análise                            |
| `AUTO_PREPARE_APPLICATIONS`                | `true`        | Prepara pacotes pendentes no worker                |
| `APPLICATION_PREPARATION_INTERVAL_SECONDS` | `60`          | Intervalo da preparação automática                 |
| `APPLICATION_PREPARATION_BATCH_SIZE`       | `25`          | Máximo preparado por ciclo                         |
| `ENABLE_NOTIFICATIONS`                     | `false`       | Liga notificações locais/externas                  |
| `NOTIFICATION_WEBHOOK_URL`                 | vazio         | Webhook HTTP opcional para eventos                 |
| `NOTIFICATION_WEBHOOK_TIMEOUT_MS`          | `5000`        | Timeout do webhook                                 |
| `ENABLE_SCHEDULER`                         | `true`        | Agenda periódica                                   |
| `REMOTIVE_ENABLED`                         | `true`        | Adapter Remotive                                   |
| `ARBEITNOW_ENABLED`                        | `true`        | Adapter Arbeitnow                                  |
| `JOBICY_ENABLED`                           | `true`        | Adapter Jobicy                                     |
| `HIMALAYAS_ENABLED`                        | `true`        | Adapter Himalayas                                  |
| `REMOTEOK_ENABLED`                         | `true`        | Adapter Remote OK                                  |
| `WEWORKREMOTELY_ENABLED`                   | `true`        | Adapter We Work Remotely                           |
| `SOLIDES_ENABLED`                          | `true`        | Adapter público Sólides                            |
| `GUPY_ENABLED`                             | `true`        | Adapter MCP oficial da Gupy                        |
| `SAFE_MODE`                                | `true`        | Proíbe futuras escritas externas                   |

A lista completa está em `.env.example`. Nenhum segredo é salvo em `JobSource.configuration` ou logs.

## Testes e qualidade

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Testes de adapters e HTTP usam mocks; a suíte automatizada não depende da internet.

## Deploy no Render

O repositório já inclui `render.yaml` e o guia `docs/deploy-render.md`. O Blueprint descreve dois recursos na mesma região (`virginia`): PostgreSQL `vagas-db` e Web Service `vagas-api`. A execução periódica fica em `.github/workflows/scheduled-worker.yml`, evitando um Cron Job pago no Render. O Blueprint não cria/sincroniza nada até ser confirmado no Render.

A API usa `./docker-entrypoint.sh node dist/src/server.js`, `RUN_MIGRATIONS=true`, `RUN_SEED=true`, `SEED_DEMO_DATA=false`, `WORKER_MODE=cron` e `HOST=0.0.0.0`. O workflow agendado do GitHub só precisa de `VAGAS_API_URL` e `VAGAS_ADMIN_API_KEY` como secrets para chamar o endpoint protegido; `SAFE_MODE=true` permanece explícito no serviço.

Use health path `/health`. Não use hostname `postgres` fora do Compose; ele existe apenas na rede Docker local. Para detalhes de custo, bootstrap e primeira publicação, siga `docs/deploy-render.md`.

## Troubleshooting

- Worker `unavailable`: confira `docker compose logs worker`, cron e `WorkerHeartbeat`.
- Fonte em cooldown: consulte `GET /job-sources/:id` e o último `CollectionError`.
- Vagas em `PENDING_ANALYSIS`: verifique flags e limites de IA.
- `401` administrativo: envie `X-Admin-Key` igual a `ADMIN_API_KEY`.
- Nenhuma vaga real: confirme fontes habilitadas, keywords e filtros do `JobSearchProfile`.
- Remotive `429`: não reduza limites; aguarde `Retry-After` e mantenha cron conservador.

## Limitações e próxima fase

- Um perfil operacional, embora as relações já sejam por candidato.
- Arbeitnow pagina de forma limitada (até cinco páginas por execução) para manter coleta conservadora.
- Remotive, Jobicy e Himalayas alternam uma keyword por execução, em vez de disparar várias chamadas no mesmo ciclo; aliases comuns de cargos em português são convertidos para equivalentes em inglês e deduplicados apenas nessas fontes globais, sem alterar o perfil salvo.
- Remote OK faz uma única leitura do feed por ciclo e aplica as keywords localmente. Quando o feed fornece um `apply_url` externo, ele é usado como URL de candidatura e a página da Remote OK permanece em `originalUrl`; o dashboard exibe `Ver na fonte` para preservar atribuição e link de volta.
- We Work Remotely usa o RSS público oficial, também com uma leitura por ciclo, filtro local e atribuição/link de volta visíveis no dashboard.
- Sólides usa somente páginas públicas de busca e os metadados estruturados `JobPosting` publicados nas páginas das vagas; não autentica candidato nem envia candidatura. A descoberta é limitada por localização e a leitura de detalhes é limitada a 12 vagas por ciclo.
- Gupy usa o MCP oficial público para candidatos (`candidates.mcp.api.gupy.io/mcp`) e a tool read-only `search_jobs`. Uma keyword em português é rotacionada por ciclo; cidade, estado, modalidade e tipo de vaga são enviados como filtros quando disponíveis. Nenhum login, currículo privado ou candidatura é acessado pelo MCP.
- O limite diário possui reserva atômica compartilhada, mas cada processo ainda limita apenas sua própria concorrência por execução; dimensione múltiplos workers com cautela para não sobrecarregar as fontes.
- Jobicy usa confirmação explícita de `active/closed/unknown`; Remotive e Arbeitnow continuam usando ausência temporal (`lastSeenAt`) como evidência de `STALE`/`CLOSED`.
- Notificações externas suportam webhook genérico, mas ainda não existem providers específicos de e-mail/Slack/Discord.
- Reprocessamento completo existe por `POST /jobs/reprocess` e CLI `npm run reprocess:jobs`, mas requer um perfil real; o seed permanece deliberadamente de demonstração.
- O currículo personalizado em Markdown, timeline e follow-up pós-candidatura já existem. O worker também tenta enriquecer candidaturas `READY`/`REVIEW_REQUIRED` com dados públicos de ATS suportados antes da preparação, armazenando perguntas públicas quando disponíveis e usando cache de 24 horas por URL. Ao marcar uma candidatura como `SUBMITTED`, o sistema agenda acompanhamento padrão em sete dias; o dashboard permite reagendar/concluir e o worker detecta pendências. A submissão automática possui interface/registry e endpoint, porém nenhum provider externo está habilitado por padrão; `SAFE_MODE=true` continua bloqueando qualquer envio.
- O dashboard e a proteção por API key já existem. Ainda faltam autenticação multiusuário/OAuth e integrações externas oficiais para sincronizar automaticamente respostas/status de ATS; esses itens dependem de credenciais/autorização do provedor.
