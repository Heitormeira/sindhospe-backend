# Melhorias pedidas na reunião de 28/10/2026 — Design

- **Origem:** relatório da reunião com o SINDHOSPE (Silvio e Iberê), seção "Próximas tarefas".
- **Execução:** autônoma, decisões registradas aqui. Branch `melhorias-reuniao` nos dois repositórios.

## Princípios

1. **Uma única competência para tudo**: a mais recente do CNES (hoje 06/2026). A causa da divergência de leitos era o cartão ler `estabelecimentos_pe`, que é de **06/2024**, enquanto a evolução lia o histórico de 06/2026.
2. **Leitos vêm de uma única fonte**: o arquivo LT do CNES (`leitos_pe_historico`), o mesmo que o CNESWeb mostra na aba Leitos. Total = soma de `QT_EXIST`; SUS = `QT_SUS`; não SUS = `QT_NSUS`; divisão por tipo (`TP_LEITO`) e especialidade (`CODLEITO`).
3. **Sem médias fracionadas de leitos.** O contexto passa a ser **totais** do município e do estado e a **participação %** do estabelecimento. Para equipamentos e profissionais, a comparação usa **mediana** de estabelecimentos do mesmo tipo.
4. **Conteúdo por categoria** de estabelecimento, derivada do `TP_UNID`:
   - **Hospital** (05, 07, 15, 62) → leitos;
   - **Clínica / ambulatório** (04, 22, 36) → equipamentos, profissionais e serviços (especialidades);
   - **Diagnóstico e terapia — SADT** (39) → equipamentos e serviços;
   - **Atenção domiciliar** (77) e **outros** → profissionais e serviços.
   
   O bloco de leitos só aparece se o estabelecimento for hospital **ou** tiver leitos cadastrados.
5. **Mudanças no Firestore só somam.** Os campos antigos continuam iguais (a produção atual segue funcionando e a paridade com a API antiga continua valendo). O conteúdo novo fica em `associados/{cnes}.atual`, `publico/setores` e `sindicato/painel`.
6. **LGPD:** o arquivo de profissionais (PF) do DATASUS traz nomes. Guardamos **apenas contagens por ocupação**; nenhum nome, CNS ou registro sai do script.

## Fontes novas (DATASUS, competência mais recente, PE)

| Arquivo | Uso |
|---|---|
| EQ (equipamentos) | Quantidade existente / em uso / SUS, por equipamento |
| PF (profissionais) | Contagem de profissionais distintos por grupo de ocupação (CBO) |
| SR (serviços especializados) | Especialidades/serviços do estabelecimento, com nome |
| HB (habilitações) | Total de habilitações |
| TAB_CNES (dicionários) | Nomes de equipamentos, serviços e especialidades de leito |

Leitura do formato `.dbc` em JavaScript puro (`node-pkware`), sem Python nem compilador. O script `npm run baixar-cnes -- AAAAMM` baixa, agrega e grava `dados/cnes-AAAAMM.json` (só agregados, versionado). O `npm run importar` lê esse arquivo.

## Dados do cadastro (arquivo ST, já no Neon)

- `DT_ATUAL` → **"Última atualização do cadastro no CNES"** (A5), separada da competência do sistema.
- `ALVARA`, `DT_EXPED`, `ORGEXPED` → **licença sanitária informada no CNES** (número, data de expedição, órgão: SES/estado ou SMS/município). É o que dá para mostrar hoje em "seus dados estão de acordo com a vigilância sanitária"; a conferência com a APEVISA depende da pesquisa D-1.

## Visão do sindicato

- Conta própria `sindicato@sindhospe.app` com claim `perfil: "sindicato"`, senha em `segredos/.env` (`SENHA_SINDICATO`), **não** a senha de demonstração.
- Documento `sindicato/painel`, legível só por esse perfil: associados por categoria (com e sem leito), leitos/UTI/SUS dos associados × estado, equipamentos e profissionais, evolução dos leitos, tabela com todos os associados e situação do cadastro, pedidos de revisão.
- Tela `/sindicato` ("Painel SINDHOSPE"); o login ganha a opção "Acesso do SINDHOSPE".

## Fora do escopo desta rodada

- Cruzamento com APEVISA e ANS (dependem da pesquisa D-1/D-2, documentada em `docs/projeto/pesquisa-fontes.md`).
- Decisões da equipe (cadeira × TCC × produto, nome "Portal Saúde PE"): o rascunho do plano de trabalho (`docs/projeto/plano-de-trabalho.md`) deixa essas escolhas marcadas como **a decidir**.
- Remover a API Express (fase 3 da migração).
