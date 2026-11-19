const { test } = require("node:test");
const assert = require("node:assert/strict");
const { campos, registroEstabelecimento, SITUACOES, PORTES } = require("../scripts/baixar-cnpj");
const { montarReceita } = require("../scripts/publicos");

// Linha no layout oficial do arquivo Estabelecimentos da Receita (30 campos, todos entre aspas).
const LINHA =
  '"12345678";"0001";"90";"1";"HOSPITAL TESTE";"02";"20050101";"00";"";"";"19990315";"8610101";"8630501,8640202";' +
  '"AVENIDA";"BOA VIAGEM";"1000";"SALA 2";"BOA VIAGEM";"51020000";"PE";"2531";"81";"33334444";"";"";"";"";"contato@teste.com";"";""';

test("campos separa a linha do CSV da Receita", () => {
  const c = campos(LINHA);
  assert.equal(c.length, 30);
  assert.equal(c[0], "12345678");
  assert.equal(c[11], "8610101");
  assert.equal(c[19], "PE");
});

test("registroEstabelecimento: sem telefone nem e-mail; endereço só de empresa", () => {
  const r = registroEstabelecimento(campos(LINHA), "2062", { 2531: "RECIFE" });
  assert.equal(r.situacao, "02");
  assert.equal(r.inicio_atividade, "1999-03-15");
  assert.deepEqual(r.cnaes_secundarios, ["8630501", "8640202"]);
  assert.equal(r.endereco.municipio, "RECIFE");
  const texto = JSON.stringify(r);
  for (const proibido of ["33334444", "contato@teste.com"]) assert.ok(!texto.includes(proibido), proibido);
  // Empresário individual (2135): o endereço costuma ser a casa da pessoa, então não é guardado.
  assert.equal(registroEstabelecimento(campos(LINHA), "2135", {}).endereco, undefined);
});

test("montarReceita acha o CNPJ pelo CNES (ou pela lista do SINDHOSPE) e formata para a tela", () => {
  const receita = {
    referencia: "2026-11",
    rotulos: { cnae: { 8610101: "Atividades de atendimento hospitalar" }, situacao: SITUACOES, porte: PORTES },
    cnes: { 2355906: "12345678000190" },
    cnpj: { "12345678000190": { ...registroEstabelecimento(campos(LINHA), "2062", { 2531: "RECIFE" }), porte: "05" } },
  };
  const r = montarReceita(receita, "2355906", {});
  assert.equal(r.cnpj, "12.345.678/0001-90");
  assert.equal(r.situacao, "Ativa");
  assert.equal(r.ativa, true);
  assert.equal(r.porte, "Demais (médio e grande porte)");
  assert.equal(r.atividade_principal.label, "Atividades de atendimento hospitalar");
  assert.equal(r.atividades_secundarias[0].label, "8630501", "sem rótulo: fica o código");
  assert.deepEqual(r.endereco, { logradouro: "Avenida Boa Viagem, 1000", complemento: "Sala 2", bairro: "Boa Viagem", cep: "51020-000", municipio: "Recife", uf: "PE" });
  assert.equal(montarReceita(receita, "0000000", { cnpj: "12.345.678/0001-90" }).cnpj, "12.345.678/0001-90", "pela lista do SINDHOSPE");
  assert.equal(montarReceita(receita, "0000000", {}), null);
  assert.equal(montarReceita(null, "2355906", {}), null);
});
