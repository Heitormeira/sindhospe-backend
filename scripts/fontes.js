/**
 * Fontes do importador, sem banco de dados:
 *   dados/cnes-AAAAMM.json        equipamentos, profissionais, serviços, habilitações e dicionários (npm run baixar-cnes)
 *   dados/historico/AAAAMM.json   cadastro (ST) e leitos (LT) de cada competência (npm run baixar-cnes -- ... --historico)
 *   dados/municipios-pe.json      nomes oficiais dos municípios (IBGE)
 *   dados/natureza-juridica.json  nomes das naturezas jurídicas (dicionário NATJUR do DATASUS)
 *   segredos/associados.json      lista de associados do SINDHOSPE (fora do repositório; npm run exportar-associados)
 *
 * carregarFontes() lê os arquivos; montarBase() devolve a mesma estrutura que
 * scripts/atual.js recebia das consultas ao Neon.
 */
const fs = require("node:fs");
const path = require("node:path");
const { linhasSt, leitosPorCnes, totaisLeitos } = require("./historico");

const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8"));
const txt = (x) => (x == null ? "" : String(x).trim());

function competenciasDisponiveis(pastaDados) {
  const pasta = path.join(pastaDados, "historico");
  const historico = fs.existsSync(pasta)
    ? fs.readdirSync(pasta).filter((f) => /^\d{6}\.json$/.test(f)).map((f) => f.slice(0, 6)).sort()
    : [];
  const agregados = fs.readdirSync(pastaDados).filter((f) => /^cnes-\d{6}\.json$/.test(f)).map((f) => f.slice(5, 11)).sort();
  return { historico, agregados };
}

/**
 * Lista de associados exportada do banco do SINDHOSPE: um objeto por linha, com pelo
 * menos `cnes`, `nome_fantasia` e `situacao`. Fica um registro por CNES (o primeiro),
 * e linhas sem CNES são ignoradas, como no importador antigo.
 */
function lerAssociados(arquivo) {
  if (!fs.existsSync(arquivo)) {
    throw new Error(`Lista de associados não encontrada: ${arquivo}. Rode: npm run exportar-associados`);
  }
  const linhas = lerJson(arquivo);
  if (!Array.isArray(linhas)) throw new Error(`${arquivo} precisa ser uma lista (array) de associados.`);
  const porCnes = new Map();
  let semCnes = 0;
  for (const linha of linhas) {
    const cnes = txt(linha.cnes);
    if (!cnes) {
      semCnes++;
      continue;
    }
    if (!porCnes.has(cnes)) porCnes.set(cnes, linha);
  }
  return { porCnes, lidos: linhas.length, semCnes };
}

/**
 * Lê todos os arquivos de uma competência (padrão: a mais recente com agregados do DATASUS).
 * `desde`: primeira competência da série histórica (padrão: todas as de dados/historico).
 */
function carregarFontes({ pastaDados, associadosPath, competencia, desde }) {
  const { historico, agregados } = competenciasDisponiveis(pastaDados);
  const comp = competencia || agregados.at(-1);
  if (!comp) throw new Error("Faltam os agregados do DATASUS. Rode: npm run baixar-cnes -- AAAAMM --historico 202003");
  if (!agregados.includes(comp)) throw new Error(`Falta dados/cnes-${comp}.json. Rode: npm run baixar-cnes -- ${comp}`);
  if (!historico.includes(comp)) throw new Error(`Falta dados/historico/${comp}.json. Rode: npm run baixar-cnes -- ${comp}`);
  if (desde && desde > comp) throw new Error(`--historico-desde ${desde} é depois da competência ${comp}.`);

  const historicos = historico
    .filter((c) => c <= comp && (!desde || c >= desde))
    .map((c) => lerJson(path.join(pastaDados, "historico", `${c}.json`)));
  const extra = lerJson(path.join(pastaDados, `cnes-${comp}.json`));
  const { municipios } = lerJson(path.join(pastaDados, "municipios-pe.json"));
  const arquivoNaturezas = path.join(pastaDados, "natureza-juridica.json");
  const naturezas = fs.existsSync(arquivoNaturezas) ? lerJson(arquivoNaturezas).naturezas : {};
  const associados = lerAssociados(associadosPath);
  return { competencia: comp, historicos, atual: historicos.at(-1), extra, municipios, naturezas, associados };
}

/** Cadastro (ST) da competência atual por CNES, no formato que atual.js usa. */
function cadastros(h) {
  const mapa = new Map();
  for (const r of linhasSt(h)) {
    if (mapa.has(r.cnes)) continue;
    mapa.set(r.cnes, {
      codufmun: txt(r.CODUFMUN),
      tp_unid: txt(r.TP_UNID),
      vinc_sus: r.VINC_SUS === "1",
      urgencia: r.URGEMERG === "1",
      centro_cirurgico: r.CENTRCIR === "1",
      centro_obstetrico: r.CENTROBS === "1",
      ambulatorio: r.ATENDAMB === "1",
      dt_atual: txt(r.DT_ATUAL),
      alvara: txt(r.ALVARA),
      dt_exped: txt(r.DT_EXPED),
      orgexped: txt(r.ORGEXPED),
      nat_jur: txt(r.NAT_JUR),
      hospitalar: r.ATENDHOS === "1",
      turno: txt(r.TURNO_AT),
      atendimento: txt(r.ATENDIMENTO),
    });
  }
  return mapa;
}

/** Série de leitos (LT) por competência: de cada associado (só onde há leitos) e do estado inteiro. */
function evolucaoLeitos(historicos, cnesLista) {
  const porCnes = new Map();
  for (const cnes of cnesLista) {
    const serie = historicos
      .filter((h) => h.lt[cnes])
      .map((h) => ({ competencia: h.competencia, ...totaisLeitos(h.lt[cnes]) }));
    if (serie.length) porCnes.set(cnes, serie);
  }
  const estado = historicos.map((h) => ({ competencia: h.competencia, ...totaisLeitos(Object.values(h.lt).flat()) }));
  return { porCnes, estado };
}

/** Base do bloco `atual` (scripts/atual.js), igual à que vinha do Neon. */
function montarBase(f) {
  const lista = [...f.associados.porCnes.values()].map((x) => ({ cnes: txt(x.cnes), nome: x.nome_fantasia, situacao: x.situacao }));
  return {
    competencia: f.competencia,
    cadastros: cadastros(f.atual),
    leitos: leitosPorCnes(f.atual),
    evolucao: evolucaoLeitos(f.historicos, lista.map((a) => a.cnes)),
    municipios: Object.fromEntries(f.municipios.map((m) => [m.codufmun, m.nome_municipio])),
    associados: lista,
    extra: f.extra,
  };
}

module.exports = { carregarFontes, montarBase, lerAssociados, competenciasDisponiveis };
