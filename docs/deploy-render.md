# Deploy no Render

O repositório inclui `render.yaml` para criar a infraestrutura mínima do agente sem alterar o funcionamento local.

## Recursos definidos

- `vagas-api`: Web Service Docker, com `/health` como health check.
- `vagas-worker`: Background Worker Docker usando a mesma imagem.
- `vagas-db`: PostgreSQL privado para API e worker.

O Blueprint usa `starter` para API/worker e `free` para o PostgreSQL. Revise os planos no Render antes de sincronizar o Blueprint, porque API/worker 24/7 podem gerar cobrança e um banco gratuito não é a opção recomendada para retenção permanente de produção.

## Alternativa sem worker 24/7

Quando o objetivo for reduzir custo, a API pode continuar como Web Service e o processamento em segundo plano pode usar um Cron Job executando `node dist/src/worker-once.js` a cada seis horas. Nesse modo use `WORKER_MODE=cron` na API e no cron, com `WORKER_HEALTH_TTL_SECONDS` maior que o intervalo entre execuções (por exemplo, `25200` para sete horas).

O ciclo único executa coleta, retomada de `PENDING_ANALYSIS`, sincronização de disponibilidade, preparação das candidaturas pendentes e retenção, grava `IDLE` no heartbeat e encerra normalmente. Isso evita manter um processo de worker contínuo quando a plataforma oferece execução agendada.

O `render.yaml` continua descrevendo a opção de worker contínuo. A alternativa com Cron Job deve usar a mesma `DATABASE_URL`, `ADMIN_API_KEY` e flags operacionais da API, mantendo `SAFE_MODE=true`.

## Segurança de bootstrap

A API executa:

```
RUN_MIGRATIONS=true
RUN_SEED=true
SEED_DEMO_DATA=false
```

Com `SEED_DEMO_DATA=false`, o seed cadastra/atualiza apenas o registry de fontes. Ele não cria candidato fictício, vagas mock, matches ou candidaturas de demonstração.

O worker usa:

```
RUN_MIGRATIONS=false
RUN_SEED=false
```

`ADMIN_API_KEY` é gerada pelo Render para a API e compartilhada com o worker por referência de variável. `SAFE_MODE=true` permanece explícito nos dois serviços.

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

A API e o worker compartilham `DATABASE_URL`. O worker mantém coleta, análise, heartbeat, preparação de candidaturas e sincronização de disponibilidade. Somente a API executa migrations.

Fontes oficiais de referência do Blueprint:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/docker
