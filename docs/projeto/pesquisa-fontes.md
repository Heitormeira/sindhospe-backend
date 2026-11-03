# Pesquisa de fontes de dados (tarefas D-1, D-2 e D-3)

Origem: reunião com o SINDHOSPE em 28/10/2026 (seção 2.6 do relatório). Levantamento feito em 03/11/2026.

## Resumo

| Fonte | Tem dado público? | Dá para cruzar com o portal? | Situação |
|---|---|---|---|
| CNES/DATASUS: leitos, equipamentos, profissionais, serviços, habilitações | Sim (FTP do DATASUS, mensal) | Sim, pelo CNES | **Já no portal** |
| CNES: licença sanitária declarada (`ALVARA`, `DT_EXPED`, `ORGEXPED`) | Sim (arquivo ST) | Sim, pelo CNES | **Já no portal** (aba Perfil) |
| Vigilância sanitária do **Recife**: licenciamento sanitário | Sim (dados abertos da Prefeitura, CSV diário) | Sim, pelo **CNPJ** | Testado; próximo passo |
| **APEVISA** (estado) | Não encontramos conjunto aberto | — | Pedir ao SINDHOSPE / LAI |
| **ANS** | Sim (portal de dados abertos da ANS) | Parcial | Fase seguinte |
| Observatório/BI do SINDHOSPE (Lume) | Acesso só de consulta | — | Aguardando acesso |

## D-1. Vigilância sanitária ("seus dados estão de acordo com a vigilância sanitária?")

### O que já está no portal

O próprio CNES traz a licença sanitária que o estabelecimento **declarou**: número, data de expedição e órgão expedidor (1 = estadual/APEVISA, 2 = municipal). A aba Perfil mostra isso, e o Painel SINDHOSPE lista quem não informou licença: **24 associados** na competência 06/2026.

Limite: é autodeclaração e não diz se a licença está válida.

### Prefeitura do Recife: conjunto aberto "Licenciamento Sanitário"

- Página: https://dados.recife.pe.gov.br/dataset/licenciamento-sanitario (CSV + dicionário em PDF; atualização diária; só processos 100% digitais).
- Campos úteis: `cnpj`, `razao_social`, `num_licenca`, `data_emissao_licenca`, `data_validade_licenca`, `licenciamento_sanitario` (ex.: "Licenciamento vigente", "Licenciamento expirado", "Licenciamento inexistente", "Licenciamento(s) solicitado(s)"), `situacao_processo`, endereço e coordenadas.
- **Teste de cruzamento (03/11/2026):** dos **112** associados com estabelecimento em Recife, **91** aparecem no arquivo pelo CNPJ e **40** têm status "Licenciamento vigente".
- Cuidados antes de mostrar ao associado:
  - há registros "vigente" com `data_validade_licenca` já vencida (ex.: 2022) ou vazia. É preciso definir a regra (status x data) com o SINDHOSPE;
  - o cruzamento é por CNPJ: um CNPJ com várias unidades (filiais) precisa ser casado pelo endereço;
  - só cobre Recife e só processos digitais.
- **Proposta:** incluir no importador como etapa opcional (`npm run baixar-licencas`), mostrar no Perfil "Licença sanitária municipal (Recife): vigente / expirada / não encontrada" com a data e a fonte, e no Painel SINDHOSPE a contagem por situação.

### APEVISA (estadual)

- Não encontramos conjunto de dados aberto da APEVISA no portal de dados abertos de Pernambuco (dados.pe.gov.br) nem no site da agência. O licenciamento estadual segue a Portaria SES/PE nº 288/2026, que fala de consulta no portal da APEVISA, mas não de dados abertos.
- Contato público: apevisa@saude.pe.gov.br, (81) 3181-6425 / 3181-6424.
- **Proposta:** o SINDHOSPE pedir à APEVISA a lista de licenças dos estabelecimentos (CNPJ, número, validade). Alternativa: pedido via Lei de Acesso à Informação.

## D-2. ANS (saúde suplementar)

Portal de dados abertos da ANS (dados.gov.br, organização ANS), com Plano de Dados Abertos 2024–2026. Conjuntos com potencial para o portal:

| Conjunto | O que traz | Uso possível |
|---|---|---|
| Hospitais, clínicas e laboratórios acreditados (Qualiss) | Prestadores com certificado de acreditação | Selo "acreditado" no Perfil |
| Monitoramento da Qualidade Hospitalar (PM-QUALISS) | Indicadores de qualidade dos hospitais participantes | Comparativo de qualidade (só quem participa) |
| Padrão TISS: procedimentos ambulatoriais e hospitalares por UF | Volume e valor médio de procedimentos na saúde suplementar, por UF e mês | Contexto de mercado em PE (não por estabelecimento) |
| Beneficiários por município | Quantidade de beneficiários de planos | Tamanho do mercado privado por município |
| Ressarcimento ao SUS | Atendimentos SUS a beneficiários de planos | Contexto para hospitais com leitos SUS |

Observações: a ANS não publica a rede credenciada de cada operadora com o CNES do prestador de forma simples. O cruzamento por estabelecimento só é direto no Qualiss.

## D-3. Referências

- Observatório citado na reunião (São Paulo, com versão paga): usar como inspiração de layout e indicadores, sem copiar conteúdo.
- O BI do SINDHOSPE (feito pela Lume) junta Receita Federal, CNES, RAIS, CAGED e ANS. O Painel SINDHOSPE do portal cobre a parte do CNES; RAIS e CAGED (empregos formais por ocupação) ficam para uma fase seguinte, se o escopo incluir.

## Achado sobre profissionais

O arquivo PF do CNES depende do que o estabelecimento cadastra. Exemplo: o Hospital Esperança tem 188 vínculos no CNES, 175 deles de médicos e só 2 de enfermeiros. Ou seja, a enfermagem não está cadastrada. O portal mostra esses números com o aviso de cadastro possivelmente incompleto, o que também serve de alerta para o associado.
