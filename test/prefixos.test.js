const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizar, gerarPrefixos } = require("../scripts/prefixos");

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

test("pontuação separa palavras", () => {
  const p = gerarPrefixos("UTI-Neo (Recife)");
  for (const esperado of ["uti", "neo", "recife"]) assert.ok(p.includes(esperado), esperado);
});

test("sem duplicatas", () => {
  const p = gerarPrefixos("Casa Casa");
  assert.equal(p.length, new Set(p).size);
  assert.deepEqual(p, ["ca", "cas", "casa"]);
});
