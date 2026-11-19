const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { comparar, primeiraDiferenca } = require("../scripts/comparar-saidas");

function saida(docs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saida-"));
  for (const [chave, dados] of Object.entries(docs)) {
    fs.mkdirSync(path.join(dir, path.dirname(chave)), { recursive: true });
    fs.writeFileSync(path.join(dir, `${chave}.json`), JSON.stringify(dados));
  }
  return dir;
}

test("primeiraDiferenca ignora a ordem das chaves e aponta o caminho", () => {
  assert.equal(primeiraDiferenca({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), null);
  assert.deepEqual(primeiraDiferenca({ a: { b: [1, 2] } }, { a: { b: [1, 3] } }), { caminho: "a.b[1]", a: 2, b: 3 });
});

test("comparar separa diferenças esperadas das inesperadas", () => {
  const atual = { leitos: { total: 250 } };
  const antiga = saida({
    "associados/H1": { identidade: { cnpj: "1" }, estrutura: { tp_unid: "05", ano: 2024 }, comparativo: {}, indicadores: {}, evolucao: [], atual },
    "associados/H2": { identidade: { cnpj: "2" }, estrutura: null, atual: { leitos: { total: 10 } } },
    "publico/visao-geral": {},
    "publico/meta": { importado_em: "ontem" },
    "mercado/05_PE": { serie: [1] },
  });
  const nova = saida({
    "associados/H1": { identidade: { cnpj: "1" }, estrutura: { tp_unid: "05" }, atual },
    "associados/H2": { identidade: { cnpj: "SEGREDO" }, estrutura: null, atual: { leitos: { total: 11 } } },
    "publico/meta": { importado_em: "hoje" },
    "mercado/05_PE": { serie: [1] },
  });
  const r = comparar(antiga, nova);
  assert.deepEqual(r.esperadas.removidos, ["publico/visao-geral"]);
  assert.equal(r.esperadas.estrutura, 1);
  assert.deepEqual(r.esperadas.mudam, ["publico/meta"]);
  assert.deepEqual(r.iguais, { associados: 1, mercado: 1 });
  assert.equal(r.inesperadas.length, 1);
  assert.match(r.inesperadas[0].motivo, /identidade\.cnpj/);
  assert.ok(!r.inesperadas[0].motivo.includes("SEGREDO"), "não imprime valores da identidade");
});
