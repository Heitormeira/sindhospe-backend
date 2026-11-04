# Plano de trabalho — Portal SINDHOSPE (rascunho para o SINDHOSPE)

> **Rascunho.** Pedido do Iberê na reunião de 28/10/2026 para apresentar ao presidente do SINDHOSPE. Os itens marcados **[a decidir]** dependem da equipe ou do sindicato e precisam ser fechados antes do envio.

## 1. Partes

- **UNICAP**: equipe do Projeto Integrador (5º período de Ciência da Computação): Heitor Meira, Heitor Farias, Caio Bandeira, Marcelo Caldas e Diogo André Ferreira. Professor orientador: **[a decidir: nome]**.
- **SINDHOSPE**: Sindicato dos Hospitais e Estabelecimentos de Serviços de Saúde de Pernambuco. Interlocutores: Silvio Marinho (Relações Institucionais) e Iberê. Aprovação: presidente do SINDHOSPE **[confirmar nome]**.

## 2. Objetivo

Oferecer aos associados do SINDHOSPE um portal em que cada estabelecimento veja os próprios números do CNES (leitos, equipamentos, profissionais, serviços, situação do cadastro) comparados com o mercado de Pernambuco, e oferecer ao sindicato uma visão consolidada dos associados ("como está o comportamento total dos nossos associados").

## 3. Escopo

### Etapa 1 — Estudo com dados públicos do CNES ("Portal Saúde PE")
- Base: CNES/DATASUS, dados públicos e mensais.
- Amostra por tipo de estabelecimento: 5 hospitais e clínicas por perfil (ver `amostra-estudo.md`).
- Validar com o SINDHOSPE o que cada tipo deve ver (sugestões do Silvio).
- Nome de trabalho: **"Portal Saúde PE"**, sem a marca SINDHOSPE até a aprovação. **[a decidir]**

### Etapa 2 — Portal do associado (já em funcionamento como demonstração)
- Login por estabelecimento; dados do próprio estabelecimento e comparativos com o mesmo tipo.
- Situação do cadastro no CNES e licença sanitária declarada.
- Pedido de revisão de dados enviado ao sindicato.

### Etapa 3 — Visão do sindicato e novas fontes
- Painel SINDHOSPE: totais dos associados, setores, cadastros desatualizados, pedidos de revisão (já em demonstração).
- Licenciamento sanitário municipal (Recife, dados abertos) e estadual (APEVISA, depende de acesso).
- ANS (acreditação, qualidade hospitalar) e, se fizer sentido, RAIS/CAGED.

**Fora do escopo nesta fase:** dados que não sejam públicos ou cedidos formalmente pelo SINDHOSPE; integração com o BI atual (Lume).

## 4. Cronograma

| Período | Entrega |
|---|---|
| até 07/11/2026 | Envio deste plano ao SINDHOSPE; recebimento das sugestões do Silvio por tipo de estabelecimento |
| 10/11 a 21/11 | Ajustes por tipo de estabelecimento com base na amostra; nova reunião de validação |
| 24/11 a 30/11 | Entrega da disciplina (30/11): portal, documentação e apresentação |
| após 30/11 | **[a decidir]**: encerrar com a disciplina, continuar como TCC ou evoluir como produto |

## 5. Dados e LGPD

- **Dados públicos** (CNES/DATASUS, dados abertos municipais, ANS): usados sem restrição, com a fonte citada na tela.
- **Dados de profissionais**: o arquivo do CNES traz nomes; o portal guarda **apenas contagens por ocupação**. Nenhum nome, CPF ou CNS sai do processo de importação.
- **Base de associados do SINDHOSPE** (nome, CNPJ, registro, situação): cedida pelo sindicato só para o portal; não é publicada nem repassada. Fica no banco do projeto com acesso restrito.
- **Acesso**: cada associado vê só o próprio estabelecimento; a visão consolidada é só da conta do sindicato. As regras de acesso são testadas automaticamente.
- **Ao fim do projeto**: os dados cedidos pelo SINDHOSPE são apagados ou devolvidos, conforme o sindicato decidir. **[a decidir]**

## 6. Responsabilidades

| UNICAP (equipe) | SINDHOSPE |
|---|---|
| Desenvolver e documentar o portal | Indicar o que é relevante por tipo de estabelecimento |
| Importar e atualizar os dados públicos | Ceder e manter atualizada a lista de associados |
| Proteger os dados cedidos (seção 5) | Validar as telas nas reuniões |
| Apresentar o resultado nas reuniões | Viabilizar contato com APEVISA, se for o caso |

## 7. Infraestrutura e custos

- Frontend na Vercel e dados no Firebase (Google), ambos no **plano gratuito**: custo zero para o SINDHOSPE nesta fase.
- Se o projeto continuar como produto, os custos de hospedagem e a propriedade do código precisam ser combinados. **[a decidir]**

## 8. Para decidir na próxima reunião interna da equipe

1. O projeto termina em 30/11, vira TCC ou vira produto?
2. O nome "Portal Saúde PE" para a etapa 1.
3. Quem da equipe é o ponto de contato com o SINDHOSPE.
4. Professor orientador que assina o plano.
