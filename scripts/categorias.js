/**
 * Regras de negócio pedidas na reunião de 28/10:
 * - cada estabelecimento vê o que é relevante para a CATEGORIA dele
 *   (hospital -> leitos; clínica/diagnóstico -> equipamentos, profissionais, serviços);
 * - profissionais agrupados por família da CBO (só contagens, nada pessoal);
 * - comparações por mediana/percentil do mesmo tipo (sem "0,8 leito").
 */

const CATEGORIAS = {
  hospital: { label: "Hospital", tipos: ["05", "07", "15", "62"], mostraLeitos: true },
  clinica: { label: "Clínica / ambulatório", tipos: ["04", "22", "36"], mostraLeitos: false },
  diagnostico: { label: "Diagnóstico e terapia (SADT)", tipos: ["39"], mostraLeitos: false },
  domiciliar: { label: "Atenção domiciliar", tipos: ["77"], mostraLeitos: false },
  outros: { label: "Outros estabelecimentos", tipos: [], mostraLeitos: false },
};

function categoriaDoTipo(tpUnid) {
  const t = String(tpUnid || "").trim();
  for (const [codigo, c] of Object.entries(CATEGORIAS)) if (c.tipos.includes(t)) return codigo;
  return "outros";
}

// Família (4 primeiros dígitos) da CBO 2002 -> grupo exibido no portal.
const GRUPOS_PROFISSIONAIS = {
  medicos: { label: "Médicos", familias: ["2251", "2252", "2253", "2231"] },
  enfermeiros: { label: "Enfermeiros", familias: ["2235"] },
  tec_enfermagem: { label: "Técnicos e auxiliares de enfermagem", familias: ["3222"] },
  fisioterapeutas: { label: "Fisioterapeutas", familias: ["2236"] },
  dentistas: { label: "Cirurgiões-dentistas", familias: ["2232"] },
  farmaceuticos: { label: "Farmacêuticos", familias: ["2234"] },
  nutricionistas: { label: "Nutricionistas", familias: ["2237"] },
  fonoaudiologos: { label: "Fonoaudiólogos", familias: ["2238"] },
  psicologos: { label: "Psicólogos", familias: ["2515"] },
  biomedicos: { label: "Biomédicos", familias: ["2212"] },
  tec_radiologia: { label: "Técnicos em radiologia e imagem", familias: ["3241"] },
  tec_laboratorio: { label: "Técnicos de laboratório", familias: ["3242", "5152"] },
  assistentes_sociais: { label: "Assistentes sociais", familias: ["2516"] },
  outros: { label: "Outros profissionais", familias: [] },
};

const FAMILIA_PARA_GRUPO = {};
for (const [grupo, g] of Object.entries(GRUPOS_PROFISSIONAIS)) for (const f of g.familias) FAMILIA_PARA_GRUPO[f] = grupo;

function grupoProfissional(cbo) {
  return FAMILIA_PARA_GRUPO[String(cbo || "").slice(0, 4)] || "outros";
}

function mediana(valores) {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** % dos valores estritamente menores que `valor` (mesma regra do percentil de leitos da API antiga). */
function percentil(valores, valor) {
  if (!valores.length) return 0;
  return Math.round((valores.filter((x) => x < valor).length * 100) / valores.length);
}

module.exports = { CATEGORIAS, categoriaDoTipo, GRUPOS_PROFISSIONAIS, grupoProfissional, mediana, percentil };
