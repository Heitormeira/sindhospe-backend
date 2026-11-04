/**
 * Consultas da competência MAIS RECENTE do CNES (histórico), usadas pelo bloco
 * `atual` dos documentos. Corrigem a divergência de leitos: tudo sai da mesma
 * competência, e leitos saem só do arquivo LT (o mesmo da aba Leitos do CNESWeb).
 */

const int = (x) => parseInt(x, 10) || 0;
const txt = (x) => (x == null ? "" : String(x).trim());

async function competenciaAtual(db) {
  const r = await db.query(`SELECT MAX(competencia) AS c FROM estabelecimentos_pe_historico`);
  return r.rows[0].c;
}

/** Cadastro (arquivo ST) de todos os estabelecimentos de PE na competência. */
async function cadastros(db, competencia) {
  const r = await db.query(
    `SELECT "CNES","CODUFMUN","TP_UNID","VINC_SUS","URGEMERG","CENTRCIR","CENTROBS","ATENDAMB",
            "DT_ATUAL","ALVARA","DT_EXPED","ORGEXPED","NAT_JUR"
       FROM estabelecimentos_pe_historico WHERE competencia = $1`,
    [competencia]
  );
  const mapa = new Map();
  for (const x of r.rows) {
    mapa.set(txt(x.CNES), {
      codufmun: txt(x.CODUFMUN),
      tp_unid: txt(x.TP_UNID),
      vinc_sus: txt(x.VINC_SUS) === "1",
      urgencia: txt(x.URGEMERG) === "1",
      centro_cirurgico: txt(x.CENTRCIR) === "1",
      centro_obstetrico: txt(x.CENTROBS) === "1",
      ambulatorio: txt(x.ATENDAMB) === "1",
      dt_atual: txt(x.DT_ATUAL),
      alvara: txt(x.ALVARA),
      dt_exped: txt(x.DT_EXPED),
      orgexped: txt(x.ORGEXPED),
    });
  }
  return mapa;
}

/** Leitos (arquivo LT) da competência, por estabelecimento, tipo e especialidade. */
async function leitos(db, competencia) {
  const r = await db.query(
    `SELECT "CNES","TP_LEITO","CODLEITO","QT_EXIST","QT_SUS","QT_NSUS"
       FROM leitos_pe_historico WHERE competencia = $1`,
    [competencia]
  );
  const mapa = new Map();
  for (const x of r.rows) {
    const cnes = txt(x.CNES);
    const l = mapa.get(cnes) || { total: 0, sus: 0, nao_sus: 0, tipos: {}, esp: {} };
    mapa.set(cnes, l);
    const e = int(x.QT_EXIST), s = int(x.QT_SUS), n = int(x.QT_NSUS);
    l.total += e; l.sus += s; l.nao_sus += n;
    const tp = txt(x.TP_LEITO), cod = txt(x.CODLEITO);
    const t = (l.tipos[tp] ??= { e: 0, s: 0 });
    t.e += e; t.s += s;
    const es = (l.esp[cod] ??= { tipo: tp, e: 0, s: 0 });
    es.e += e; es.s += s;
  }
  return mapa;
}

/** Série de leitos (LT) por competência: de cada CNES pedido e do estado inteiro. */
async function evolucaoLeitos(db, cnesLista) {
  const linha = (x) => ({
    competencia: x.competencia,
    total: int(x.total), sus: int(x.sus), nao_sus: int(x.nao_sus), complementares: int(x.complementares),
  });
  const SOMAS = `SUM(COALESCE(NULLIF(TRIM("QT_EXIST"),'')::int,0)) AS total,
                 SUM(COALESCE(NULLIF(TRIM("QT_SUS"),'')::int,0)) AS sus,
                 SUM(COALESCE(NULLIF(TRIM("QT_NSUS"),'')::int,0)) AS nao_sus,
                 SUM(CASE WHEN TRIM("TP_LEITO")='3' THEN COALESCE(NULLIF(TRIM("QT_EXIST"),'')::int,0) ELSE 0 END) AS complementares`;
  const porCnes = await db.query(
    `SELECT TRIM("CNES") AS cnes, competencia, ${SOMAS} FROM leitos_pe_historico
      WHERE TRIM("CNES") = ANY($1) GROUP BY 1, 2 ORDER BY 1, 2`,
    [cnesLista]
  );
  const estado = await db.query(`SELECT competencia, ${SOMAS} FROM leitos_pe_historico GROUP BY 1 ORDER BY 1`);
  const mapa = new Map();
  for (const x of porCnes.rows) {
    if (!mapa.has(x.cnes)) mapa.set(x.cnes, []);
    mapa.get(x.cnes).push(linha(x));
  }
  return { porCnes: mapa, estado: estado.rows.map(linha) };
}

async function nomesMunicipios(db) {
  const r = await db.query(`SELECT codufmun, nome_municipio FROM municipios_pe`);
  return Object.fromEntries(r.rows.map((x) => [txt(x.codufmun), x.nome_municipio]));
}

/** Associados (deduplicados por CNES) com nome e situação. */
async function associados(db) {
  const r = await db.query(
    `SELECT DISTINCT ON (cnes) cnes, nome_fantasia, situacao FROM identidade_associados
      WHERE cnes IS NOT NULL AND btrim(cnes) <> '' ORDER BY cnes`
  );
  return r.rows.map((x) => ({ cnes: txt(x.cnes), nome: x.nome_fantasia, situacao: x.situacao }));
}

/** Carrega tudo o que o bloco `atual` precisa, numa única competência. */
async function carregarBaseAtual(db, extra) {
  const competencia = await competenciaAtual(db);
  if (extra && extra.competencia !== competencia) {
    throw new Error(
      `dados/cnes-${extra.competencia}.json não é da competência do banco (${competencia}). ` +
        `Rode: npm run baixar-cnes -- ${competencia}`
    );
  }
  const lista = await associados(db);
  return {
    competencia,
    cadastros: await cadastros(db, competencia),
    leitos: await leitos(db, competencia),
    evolucao: await evolucaoLeitos(db, lista.map((a) => a.cnes)),
    municipios: await nomesMunicipios(db),
    associados: lista,
    extra: extra || { rotulos: { equipamentos: {}, servicos: {}, leitos_tipo: {}, leitos_especialidade: {} }, estabelecimentos: {} },
  };
}

module.exports = { carregarBaseAtual, competenciaAtual };
