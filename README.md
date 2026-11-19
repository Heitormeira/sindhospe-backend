# Portal SINDHOSPE — Backend

API do **Portal SINDHOSPE**, desenvolvida no Projeto Integrador (UNICAP + SINDHOSPE). Ela entrega aos associados os indicadores do próprio estabelecimento, cruzando a base de associados do sindicato com os dados públicos do CNES/DATASUS.

- **API em produção:** https://sindhospe-backend.onrender.com
- **Frontend:** repositório `sindhospe-frontend` (Next.js, hospedado na Vercel)

> **Migração para o Firebase (em andamento).** O portal está passando a ler os dados do **Firestore** e a usar o **Firebase Auth**, com uma conta por associado. Este repositório guarda o **importador**, que calcula os indicadores a partir dos arquivos públicos do DATASUS e da lista de associados e os publica no Firebase (o Neon não é mais usado pelo importador). A API Express (`server.js`) continua no ar até o frontend novo ser validado em produção. Design e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.

## Importador para o Firebase

De onde vêm os dados:

| Fonte | Onde fica | Como atualizar |
|---|---|---|
| Cadastro (ST) e leitos (LT) do CNES, por trimestre | `dados/historico/AAAAMM.json` (público, versionado) | `npm run baixar-cnes -- AAAAMM --historico 202003` |
| Equipamentos, profissionais, serviços e habilitações | `dados/cnes-AAAAMM.json` (público, versionado) | o mesmo comando |
| Nomes dos municípios | `dados/municipios-pe.json` (IBGE) | não muda |
| Nomes das naturezas jurídicas | `dados/natureza-juridica.json` (dicionário NATJUR do DATASUS) | não muda |
| Lista de associados do SINDHOSPE | `../segredos/associados.json` (**fora** do repositório) | `npm run exportar-associados` (uma vez, do Neon) ou editar o arquivo |

Segredos ficam **fora** do repositório, na pasta `../segredos/` (ou na pasta indicada em `SEGREDOS_DIR`):

| Arquivo | Conteúdo |
|---|---|
| `associados.json` | lista de associados (CNES, nome, CNPJ, registro, situação) |
| `.env` | `SENHA_SINDICATO=...` (8+ caracteres, conta `sindicato@sindhospe.app` do Painel SINDHOSPE; opcional) e `DATABASE_URL=...` (só para `exportar-associados`) |
| `firebase-admin.json` | chave da conta de serviço (Firebase → Configurações → Contas de serviço); o modo seco não precisa |

```bash
npm install
npm run baixar-cnes -- 202609 --historico 202003
                         # baixa do DATASUS o ST e o LT de cada trimestre desde 03/2020 (só os que faltam)
                         # e EQ, PF, SR e HB de 09/2026; grava só contagens em dados/
npm run importar:seco    # calcula tudo e grava em ./saida, sem tocar no Firebase
npm run importar         # publica no Firestore e cria/atualiza as contas (rodar a cada trimestre do CNES)
npm run deploy:regras    # publica firestore.rules
npm test                 # testes unitários
npm run test:regras      # regras + importador no emulador (precisa de Java 21 no PATH)
```

Opções do importador: `--competencia AAAAMM` (usar uma competência que não é a mais recente), `--historico-desde AAAAMM` (série histórica a partir dessa competência; padrão: tudo o que está em `dados/historico`, hoje desde 03/2020) e, no modo seco, `--saida PASTA`.

**Conferência da troca do Neon pelos arquivos (uma vez):** gerar as duas saídas na mesma competência e comparar.

```bash
git checkout 14cf112                # última versão que ainda lê o Neon
npm run importar:seco              # importador antigo (Neon), grava em ./saida
mv saida saida-neon
git checkout main                  # (ou sem-neon, se o PR ainda não foi juntado)
npm run exportar-associados        # grava ../segredos/associados.json (somente leitura no Neon)
npm run importar:seco -- --competencia 202606 --historico-desde 202406   # mesmos trimestres que o Neon tinha
npm run comparar -- saida-neon saida     # critério: "nenhuma diferença inesperada"
```

### O que é publicado

| Documento | Conteúdo | Quem lê |
|---|---|---|
| `associados/{cnes}` | Identidade (lista do SINDHOSPE), estrutura do cadastro do CNES e bloco `atual`: leitos (arquivo LT), equipamentos, profissionais, serviços, habilitações, situação do cadastro e licença sanitária, tudo da competência mais recente, com a categoria do estabelecimento e a comparação com o mesmo grupo | o próprio associado e o sindicato |
| `publico/setores` | Estado × associados por setor (hospital, clínica, diagnóstico...) | qualquer conta |
| `sindicato/painel` | Totais dos associados, setores, evolução dos leitos, equipamentos e lista com situação do cadastro | só `perfil: "sindicato"` |
| `mercado/*` | Série por tipo de unidade (estado e município), mesma conta da API antiga | qualquer conta |
| `publico/tipos`, `publico/municipios`, `publico/meta` | Listas dos filtros e competência dos dados | qualquer conta |

Também vai no bloco `atual`: **quem o estabelecimento atende** (SUS, particular, planos e seguros, por tipo de atendimento: campos APxxCVyy do ST, como declarados no CNES) e o turno de atendimento.

Regras de negócio (reunião com o SINDHOSPE de 28/10/2026, design em `docs/superpowers/specs/2026-10-31-melhorias-reuniao-design.md`):
- leitos sempre da mesma competência e da mesma fonte em todos os blocos; totais e participação em vez de médias, comparando só com o mesmo tipo de unidade;
- totais do estado por setor sem os tipos não assistenciais (centrais de gestão, regulação e abastecimento; cooperativas de cessão de trabalhadores);
- leitos só para hospital (ou quem tem leito cadastrado);
- comparação por mediana entre estabelecimentos do mesmo grupo (hospitais pelo tipo de unidade; demais pela categoria + serviço principal: diálise, imagem, patologia, laboratório...), só com quem tem o item cadastrado;
- LGPD: do arquivo de profissionais só saem contagens por ocupação.

Documentos do projeto com o SINDHOSPE: `docs/projeto/` (plano de trabalho, amostra do estudo, pesquisa de fontes).

- O importador não usa banco de dados: lê os arquivos de `dados/` e a lista de associados. É idempotente: pode rodar de novo sem duplicar nada.
- Ele aborta sem alterar nada se a importação trouxer menos de 90% dos associados atuais. Se a redução for real, use `npm run importar -- --forcar`.
- **Senha individual:** cada conta nova recebe uma senha aleatória própria (10 caracteres, sem 0/O/1/l/I). As senhas vão para `../segredos/senhas/senhas-<data>-<motivo>.csv` (fora do repositório; abre no Excel) e **nunca** aparecem no terminal.
- Contas que já existem não têm a senha trocada, para não derrubar quem está logado nem apagar a senha que o associado escolheu.
- **Redefinir senhas** ("esqueci minha senha", ou a entrega inicial): `npm run senhas -- 2355906 3141020` (só esses CNES) ou `npm run senhas -- --todos`. Gera o CSV e derruba as sessões abertas dessas contas. A conta do sindicato não é afetada.
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
