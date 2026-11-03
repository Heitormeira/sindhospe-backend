const { test } = require("node:test");
const assert = require("node:assert/strict");
const { categoriaDoTipo, grupoProfissional, mediana, percentil, CATEGORIAS, perfilDeServico } = require("../scripts/categorias");

test("categoriaDoTipo agrupa os tipos de unidade do CNES", () => {
  for (const t of ["05", "07", "15", "62"]) assert.equal(categoriaDoTipo(t), "hospital", t);
  for (const t of ["04", "22", "36"]) assert.equal(categoriaDoTipo(t), "clinica", t);
  assert.equal(categoriaDoTipo("39"), "diagnostico");
  assert.equal(categoriaDoTipo("77"), "domiciliar");
  assert.equal(categoriaDoTipo("43"), "outros");
  assert.equal(categoriaDoTipo(null), "outros");
  assert.equal(categoriaDoTipo(" 05 "), "hospital");
  for (const c of ["hospital", "clinica", "diagnostico", "domiciliar", "outros"]) assert.ok(CATEGORIAS[c].label);
});

test("grupoProfissional usa a família da CBO", () => {
  assert.equal(grupoProfissional("225125"), "medicos");
  assert.equal(grupoProfissional("223505"), "enfermeiros");
  assert.equal(grupoProfissional("322205"), "tec_enfermagem");
  assert.equal(grupoProfissional("223605"), "fisioterapeutas");
  assert.equal(grupoProfissional("324115"), "tec_radiologia");
  assert.equal(grupoProfissional("411010"), "outros");
  assert.equal(grupoProfissional(""), "outros");
});

test("mediana e percentil para comparar com o mesmo tipo", () => {
  assert.equal(mediana([]), 0);
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(percentil([1, 2, 3, 4], 3), 50); // 50% têm menos que 3
  assert.equal(percentil([], 3), 0);
});

test("perfilDeServico escolhe o serviço que define o subgrupo, com prioridade", () => {
  assert.equal(perfilDeServico(["159", "121"]).codigo, "imagem");
  assert.equal(perfilDeServico(["145", "120"]).codigo, "patologia");
  assert.equal(perfilDeServico(["144"]).codigo, "laboratorio");
  assert.equal(perfilDeServico(["159"]), null);
  assert.equal(perfilDeServico([]), null);
});

test("percentil nunca diz 100%", () => {
  assert.equal(percentil([1, 2, 3], 3), 67);
  assert.equal(percentil(Array.from({ length: 300 }, (_, i) => i), 299), 99);
});
