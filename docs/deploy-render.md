# Deploy no Render

O repositório inclui `render.yaml` para criar a infraestrutura mínima do agente sem alterar o funcionamento local.

## Recursos definidos

- `vagas-api`: Web Service Docker, com `/health` como health check.
- `vagas-worker-cron`: Cron Job Docker usando a mesma imagem, executado a cada seis horas.
- `vagas-db`: PostgreSQL privado para API e cron, na região `virginia`.

API, cron e banco ficam explicitamente na mesma região (`virginia`) para preservar conectividade privada e evitar diferenças de latência/região. Como já existe um `vagas-db` nesse workspace, o Blueprint referencia o recurso pelo nome e não fixa `databaseName`/`user`, que são propriedades imutáveis do banco existente.

O Blueprint foi ajustado para a opção de menor custo operacional: API no plano `free` e processamento em segundo plano via Cron Job. O cron não possui plano gratuito; a plataforma cobra pelo tempo ativo e mantém cobrança mínima mensal para esse tipo de serviço. O cron usa `node dist/src/worker-once.js`, `WORKER_MODE=cron` e `WORKER_HEALTH_TTL_SECONDS=25200`, suficiente para uma janela de sete horas entre heartbeats.

O ciclo único executa coleta, retomada de `PENDING_ANALYSIS`, sincronização de disponibilidade, preparação das candidaturas pendentes e retenção, grava `IDLE` no heartbeat e encerra normalmente. Isso evita manter um worker contínuo 24/7.

`SAFE_MODE=true` permanece explícito na API e no cron. O PostgreSQL está configurado no plano gratuito no Blueprint; ele é adequado para validação inicial, mas não deve ser tratado como armazenamento permanente sem revisar as condições atuais do plano.

## Segurança de bootstrap

A API executa:

```
RUN_MIGRATIONS=true
RUN_SEED=true
SEED_DEMO_DATA=false
```

Com `SEED_DEMO_DATA=false`, o seed cadastra/atualiza apenas o registry de fontes. Ele não cria candidato fictício, vagas mock, matches ou candidaturas de demonstração.

O cron usa:

```
RUN_MIGRATIONS=false
RUN_SEED=false
WORKER_MODE=cron
WORKER_HEALTH_TTL_SECONDS=25200
```

`ADMIN_API_KEY` é gerada pelo Render para a API e compartilhada com o cron por referência de variável. `SAFE_MODE=true` permanece explícito nos dois serviços.

## OpenAI

`OPENAI_API_KEY` é opcional. Sem ela o pipeline continua usando o provider mock e o matching determinístico. Para usar análise OpenAI em produção, configure a mesma chave em API e worker pelo painel do Render, sem adicioná-la ao Git.

## Primeira publicação

1. No Render, crie um Blueprint apontando para este repositório e para `render.yaml`.
2. Revise os planos antes de confirmar a criação.
3. Aguarde o banco ficar disponível e a API concluir migrations/seed.
4. Confirme `GET /health`.
5. Preencha o perfil real antes de deixar o worker coletar em produção.
6. Acesse `/dashboard` e informe a `ADMIN_API_KEY`.
7. Mantenha `SAFE_MODE=true` até existir um provider de submissão externo explicitamente autorizado.

## Depois do deploy

A API e o cron compartilham `DATABASE_URL`. O cron mantém coleta, análise, heartbeat, preparação de candidaturas e sincronização de disponibilidade. Somente a API executa migrations.

Fontes oficiais de referência do Blueprint:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/docker
