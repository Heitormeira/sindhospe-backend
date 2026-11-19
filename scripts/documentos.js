/**
 * Monta todos os documentos do Firestore a partir dos arquivos do DATASUS e da lista
 * de associados (scripts/fontes.js). Não usa banco de dados.
 */
const { gerarPrefixos } = require("./prefixos");
const { montarBase } = require("./fontes");
const { montarAtual, montarSetores, montarPainelSindicato } = require("./atual");
const { montarFicha, montarMercado, montarTipos } = require("./publicos");

// Converte para JSON puro (remove undefined), como res.json() fazia na API antiga.
const json = (x) => JSON.parse(JSON.stringify(x));

function montarDocumentos(fontes, { log = console.log } = {}) {
  const docs = new Map();
  const base = montarBase(fontes);
  log(`Competência: ${base.competencia} (série histórica: ${fontes.historicos.map((h) => h.competencia).join(", ")})`);

  // Bloco atual (reunião de 28/10): uma competência só, por categoria de estabelecimento.
  docs.set("publico/setores", json(montarSetores(base)));
  docs.set("sindicato/painel", json(montarPainelSindicato(base)));

  // Públicos
  docs.set("publico/municipios", { lista: fontes.municipios });
  docs.set("publico/tipos", { lista: montarTipos(fontes.atual) });
  docs.set("publico/meta", { competencia_max: base.competencia, importado_em: new Date().toISOString() });

  // Associados + índice de busca
  const { porCnes, lidos, semCnes } = fontes.associados;
  if (semCnes > 0) log(`Aviso: ${semCnes} associado(s) sem CNES na lista foram ignorados.`);
  let foraDoCnes = 0;
  for (const [cnes, identidade] of porCnes) {
    const cad = base.cadastros.get(cnes);
    if (!cad) foraDoCnes++;
    docs.set(`associados/${cnes}`, json({ ...montarFicha(identidade, cad, base.municipios, cnes), atual: montarAtual(base, cnes) }));
    docs.set(`busca/${cnes}`, { nome_fantasia: identidade.nome_fantasia, prefixos: gerarPrefixos(identidade.nome_fantasia) });
  }

  // Mercado: por tipo no estado inteiro e por tipo × município
  for (const [chave, serie] of montarMercado(fontes.historicos)) docs.set(`mercado/${chave}`, { serie });

  // Paridade: o que foi lido × o que vai ser gravado
  const st = Object.keys(fontes.atual.st).length + (fontes.atual.st_repetidos || []).length;
  const lt = Object.values(fontes.atual.lt).reduce((s, x) => s + x.length, 0);
  log(`Lido: ${st} estabelecimentos no ST e ${lt} linhas no LT de ${base.competencia}; ${lidos} linhas na lista de associados.`);
  log(`Associados: ${porCnes.size} com documento (${foraDoCnes} fora do CNES de ${base.competencia}).`);
  return docs;
}

function contarPorColecao(docs) {
  const contagem = {};
  for (const chave of docs.keys()) {
    const colecao = chave.split("/")[0];
    contagem[colecao] = (contagem[colecao] || 0) + 1;
  }
  return contagem;
}

module.exports = { montarDocumentos, contarPorColecao };
