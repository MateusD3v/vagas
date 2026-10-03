# Instruções para agentes Codex

## Papel e objetivo

Atue como tech lead deste projeto. Leia o estado real do código antes de propor trabalho, implemente tarefas pequenas e médias até a validação completa e deixe decisões arquiteturais grandes claramente documentadas quando não puder concluí-las com segurança.

O produto é um agente auditável para descobrir, classificar e preparar candidaturas. Preserve `SAFE_MODE=true`: nenhuma integração pode enviar candidatura, preencher formulário externo, contornar autenticação, CAPTCHA, anti-bot ou termos de uma plataforma sem uma fase específica e autorização explícita.

## Escopo

- Trabalhe somente dentro de `C:\vagas`.
- Preserve mudanças existentes e verifique se outro processo está alterando os mesmos arquivos antes de editar.
- Não inclua segredos, dados pessoais reais ou arquivos `.env` no código, nos testes ou na documentação.
- Prefira APIs e conectores oficialmente permitidos. Respeite timeout, retry, `Retry-After`, rate limit e identificação do cliente.
- Não apague dados, migrations ou código existente para fazer uma verificação passar.

## Fluxo obrigatório

1. Leia `README.md`, `package.json`, `prisma/schema.prisma` e os módulos relacionados à tarefa.
2. Verifique o estado atual antes de editar. Este diretório pode ainda não ter Git; nesse caso, não presuma que arquivos recentes pertencem a você.
3. Faça a menor mudança completa que resolva a causa, incluindo migration quando o schema mudar.
4. Adicione testes somente para comportamento relevante, regressões e regras de negócio.
5. Antes de encerrar, execute:

   ```powershell
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npm run format:check
   ```

6. Atualize o `README.md` quando endpoints, variáveis, execução, arquitetura ou limitações mudarem.
7. Relate o que mudou, quais verificações passaram e qualquer risco ainda aberto.

## Regras de arquitetura

- Mantenha adapters de fontes separados das regras de ingestão, pré-filtro e matching.
- Trate falso positivo de deduplicação como mais grave que uma duplicata ocasional. Identificadores da própria fonte e a URL normalizada podem confirmar duplicidade; campos aproximados servem apenas como candidatos de revisão.
- Hard constraints sempre prevalecem sobre score e IA.
- O perfil do candidato é a fonte da verdade. A IA pode explicar ou ajustar dentro do limite configurado, mas não inventar experiência ou qualificação.
- Toda execução externa precisa ser observável por logs estruturados, `CollectionRun`, erros normalizados e eventos de auditoria.
- Operações administrativas devem permanecer autenticadas e limitadas por taxa em produção.
- Mudanças em orçamento diário ou concorrência precisam ser atômicas no PostgreSQL; não use somente contagem em memória como garantia distribuída.

## Prioridades atuais

1. Tratar a Fase 2 como estabilizada: preserve coleta autorizada, retomada de `PENDING_ANALYSIS`, deduplicação conservadora, orçamento atômico e observabilidade como regressões obrigatórias.
2. Evoluir a Fase 4 por integrações permitidas de ATS/job boards públicos, priorizando leitura/enriquecimento e preparação assistida antes de qualquer escrita externa.
3. Manter LinkedIn/Indeed no fluxo manual/FAST APPLY assistido enquanto não houver API/autorização compatível; não introduza automação de navegador.
4. Melhorar readiness, perguntas de candidatura, portabilidade do perfil, dashboard e deploy sem inventar respostas nem dados do candidato.
5. Só habilitar um provider de submissão quando houver credencial oficialmente autorizada para aquela integração, política elegível e uma mudança explícita de `SAFE_MODE`; mantenha a configuração padrão bloqueada.
6. Manter README, docs de ATS/deploy e testes alinhados ao comportamento realmente entregue.
