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

## Regra do agente

1. **Provider autorizado + credencial válida + política elegível + SAFE_MODE desativado conscientemente**: pode existir submissão automática.
2. **ATS reconhecido sem credencial da organização**: preparar currículo, respostas, perguntas exigidas e abrir o formulário oficial.
3. **LinkedIn Easy Apply / Indeed Apply**: fluxo FAST APPLY assistido, sem bot de navegador.
4. CAPTCHA, anti-bot, limites e controles de acesso nunca são contornados.
