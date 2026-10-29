# Portal SINDHOSPE — Backend

API do **Portal SINDHOSPE**, desenvolvida no Projeto Integrador (UNICAP + SINDHOSPE). Ela entrega aos associados os indicadores do próprio estabelecimento, cruzando a base de associados do sindicato com os dados públicos do CNES/DATASUS.

- **API em produção:** https://sindhospe-backend.onrender.com
- **Frontend:** repositório `sindhospe-frontend` (Next.js, hospedado na Vercel)

> **Migração para o Firebase (em andamento).** O portal está passando a ler os dados do **Firestore** e a usar o **Firebase Auth**, com uma conta por associado. Este repositório passa a guardar o **importador** que calcula os indicadores no Neon e os publica no Firebase. A API Express (`server.js`) continua no ar até o frontend novo ser validado em produção. Design e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.

## Importador para o Firebase

Segredos ficam **fora** do repositório, na pasta `../segredos/` (ou na pasta indicada em `SEGREDOS_DIR`):

| Arquivo | Conteúdo |
|---|---|
| `.env` | `DATABASE_URL=...` (Neon) e `SENHA_DEMO=...` (6+ caracteres, senha inicial das contas) |
| `firebase-admin.json` | chave da conta de serviço (Firebase → Configurações → Contas de serviço) |

```bash
npm install
npm run importar:seco    # calcula tudo e grava em ./saida, sem tocar no Firebase
npm run paridade         # compara ./saida com a API Express rodando localmente (critério: 0 divergências)
npm run importar         # publica no Firestore e cria/atualiza as contas (rodar a cada competência do CNES)
npm run deploy:regras    # publica firestore.rules
npm test                 # testes unitários
npm run test:regras      # regras + importador no emulador (precisa de Java 21 no PATH)
```

- O importador conecta ao Neon **somente leitura** e é idempotente: pode rodar de novo sem duplicar nada.
- Ele aborta sem alterar nada se a importação trouxer menos de 90% dos associados atuais. Se a redução for real, use `npm run importar -- --forcar`.
- Contas que já existem não têm a senha trocada, para não derrubar quem está logado. Para redefinir todas as senhas para `SENHA_DEMO`, use `npm run importar -- --resetar-senhas`.
- Associados que saem do sindicato têm a conta **desativada**, não apagada.
- Cada importação faz cerca de 2.900 gravações, dentro da cota gratuita de 20 mil por dia.

## Equipe

| Aluno | RA |
|---|---|
| Heitor Meira | 852542 |
| Heitor Farias | 853409 |
| Caio Bandeira | 853860 |
| Marcelo Caldas | 852309 |
| Diogo André Ferreira | _a preencher_ |

## Arquitetura

O sistema é dividido em três camadas independentes:

```
Navegador do usuário
        ↓
Frontend — Next.js + Tailwind CSS (Vercel)
        ↓  fetch() para a URL definida em NEXT_PUBLIC_API_URL
Backend — Node.js + Express (Render)   ← este repositório
        ↓  consultas SQL
Banco de dados — PostgreSQL (Neon)
```

| Camada | Tecnologia | Hospedagem | Função |
|---|---|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS | Vercel | Interface: login, dashboard, relatório e demais abas |
| Backend | Node.js, Express | Render | API REST: recebe os pedidos, aplica as regras e consulta o banco |
| Banco | PostgreSQL | Neon | Dados dos associados (`identidade_associados`) e dados do CNES/DATASUS |

**Por que separar assim:** o navegador nunca fala direto com o banco. Todo dado passa pelo backend, que decide o que pode ser devolvido (por exemplo, a busca de estabelecimentos não expõe CNPJ). Cada camada pode ser trocada ou escalada sem mexer nas outras.

## Estrutura do repositório

```
sindhospe-backend/
├── server.js          # Servidor Express com todas as rotas da API
├── package.json       # Dependências e scripts
├── package-lock.json
└── .gitignore
```

## Principais endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/estabelecimento/:cnes` | Identidade, estrutura física, indicadores e comparativos (município e estado) de um estabelecimento |
| GET | `/api/estabelecimentos/buscar?q=` | Autocomplete do login. Exige 2+ letras, devolve no máximo 8 resultados e só `cnes` e `nome_fantasia` |
| GET | `/api/evolucao/:cnes` | Série histórica de leitos do estabelecimento |
| GET | `/api/mercado?tipo=&municipio=` | Médias do mercado por tipo de unidade, no município ou no estado |

O servidor também expõe rotas de visão geral, leitos SUS, representatividade do SINDHOSPE e solicitação de revisão de dados. Veja o `server.js` para a lista completa.

## Segurança e privacidade

- A busca de estabelecimentos é feita **no servidor** (`ILIKE`, mínimo de 2 caracteres, limite de 8 resultados), para que ninguém consiga listar todos os associados.
- O frontend só consulta o estabelecimento da sessão logada; o relatório é sempre do próprio associado.
- **Limitações conhecidas desta fase de demonstração:**
  - o login usa uma senha única de demonstração e guarda a sessão no `localStorage`, sem token validado pelo servidor;
  - a rota antiga `/api/estabelecimentos` (lista completa) ainda precisa ser restringida ou removida.

## Como rodar localmente

Pré-requisitos: Node.js e acesso a um banco PostgreSQL com os dados do projeto.

```bash
npm install
node server.js
```

O servidor sobe em `http://localhost:3001`. A string de conexão com o Postgres é lida de variável de ambiente (no Render, ela fica configurada no painel do serviço, nunca no código).

No frontend, aponte a API com a variável `NEXT_PUBLIC_API_URL` (sem ela, o padrão é `http://localhost:3001`).

## Observações de hospedagem

- No plano gratuito do Render, o servidor "dorme" após um tempo sem uso; a primeira requisição depois disso pode levar cerca de 50 segundos.
- Os deploys no Render são manuais (**Manual Deploy → Deploy latest commit**) depois do `git push`.
