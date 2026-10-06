# Submissão por ATS

Estado pesquisado em 2026-10-05. O registry de submissão só deve habilitar um provider quando existir credencial oficialmente autorizada para aquela integração. `SAFE_MODE=true` continua sendo a trava operacional adicional.

## Greenhouse

- O Job Board API oferece leitura pública de vagas e perguntas do formulário.
- `POST /v1/boards/{board_token}/jobs/{id}` permite envio de candidatura, mas exige **Job Board API Key** via Basic Auth.
- A chave pertence à organização que usa Greenhouse; não é uma API pública de conta de candidato.
- Sem uma chave fornecida/autorizada pela organização, o agente deve usar o formulário hospedado e o kit local, não tentar enviar diretamente.

Referência: https://docs.greenhouse.io/job-board.html

## Lever

- O Postings API público permite listar/ler vagas publicadas.
- A API documenta submissão programática, porém `POST /v0/postings/{site}/{posting-id}?key=APIKEY` exige uma API key gerada por um Super Admin da conta Lever.
- A documentação também recomenda o formulário hospedado quando não há uma integração customizada autorizada.
- Sem chave da organização, o agente mantém o fluxo ATS assistido.

Referências:

- https://github.com/lever/postings-api
- https://hire.lever.co/developer/documentation

## Ashby

- A API pública de job board permite descobrir vagas.
- `applicationForm.submit` existe para candidaturas, mas exige a permissão `candidatesWrite`.
- Portanto, também depende de credencial da organização/integração e não de uma conta comum de candidato.

Referências:

- https://developers.ashbyhq.com/docs/public-job-posting-api
- https://developers.ashbyhq.com/reference/applicationformsubmit

## Personio

- A Career Site expõe um XML público em `https://<conta>.jobs.personio.de/xml` com as vagas abertas e o conteúdo da publicação.
- O resolvedor usa somente esse feed público para enriquecer links `https://<conta>.jobs.personio.de/job/<id>`.
- A submissão de candidatura existe na API de Recruiting, mas os endpoints atuais de escrita usam credencial/autorização da integração da organização (v2 com OAuth 2.0); isso não é tratado como uma API pública de candidato.
- Sem credencial oficialmente autorizada pela organização, o agente apenas prepara os dados e abre o formulário Personio hospedado.

Referências:

- https://developer.personio.de/v1.0/reference/get_xml
- https://developer.personio.de/docs/integration-of-open-positions
- https://developer.personio.de/changelog/job-application-submission

## Pinpoint

- O Pinpoint oferece um endpoint JSON público em `https://<conta>.pinpointhq.com/postings.json` para listar publicações externas.
- O resolvedor usa somente esse feed público e nunca a API autenticada `/api/v1`.
- O feed público expõe ID da publicação, título, descrição, responsabilidades, requisitos, benefícios, localização, modalidade, tipo de contratação e URL pública/formulário quando disponíveis.
- O nome da empresa não é inferido pelo subdomínio; permanece como pendência quando não é publicado no feed.
- A API autenticada de Pinpoint usa `X-API-KEY` e inclui operações de escrita; sem credencial oficialmente autorizada pela organização, o agente apenas prepara os dados e usa o formulário público hospedado.

Referências:

- https://developers.pinpointhq.com/docs/jobs-json-endpoint
- https://help.pinpoint.support/en/articles/5878344-how-to-list-pinpoint-jobs-on-any-website
- https://developers.pinpointhq.com/reference/get-job-postings

## Resolução de links intermediários

- Antes do enriquecimento ATS, o worker tenta substituir páginas intermediárias por um destino direto somente quando isso pode ser comprovado por dados públicos.
- Para Remote OK, vagas antigas podem reutilizar o `rawData.applyUrl` que já veio do feed oficial; a página da Remote OK permanece em `originalUrl`.
- Para Remotive, a página pública da vaga é lida e apenas um link externo rotulado como candidatura é promovido para `applicationUrl`; falhas e ausência de link entram em cache por 24 horas.
- Para Arbeitnow, o worker acessa somente o endpoint público `.../apply` da vaga e segue redirects HTTP normais até o URL final; o link original do Arbeitnow permanece em `originalUrl`. Destinos Greenhouse/Ashby seguem para enriquecimento ATS; outros destinos externos permanecem assistidos.
- Breezy HR passa a ser reconhecido como ATS quando um link direto `*.breezy.hr` é encontrado, mas nenhuma API autenticada da organização é usada.
- Jobicy e We Work Remotely não são contornados quando o acesso ao destino exige login; o fluxo permanece manual nesses casos.
- Essa etapa nunca envia formulário, cria conta, contorna CAPTCHA ou altera `SAFE_MODE`.

## Breezy HR

- Links `*.breezy.hr/p/<vaga>` são enriquecidos pela própria página pública da vaga.
- O resolvedor lê somente o bloco schema.org `JobPosting` em JSON-LD, extraindo título, empresa, descrição, local, modalidade remota, tipo de contratação e data quando publicados.
- Nenhuma chave, sessão ou API privada é necessária para essa leitura pública.
- A API oficial de posições/candidatos do Breezy usa autorização da organização; ela não é usada para submissão automática neste projeto.

Referências:

- https://developer.breezy.hr/reference/overview
- https://developer.breezy.hr/reference/addcandidate

## Enriquecimento automático no worker

- Candidaturas `READY` e `REVIEW_REQUIRED` com URL de ATS reconhecida são enriquecidas antes da preparação do kit.
- O processo usa somente endpoints públicos já suportados pelo resolvedor e nunca executa submissão.
- O resultado fica registrado no `rawData.atsEnrichment` com plataforma, status e horário da checagem.
- Perguntas públicas do formulário são gravadas em `rawData.applicationQuestions` quando o ATS as fornece, permitindo que o Kit rápido avalie respostas já presentes no perfil.
- A mesma URL usa cache de 24 horas para evitar chamadas repetitivas; falhas também entram em cooldown de 24 horas e não abortam o restante do ciclo.

## Regra do agente

1. **Provider autorizado + credencial válida + política elegível + SAFE_MODE desativado conscientemente**: pode existir submissão automática.
2. **ATS reconhecido sem credencial da organização**: preparar currículo, respostas, perguntas exigidas e abrir o formulário oficial.
3. **LinkedIn Easy Apply / Indeed Apply**: fluxo FAST APPLY assistido, sem bot de navegador.
4. CAPTCHA, anti-bot, limites e controles de acesso nunca são contornados.
