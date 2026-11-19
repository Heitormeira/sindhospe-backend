/**
 * Histórico do CNES por competência, a partir dos arquivos ST (cadastro) e LT (leitos)
 * do DATASUS. Substitui as tabelas estabelecimentos_pe_historico e leitos_pe_historico
 * que ficavam no Neon.
 *
 * Arquivo dados/historico/AAAAMM.json (compacto, versionado):
 *   { competencia, campos_st: [...], st: { cnes: [valores na ordem de campos_st] },
 *     lt: { cnes: [[TP_LEITO, CODLEITO, QT_EXIST, QT_SUS, QT_NSUS], ...] } }
 *
 * LGPD: do ST só saem os campos abaixo (nada de CPF/CNPJ, CEP ou dados bancários).
 */

// Campos do ST guardados, na ordem do arquivo compacto.
const CAMPOS_ST = [
  "CODUFMUN", "TP_UNID", "VINC_SUS", "URGEMERG", "CENTRCIR", "CENTROBS", "ATENDAMB", "ATENDHOS",
  "DT_ATUAL", "ALVARA", "DT_EXPED", "ORGEXPED", "NAT_JUR", "TURNO_AT", "LEITOS_ST", "COMPLEMENTARES_ST",
];

// Mesmas somas que a API antiga fazia no ST (usadas só na série do Mercado).
const LEITOS_ST = ["QTLEITP1", "QTLEITP2", "QTLEITP3"];
const COMPLEMENTARES_ST = [
  "QTLEIT05", "QTLEIT06", "QTLEIT07", "QTLEIT08", "QTLEIT09", "QTLEIT19", "QTLEIT20", "QTLEIT21",
  "QTLEIT22", "QTLEIT23", "QTLEIT32", "QTLEIT34", "QTLEIT38", "QTLEIT39", "QTLEIT40",
];

/** Campos que o leitor de DBF precisa trazer do ST. */
const CAMPOS_LIDOS_ST = ["CNES", ...CAMPOS_ST.slice(0, -2), ...LEITOS_ST, ...COMPLEMENTARES_ST];
const CAMPOS_LIDOS_LT = ["CNES", "TP_LEITO", "CODLEITO", "QT_EXIST", "QT_SUS", "QT_NSUS"];

const int = (x) => parseInt(x, 10) || 0;
const soma = (r, campos) => campos.reduce((s, c) => s + int(r[c]), 0);

/**
 * Registros brutos do ST e do LT -> estrutura compacta.
 * CNES repetido no ST é raro; se acontecer, cada linha conta (como no banco antigo),
 * então guardamos as repetições em `st_repetidos`.
 */
function compactarHistorico(competencia, { st, lt }) {
  const saida = { competencia, campos_st: CAMPOS_ST, st: {}, st_repetidos: [], lt: {} };
  for (const r of st) {
    const linha = [...CAMPOS_ST.slice(0, -2).map((c) => r[c] ?? ""), soma(r, LEITOS_ST), soma(r, COMPLEMENTARES_ST)];
    if (saida.st[r.CNES]) saida.st_repetidos.push([r.CNES, ...linha]);
    else saida.st[r.CNES] = linha;
  }
  for (const r of lt) {
    (saida.lt[r.CNES] ??= []).push([r.TP_LEITO, r.CODLEITO, int(r.QT_EXIST), int(r.QT_SUS), int(r.QT_NSUS)]);
  }
  return saida;
}

/** Linhas do ST como objetos { cnes, CODUFMUN, TP_UNID, ... } (repetições incluídas). */
function linhasSt(h) {
  const campos = h.campos_st;
  const obj = (cnes, v) => {
    const o = { cnes };
    campos.forEach((c, i) => (o[c] = v[i]));
    return o;
  };
  return [
    ...Object.entries(h.st).map(([cnes, v]) => obj(cnes, v)),
    ...(h.st_repetidos || []).map(([cnes, ...v]) => obj(cnes, v)),
  ];
}

/** Leitos (LT) de uma competência por CNES: total, SUS, não SUS e divisão por tipo e especialidade. */
function leitosPorCnes(h) {
  const mapa = new Map();
  for (const [cnes, linhas] of Object.entries(h.lt)) {
    const l = { total: 0, sus: 0, nao_sus: 0, tipos: {}, esp: {} };
    for (const [tp, cod, e, s, n] of linhas) {
      l.total += e; l.sus += s; l.nao_sus += n;
      const t = (l.tipos[tp] ??= { e: 0, s: 0 });
      t.e += e; t.s += s;
      const es = (l.esp[cod] ??= { tipo: tp, e: 0, s: 0 });
      es.e += e; es.s += s;
    }
    mapa.set(cnes, l);
  }
  return mapa;
}

/** Totais de uma competência por CNES, no formato da série de evolução. */
function totaisLeitos(linhas) {
  const t = { total: 0, sus: 0, nao_sus: 0, complementares: 0 };
  for (const [tp, , e, s, n] of linhas) {
    t.total += e; t.sus += s; t.nao_sus += n;
    if (tp === "3") t.complementares += e;
  }
  return t;
}

module.exports = {
  CAMPOS_ST, CAMPOS_LIDOS_ST, CAMPOS_LIDOS_LT, LEITOS_ST, COMPLEMENTARES_ST,
  compactarHistorico, linhasSt, leitosPorCnes, totaisLeitos,
};
