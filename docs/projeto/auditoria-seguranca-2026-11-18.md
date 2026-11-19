# Auditoria de segurança do Firebase — 18/11/2026

Projeto `sindhospe-portal` (plano Spark). Verificações feitas contra a **produção**, com a chave de serviço e, para os testes "de fora", com a `apiKey` pública e sem login.

## Resultado

| Item | Situação |
|---|---|
| Regras publicadas = `firestore.rules` deste repositório | ✅ idênticas |
| Cadastro de conta pelo site (signUp público) | ✅ bloqueado (`ADMIN_ONLY_OPERATION`) |
| Login anônimo | ✅ bloqueado |
| Provedores de login | ✅ só e-mail/senha |
| Proteção contra enumeração de e-mails | ✅ ativa |
| Contas | ✅ 226 (225 associados + sindicato), todas `@sindhospe.app`, todas com claim (`cnes` ou `perfil`) |
| Realtime Database / Cloud Storage | ✅ não ativados (nada exposto) |
| `associados` sem login (get ou list) | ✅ negado |
| `associados/{outro CNES}` logado como associado | ✅ negado (testes de regras no emulador) |
| `solicitacoes_revisao` sem login | ✅ negado; associado só cria para o próprio CNES, campos e tamanhos limitados |
| `sindicato/*` por associado | ✅ negado |
| Política de senha no servidor | ✅ **aplicada nesta data**: mínimo 8 caracteres, com número (`ENFORCE`) |
| Domínios autorizados | ✅ **limpos nesta data**: saiu o preview antigo `…-git-migracao-firebase-…vercel.app` |
| Proteção contra exclusão do banco Firestore | ⚠️ desativada — a chave de serviço não tem permissão; ativar no console (dono do projeto) |

## Brechas encontradas

### 1. Senha única de demonstração exibida na tela de login — **grave, corrigida neste PR**

Todas as contas usavam a mesma senha, mostrada no login (`NEXT_PUBLIC_SENHA_DEMO_DICA`). Junto com a brecha 2, qualquer pessoa podia entrar como qualquer associado e ver a ficha completa.

Correção: senha individual por associado (`scripts/senhas.js`, `npm run senhas`), troca de senha no Perfil, dica removida do login. **Só fica efetiva depois de** `npm run senhas -- --todos` em produção (ver README).

### 2. Lista de associados obtível sem login — **risco residual aceito**

A coleção `busca` (só `nome_fantasia` e `prefixos`; id = CNES) permite `list` sem login com `limit <= 8`. Paginando 8 por vez, um script obtém os 225 documentos (testado). As regras do Firestore não conseguem exigir o filtro `array-contains` nem bloquear cursores.

- Mesmo comportamento da API antiga (`ILIKE`, mínimo 2 letras, `LIMIT 8`): tentando todas as combinações de 2 letras chegava-se ao mesmo resultado.
- Nome e CNES dos estabelecimentos são públicos no CNES/DATASUS; o que vaza é a **lista de filiados ao SINDHOSPE**.
- Com senha individual, conhecer o CNES não dá mais acesso a nada.
- Para fechar de vez seria preciso servidor (Cloud Functions, plano Blaze) ou trocar a busca por nome por "digite o CNES". Fica como evolução da etapa 2, se o SINDHOSPE considerar a lista sensível.

### 3. Pedidos de revisão sem limite de quantidade — baixo

Um associado logado pode criar muitos pedidos (até 2.000 caracteres cada). Sem servidor não há limite de taxa nas regras; o risco é só de incômodo e é rastreável (cada pedido traz o CNES do token).

## Como repetir

Scripts de auditoria usados (fora do repositório, para não versionar consultas à produção): leitura de `admin/v2/projects/sindhospe-portal/config`, comparação de `getFirestoreRuleset()` com `firestore.rules`, tentativa de `signUp` com a `apiKey`, `runQuery` sem login em `busca`, `associados` e `solicitacoes_revisao`, e `listUsers()` conferindo domínio e claims.
