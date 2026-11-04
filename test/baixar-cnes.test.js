const { test } = require("node:test");
const assert = require("node:assert/strict");
const { agregarCnes, limparRotulo } = require("../scripts/baixar-cnes");

const EQ = [
  { CNES: "1", TIPEQUIP: "01", CODEQUIP: "13", QT_EXIST: "2", QT_USO: "2", IND_SUS: "0" },
  { CNES: "1", TIPEQUIP: "01", CODEQUIP: "13", QT_EXIST: "1", QT_USO: "0", IND_SUS: "1" },
  { CNES: "1", TIPEQUIP: "02", CODEQUIP: "05", QT_EXIST: "4", QT_USO: "4", IND_SUS: "0" },
];
const PF = [
  { CNES: "1", CBO: "225125", CNS_PROF: "A", NOMEPROF: "FULANO" },
  { CNES: "1", CBO: "225250", CNS_PROF: "A", NOMEPROF: "FULANO" }, // mesmo médico, 2 CBOs
  { CNES: "1", CBO: "223505", CNS_PROF: "B", NOMEPROF: "BELTRANA" },
  { CNES: "2", CBO: "322205", CNS_PROF: "A", NOMEPROF: "FULANO" },
];
const SR = [
  { CNES: "1", SERV_ESP: "105" }, { CNES: "1", SERV_ESP: "105" }, { CNES: "1", SERV_ESP: "121" },
];
const HB = [{ CNES: "1", SGRUPHAB: "2601" }, { CNES: "1", SGRUPHAB: "2601" }, { CNES: "1", SGRUPHAB: "0802" }];

test("agregarCnes soma equipamentos por código e conta profissionais distintos", () => {
  const r = agregarCnes({ eq: EQ, pf: PF, sr: SR, hb: HB });
  assert.deepEqual(r["1"].eq, { "0113": [3, 2, 1], "0205": [4, 4, 0] }); // [existentes, em uso, SUS]
  assert.deepEqual(r["1"].pf, { t: 2, g: { medicos: 1, enfermeiros: 1 } });
  assert.deepEqual(r["1"].sr, ["105", "121"]);
  assert.equal(r["1"].hb, 2);
  assert.deepEqual(r["2"].pf, { t: 1, g: { tec_enfermagem: 1 } });
});

test("agregarCnes não deixa sair nenhum dado pessoal", () => {
  const texto = JSON.stringify(agregarCnes({ eq: EQ, pf: PF, sr: SR, hb: HB }));
  for (const proibido of ["FULANO", "BELTRANA", '"A"', '"B"', "CNS"]) assert.ok(!texto.includes(proibido), proibido);
});

test("limparRotulo tira o prefixo de código e normaliza caixa", () => {
  assert.equal(limparRotulo("0113-Ultrassom Doppler Colorido"), "Ultrassom Doppler Colorido");
  assert.equal(limparRotulo("3-Complementar"), "Complementar");
  assert.equal(limparRotulo("ESTRATEGIA DE SAUDE DA FAMILIA"), "Estrategia de saude da familia");
  assert.equal(limparRotulo("UTI ADULTO - TIPO II"), "UTI adulto - tipo II");
});
