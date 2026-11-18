const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gerarSenha, ALFABETO, paraCsv } = require("../scripts/senhas");

test("gerarSenha: 10 caracteres sem ambíguos, com letra e número", () => {
  const vistas = new Set();
  for (let i = 0; i < 500; i++) {
    const s = gerarSenha();
    assert.equal(s.length, 10);
    assert.ok([...s].every((c) => ALFABETO.includes(c)), s);
    assert.match(s, /[a-zA-Z]/);
    assert.match(s, /[0-9]/);
    vistas.add(s);
  }
  assert.equal(vistas.size, 500, "sem repetição");
  for (const c of "0O1lI") assert.ok(!ALFABETO.includes(c), `sem ${c}`);
});

test("paraCsv: separador ; (Excel pt-BR), BOM, aspas escapadas", () => {
  const csv = paraCsv([{ cnes: "2355906", estabelecimento: 'HOSPITAL "X"; SA', senha: "abc" }]);
  assert.ok(csv.startsWith("\uFEFFcnes;estabelecimento;senha\r\n"));
  assert.ok(csv.includes('2355906;"HOSPITAL ""X""; SA";abc'));
});
