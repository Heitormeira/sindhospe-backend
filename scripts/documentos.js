/**
 * Monta todos os documentos do Firestore a partir do Neon.
 * Cada documento guarda exatamente o JSON que a rota equivalente da API devolvia
 * (ver docs/superpowers/specs/2026-10-26-migracao-firebase-design.md §4).
 */
const c = require("./consultas");
const { gerarPrefixos } = require("./prefixos");

// Converte para JSON puro (Date -> string, remove undefined), como res.json() fazia.
const json = (x) => JSON.parse(JSON.stringify(x));

/** Executa fn em cada item com no máximo `limite` chamadas simultâneas. */
async function emParalelo(itens, limite, fn) {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

async function montarDocumentos(db, { log = console.log } = {}) {
  const docs = new Map();

  // Públicos
  docs.set("publico/visao-geral", json(await c.getVisaoGeral(db)));
  docs.set("publico/representatividade", json(await c.getRepresentatividade(db)));
  docs.set("publico/municipios", { lista: json(await c.getMunicipios(db)) });
  docs.set("publico/tipos", { lista: json(await c.getTipos(db)) });
  docs.set("publico/meta", {
    competencia_max: await c.getCompetenciaMax(db),
    importado_em: new Date().toISOString(),
  });

  // Associados + índice de busca
  const associados = await c.listarAssociados(db);
  const semCnes = await c.contarAssociadosSemCnes(db);
  if (semCnes > 0) log(`Aviso: ${semCnes} linha(s) de identidade_associados sem CNES foram ignoradas.`);
  await emParalelo(associados, 4, async ({ cnes, nome_fantasia }, i) => {
    const ficha = await c.getEstabelecimento(db, cnes);
    const evolucao = await c.getEvolucao(db, cnes);
    docs.set(`associados/${cnes}`, json({ ...ficha, evolucao }));
    docs.set(`busca/${cnes}`, { nome_fantasia, prefixos: gerarPrefixos(nome_fantasia) });
    if ((i + 1) % 50 === 0) log(`  associados: ${i + 1}/${associados.length}`);
  });

  // Mercado: por tipo no estado inteiro e por tipo × município
  const tipos = await c.listarTiposMercado(db);
  await emParalelo(tipos, 4, async (tipo) => {
    docs.set(`mercado/${tipo}_PE`, { serie: json(await c.getMercado(db, tipo)) });
  });
  const combos = await c.listarCombosMercado(db);
  await emParalelo(combos, 4, async ({ tipo, codufmun }, i) => {
    docs.set(`mercado/${tipo}_${codufmun}`, { serie: json(await c.getMercado(db, tipo, codufmun)) });
    if ((i + 1) % 500 === 0) log(`  mercado: ${i + 1}/${combos.length}`);
  });

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

module.exports = { montarDocumentos, contarPorColecao, emParalelo };
