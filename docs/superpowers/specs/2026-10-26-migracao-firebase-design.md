# Migração do backend para o Firebase — Design

- **Data:** 2026-10-26
- **Status:** aprovado em conversa, aguardando revisão desta spec
- **Projeto Firebase:** `sindhospe-portal` (plano Spark, gratuito)

## 1. Objetivo

Substituir a API Express (Render) + PostgreSQL (Neon) por **Firestore + Firebase Auth, sem servidor**, a pedido do professor do Projeto Integrador. Critérios de sucesso:

1. Todas as telas do portal mostram **os mesmos números** de hoje.
2. Cada associado entra com **conta própria** e só consegue ler os dados do próprio estabelecimento — regra imposta pelo Firestore, não pelo frontend.
3. Tudo roda no **plano Spark**, sem cartão de crédito e sem Cloud Functions.
4. Atualizar os dados a cada nova competência do CNES é **um comando**: `npm run importar`.

Fora de escopo: e-mail real dos associados, recuperação de senha, painel administrativo, mudar a hospedagem do frontend (continua na Vercel).

## 2. Situação atual (medida em 2026-10-26)

| Tabela no Neon | Linhas |
|---|---|
| `identidade_associados` | 227 (225 CNES distintos; 1 CNES duplicado; 1 linha com `situacao` nula) |
| `estabelecimentos_pe` | 12.131 |
| `estabelecimentos_pe_historico` | 119.502 (9 competências, 202406 a 202606) |
| `leitos_pe_historico` | 19.940 |
| `servicos_pe` | 39.248 |
| `habilitacoes_pe` | 1.060 |
| `municipios_pe` | 185 |
| `solicitacoes_revisao` | não existe (criada sob demanda pelo `POST`) |

Combinações distintas tipo × município no histórico: 2.419; tipos de unidade: 38.

O README diz "269 associados"; o banco tem 227 linhas / 225 CNES. Corrigir o README na fase 3.

Todas as rotas são de leitura analítica (`GROUP BY`, `AVG`, `COUNT FILTER`, percentil, `JOIN`), exceto `POST /api/solicitar-revisao`. Copiar as tabelas brutas para o Firestore estouraria a cota diária do Spark (20 mil gravações / 50 mil leituras) e exigiria agregação no cliente. Por isso os agregados são **pré-calculados**.

## 3. Arquitetura

```
Navegador ──(Firebase JS SDK)──> Firebase Auth + Firestore      [produção]

Máquina do desenvolvedor:
  Neon (PostgreSQL) ──SQL──> scripts/importar.js ──Admin SDK──> Firestore + Auth   [a cada competência]
```

O script de importação reaproveita as **mesmas consultas SQL e o mesmo pós-processamento** do `server.js` (extraídos para `scripts/consultas.js`), de modo que cada documento tem **exatamente o JSON que a rota correspondente devolve hoje**. As páginas do frontend trocam apenas a origem do dado.

## 4. Modelo de dados no Firestore

| Documento | Conteúdo | Origem atual | Quantidade |
|---|---|---|---|
| `associados/{cnes}` | `{ ...resposta de /api/estabelecimento/:cnes, evolucao: [...resposta de /api/evolucao/:cnes] }` | 2 rotas | 225 |
| `mercado/{tipo}_{codufmun}` | `{ serie: [...resposta de /api/mercado?tipo=&municipio=] }` | `/api/mercado` | ≈ 2.419 |
| `mercado/{tipo}_PE` | `{ serie: [...resposta de /api/mercado?tipo=] }` (estado inteiro) | `/api/mercado` | 38 |
| `publico/visao-geral` | resposta de `/api/visao-geral` | 1 rota | 1 |
| `publico/representatividade` | resposta de `/api/representatividade` | 1 rota | 1 |
| `publico/municipios` | `{ lista: [...] }` de `/api/municipios` | 1 rota | 1 |
| `publico/tipos` | `{ lista: [...] }` de `/api/tipos` | 1 rota | 1 |
| `publico/meta` | `{ competencia_max, importado_em }` | novo | 1 |
| `busca/{cnes}` | `{ nome_fantasia, prefixos: [...] }` | `/api/estabelecimentos/buscar` | 225 |
| `solicitacoes_revisao/{auto}` | `{ cnes, nome, mensagem?, criado_em }` | `POST /api/solicitar-revisao` | gravado pelo usuário |

Total por importação: **≈ 2.900 gravações** (cabe na cota diária de 20 mil).

Detalhes:

- **Arrays na raiz** (`municipios`, `tipos`, séries de mercado) ficam sob uma chave (`lista`, `serie`), porque um documento do Firestore precisa ser um objeto.
- **Tipos preservados:** o JSON passa por `JSON.parse(JSON.stringify(...))` antes de gravar, mantendo strings como `"12.3"` (resultado de `toFixed`) e contagens do `pg` exatamente como a API devolve hoje.
- **`prefixos`:** o nome é normalizado (minúsculas, sem acentos), dividido em palavras, e cada palavra gera seus prefixos com 2 ou mais caracteres. Exemplo: "Hospital Esperança" gera `ho, hos, hosp, …, es, esp, …, esperanca`. A busca usa `where("prefixos", "array-contains", termoNormalizado).limit(8)`, o equivalente ao `ILIKE '%termo%'` de hoje no início de cada palavra. Com várias palavras digitadas, a consulta usa a mais longa e o cliente filtra os até 8 resultados pelas demais. A ordenação por nome também é feita no cliente, sem índice composto.
- **Linhas sem CNES** em `identidade_associados` são ignoradas e listadas no relatório do script.

## 5. Autenticação

- O script cria (ou atualiza) um usuário Firebase Auth por associado: e-mail `{cnes}@sindhospe.app`, senha `SENHA_DEMO` e custom claim `{ cnes }`.
- `SENHA_DEMO` fica em `segredos/.env` (mínimo de 6 caracteres, exigência do Firebase) e nunca vai para o código ou para o repositório.
- Login no frontend: o usuário busca o nome, escolhe o estabelecimento (o `cnes` vem do id do documento em `busca`), digita a senha, e o frontend chama `signInWithEmailAndPassword(auth, `${cnes}@sindhospe.app`, senha)`. Para quem usa, a tela não muda.
- A sessão é a persistência padrão do Firebase Auth (IndexedDB). A chave `localStorage` antiga deixa de ser usada.
- Idempotência: um usuário existente tem claims e senha regravadas; o script nunca duplica contas.

## 6. Regras de segurança (`firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function logado() { return request.auth != null; }

    match /associados/{cnes} {
      allow get: if logado() && request.auth.token.cnes == cnes;
    }
    match /mercado/{id}  { allow get: if logado(); }
    match /publico/{id}  { allow get: if logado(); }

    // Busca do login: sem login, só consultas de até 8 resultados.
    match /busca/{cnes} {
      allow list: if request.query.limit <= 8;
    }

    match /solicitacoes_revisao/{id} {
      allow create: if logado()
        && request.resource.data.keys().hasOnly(['cnes', 'nome', 'mensagem', 'criado_em'])
        && request.resource.data.cnes == request.auth.token.cnes
        && request.resource.data.nome is string
        && request.resource.data.nome.size() > 0
        && request.resource.data.nome.size() <= 200
        && (!('mensagem' in request.resource.data)
            || (request.resource.data.mensagem is string
                && request.resource.data.mensagem.size() <= 2000))
        && request.resource.data.criado_em == request.time;
    }
  }
}
```

Tudo o que não está listado é negado. Nenhum `list` em `associados`, então ninguém enumera associados. As solicitações são lidas pela equipe no console do Firebase.

## 7. Repositório `sindhospe-backend`

```
sindhospe-backend/
├── firebase.json              # aponta para as regras e índices
├── .firebaserc                # projeto padrão: sindhospe-portal
├── firestore.rules
├── firestore.indexes.json     # vazio (nenhum índice composto é necessário)
├── scripts/
│   ├── consultas.js           # SQL + montagem dos JSONs (extraído do server.js)
│   ├── contas.js              # criação/atualização de usuários + claims
│   ├── importar.js            # orquestra; flag --dry-run grava JSON em ./saida em vez do Firestore
│   ├── prefixos.js            # normalização + geração de prefixos
│   └── paridade.js            # compara ./saida com a API Express local
├── test/
│   ├── prefixos.test.js       # node:test
│   └── regras.test.js         # @firebase/rules-unit-testing no emulador
└── server.js                  # removido só na fase 3
```

- Segredos são lidos de `../segredos/` por padrão (`SEGREDOS_DIR` permite sobrescrever): `.env` com `DATABASE_URL` e `SENHA_DEMO`, e `firebase-admin.json`.
- O `.gitignore` passa a cobrir `.env*`, `*-admin.json`, `saida/` e logs do emulador (hoje cobre só `.env.local`).
- Scripts npm: `importar`, `importar:seco` (`--dry-run`), `paridade`, `test`, `deploy:regras`.
- Gravação em lotes de 400 operações (limite de 500 por batch). Documentos de `associados`, `busca` e `mercado` que não existem mais na origem são apagados ao fim da importação, e o script imprime o resumo (criados/atualizados/apagados).
- A conexão com o Neon abre com `default_transaction_read_only = on`: o script nunca escreve no Postgres.

## 8. Frontend (`sindhospe-frontend`)

- Nova dependência: `firebase` (SDK modular).
- `src/app/firebase.js`: inicializa o app a partir de `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`.
- `src/app/dados.js`: uma função por rota antiga, devolvendo o mesmo formato:
  `buscarEstabelecimentos(q)`, `getEstabelecimento(cnes)`, `getEvolucao(cnes)`, `getMercado(tipo, municipio?)`, `getMunicipios()`, `getTipos()`, `getVisaoGeral()`, `getRepresentatividade()`, `solicitarRevisao({ cnes, nome, mensagem })`.
- `useSessao()` (em `components.jsx`): `{ carregando, sessao: { cnes, nome } | null }` via `onAuthStateChanged` + claim `cnes`. Substitui `getSessao`/`salvarSessao`/`limparSessao`; `nav-client.jsx` usa o hook para proteger as rotas e mostra "carregando" enquanto o Auth resolve.
- Páginas tocadas: `login`, `dashboard`, `relatorio`, `evolucao`, `mercado`, `perfil`, `visao-geral`, `nav-client`, `components`, `api-error`. As páginas `demo/` e `status` continuam como estão (dados mockados).
- `api-error.js` passa a traduzir erros do Firebase (`permission-denied`, `unavailable`, `auth/invalid-credential`) para mensagens em português.
- `API_URL` e `NEXT_PUBLIC_API_URL` são removidos.
- Vercel: criar as 4 variáveis `NEXT_PUBLIC_FIREBASE_*` em Production e Preview e remover `NEXT_PUBLIC_API_URL` na fase 3.
- Firebase Auth → domínios autorizados: incluir `sindhospe-frontend.vercel.app` e o domínio de preview da Vercel.

## 9. Implantação e reversão

| Fase | O que acontece | Reversão |
|---|---|---|
| **1. Expandir** | Deploy das regras; importação para o Firestore; criação das contas. Express e frontend atuais **seguem no ar sem mudança**. | Apagar coleções/usuários; nada em produção depende deles. |
| **2. Migrar** | Frontend lendo do Firestore numa branch → preview da Vercel → validação → merge na `main`. | Reverter o merge; o Render ainda está no ar. |
| **3. Contrair** | Remover `server.js`, `pg`, `express`, `cors`; desligar o serviço no Render; atualizar os READMEs (arquitetura, contagem de associados). | Só com autorização explícita da equipe, porque não tem volta simples. |

O Neon não é apagado: continua como fonte do script de importação.

## 10. Verificação

1. **Paridade:** `server.js` rodando localmente contra o Neon; `npm run importar:seco` gera `./saida`; `npm run paridade` compara campo a campo a resposta de cada rota com o documento correspondente: os 225 associados (ficha + evolução), as rotas públicas e uma amostra de 50 séries de mercado + todas as `_PE`. Critério: zero divergências.
2. **Regras** (emulador do Firestore; requer Java 21 ou superior): o associado A lê `associados/A` e não lê `associados/B`; sem login, nada é lido fora de `busca`; `busca` com `limit(9)` ou sem limite é negada; uma solicitação com `cnes` de outro associado, campo extra ou `criado_em` forjado é negada.
3. **Prefixos:** testes unitários com acentos, maiúsculas e nomes de uma palavra.
4. **Ponta a ponta** (preview da Vercel): login com a senha de demo, dashboard, relatório, evolução, mercado, visão geral, envio de revisão (conferido no console), logout e acesso direto a uma rota protegida sem login.

## 11. Riscos

- **Neon "dormindo":** a primeira consulta do script pode demorar; o script usa timeout de conexão generoso.
- **Java ausente:** sem JDK 21, os testes de regras não rodam localmente. Alternativa: instalar o Temurin 21 via `winget`.
- **Senha de demo compartilhada:** todas as contas usam a mesma senha, o que é aceitável para a demonstração e está registrado no README. O modelo (uma conta por CNES + claims) já é o de produção; basta trocar as senhas.
