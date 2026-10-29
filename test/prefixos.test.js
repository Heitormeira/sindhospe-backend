const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizar, gerarPrefixos, termoDeBusca } = require("../scripts/prefixos");

test("normalizar remove acentos e caixa", () => {
  assert.equal(normalizar("Hospital ESPERANÇA"), "hospital esperanca");
  assert.equal(normalizar("  São João  "), "sao joao");
});

test("gera prefixos de 2+ caracteres de cada palavra", () => {
  const p = gerarPrefixos("Hospital Esperança");
  for (const esperado of ["ho", "hosp", "hospital", "es", "esperanca"]) assert.ok(p.includes(esperado), esperado);
  assert.ok(!p.includes("h"));
  assert.ok(!p.includes("e"));
});

test("gera prefixos das frases que começam em cada palavra", () => {
  const p = gerarPrefixos("Hospital Santa Joana");
  for (const esperado of ["hospital s", "hospital santa", "hospital santa jo", "hospital santa joana", "santa jo", "joana"]) {
    assert.ok(p.includes(esperado), esperado);
  }
  assert.ok(!p.includes("hospital "), "sem espaço no fim");
  assert.ok(!p.includes("ospital"), "não casa no meio da palavra");
});

test("pontuação separa palavras", () => {
  const p = gerarPrefixos("UTI-Neo (Recife)");
  for (const esperado of ["uti", "uti neo", "neo recife", "recife"]) assert.ok(p.includes(esperado), esperado);
});

test("sem duplicatas", () => {
  const p = gerarPrefixos("Casa Casa");
  assert.equal(p.length, new Set(p).size);
  assert.deepEqual(p, ["ca", "cas", "casa", "casa c", "casa ca", "casa cas", "casa casa"]);
});

test("termoDeBusca casa com o índice para o que o usuário digita", () => {
  const p = gerarPrefixos("Hospital Santa Joana");
  for (const digitado of ["Hospital Santa", "hospital  santa jo", "SANTA-Jo", "Joana"]) {
    assert.ok(p.includes(termoDeBusca(digitado)), digitado);
  }
  assert.equal(termoDeBusca("h"), null);
  assert.equal(termoDeBusca(" - "), null);
});
