const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { carregarFontes, montarBase } = require("../scripts/fontes");
const { montarDocumentos } = require("../scripts/documentos");
const { compactarHistorico } = require("../scripts/historico");

const st = (cnes, mun, tp, extra = {}) => ({
  CNES: cnes, CODUFMUN: mun, TP_UNID: tp, VINC_SUS: "1", URGEMERG: "0", CENTRCIR: "0", CENTROBS: "0", ATENDAMB: "1",
  DT_ATUAL: "202604", ALVARA: "", DT_EXPED: "", ORGEXPED: "", NAT_JUR: "2054", QTLEITP1: "0", QTLEITP2: "0", QTLEITP3: "0", ...extra,
});
const lt = (cnes, tp, cod, e, s) => ({ CNES: cnes, TP_LEITO: tp, CODLEITO: cod, QT_EXIST: String(e), QT_SUS: String(s), QT_NSUS: String(e - s) });

/** Pasta de dados mínima: 2 competências, 2 hospitais e 1 clínica; associados H1, C1 e um sem CNES. */
function pastaFalsa() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-"));
  fs.mkdirSync(path.join(dir, "historico"));
  const comps = {
    202603: { st: [st("H1", "261160", "05", { QTLEITP1: "100" }), st("H2", "261160", "05", { VINC_SUS: "0", QTLEITP1: "50" })], lt: [lt("H1", "1", "03", 100, 10)] },
    202606: {
      st: [st("H1", "261160", "05", { QTLEITP1: "120" }), st("H2", "261160", "05", { VINC_SUS: "0", QTLEITP1: "50" }), st("C1", "260790", "39")],
      lt: [lt("H1", "1", "03", 100, 10), lt("H1", "3", "75", 20, 0), lt("H2", "2", "33", 50, 0)],
    },
  };
  for (const [c, brutos] of Object.entries(comps)) {
    fs.writeFileSync(path.join(dir, "historico", `${c}.json`), JSON.stringify(compactarHistorico(c, brutos)));
  }
  const vazio = { rotulos: { equipamentos: {}, servicos: {}, leitos_tipo: {}, leitos_especialidade: {} }, estabelecimentos: {} };
  fs.writeFileSync(path.join(dir, "cnes-202603.json"), JSON.stringify({ competencia: "202603", ...vazio }));
  fs.writeFileSync(path.join(dir, "cnes-202606.json"), JSON.stringify({ competencia: "202606", ...vazio }));
  fs.writeFileSync(
    path.join(dir, "municipios-pe.json"),
    JSON.stringify({ municipios: [{ codufmun: "260790", nome_municipio: "Jaboatão dos Guararapes" }, { codufmun: "261160", nome_municipio: "Recife" }] })
  );
  fs.writeFileSync(path.join(dir, "natureza-juridica.json"), JSON.stringify({ naturezas: { 2054: "Sociedade Anonima Fechada" } }));
  const associados = path.join(dir, "associados.json");
  fs.writeFileSync(
    associados,
    JSON.stringify([
      { cnes: "H1", nome_fantasia: "HOSPITAL UM", situacao: "Filiado", cnpj: "1" },
      { cnes: "H1", nome_fantasia: "DUPLICADO", situacao: "Filiado", cnpj: "2" },
      { cnes: "C1", nome_fantasia: "CLINICA UM", situacao: "Filiado", cnpj: "3" },
      { cnes: "", nome_fantasia: "SEM CNES", situacao: "Filiado" },
    ])
  );
  return { dir, associados };
}

test("carregarFontes usa a competência mais recente e a série até ela", () => {
  const { dir, associados } = pastaFalsa();
  const f = carregarFontes({ pastaDados: dir, associadosPath: associados });
  assert.equal(f.competencia, "202606");
  assert.deepEqual(f.historicos.map((h) => h.competencia), ["202603", "202606"]);
  assert.equal(f.associados.porCnes.size, 2, "um registro por CNES, sem a linha sem CNES");
  assert.equal(f.associados.porCnes.get("H1").nome_fantasia, "HOSPITAL UM", "fica o primeiro");
  assert.equal(f.associados.semCnes, 1);

  const antiga = carregarFontes({ pastaDados: dir, associadosPath: associados, competencia: "202603" });
  assert.deepEqual(antiga.historicos.map((h) => h.competencia), ["202603"]);

  const recorte = carregarFontes({ pastaDados: dir, associadosPath: associados, desde: "202606" });
  assert.deepEqual(recorte.historicos.map((h) => h.competencia), ["202606"], "--historico-desde corta a série");
  assert.throws(() => carregarFontes({ pastaDados: dir, associadosPath: associados, competencia: "202603", desde: "202606" }), /historico-desde/);
});

test("carregarFontes explica o que falta", () => {
  const { dir, associados } = pastaFalsa();
  assert.throws(() => carregarFontes({ pastaDados: dir, associadosPath: associados, competencia: "202609" }), /cnes-202609/);
  assert.throws(() => carregarFontes({ pastaDados: dir, associadosPath: path.join(dir, "nao-existe.json") }), /exportar-associados/);
});

test("montarBase: leitos e evolução do LT, cadastro do ST da competência atual", () => {
  const { dir, associados } = pastaFalsa();
  const base = montarBase(carregarFontes({ pastaDados: dir, associadosPath: associados }));
  assert.equal(base.leitos.get("H1").total, 120);
  assert.equal(base.cadastros.get("C1").tp_unid, "39");
  assert.deepEqual(base.evolucao.porCnes.get("H1"), [
    { competencia: "202603", total: 100, sus: 10, nao_sus: 90, complementares: 0 },
    { competencia: "202606", total: 120, sus: 10, nao_sus: 110, complementares: 20 },
  ]);
  assert.equal(base.evolucao.porCnes.has("C1"), false, "sem leitos, sem série");
  assert.deepEqual(base.evolucao.estado.map((x) => x.total), [100, 170]);
  assert.equal(base.municipios["261160"], "Recife");
});

test("montarDocumentos: associados, busca, mercado e públicos sem banco de dados", () => {
  const { dir, associados } = pastaFalsa();
  const docs = montarDocumentos(carregarFontes({ pastaDados: dir, associadosPath: associados }), { log: () => {} });

  const h1 = docs.get("associados/H1");
  assert.equal(h1.identidade.cnpj, "1");
  assert.equal(h1.estrutura.tp_unid_label, "Hospital geral");
  assert.equal(h1.estrutura.municipio_nome, "Recife");
  assert.equal(h1.estrutura.nat_jur_label, "Sociedade Anonima Fechada");
  assert.equal(h1.atual.leitos.total, 120);
  assert.equal(h1.atual.evolucao.at(-1).total, h1.atual.leitos.total, "cartão = último ponto da evolução");
  for (const campo of ["indicadores", "comparativo", "evolucao"]) assert.equal(campo in h1, false, campo);
  assert.equal(docs.get("associados/C1").atual.mostra_leitos, false);
  assert.deepEqual(docs.get("busca/C1").prefixos.includes("clinica"), true);

  // Mercado: mesma conta da API antiga (média do ST QTLEITP1-3 e dos leitos SUS do LT)
  assert.deepEqual(docs.get("mercado/05_261160").serie, [
    { competencia: "202603", total: 2, total_sus: 1, media_leitos: "75.0", media_complementares: "0.0", media_leitos_sus: "5.0" },
    { competencia: "202606", total: 2, total_sus: 1, media_leitos: "85.0", media_complementares: "0.0", media_leitos_sus: "5.0" },
  ]);
  assert.deepEqual(docs.get("mercado/39_PE").serie.map((x) => x.competencia), ["202606"]);
  assert.deepEqual(docs.get("publico/tipos").lista, [
    { codigo: "05", label: "Hospital geral", total: 2 },
    { codigo: "39", label: "Unidade de apoio diagnose e terapia (SADT isolado)", total: 1 },
  ]);
  assert.equal(docs.get("publico/meta").competencia_max, "202606");
  assert.equal(docs.has("publico/visao-geral"), false);
});
