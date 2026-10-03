# Job Application Agent — Fase 3 foundation

Backend auditável que coleta vagas reais autorizadas, normaliza, deduplica, pré-filtra, analisa, reprocessa e prepara candidaturas locais. O sistema **não envia candidaturas**, não automatiza LinkedIn/Indeed e não usa navegador, CAPTCHA bypass ou evasão anti-bot.

## Stack e arquitetura

Node.js 20+, TypeScript, Fastify, PostgreSQL, Prisma, Zod, Vitest, Docker Compose e Swagger. Fastify mantém API e worker pequenos, com logs JSON via Pino. Domínio, persistência e integrações ficam separados:

```text
src/
  config/                       ambiente validado
  database/                     Prisma client
  integrations/
    job-sources/
      mock/                     fonte determinística
      providers/                Remotive e Arbeitnow
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

Endpoints administrativos usam `X-Admin-Key` quando `ADMIN_API_KEY` está configurada e possuem rate limit de cinco chamadas por minuto.

```bash
curl -X POST http://localhost:3000/job-sources/run \
  -H "X-Admin-Key: local-admin-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

A resposta `202` contém `collectionRunIds`. Consulte o progresso em `GET /collection-runs/:id`. Para uma fonte específica, use `POST /job-sources/:id/run`.

## Endpoints

Compatibilidade da Fase 1 preservada:

- `GET /health`
- `GET|POST|PUT|PATCH /profile`, `GET /profile/readiness`
- `GET|POST /candidate-answers`, `PUT|DELETE /candidate-answers/:id`
- `GET /jobs`, `GET /jobs/:id`
- `POST /jobs/import/mock`, `POST /jobs/:id/analyze`, `POST /jobs/reprocess`
- `GET /matches`, `GET /matches/:id`
- `GET /applications`, `GET /applications/:id`
- `POST /applications/:id/prepare`, `GET /applications/:id/preparation`
- `GET /applications/:id/eligibility` para explicar requisitos e bloqueios de automação
- `POST /applications/:id/submit` para provider de submissão explicitamente autorizado
- `PATCH /applications/:id/status` para acompanhamento manual auditável
- `GET /stats`, `GET /docs`

Fase 2:

- `GET /job-sources`, `GET /job-sources/:id`
- `POST /job-sources/run`, `POST /job-sources/:id/run`
- `GET /collection-runs`, `GET /collection-runs/:id`
- `GET /job-search-profile`, `PUT /job-search-profile`

Listagens usam `page`/`pageSize`, limitados a 100. Collection runs aceitam `source`, `status`, `from` e `to`. `/stats` inclui métricas agregadas por fonte.

## Scheduler e worker

O worker usa cron no próprio processo, sem Redis. `JOB_COLLECTION_CRON` segue o formato cron de cinco campos e o padrão `0 */6 * * *` executa a cada seis horas, respeitando a recomendação da Remotive de no máximo quatro coletas diárias. A opção `protect` impede sobreposição dentro do scheduler e as fontes de uma execução são processadas em sequência para compartilhar corretamente o orçamento diário.

O heartbeat é atualizado a cada 30 segundos. `/health` considera o worker indisponível após 90 segundos sem atualização e também informa se o perfil ainda é de demonstração. `SIGTERM` e `SIGINT` interrompem scheduler/heartbeat e fecham Prisma. A manutenção diária remove runs/logs expirados e marca vagas reais não vistas como `STALE` e depois `CLOSED` usando janelas configuráveis.

## Pré-filtro, IA e custos

Antes do matching, regras baratas verificam palavras excluídas, senioridade, modalidade, localização de vagas híbridas/presenciais, contratação e idade. Vagas aprovadas recebem `preliminaryScore` e são ordenadas antes da IA. Rejeições geram `JOB_PREFILTER_REJECTED`.

`LLM_MAX_ANALYSES_PER_RUN` e `LLM_MAX_ANALYSES_PER_DAY` deixam excedentes em `PENDING_ANALYSIS`; cada ciclo do worker retoma essa fila por prioridade, mesmo quando nenhuma vaga nova é importada ou a criação de uma coleta falha. A cota diária é reservada por atualização condicional atômica no PostgreSQL, portanto permanece segura com processos concorrentes. Resultados encontrados no cache devolvem a reserva. O hash de vaga + perfil + configuração e `MATCHING_ENGINE_VERSION` evitam nova chamada quando nada mudou. Sem `OPENAI_API_KEY`, o provider mock mantém o pipeline funcional.

Hard constraints continuam soberanas. A IA nunca altera o perfil nem cria competências ou respostas.

## Preparação de candidatura

`POST /applications/:id/prepare` gera um pacote estruturado a partir exclusivamente do perfil salvo e da vaga: contato, formação, competências, idiomas, experiências priorizadas por relevância, currículo em Markdown e respostas marcadas como reutilizáveis. O pacote registra informações ausentes em vez de inventá-las e permanece local em `ApplicationPreparation`; nenhuma submissão externa é realizada. `GET /applications/:id/preparation` recupera a versão mais recente. `GET /applications/:id/eligibility` avalia a política configurada, limite diário, fonte, score, dados faltantes e separa esses requisitos dos bloqueios operacionais (`SAFE_MODE` e ausência de um provider de submissão autorizado).

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

| Variável                          | Padrão        | Finalidade                                     |
| --------------------------------- | ------------- | ---------------------------------------------- |
| `DATABASE_URL`                    | local         | PostgreSQL padrão/Supabase PostgreSQL          |
| `ADMIN_API_KEY`                   | vazio         | Proteção temporária; obrigatória em production |
| `JOB_COLLECTION_CRON`             | `0 */6 * * *` | Agenda do worker                               |
| `JOB_SOURCE_TIMEOUT_MS`           | `10000`       | Timeout HTTP                                   |
| `JOB_SOURCE_MAX_RETRIES`          | `3`           | Tentativas adicionais                          |
| `JOB_SOURCE_USER_AGENT`           | identificável | Identidade da aplicação                        |
| `SOURCE_FAILURE_THRESHOLD`        | `5`           | Falhas antes do cooldown                       |
| `SOURCE_COOLDOWN_MINUTES`         | `30`          | Duração do cooldown                            |
| `COLLECTION_RUN_RETENTION_DAYS`   | `30`          | Retenção de execuções finalizadas              |
| `AUDIT_LOG_RETENTION_DAYS`        | `90`          | Retenção de logs de auditoria                  |
| `JOB_STALE_AFTER_DAYS`            | `14`          | Dias sem reaparecer antes de `STALE`           |
| `JOB_CLOSED_AFTER_DAYS`           | `30`          | Dias sem reaparecer antes de `CLOSED`          |
| `AUTO_ANALYZE_NEW_JOBS`           | `true`        | Análise após ingestão                          |
| `LLM_MAX_ANALYSES_PER_RUN`        | `25`          | Limite por execução                            |
| `LLM_MAX_ANALYSES_PER_DAY`        | `100`         | Limite diário                                  |
| `MATCHING_ENGINE_VERSION`         | `1`           | Versão auditável                               |
| `MAX_JOB_AGE_DAYS`                | `14`          | Freshness padrão                               |
| `ENABLE_REAL_JOB_SOURCES`         | `true`        | Liga adapters reais                            |
| `ENABLE_AUTO_ANALYSIS`            | `true`        | Feature flag de análise                        |
| `ENABLE_NOTIFICATIONS`            | `false`       | Liga notificações locais/externas              |
| `NOTIFICATION_WEBHOOK_URL`        | vazio         | Webhook HTTP opcional para eventos             |
| `NOTIFICATION_WEBHOOK_TIMEOUT_MS` | `5000`        | Timeout do webhook                             |
| `ENABLE_SCHEDULER`                | `true`        | Agenda periódica                               |
| `REMOTIVE_ENABLED`                | `true`        | Adapter Remotive                               |
| `ARBEITNOW_ENABLED`               | `true`        | Adapter Arbeitnow                              |
| `SAFE_MODE`                       | `true`        | Proíbe futuras escritas externas               |

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

Crie três recursos usando o mesmo repositório/imagem:

1. PostgreSQL gerenciado (ou Supabase apenas como PostgreSQL) e copie sua URL TLS para `DATABASE_URL`.
2. Web Service/API com start command `./docker-entrypoint.sh node dist/src/server.js`, `RUN_MIGRATIONS=true`, `RUN_SEED=true`, `HOST=0.0.0.0` e uma `ADMIN_API_KEY` forte.
3. Background Worker com `./docker-entrypoint.sh node dist/src/worker.js`, `RUN_MIGRATIONS=false` e `RUN_SEED=false`.

Compartilhe as demais variáveis entre API e worker. Use health path `/health`. Não use hostname `postgres` fora do Compose; ele existe apenas na rede Docker local.

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
- Remotive alterna uma keyword por execução, em vez de disparar várias chamadas no mesmo ciclo.
- O limite diário possui reserva atômica compartilhada, mas cada processo ainda limita apenas sua própria concorrência por execução; dimensione múltiplos workers com cautela para não sobrecarregar as fontes.
- `STALE` e `CLOSED` usam ausência temporal (`lastSeenAt`) como evidência; confirmação explícita por API/ATS pode ser adicionada no futuro.
- Notificações externas suportam webhook genérico, mas ainda não existem providers específicos de e-mail/Slack/Discord.
- Reprocessamento completo existe por `POST /jobs/reprocess` e CLI `npm run reprocess:jobs`, mas requer um perfil real; o seed permanece deliberadamente de demonstração.
- O currículo personalizado em Markdown e o acompanhamento manual de candidatura já existem. A submissão automática possui interface/registry e endpoint, porém nenhum provider externo está habilitado por padrão; `SAFE_MODE=true` continua bloqueando qualquer envio.
- Ainda não há dashboard, autenticação completa, OAuth nem integração de acompanhamento externo. Esses itens continuam para as próximas etapas da Fase 3.
