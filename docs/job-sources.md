# Fontes de vagas

Verificação mais recente: **6 de outubro de 2026**.

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
- Paginação: a API fornece paginação; a implementação percorre no máximo cinco páginas por execução e interrompe ao atingir `maxJobsPerRun`.
- Limites/regras: a documentação pública não publica uma cota numérica. O adapter usa limite interno conservador de 0,5 requisição por segundo e concorrência 1.

## Jobicy — ACTIVE

- Tipo: API pública de vagas remotas.
- Endpoint: `GET https://jobicy.com/api/v2/remote-jobs`.
- Documentação oficial: <https://jobicy.com/jobs-rss-feed>.
- Autenticação: não requerida para a API pública; sem chave, `url` aponta para a página da vaga na Jobicy.
- Janela pública: vagas publicadas nos últimos sete dias, com atraso aproximado de três horas.
- Filtros usados: `count`, `tag` e `cursor`; uma keyword é rotacionada por execução para manter a coleta conservadora.
- Paginação: cursor opaco (`nextCursor`), com até três páginas por execução e no máximo 200 itens por página.
- Normalização: descrição sem HTML, modalidade `REMOTE`, senioridade inferida conservadoramente, salário estruturado quando disponível e tecnologias reconhecidas.
- Atribuição: a URL pública da Jobicy é preservada como origem da vaga.
- Status explícito: `GET /api/v2/remote-jobs/status?ids=...` verifica até 100 IDs por chamada. `closed` pode encerrar a vaga; `unknown` nunca é tratado como confirmação de fechamento.
- Controle interno: concorrência 1, limite conservador de uma requisição a cada 30 segundos, sincronização periódica de disponibilidade e sem uso da API comercial paga por padrão.

## Himalayas — ACTIVE

- Tipo: API pública JSON de vagas remotas.
- Endpoint usado: `GET https://himalayas.app/jobs/api/search`.
- Documentação oficial: <https://himalayas.app/docs/remote-jobs-api>.
- Autenticação: não requerida.
- Filtros usados: uma keyword por execução em `q` e ordenação `recent`; a keyword é rotacionada entre os termos do perfil para manter a coleta conservadora.
- Campos: GUID, título, empresa, descrição HTML, tipo de contratação, senioridade, restrições de país/fuso, categorias, salário, publicação, expiração e link de candidatura.
- Normalização: descrição sem HTML, modalidade `REMOTE`, senioridade inferida de forma conservadora, localização baseada nas restrições de país e tecnologias reconhecidas. O parser aceita as duas representações oficiais atualmente publicadas para `locationRestrictions` (nomes de país como strings ou objetos com `alpha2`/`name`/`slug`) e fusos como strings ou números, evitando quebra por divergência entre README/OpenAPI.
- Limite público: até 20 registros por resposta; o adapter usa no máximo 20 e faz somente uma requisição por execução.
- Atualização/rate limit: a documentação informa atualização diária e rate limit sem cota numérica pública. O adapter usa limite interno de uma requisição a cada 30 segundos e concorrência 1.
- Atribuição: ao exibir dados da vaga, manter o link retornado e identificar Himalayas como fonte. O projeto não republica as vagas em outros job boards.
- Controle interno: cron padrão a cada seis horas, deduplicação central e `HIMALAYAS_ENABLED` para desativação explícita.

## Remote OK — ACTIVE

- Tipo: API pública JSON de vagas remotas.
- Endpoint: `GET https://remoteok.com/api`.
- Documentação/FAQ oficial: <https://remoteok.com/faq>.
- Autenticação: não requerida.
- Formato: o primeiro item do array é um objeto de metadados/termos; os demais são vagas. `id` é a identidade estável usada pelo projeto; `slug` é metadado e pode vir vazio em entradas reais sem invalidar todo o feed.
- Filtros usados: o adapter faz uma única requisição por ciclo e aplica as keywords do perfil localmente em cargo, empresa, tags e descrição. Isso evita depender da taxonomia própria de tags da plataforma.
- Campos: ID, slug, data/epoch, empresa, cargo, tags, descrição HTML, localização, salário mínimo/máximo, URL da vaga e URL de aplicação.
- Normalização: descrição sem HTML, modalidade `REMOTE`, contratação e senioridade inferidas conservadoramente, tecnologias reconhecidas e salário preservado sem inventar moeda.
- Atribuição: o dashboard exibe a fonte como **Remote OK** e o link principal armazenado aponta para a URL da vaga no Remote OK. A fonte exige crédito e hyperlink de volta quando os dados são usados.
- Controle interno: uma requisição por execução, concorrência 1, limite interno de uma requisição a cada 30 segundos, deduplicação central e `REMOTEOK_ENABLED` para desativação explícita.

## We Work Remotely — ACTIVE

- Tipo: RSS público oficial de vagas remotas.
- Feed: `GET https://weworkremotely.com/remote-jobs.rss`.
- Página oficial do feed: <https://weworkremotely.com/remote-job-rss-feed>.
- Autenticação: não requerida. A própria WWR informa que qualquer pessoa pode usar o feed.
- Regra de uso: a WWR pede atribuição e link de volta; por isso a URL da vaga no WWR é preservada como `applicationUrl`/`originalUrl` e o dashboard exibe a fonte **We Work Remotely**.
- Campos lidos: título, link, GUID, publicação, descrição, região, país, estado, categoria, tipo, skills e expiração quando presentes.
- Empresa/cargo: o feed usa normalmente o título no formato `Empresa: Cargo`; se o formato não vier assim, o adapter só aceita a vaga quando houver criador explícito no RSS, sem inventar empresa.
- Filtros: uma única leitura do feed por ciclo; keywords do perfil são aplicadas localmente em cargo, empresa, descrição, skills e categoria.
- Normalização: HTML removido da descrição, modalidade `REMOTE`, contratação e senioridade inferidas conservadoramente e tecnologias reconhecidas por dicionário limitado.
- Controle interno: concorrência 1, limite conservador de uma requisição a cada 30 segundos, deduplicação central e `WEWORKREMOTELY_ENABLED` para desativação explícita.

## Sólides — ACTIVE

- Tipo: portal/ATS com páginas públicas de busca e páginas públicas de vaga.
- Páginas usadas: `GET https://vagas.solides.com.br/vagas/todas/<localização>` e as URLs `/vaga/<id>/<slug>` descobertas nelas.
- Autenticação: não requerida para a coleta. O adapter não usa login de candidato, não envia currículo e não executa candidatura.
- Descoberta: usa até três localizações do perfil por ciclo; Belém e Ananindeua são resolvidas para as rotas públicas `belem-pa` e `ananindeua-pa`, e busca remota usa `home-office`.
- Detalhes: lê somente o `JobPosting` JSON-LD publicado na página pública da vaga. Empresa, cargo, descrição, localização, modalidade, contratação, publicação e salário são usados apenas quando publicados.
- Filtros: keywords do perfil permanecem em português e são aplicadas localmente depois da leitura dos metadados públicos. O pré-filtro central continua responsável pelas preferências finais.
- Limites internos: no máximo 12 vagas normalizadas por ciclo, leitura sequencial e concorrência 1.
- Segurança: mudança de estrutura que impeça encontrar links ou `JobPosting` gera `INVALID_RESPONSE`; o adapter não inventa dados nem tenta contornar login/CAPTCHA.
- Atribuição: `applicationUrl` e `originalUrl` preservam a URL pública da vaga na Sólides, e `rawData.attribution` registra **Sólides Vagas**.
- Controle interno: `SOLIDES_ENABLED` permite desativação explícita sem afetar as demais fontes.

## Mock Job Source — DEVELOPMENT

- Tipo: mock local.
- Endpoint/autenticação: nenhum.
- Conteúdo: 15 vagas fictícias da Fase 1.
- Finalidade: desenvolvimento determinístico, seed e testes sem internet.
- Não é executado pelo scheduler no seed padrão; o endpoint compatível `POST /jobs/import/mock` permanece disponível.

## Falhas e desativação

Cada fonte pode ser desativada no banco (`JobSource.enabled`) e as fontes reais também possuem flags `ENABLE_REAL_JOB_SOURCES`, `REMOTIVE_ENABLED`, `ARBEITNOW_ENABLED`, `JOBICY_ENABLED`, `HIMALAYAS_ENABLED`, `REMOTEOK_ENABLED`, `WEWORKREMOTELY_ENABLED` e `SOLIDES_ENABLED`. Timeout, 429, 5xx e erros de schema são classificados. Após falhas consecutivas, a fonte entra em cooldown temporário; nunca é desabilitada permanentemente automaticamente.
