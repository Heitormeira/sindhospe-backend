const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarAtual, montarSetores, montarPainelSindicato, situacaoCadastro } = require("../scripts/atual");

const cad = (codufmun, tp_unid, extra = {}) => ({
  codufmun, tp_unid, vinc_sus: true, urgencia: false, centro_cirurgico: false, centro_obstetrico: false,
  ambulatorio: true, dt_atual: "202604", alvara: "", dt_exped: "", orgexped: "", ...extra,
});

function baseFalsa() {
  return {
    competencia: "202606",
    municipios: { "261160": "Recife", "260790": "Jaboatão" },
    cadastros: new Map([
      ["H1", cad("261160", "05", { alvara: "123", dt_exped: "20250819", orgexped: "2", urgencia: true })],
      ["H2", cad("261160", "05")],
      ["H3", cad("260790", "07", { dt_atual: "202501" })],
      ["C1", cad("261160", "39")],
      ["C2", cad("261160", "39")],
      ["C3", cad("260790", "39")],
    ]),
    leitos: new Map([
      ["H1", { total: 250, sus: 3, nao_sus: 247, tipos: { 1: { e: 48, s: 0 }, 3: { e: 117, s: 3 }, 2: { e: 85, s: 0 } }, esp: { 75: { tipo: "3", e: 60, s: 3 }, 33: { tipo: "2", e: 85, s: 0 } } }],
      ["H2", { total: 150, sus: 100, nao_sus: 50, tipos: { 2: { e: 150, s: 100 } }, esp: {} }],
      ["H3", { total: 100, sus: 100, nao_sus: 0, tipos: { 2: { e: 100, s: 100 } }, esp: {} }],
    ]),
    evolucao: {
      porCnes: new Map([["H1", [{ competencia: "202603", total: 240, sus: 3, nao_sus: 237, complementares: 110 }, { competencia: "202606", total: 250, sus: 3, nao_sus: 247, complementares: 117 }]]]),
      estado: [{ competencia: "202603", total: 480, sus: 200, nao_sus: 280, complementares: 110 }, { competencia: "202606", total: 500, sus: 203, nao_sus: 297, complementares: 117 }],
    },
    associados: [
      { cnes: "H1", nome: "HOSPITAL UM", situacao: "Filiado" },
      { cnes: "C1", nome: "CLINICA UM", situacao: "Filiado" },
      { cnes: "REG001", nome: "SEM CNES", situacao: "Filiado" },
    ],
    extra: {
      rotulos: {
        equipamentos: { "0113": "Ultrassom Doppler Colorido", "0111": "Tomógrafo Computadorizado" },
        servicos: { 121: "Servico de diagnostico por imagem" },
        leitos_tipo: { 1: "Cirúrgico", 2: "Clínico", 3: "Complementar" },
        leitos_especialidade: { 75: "UTI adulto - tipo II", 33: "Clinica geral" },
      },
      estabelecimentos: {
        H1: { eq: { "0113": [3, 2, 1] }, pf: { t: 185, g: { medicos: 172, enfermeiros: 13 } }, sr: ["121"], hb: 3 },
        C1: { eq: { "0113": [2, 2, 0], "0111": [1, 1, 0] }, pf: { t: 10, g: { tec_radiologia: 4 } }, sr: ["121", "999"], hb: 0 },
        C2: { eq: { "0113": [1, 1, 0] }, pf: { t: 5, g: {} }, sr: [], hb: 0 },
        C3: { eq: { "0113": [5, 5, 0] }, pf: { t: 30, g: {} }, sr: [], hb: 0 },
      },
    },
  };
}

test("hospital: leitos da mesma competência, totais e participação (sem médias)", () => {
  const a = montarAtual(baseFalsa(), "H1");
  assert.equal(a.competencia, "202606");
  assert.equal(a.categoria, "hospital");
  assert.equal(a.mostra_leitos, true);
  assert.equal(a.leitos.total, 250);
  assert.equal(a.leitos.complementares, 117);
  assert.equal(a.leitos.gerais, 133);
  assert.equal(a.leitos.sus, 3);
  assert.equal(a.leitos.nao_sus, 247);
  // a última competência da evolução bate com o total do cartão
  assert.equal(a.evolucao.at(-1).total, a.leitos.total);
  assert.deepEqual(a.leitos.contexto.municipio, { nome: "Recife", total: 400, percentual: 62.5 });
  assert.deepEqual(a.leitos.contexto.estado, { total: 500, percentual: 50 });
  assert.equal(a.leitos.por_tipo[0].label, "Complementar"); // ordenado por quantidade
  assert.equal(a.leitos.por_especialidade[0].label, "Clinica geral");
  assert.ok(!/"media(_\w+)?"/.test(JSON.stringify(a)));
});

test("clínica: sem bloco de leitos e comparada com o mesmo tipo", () => {
  const a = montarAtual(baseFalsa(), "C1");
  assert.equal(a.categoria, "diagnostico");
  assert.equal(a.mostra_leitos, false);
  assert.equal(a.leitos, null);
  assert.equal(a.equipamentos.total, 3);
  assert.equal(a.equipamentos.itens[0].label, "Ultrassom Doppler Colorido");
  assert.equal(a.equipamentos.itens[0].grupo, "Diagnóstico por imagem");
  assert.deepEqual(a.equipamentos.comparacao, { tipo: "39", estabelecimentos: 3, mediana: 3, percentil: 33 });
  assert.deepEqual(a.profissionais.comparacao, { tipo: "39", estabelecimentos: 3, mediana: 10, percentil: 33 });
  assert.deepEqual(a.servicos, [
    { codigo: "121", label: "Servico de diagnostico por imagem" },
    { codigo: "999", label: "Serviço 999" },
  ]);
  assert.equal(a.profissionais.grupos[0].label, "Técnicos em radiologia e imagem");
});

test("cadastro: data de atualização, licença sanitária e situação", () => {
  const h1 = montarAtual(baseFalsa(), "H1").cadastro;
  assert.equal(h1.encontrado, true);
  assert.equal(h1.ultima_atualizacao, "2026-04");
  assert.equal(h1.meses_sem_atualizar, 2);
  assert.equal(h1.situacao, "em_dia");
  assert.deepEqual(h1.licenca, { numero: "123", expedicao: "2025-08-19", orgao: "Vigilância Sanitária Municipal" });
  const h3 = montarAtual(baseFalsa(), "H3").cadastro;
  assert.equal(h3.situacao, "desatualizado");
  assert.equal(h3.licenca, null);
  const reg = montarAtual(baseFalsa(), "REG001");
  assert.equal(reg.cadastro.encontrado, false);
  assert.equal(reg.categoria, "outros");
  assert.equal(reg.equipamentos.total, 0);
});

test("situacaoCadastro", () => {
  assert.equal(situacaoCadastro("202606", "202606"), 0);
  assert.equal(situacaoCadastro("202512", "202606"), 6);
  assert.equal(situacaoCadastro("", "202606"), null);
});

test("setores: estado × associados por categoria", () => {
  const s = montarSetores(baseFalsa());
  assert.equal(s.competencia, "202606");
  const hosp = s.categorias.find((c) => c.codigo === "hospital");
  assert.deepEqual(hosp.estado, { estabelecimentos: 3, com_leitos: 3, leitos: 500, leitos_sus: 203, leitos_complementares: 117, equipamentos: 3, profissionais: 185 });
  assert.deepEqual(hosp.associados, { estabelecimentos: 1, com_leitos: 1, leitos: 250, leitos_sus: 3, leitos_complementares: 117, equipamentos: 3, profissionais: 185 });
  const diag = s.categorias.find((c) => c.codigo === "diagnostico");
  assert.equal(diag.estado.estabelecimentos, 3);
  assert.equal(diag.associados.estabelecimentos, 1);
  assert.equal(s.associados.sem_cadastro_cnes, 1);
  assert.equal(s.associados.com_leitos, 1);
  assert.equal(s.associados.sem_leitos, 2);
});

test("painel do sindicato: lista com situação e totais, sem dados pessoais", () => {
  const p = montarPainelSindicato(baseFalsa());
  assert.equal(p.lista.length, 3);
  const h1 = p.lista.find((x) => x.cnes === "H1");
  assert.deepEqual(
    { categoria: h1.categoria, leitos: h1.leitos, equipamentos: h1.equipamentos, profissionais: h1.profissionais, cadastro: h1.cadastro, licenca: h1.licenca },
    { categoria: "hospital", leitos: 250, equipamentos: 3, profissionais: 185, cadastro: "em_dia", licenca: true }
  );
  assert.equal(p.lista.find((x) => x.cnes === "REG001").cadastro, "nao_encontrado");
  assert.equal(p.resumo.leitos_associados, 250);
  assert.equal(p.resumo.leitos_estado, 500);
  assert.equal(p.resumo.percentual_leitos, 50);
  assert.deepEqual(p.evolucao_leitos.at(-1), { competencia: "202606", associados: 250, estado: 500 });
  assert.equal(p.equipamentos_associados[0].label, "Ultrassom Doppler Colorido");
  assert.equal(p.equipamentos_associados[0].quantidade, 5);
});
