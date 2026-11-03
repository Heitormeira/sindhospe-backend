# Amostra do estudo por tipo de estabelecimento (tarefa B1)

Origem: proposta do Silvio na reunião de 28/10/2026 (seção 2.7): **5 hospitais** (2–3 da capital, 3 do interior) e clínicas por perfil (radiologia, patologia, análises clínicas). A amostra serve para validar, com o SINDHOSPE, o que cada tipo de estabelecimento deve ver no portal.

## Critério

- Dados da competência 06/2026 do CNES (o mesmo que está no portal).
- **Escolhemos entre os associados**, porque o arquivo público do CNES não traz o nome do estabelecimento (só o código), e os associados já têm conta no portal, então dá para abrir a tela de cada um na demonstração. Se o SINDHOSPE quiser incluir não associados, os nomes podem ser consultados no CNESWeb pelo código.
- Hospitais: tipos diferentes (privado, filantrópico) e regiões diferentes do estado.
- Clínicas: os maiores de cada grupo de comparação do portal (categoria + serviço principal).

## Hospitais (5 + 1 reserva)

| CNES | Estabelecimento | Município | Leitos | Por que entra |
|---|---|---|---|---|
| 2355906 | Hospital Esperança | Recife | 250 | Caso usado na reunião (divergência de leitos) |
| 0001120 | Real Hospital Português | Recife | 725 | Filantrópico citado na reunião (leitos SUS em hospital não público) |
| 5615895 | Unimed Caruaru | Caruaru (Agreste) | 212 | Hospital de operadora no interior |
| 2354551 | APAMI Surubim | Surubim (Agreste Setentrional) | 180 | Materno-infantil filantrópico no interior |
| 3812553 | Memorial Hospital de Goiana | Goiana (Mata Norte) | 76 | Hospital privado de porte menor |
| 0000434 | IMIP *(reserva)* | Recife | 1.048 | Maior associado, perfil SUS |

## Clínicas e serviços de diagnóstico

| Grupo de comparação no portal | CNES | Estabelecimento | Município | Equipamentos / vínculos |
|---|---|---|---|---|
| SADT · diagnóstico por imagem (radiologia) | 3141020 | Clínica Radiológica Lucilo Maranhão | Recife | 16 / 84 (citada na reunião) |
| SADT · diagnóstico por imagem | 0002003 | Centro Diagnóstico Multimagem | Recife | 51 / 6 |
| Clínica · nefrologia e diálise | 3660710 | Clínica Nefrológica de Caruaru (SOS Rim) | Caruaru | 92 / 64 |
| Clínica · oftalmologia | 7374720 | Univision Médicos Associados | Recife | 52 / 11 |
| SADT · laboratório clínico | 2348691 | Laboratório Jussara | Cupira | 0 / 1 |
| SADT · anatomia patológica | 2430274 | Laboratório de Patologia Clínica | Petrolina | 0 / 1 |
| Atenção domiciliar | 7560559 | Confiare Saúde | Recife | 143 / 195 |

**Atenção:** os laboratórios e as patologias associados têm cadastro muito pequeno no CNES (0 equipamentos, 1 profissional). Para esses perfis, a amostra deve incluir laboratórios não associados de maior porte (consultar no CNESWeb), senão a comparação fica pobre. Este é um ponto para levar ao Silvio junto com a lista de informações que ele vai mandar (compromisso C1 da reunião).

## Como usar

1. Abrir cada estabelecimento no portal (login pela busca do nome) e anotar o que falta ou sobra em cada aba.
2. Comparar com a ficha no CNESWeb (Consultas → Estabelecimentos) para conferir leitos, equipamentos e profissionais.
3. Levar as diferenças e a tabela "tipo × indicadores" (tarefa B2) para a próxima reunião.
