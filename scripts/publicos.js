/**
 * Documentos que vinham das consultas antigas ao Neon (scripts/consultas.js, removido),
 * agora calculados a partir dos arquivos do DATASUS:
 *   - ficha do associado (identidade + estrutura), sem os blocos antigos de médias;
 *   - mercado/{tipo}_{PE|município}: série por competência, mesma conta da API antiga;
 *   - publico/tipos e publico/municipios.
 */
const { linhasSt } = require("./historico");
const { rotuloTipo } = require("./tipos");

const txt = (x) => (x == null ? "" : String(x).trim());

/**
 * Ficha do associado: identidade (lista do SINDHOSPE) + estrutura do cadastro do CNES na
 * competência atual. Os blocos `indicadores`, `comparativo` (médias) e `evolucao` (leitos do ST)
 * saíram: as telas usam o bloco `atual`.
 */
function montarFicha(identidade, cad, municipios, cnes) {
  if (!cad) return { identidade, estrutura: null, sem_dados_cnes: true };
  return {
    identidade,
    estrutura: {
      cnes,
      codufmun: cad.codufmun,
      municipio_nome: municipios[cad.codufmun] || cad.codufmun,
      tp_unid: cad.tp_unid,
      tp_unid_label: rotuloTipo(cad.tp_unid),
      nat_jur: cad.nat_jur,
    },
  };
}

/**
 * Série do mercado por tipo de unidade (estado inteiro e por município), igual à da API antiga:
 * por competência, total de estabelecimentos, quantos têm vínculo SUS e as médias do ST/LT.
 * Devolve Map "tipo_PE" | "tipo_codufmun" -> serie.
 */
function montarMercado(historicos) {
  const grupos = new Map(); // chave -> Map(competencia -> acumulado)
  const somar = (chave, competencia, r, sus) => {
    if (!grupos.has(chave)) grupos.set(chave, new Map());
    const porComp = grupos.get(chave);
    const a = porComp.get(competencia) || { total: 0, total_sus: 0, leitos: 0, complementares: 0, leitos_sus: 0 };
    porComp.set(competencia, a);
    a.total++;
    if (r.VINC_SUS === "1") a.total_sus++;
    a.leitos += r.LEITOS_ST;
    a.complementares += r.COMPLEMENTARES_ST;
    a.leitos_sus += sus;
  };
  for (const h of historicos) {
    const susPorCnes = {};
    for (const [cnes, linhas] of Object.entries(h.lt)) susPorCnes[cnes] = linhas.reduce((s, l) => s + l[3], 0);
    for (const r of linhasSt(h)) {
      const tipo = txt(r.TP_UNID);
      const mun = txt(r.CODUFMUN);
      if (!tipo) continue;
      const sus = susPorCnes[r.cnes] || 0;
      somar(`${tipo}_PE`, h.competencia, r, sus);
      if (mun) somar(`${tipo}_${mun}`, h.competencia, r, sus);
    }
  }
  const media = (soma, n) => (n ? soma / n : 0).toFixed(1);
  const saida = new Map();
  for (const [chave, porComp] of grupos) {
    saida.set(
      chave,
      [...porComp.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([competencia, a]) => ({
          competencia,
          total: a.total,
          total_sus: a.total_sus,
          media_leitos: media(a.leitos, a.total),
          media_complementares: media(a.complementares, a.total),
          media_leitos_sus: media(a.leitos_sus, a.total),
        }))
    );
  }
  return saida;
}

/** publico/tipos: estabelecimentos por tipo de unidade na competência atual. */
function montarTipos(h) {
  const contagem = {};
  for (const r of linhasSt(h)) {
    const t = txt(r.TP_UNID);
    contagem[t] = (contagem[t] || 0) + 1;
  }
  return Object.entries(contagem)
    .sort(([ca, a], [cb, b]) => b - a || ca.localeCompare(cb))
    .map(([codigo, total]) => ({ codigo, label: rotuloTipo(codigo), total }));
}

module.exports = { montarFicha, montarMercado, montarTipos };
