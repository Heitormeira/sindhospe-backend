const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compactarHistorico, linhasSt, leitosPorCnes, totaisLeitos, CAMPOS_LIDOS_ST } = require("../scripts/historico");
const { trimestres } = require("../scripts/baixar-cnes");

const ST = [
  {
    CNES: "H1", CODUFMUN: "261160", TP_UNID: "05", VINC_SUS: "1", URGEMERG: "1", CENTRCIR: "1", CENTROBS: "0",
    ATENDAMB: "1", ATENDHOS: "1", DT_ATUAL: "202604", ALVARA: "123", DT_EXPED: "20250819", ORGEXPED: "2",
    NAT_JUR: "2054", TURNO_AT: "06", QTLEITP1: "48", QTLEITP2: "64", QTLEITP3: "117", QTLEIT05: "10", QTLEIT40: "",
    CPF_CNPJ: "12345678000199", COD_CEP: "50000000",
  },
  { CNES: "C1", CODUFMUN: "261160", TP_UNID: "39", VINC_SUS: "0", QTLEITP1: "", QTLEITP2: "", QTLEITP3: "" },
];
const LT = [
  { CNES: "H1", TP_LEITO: "1", CODLEITO: "03", QT_EXIST: "48", QT_SUS: "0", QT_NSUS: "48" },
  { CNES: "H1", TP_LEITO: "3", CODLEITO: "75", QT_EXIST: "117", QT_SUS: "3", QT_NSUS: "114" },
  { CNES: "H1", TP_LEITO: "2", CODLEITO: "33", QT_EXIST: "85", QT_SUS: "0", QT_NSUS: "85" },
];

test("compactarHistorico guarda só os campos do ST que o portal usa (sem CPF/CNPJ nem CEP)", () => {
  const h = compactarHistorico("202606", { st: ST, lt: LT });
  const texto = JSON.stringify(h);
  for (const proibido of ["12345678000199", "50000000", "CPF_CNPJ", "COD_CEP"]) assert.ok(!texto.includes(proibido), proibido);
  assert.ok(!CAMPOS_LIDOS_ST.includes("CPF_CNPJ"));
  const [h1] = linhasSt(h);
  assert.equal(h1.cnes, "H1");
  assert.equal(h1.TP_UNID, "05");
  assert.equal(h1.DT_ATUAL, "202604");
  assert.equal(h1.LEITOS_ST, 229); // QTLEITP1 + 2 + 3, como a API antiga
  assert.equal(h1.COMPLEMENTARES_ST, 10);
  assert.equal(linhasSt(h)[1].LEITOS_ST, 0);
});

test("CNES repetido no ST conta cada linha (como no banco antigo)", () => {
  const h = compactarHistorico("202606", { st: [...ST, { ...ST[1], VINC_SUS: "1" }], lt: [] });
  assert.equal(h.st_repetidos.length, 1);
  assert.equal(linhasSt(h).length, 3);
});

test("leitosPorCnes soma total, SUS e não SUS do LT, por tipo e especialidade", () => {
  const l = leitosPorCnes(compactarHistorico("202606", { st: ST, lt: LT })).get("H1");
  assert.equal(l.total, 250);
  assert.equal(l.sus, 3);
  assert.equal(l.nao_sus, 247);
  assert.deepEqual(l.tipos["3"], { e: 117, s: 3 });
  assert.deepEqual(l.esp["75"], { tipo: "3", e: 117, s: 3 });
});

test("totaisLeitos: complementares são o TP_LEITO 3", () => {
  const h = compactarHistorico("202606", { st: ST, lt: LT });
  assert.deepEqual(totaisLeitos(h.lt.H1), { total: 250, sus: 3, nao_sus: 247, complementares: 117 });
});

test("trimestres: de 3 em 3 meses, terminando na competência pedida", () => {
  assert.deepEqual(trimestres("202406", "202609"), [
    "202406", "202409", "202412", "202503", "202506", "202509", "202512", "202603", "202606", "202609",
  ]);
  assert.deepEqual(trimestres("202406", "202406"), ["202406"]);
});
