# Deploy no Render

O repositório inclui `render.yaml` para criar a infraestrutura mínima do agente sem alterar o funcionamento local.

## Recursos definidos

- `vagas-api`: Web Service Docker, com `/health` como health check.
- `vagas-db`: PostgreSQL privado para a API, na região `virginia`.
- `.github/workflows/scheduled-worker.yml`: agenda externa de seis em seis horas que chama o endpoint protegido `POST /worker/run-once`.

O objetivo é evitar um Cron Job pago no Render. A API no plano gratuito pode dormir entre períodos de uso; o workflow agendado faz uma chamada legítima a cada seis horas e o Render acorda o serviço quando necessário. O endpoint responde `202` e o processo continua o ciclo em background no próprio Web Service.

O ciclo usa um lock atômico persistido em `WorkerHeartbeat`, portanto chamadas duplicadas não iniciam dois ciclos em paralelo. Um lock abandonado expira após `WORKER_CYCLE_LOCK_TTL_MINUTES`.

## Segurança de bootstrap

A API executa:

```
RUN_MIGRATIONS=true
RUN_SEED=true
SEED_DEMO_DATA=false
WORKER_MODE=cron
WORKER_HEALTH_TTL_SECONDS=25200
SAFE_MODE=true
```

Com `SEED_DEMO_DATA=false`, o seed cadastra/atualiza apenas o registry de fontes. Ele não cria candidato fictício, vagas mock, matches ou candidaturas de demonstração.

`ADMIN_API_KEY` é gerada pelo Render e protege todos os endpoints de dados. O GitHub Actions precisa receber essa mesma chave como secret, nunca como texto versionado.

## GitHub Actions agendado

Depois de a API ficar online, cadastre no repositório:

- `VAGAS_API_URL`: URL pública do serviço, por exemplo `https://vagas-api.onrender.com`.
- `VAGAS_ADMIN_API_KEY`: mesmo valor de `ADMIN_API_KEY` do Render.

O workflow roda a cada seis horas e também aceita `workflow_dispatch` para teste manual. Se os secrets ainda não existirem, ele encerra sem erro e não chama a API.

O endpoint `POST /worker/run-once` executa, em sequência:

1. coleta das fontes habilitadas;
2. retomada de `PENDING_ANALYSIS`;
3. sincronização explícita de disponibilidade quando suportada;
4. preparação das candidaturas pendentes;
5. retenção e manutenção.

Use `GET /worker/status` e `GET /health` para acompanhar o último heartbeat.

## OpenAI

`OPENAI_API_KEY` é opcional. Sem ela o pipeline continua usando o provider mock e o matching determinístico. Para usar análise OpenAI em produção, configure a chave apenas no Render, sem adicioná-la ao Git.

## Primeira publicação

1. No Render, crie/sincronize o Blueprint apontando para este repositório e `render.yaml`.
2. Aguarde `vagas-db` e `vagas-api` ficarem disponíveis.
3. Confirme `GET /health`.
4. Preencha ou importe o perfil real.
5. Acesse `/dashboard` e informe a `ADMIN_API_KEY`.
6. Cadastre `VAGAS_API_URL` e `VAGAS_ADMIN_API_KEY` nos GitHub Actions secrets.
7. Rode manualmente o workflow `Scheduled worker trigger` uma vez e confira `GET /worker/status`.
8. Mantenha `SAFE_MODE=true` até existir um provider de submissão externo explicitamente autorizado.

## Limite do banco gratuito

O PostgreSQL gratuito do Render é adequado para validação inicial, mas possui expiração/limites próprios do plano. O perfil real pode ser exportado por `GET /profile/export` para backup privado antes de qualquer migração ou expiração.

Fontes oficiais de referência:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/docker
- https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule
