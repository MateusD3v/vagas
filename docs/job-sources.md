# Fontes de vagas

Verificação mais recente: **3 de outubro de 2026**.

Os adapters deste projeto fazem somente requisições `GET` a APIs públicas. Eles não autenticam como candidato, não enviam candidaturas e não contornam CAPTCHA, rate limits ou controles anti-bot. Toda vaga preserva a URL original e a referência da fonte.

## Remotive — ACTIVE

- Tipo: API pública de vagas remotas.
- Endpoint: `GET https://remotive.com/api/remote-jobs`.
- Documentação oficial: <https://github.com/remotive-com/remote-jobs-api>.
- Autenticação: não requerida.
- Filtros usados: `search` e `limit`.
- Campos: ID, URL, título, empresa, categoria, tipo, publicação, localização permitida, salário textual e descrição HTML.
- Normalização: descrição sem HTML, modalidade `REMOTE`, senioridade inferida conservadoramente e tecnologias reconhecidas por dicionário limitado.
- Limites/regras: a documentação recomenda no máximo quatro consultas por dia e informa bloqueio acima de duas consultas por minuto. As vagas públicas têm atraso de 24 horas.
- Atribuição: ao exibir/reutilizar uma vaga, manter o link para Remotive e identificá-la como fonte. Os dados não devem ser republicados em outros agregadores.
- Controle interno: uma requisição por execução; limite de 1 requisição a cada 30 segundos e cron padrão a cada seis horas.

## Arbeitnow — ACTIVE

- Tipo: API pública agregada de vagas, majoritariamente originadas de ATSs públicos.
- Endpoint: `GET https://www.arbeitnow.com/api/job-board-api`.
- Documentação oficial: <https://www.arbeitnow.com/blog/job-board-api>.
- Autenticação: não requerida.
- Campos: slug, empresa, título, descrição, remoto, URL, tags, tipos de contratação, localização e criação.
- Normalização: filtro de keywords local, descrição sem HTML, modalidade remota/presencial, senioridade inferida conservadoramente e tecnologias reconhecidas.
- Paginação: a API fornece paginação; a implementação consulta a primeira página e respeita `maxJobsPerRun`.
- Limites/regras: a documentação pública não publica uma cota numérica. O adapter usa limite interno conservador de 0,5 requisição por segundo e somente uma chamada por execução.

## Mock Job Source — DEVELOPMENT

- Tipo: mock local.
- Endpoint/autenticação: nenhum.
- Conteúdo: 15 vagas fictícias da Fase 1.
- Finalidade: desenvolvimento determinístico, seed e testes sem internet.
- Não é executado pelo scheduler no seed padrão; o endpoint compatível `POST /jobs/import/mock` permanece disponível.

## Falhas e desativação

Cada fonte pode ser desativada no banco (`JobSource.enabled`) e as fontes reais também possuem flags `ENABLE_REAL_JOB_SOURCES`, `REMOTIVE_ENABLED` e `ARBEITNOW_ENABLED`. Timeout, 429, 5xx e erros de schema são classificados. Após falhas consecutivas, a fonte entra em cooldown temporário; nunca é desabilitada permanentemente automaticamente.
