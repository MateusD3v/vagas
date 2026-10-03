# Pipeline de coleta e análise

```text
Scheduler / execução manual
           |
           v
   JobCollectionService
           |
           v
    JobSourceRegistry
           |
           v
   Adapter da fonte ─── GET público com timeout/retry/rate limit
           |
           v
      Normalização
           |
           v
     Validação Zod
           |
           v
 Ingestão transacional
   |              |
   |              +── JobSourceReference + lastSeenAt
   v
 Job canônico / deduplicação
           |
           v
      Pré-filtro
     /          \
 REJECT          PASS + preliminaryScore
   |                     |
 auditoria        ordenação por prioridade
                         |
                  limites diário/execução
                         |
                  JobMatchingService
                         |
                APPLY / REVIEW / SKIP
                         |
               Application idempotente
                         |
               evento / AuditLog
```

## Idempotência e concorrência

- `Job.fingerprint` representa a ocorrência com URL normalizada.
- `Job.canonicalFingerprint` usa empresa, cargo e localização para localizar possíveis duplicatas; ele não confirma nem mescla vagas sozinho, pois duas oportunidades reais podem compartilhar esses campos.
- `JobSourceReference` possui constraints únicas por fonte/ID, fonte/URL e vaga/fonte.
- criação de vaga e referência ocorre em transação;
- conflitos `P2002` causados por coletas concorrentes são relidos e convertidos em duplicata;
- `JobMatch` e `Application` continuam únicos por candidato/vaga;
- reanálises reutilizam o resultado quando `analysisInputHash` e `engineVersion` não mudaram.

## Estados

Vagas percorrem `DISCOVERED`, `PREFILTERED`, `PENDING_ANALYSIS` e `ANALYZED`. Elas podem terminar em `REJECTED_BY_PREFILTER` ou `ERROR`. `STALE` e `CLOSED` estão preparados para uma política futura de expiração; ausência em um único ciclo nunca fecha uma vaga.

Cada fonte gera um `CollectionRun` em `RUNNING`, finalizado como:

- `SUCCESS`: pipeline terminou sem erros;
- `PARTIAL`: algumas vagas falharam, mas a fonte produziu resultado utilizável;
- `FAILED`: a fonte/execução falhou integralmente.

Os detalhes normalizados ficam em `CollectionError`; payloads e segredos não entram nos logs.
