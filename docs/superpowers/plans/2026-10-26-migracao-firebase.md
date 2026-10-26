# Migração para Firebase — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a API Express/Neon por Firestore + Firebase Auth (plano Spark), com os mesmos números em todas as telas e uma conta por associado.

**Architecture:** Um script local (`sindhospe-backend/scripts`) roda as mesmas consultas SQL do `server.js` no Neon (somente leitura), grava os resultados pré-calculados no Firestore e cria as contas no Auth com a claim `cnes`. O frontend lê os documentos pelo SDK web; regras do Firestore garantem que cada associado só leia o próprio documento.

**Tech Stack:** Node (CommonJS no backend), `pg`, `firebase-admin`, `firebase-tools`, `@firebase/rules-unit-testing`, `node:test`; Next.js 16 + `firebase` (SDK web modular) no frontend.

**Spec:** `docs/superpowers/specs/2026-10-26-migracao-firebase-design.md`

## Global Constraints

- Projeto Firebase: `sindhospe-portal`; plano Spark — nada de Cloud Functions.
- Segredos lidos de `../segredos/` (sobrescrevível por `SEGREDOS_DIR`): `.env` com `DATABASE_URL` e `SENHA_DEMO` (≥ 6 caracteres), `firebase-admin.json`. Nenhum segredo é impresso, commitado ou copiado para dentro dos repositórios.
- Conexão com o Neon sempre com `SET default_transaction_read_only = on`.
- Cada documento tem exatamente o JSON da rota correspondente (passado por `JSON.parse(JSON.stringify(x))`).
- E-mail das contas: `{cnes}@sindhospe.app`; claim: `{ cnes }`.
- Busca: termos normalizados (minúsculas, sem acentos); prefixos de ≥ 2 caracteres; `limit(8)`.
- Lotes de no máximo 400 gravações.
- `server.js` **não é alterado** neste plano (é o oráculo da paridade). Fase 3 (remover Express/Render) fica fora, só com autorização explícita.
- Trabalho em branches `migracao-firebase` nos dois repositórios; nada vai para `main` sem a validação do preview.
- Textos de interface em português do Brasil.

## Review Focus

1. **Associado sem estrutura no CNES** (`sem_dados_cnes: true`): o documento é gravado com `estrutura/indicadores/comparativo: null` e `evolucao: []`, e o dashboard mostra o aviso amigável em vez de quebrar → coberto na paridade (Task 4) e no E2E (Task 9).
2. **Recarregar uma página protegida com sessão válida:** enquanto o Auth ainda resolve, o `nav-client` não pode redirecionar para `/login` → teste manual na Task 9 (F5 no `/dashboard`).
3. **Mercado com combinação tipo × município sem dados:** o documento não existe e `getMercado` devolve `[]` (como a API), com `municipio === ""` significando o estado inteiro → teste em `busca`/`dados` na Task 7 e checagem na Task 9.
4. **Busca com 0–1 caractere, só acentos ou só pontuação:** devolve `[]` sem consultar o Firestore → teste na Task 7.
5. **Senha errada / usuário sem claim `cnes`:** mensagem em português (`auth/invalid-credential` → "Senha incorreta"; `permission-denied` → orientação para sair e entrar de novo), sem tela branca → Task 8 + E2E Task 9.

---

## Parte A — `sindhospe-backend` (Fase 1: expandir)

### Task 1: Base do projeto, segredos e prefixos

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `scripts/segredos.js`, `scripts/prefixos.js`, `test/segredos.test.js`, `test/prefixos.test.js`

**Interfaces:**
- Produces: `carregarSegredos(dir = process.env.SEGREDOS_DIR || path.resolve(__dirname, "../../segredos")) -> { databaseUrl: string, senhaDemo: string, credencialPath: string }`; `normalizar(texto: string) -> string`; `gerarPrefixos(nome: string) -> string[]` (únicos, ordem de aparição).

- [ ] **Step 1:** `git checkout -b migracao-firebase`. `.gitignore` acrescenta `.env*`, `*-admin.json`, `saida/`, `*-debug.log`, `.firebase/`. `package.json`: `"test": "node --test test/"`, deps `firebase-admin`; devDeps `firebase-tools`, `@firebase/rules-unit-testing`, `firebase` (o último é exigido pelo rules-unit-testing).
- [ ] **Step 2: Testes que falham**
  - `segredos.test.js` (diretório temporário com `.env` e `firebase-admin.json` falsos): lê `DATABASE_URL` com e sem aspas; lança erro citando `SENHA_DEMO` quando ausente ou com menos de 6 caracteres; lança erro citando `firebase-admin.json` quando o arquivo falta; a mensagem de erro **não** contém o valor da URL.
  - `prefixos.test.js`: `normalizar("Hospital ESPERANÇA") === "hospital esperanca"`; `gerarPrefixos("Hospital Esperança")` contém `"ho"`, `"hosp"`, `"hospital"`, `"es"`, `"esperanca"` e não contém `"h"`; `gerarPrefixos("UTI-Neo (Recife)")` contém `"uti"`, `"neo"`, `"recife"` (pontuação separa palavras); sem duplicatas para `"Casa Casa"`.
- [ ] **Step 3:** `npm test` → FAIL (módulos não existem).
- [ ] **Step 4:** Implementar. `normalizar`: `NFD` + remover `\p{Diacritic}` + minúsculas + trim. Palavras = `split(/[^a-z0-9]+/)`.
- [ ] **Step 5:** `npm test` → PASS. Commit `chore: base do importador Firebase (segredos, prefixos, gitignore)`.

### Task 2: Consultas extraídas do `server.js`

**Files:**
- Create: `scripts/consultas.js`

**Interfaces:**
- Consumes: um `pg.Client` conectado.
- Produces (todas `async`, retornando o mesmo JSON da rota): `getEstabelecimento(db, cnes)` (ou `null` se não há identidade), `getEvolucao(db, cnes)`, `getMercado(db, tipo, municipio?)`, `getMunicipios(db)`, `getTipos(db)`, `getVisaoGeral(db)`, `getRepresentatividade(db)`, `listarAssociados(db) -> [{ cnes, nome_fantasia }]` (sem `cnes` nulo/vazio, deduplicado), `listarCombosMercado(db) -> [{ tipo, codufmun }]`, `listarTipos(db) -> string[]`, `abrirConexao(databaseUrl) -> pg.Client` (já em read-only).

- [ ] **Step 1:** Copiar SQL, constantes (`LEITOS_SQL`, `LEITOS_COMPLEMENTARES_SQL`, `TP_UNID_LABELS`) e pós-processamento de cada rota **sem alterar a lógica**; trocar `res.json(x)` por `return x` e `pool.query` por `db.query`. `server.js` permanece intacto.
- [ ] **Step 2:** A verificação desta task é a paridade (Task 4). Commit `feat: consultas do portal reutilizáveis pelo importador`.

### Task 3: Montagem dos documentos + modo seco

**Files:**
- Create: `scripts/documentos.js`, `scripts/importar.js`

**Interfaces:**
- Consumes: Task 1 e Task 2.
- Produces: `montarDocumentos(db) -> Map<string /* "colecao/id" */, object>` com exatamente as chaves da spec §4 (`associados/{cnes}` = `{...getEstabelecimento, evolucao}`; `mercado/{tipo}_{codufmun}` e `mercado/{tipo}_PE` = `{ serie }`; `publico/{visao-geral|representatividade}`; `publico/municipios|tipos` = `{ lista }`; `publico/meta` = `{ competencia_max, importado_em }`; `busca/{cnes}` = `{ nome_fantasia, prefixos }`). CLI: `node scripts/importar.js [--dry-run]`.

- [ ] **Step 1:** `montarDocumentos` com no máximo 5 consultas simultâneas (o Neon do plano free limita conexões; usar um único client sequencial se for mais simples). Imprime progresso a cada 100 documentos.
- [ ] **Step 2:** `--dry-run` grava cada documento em `saida/<colecao>/<id>.json` e imprime a contagem por coleção. Scripts npm: `importar`, `importar:seco`.
- [ ] **Step 3:** `npm run importar:seco` → espera ≈ 225 `associados`, 225 `busca`, ≈ 2.457 `mercado`, 5 `publico`. Commit `feat: monta documentos do Firestore a partir do Neon`.

### Task 4: Paridade com a API atual

**Files:**
- Create: `scripts/paridade.js`

**Interfaces:**
- Consumes: `saida/` da Task 3; `server.js` rodando em `http://localhost:3099` com o `DATABASE_URL` dos segredos (o script sobe e derruba o servidor como processo filho).

- [ ] **Step 1:** Comparar com `assert.deepStrictEqual` (após `JSON.parse(JSON.stringify())` nos dois lados): os 225 `associados` (`/api/estabelecimento/:cnes` + `/api/evolucao/:cnes`), as 4 rotas públicas e todas as `mercado/*_PE` + 50 combos de município sorteados com semente fixa; `busca` vs `/api/estabelecimentos/buscar?q=` para 20 termos (`ho`, `hosp`, `clin`, `real`, `sao`…), comparando o conjunto de CNES quando a API devolve menos de 8 itens. Ignorar `publico/meta`.
- [ ] **Step 2:** `npm run paridade` → `0 divergências`. Se o único CNES duplicado em `identidade_associados` divergir, registrar qual linha cada lado escolheu e decidir com o usuário (o `DISTINCT ON` sem desempate é não determinístico nos dois lados). Commit `test: paridade entre documentos e API Express`.

### Task 5: Regras do Firestore testadas no emulador

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules` (texto da spec §6), `firestore.indexes.json` (`{"indexes":[],"fieldOverrides":[]}`), `test/regras.test.js`

- [ ] **Step 1:** Instalar o JDK: `winget install EclipseAdoptium.Temurin.21.JDK`; conferir `java -version` (≥ 21).
- [ ] **Step 2: Testes** (`@firebase/rules-unit-testing`, projeto `demo-sindhospe`), cada um com `assertSucceeds`/`assertFails`:
  - usuário `{cnes:"A"}` lê `associados/A` ✓, `associados/B` ✗, `list` em `associados` ✗;
  - sem login: `associados/A` ✗, `publico/visao-geral` ✗, `mercado/05_PE` ✗;
  - logado: `publico/*` ✓, `mercado/*` ✓;
  - sem login: `busca` com `where(array-contains).limit(8)` ✓, `limit(9)` ✗, sem limite ✗, `get` de `busca/A` ✗;
  - `solicitacoes_revisao`: create válido com `criado_em: serverTimestamp()` ✓; `cnes` de outro ✗; campo extra ✗; `nome` vazio ✗; `mensagem` com 2001 caracteres ✗; `criado_em` de data fixa ✗; read ✗; sem login ✗.
- [ ] **Step 3:** Script `"test:regras": "firebase emulators:exec --only firestore --project demo-sindhospe \"node --test test/regras.test.js\""`; rodar → PASS. Commit `feat: regras do Firestore com testes no emulador`.

### Task 6: Gravação no Firestore, contas e deploy

**Files:**
- Create: `scripts/firestore.js`, `scripts/contas.js`
- Modify: `scripts/importar.js`, `package.json`

**Interfaces:**
- Produces: `gravarDocumentos(firestore, docs: Map) -> { gravados, apagados }` (lotes de 400; apaga documentos de `associados`, `busca`, `mercado` ausentes no Map); `sincronizarContas(auth, associados, senhaDemo) -> { criadas, atualizadas }` (cria `{cnes}@sindhospe.app` ou atualiza senha; sempre `setCustomUserClaims(uid, { cnes })`).

- [ ] **Step 1:** Teste de `gravarDocumentos` e `sincronizarContas` contra os emuladores de Firestore e Auth (projeto `demo-sindhospe`): rodar duas vezes com o mesmo Map → segunda execução sem duplicatas e mesmo total; remover uma chave do Map → documento apagado; claim `cnes` presente no usuário. Rodar → FAIL; implementar; → PASS.
- [ ] **Step 2:** `importar.js` sem `--dry-run`: inicializa o Admin SDK com `credencialPath`, monta, grava, sincroniza contas, imprime o resumo. Script `deploy:regras`: `firebase deploy --only firestore:rules,firestore:indexes --project sindhospe-portal` com `GOOGLE_APPLICATION_CREDENTIALS` apontando para a chave.
- [ ] **Step 3 (produção, fase 1):** `npm run deploy:regras`, depois `npm run importar`. Verificar pelo Admin SDK: contagem por coleção igual ao modo seco; 225 usuários com claim. Se a conta de serviço não tiver permissão de deploy, parar e pedir ao usuário o papel "Firebase Rules Admin" (ou deploy via `npx firebase login`).
- [ ] **Step 4:** Commit `feat: importador grava no Firestore e sincroniza contas`; atualizar o README do backend com a seção "Atualizar os dados" (`npm run importar`), sem remover a documentação do Express ainda.

## Parte B — `sindhospe-frontend` (Fase 2: migrar)

### Task 7: Firebase, busca e camada de dados

**Files:**
- Create: `src/app/firebase.js`, `src/app/busca.js`, `src/app/dados.js`, `src/app/busca.test.mjs`, `.env.local` (fora do git)
- Modify: `package.json`

**Interfaces:**
- Produces: `app, auth, db` (de `firebase.js`, a partir de `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`); `planoDeBusca(q) -> { consulta: string, filtros: string[] } | null` e `normalizar` (mesma regra da Task 1); em `dados.js`: `buscarEstabelecimentos(q)`, `getEstabelecimento(cnes)`, `getEvolucao(cnes)`, `getMercado(tipo, municipio = "")`, `getMunicipios()`, `getTipos()`, `getVisaoGeral()`, `getRepresentatividade()`, `solicitarRevisao({ cnes, nome, mensagem })` — formatos idênticos aos da API.

- [ ] **Step 1:** `git checkout -b migracao-firebase`; `npm i firebase`; `"test": "node --test src/app/"`; criar `.env.local` com o `firebaseConfig` informado pelo usuário (sem `measurementId`).
- [ ] **Step 2: Testes** (`busca.test.mjs`): `planoDeBusca("")`, `("h")`, `("  ")`, `("ã")`, `("--")` → `null`; `planoDeBusca("Hospital Esp")` → `{ consulta: "hospital", filtros: ["esp"] }`; `("São")` → `{ consulta: "sao", filtros: [] }`. → FAIL → implementar (a palavra mais longa vira `consulta`, as demais, com ≥ 1 caractere, viram `filtros`) → PASS.
- [ ] **Step 3:** `dados.js`: `buscarEstabelecimentos` retorna `[]` quando `planoDeBusca` é `null`; senão `query(collection(db,"busca"), where("prefixos","array-contains",consulta), limit(8))`, filtra por `filtros` (cada filtro precisa ser prefixo de alguma palavra do nome normalizado), mapeia para `{ cnes: doc.id, nome_fantasia }` e ordena com `localeCompare(..., "pt-BR")`. `getMercado`: id `${tipo}_${municipio || "PE"}`, documento ausente → `[]`. `getEstabelecimento` devolve o documento sem o campo `evolucao`; `getEvolucao` devolve `evolucao`. `solicitarRevisao` faz `addDoc` com `criado_em: serverTimestamp()` e omite `mensagem` quando vazia.
- [ ] **Step 4:** `npm test` e `npm run lint` → PASS. Commit `feat: camada de dados lendo do Firestore`.

### Task 8: Sessão com Firebase Auth

**Files:**
- Modify: `src/app/components.jsx:113-140`, `src/app/login/page.js`, `src/app/nav-client.jsx`, `src/app/api-error.js`

**Interfaces:**
- Produces: `useSessao() -> { carregando: boolean, sessao: { cnes, nome } | null }` (claim `cnes` via `getIdTokenResult`; `nome` vem de `busca` no login e é guardado em `sessionStorage` só para exibição); `entrar(cnes, nome, senha)`; `sair()`; `mensagemDeErro(err) -> string` em `api-error.js`.

- [ ] **Step 1:** Remover `getSessao/salvarSessao/limparSessao` e a chave antiga do `localStorage`; atualizar todos os importadores (`grep -rn "getSessao\|salvarSessao\|limparSessao" src` deve ficar vazio, exceto `demo/`).
- [ ] **Step 2:** Login: busca via `buscarEstabelecimentos`; envio via `entrar`; erros via `mensagemDeErro` (`auth/invalid-credential`/`auth/wrong-password` → "Senha incorreta."; `auth/too-many-requests` → "Muitas tentativas. Aguarde alguns minutos."; `permission-denied` → "Sua sessão não tem acesso a estes dados. Saia e entre novamente."; `unavailable`/rede → "Não foi possível conectar ao Firebase. Verifique sua internet.").
- [ ] **Step 3:** `nav-client`: enquanto `carregando`, mostrar "Carregando…" e **não** redirecionar; sem sessão → `/login`; botão Sair chama `sair()`.
- [ ] **Step 4:** `npm run lint` e `npm run build` → PASS. Commit `feat: login individual com Firebase Auth`.

### Task 9: Páginas migradas e validação ponta a ponta

**Files:**
- Modify: `src/app/dashboard/page.js`, `relatorio/page.js`, `evolucao/page.js`, `mercado/page.js`, `perfil/page.js`, `visao-geral/page.js`, `src/app/components.jsx` (remover `API_URL`), `README.md`

- [ ] **Step 1:** Trocar cada `fetch(\`${API_URL}/...\`)` pela função correspondente de `dados.js` e cada `getSessao()` por `useSessao()`. `grep -rn "API_URL\|fetch(" src/app --include=*.js --include=*.jsx | grep -v demo/` → vazio.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build` → PASS.
- [ ] **Step 3: E2E local** (`npm run dev`, navegador real contra o `sindhospe-portal`): login com a senha de demo; dashboard com os mesmos números da API do Render para 2 associados (um com estrutura, um com `sem_dados_cnes` se existir); relatório; evolução; mercado com estado inteiro, um município com dados e uma combinação vazia; visão geral; envio de revisão (conferir o documento no Firestore pelo Admin SDK e apagá-lo depois); senha errada; F5 no `/dashboard`; sair e abrir `/dashboard` direto → `/login`.
- [ ] **Step 4:** README do frontend: arquitetura nova, variáveis `NEXT_PUBLIC_FIREBASE_*`, login individual. Commit `feat: telas lendo do Firestore`.
- [ ] **Step 5 (com o usuário):** push das duas branches; o usuário cria as 4 variáveis na Vercel (Production + Preview) e autoriza o domínio de preview no Firebase Auth; repetir o Step 3 no preview; merge na `main` só com o OK dele.

## Fora deste plano

Fase 3 da spec (remover `server.js`/`pg`/`express`/`cors`, desligar o Render, remover `NEXT_PUBLIC_API_URL`, corrigir "269 associados" no README): só depois que o portal rodar na `main` com o Firebase e com autorização explícita.
