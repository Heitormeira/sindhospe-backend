/**
 * Consultas do Portal SINDHOSPE, extraídas do server.js SEM mudar a lógica:
 * mesmo SQL, mesmo pós-processamento, mesmo JSON de saída de cada rota.
 * O server.js continua intacto e serve de referência (scripts/paridade.js).
 */
const { Pool } = require("pg");

const LEITOS_SQL = `
  COALESCE(NULLIF("QTLEITP1", '')::int, 0)
  + COALESCE(NULLIF("QTLEITP2", '')::int, 0)
  + COALESCE(NULLIF("QTLEITP3", '')::int, 0)
`;

const LEITOS_COMPLEMENTARES_SQL = `
  COALESCE(NULLIF("QTLEIT05", '')::int, 0) + COALESCE(NULLIF("QTLEIT06", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT07", '')::int, 0) + COALESCE(NULLIF("QTLEIT08", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT09", '')::int, 0) + COALESCE(NULLIF("QTLEIT19", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT20", '')::int, 0) + COALESCE(NULLIF("QTLEIT21", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT22", '')::int, 0) + COALESCE(NULLIF("QTLEIT23", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT32", '')::int, 0) + COALESCE(NULLIF("QTLEIT34", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT38", '')::int, 0) + COALESCE(NULLIF("QTLEIT39", '')::int, 0)
  + COALESCE(NULLIF("QTLEIT40", '')::int, 0)
`;

// Dicionário TP_UNID — fonte: cnes2.datasus.gov.br/Mod_Ind_Unidade.asp
const TP_UNID_LABELS = {
  "01": "Posto de saúde",
  "02": "Centro de saúde/unidade básica",
  "04": "Policlínica",
  "05": "Hospital geral",
  "07": "Hospital especializado",
  "15": "Unidade mista",
  "20": "Pronto socorro geral",
  "21": "Pronto socorro especializado",
  "22": "Consultório isolado",
  "32": "Unidade móvel fluvial",
  "36": "Clínica/centro de especialidade",
  "39": "Unidade de apoio diagnose e terapia (SADT isolado)",
  "40": "Unidade móvel terrestre",
  "42": "Unidade móvel de nível pré-hospitalar (SAMU)",
  "43": "Farmácia",
  "50": "Unidade de vigilância em saúde",
  "60": "Cooperativa/empresa de cessão de trabalhadores na saúde",
  "61": "Centro de parto normal (isolado)",
  "62": "Hospital/dia (isolado)",
  "67": "Laboratório Central de Saúde Pública (LACEN)",
  "68": "Central de gestão em saúde",
  "69": "Centro de atenção hemoterápica/hematológica",
  "70": "Centro de Atenção Psicossocial (CAPS)",
  "71": "Centro de apoio à saúde da família",
  "72": "Unidade de atenção à saúde indígena",
  "73": "Pronto atendimento",
  "74": "Polo Academia da Saúde",
  "75": "Telessaúde",
  "76": "Central de regulação médica das urgências",
  "77": "Serviço de atenção domiciliar (home care)",
  "78": "Unidade de atenção em regime residencial",
  "79": "Oficina ortopédica",
  "80": "Laboratório de saúde pública",
  "81": "Central de regulação do acesso",
  "82": "Central de notificação, captação e distribuição de órgãos (estadual)",
  "83": "Polo de prevenção de doenças e agravos e promoção da saúde",
  "84": "Central de abastecimento",
  "85": "Centro de imunização",
};

const rotulo = (codigo) => TP_UNID_LABELS[codigo] || `Código ${codigo}`;

/**
 * Pool SOMENTE LEITURA com o Neon: o importador nunca grava no Postgres.
 * Usa o endpoint direto (sem "-pooler"): no pooler (PgBouncer em modo
 * transação) um SET de sessão não vale com certeza para as consultas seguintes;
 * no direto, a opção de inicialização garante read-only em toda conexão.
 */
function urlDireta(databaseUrl) {
  const u = new URL(databaseUrl);
  u.hostname = u.hostname.replace("-pooler.", ".");
  return u.toString();
}

async function abrirConexao(databaseUrl) {
  const db = new Pool({
    connectionString: urlDireta(databaseUrl),
    ssl: { rejectUnauthorized: false },
    options: "-c default_transaction_read_only=on",
    max: 4,
    connectionTimeoutMillis: 60000, // o Neon gratuito pode estar "dormindo"
  });
  const r = await db.query("SHOW default_transaction_read_only");
  if (r.rows[0].default_transaction_read_only !== "on") {
    await db.end();
    throw new Error("Conexão com o Neon não ficou em modo somente leitura; abortando.");
  }
  return db;
}

// --- /api/estabelecimento/:cnes ---
async function getEstabelecimento(db, cnes) {
  const identidadeResult = await db.query(
    `SELECT DISTINCT ON (cnes) * FROM identidade_associados WHERE cnes = $1`,
    [cnes]
  );
  if (identidadeResult.rows.length === 0) return null;
  const identidade = identidadeResult.rows[0];

  const estruturaResult = await db.query(
    `SELECT
        e."CNES" AS cnes,
        e."CODUFMUN" AS codufmun,
        COALESCE(m.nome_municipio, e."CODUFMUN") AS municipio_nome,
        e."TP_UNID" AS tp_unid,
        e."NAT_JUR" AS nat_jur,
        ${LEITOS_SQL} AS leitos_totais,
        ${LEITOS_COMPLEMENTARES_SQL} AS leitos_complementares,
        e."URGEMERG" AS tem_urgencia,
        e."CENTRCIR" AS tem_centro_cirurgico,
        e."CENTROBS" AS tem_centro_obstetrico,
        e."ATENDAMB" AS tem_atend_ambulatorial,
        e."VINC_SUS" AS aceita_sus
      FROM estabelecimentos_pe e
      LEFT JOIN municipios_pe m ON m.codufmun = e."CODUFMUN"
      WHERE e."CNES" = $1
      LIMIT 1`,
    [cnes]
  );

  if (estruturaResult.rows.length === 0) {
    return { identidade, estrutura: null, indicadores: null, comparativo: null, sem_dados_cnes: true };
  }
  const estrutura = estruturaResult.rows[0];

  const compMunicipioResult = await db.query(
    `SELECT
        COUNT(*) AS total,
        AVG(leitos) AS media_leitos,
        AVG(complementares) AS media_complementares,
        (COUNT(*) FILTER (WHERE leitos < $3)) * 100.0 / NULLIF(COUNT(*), 0) AS percentil
     FROM (
       SELECT ${LEITOS_SQL} AS leitos, ${LEITOS_COMPLEMENTARES_SQL} AS complementares
       FROM estabelecimentos_pe
       WHERE "CODUFMUN" = $1 AND "TP_UNID" = $2
     ) t`,
    [estrutura.codufmun, estrutura.tp_unid, estrutura.leitos_totais]
  );

  const compEstadoResult = await db.query(
    `SELECT
        COUNT(*) AS total,
        AVG(leitos) AS media_leitos,
        AVG(complementares) AS media_complementares,
        (COUNT(*) FILTER (WHERE leitos < $2)) * 100.0 / NULLIF(COUNT(*), 0) AS percentil
     FROM (
       SELECT ${LEITOS_SQL} AS leitos, ${LEITOS_COMPLEMENTARES_SQL} AS complementares
       FROM estabelecimentos_pe
       WHERE "TP_UNID" = $1
     ) t`,
    [estrutura.tp_unid, estrutura.leitos_totais]
  );

  const municipio = compMunicipioResult.rows[0];
  const estado = compEstadoResult.rows[0];

  const servicosResult = await db.query(
    `SELECT COUNT(DISTINCT "SERV_ESP") AS total FROM servicos_pe WHERE "CNES" = $1`,
    [cnes]
  );
  const habilitacoesResult = await db.query(
    `SELECT COUNT(DISTINCT "SGRUPHAB") AS total FROM habilitacoes_pe WHERE "CNES" = $1`,
    [cnes]
  );

  const mediaServicosResult = await db.query(
    `SELECT AVG(qtd) AS media FROM (
       SELECT sp."CNES", COUNT(DISTINCT sp."SERV_ESP") AS qtd
       FROM servicos_pe sp
       JOIN estabelecimentos_pe e ON e."CNES" = sp."CNES"
       WHERE e."CODUFMUN" = $1 AND e."TP_UNID" = $2
       GROUP BY sp."CNES"
     ) sub`,
    [estrutura.codufmun, estrutura.tp_unid]
  );

  return {
    identidade,
    estrutura: { ...estrutura, tp_unid_label: rotulo(estrutura.tp_unid) },
    indicadores: {
      total_servicos_especializados: parseInt(servicosResult.rows[0].total, 10),
      total_habilitacoes: parseInt(habilitacoesResult.rows[0].total, 10),
      media_servicos_mesmo_tipo_municipio: parseFloat(mediaServicosResult.rows[0].media || 0).toFixed(1),
    },
    comparativo: {
      municipio: {
        total_estabelecimentos_mesmo_tipo: parseInt(municipio.total, 10),
        media_leitos: parseFloat(municipio.media_leitos || 0).toFixed(1),
        media_complementares: parseFloat(municipio.media_complementares || 0).toFixed(1),
        percentil_leitos: Math.round(parseFloat(municipio.percentil || 0)),
      },
      estado: {
        total_estabelecimentos_mesmo_tipo: parseInt(estado.total, 10),
        media_leitos: parseFloat(estado.media_leitos || 0).toFixed(1),
        media_complementares: parseFloat(estado.media_complementares || 0).toFixed(1),
        percentil_leitos: Math.round(parseFloat(estado.percentil || 0)),
      },
    },
  };
}

// --- /api/municipios ---
async function getMunicipios(db) {
  const r = await db.query(`SELECT codufmun, nome_municipio FROM municipios_pe ORDER BY nome_municipio`);
  return r.rows;
}

// --- /api/tipos ---
async function getTipos(db) {
  const r = await db.query(
    `SELECT "TP_UNID" AS codigo, COUNT(*) AS total
     FROM estabelecimentos_pe
     GROUP BY "TP_UNID"
     ORDER BY COUNT(*) DESC`
  );
  return r.rows.map((row) => ({ codigo: row.codigo, label: rotulo(row.codigo), total: parseInt(row.total, 10) }));
}

// --- /api/evolucao/:cnes ---
async function getEvolucao(db, cnes) {
  const r = await db.query(
    `SELECT
        h.competencia,
        ${LEITOS_SQL} AS leitos_totais,
        ${LEITOS_COMPLEMENTARES_SQL} AS leitos_complementares,
        COALESCE(lt.leitos_sus, 0) AS leitos_sus,
        GREATEST(COALESCE(lt.leitos_exist, 0) - COALESCE(lt.leitos_sus, 0), 0) AS leitos_nao_sus,
        h."VINC_SUS" AS aceita_sus
      FROM estabelecimentos_pe_historico h
      LEFT JOIN (
        SELECT "CNES", competencia,
          SUM(COALESCE(NULLIF("QT_SUS", '')::int, 0)) AS leitos_sus,
          SUM(COALESCE(NULLIF("QT_EXIST", '')::int, 0)) AS leitos_exist
        FROM leitos_pe_historico
        GROUP BY "CNES", competencia
      ) lt ON lt."CNES" = h."CNES" AND lt.competencia = h.competencia
      WHERE h."CNES" = $1
      ORDER BY h.competencia`,
    [cnes]
  );
  return r.rows;
}

// --- /api/mercado?tipo=&municipio= (sem município = estado inteiro) ---
async function getMercado(db, tipo, municipio) {
  const condMunicipio = municipio ? `AND h."CODUFMUN" = $2` : "";
  const params = municipio ? [tipo, municipio] : [tipo];
  const r = await db.query(
    `SELECT
        h.competencia,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE h."VINC_SUS" = '1') AS total_sus,
        AVG(${LEITOS_SQL}) AS media_leitos,
        AVG(${LEITOS_COMPLEMENTARES_SQL}) AS media_complementares,
        AVG(COALESCE(lt.leitos_sus, 0)) AS media_leitos_sus
      FROM estabelecimentos_pe_historico h
      LEFT JOIN (
        SELECT "CNES", competencia,
          SUM(COALESCE(NULLIF("QT_SUS", '')::int, 0)) AS leitos_sus
        FROM leitos_pe_historico
        GROUP BY "CNES", competencia
      ) lt ON lt."CNES" = h."CNES" AND lt.competencia = h.competencia
      WHERE h."TP_UNID" = $1 ${condMunicipio}
      GROUP BY h.competencia
      ORDER BY h.competencia`,
    params
  );
  return r.rows.map((row) => ({
    competencia: row.competencia,
    total: parseInt(row.total, 10),
    total_sus: parseInt(row.total_sus, 10),
    media_leitos: parseFloat(row.media_leitos || 0).toFixed(1),
    media_complementares: parseFloat(row.media_complementares || 0).toFixed(1),
    media_leitos_sus: parseFloat(row.media_leitos_sus || 0).toFixed(1),
  }));
}

// --- /api/visao-geral ---
async function getVisaoGeral(db) {
  // Sequencial (o server.js usa Promise.all no pool; num Client único as
  // consultas seriam enfileiradas de qualquer forma).
  const evolucaoTotal = await db.query(
    `SELECT competencia, COUNT(*) AS total
     FROM estabelecimentos_pe_historico
     GROUP BY competencia ORDER BY competencia`
  );
  const distribuicaoTipo = await db.query(
    `SELECT "TP_UNID" AS codigo, COUNT(*) AS total
     FROM estabelecimentos_pe GROUP BY "TP_UNID" ORDER BY COUNT(*) DESC LIMIT 6`
  );
  const leitosAtuais = await db.query(
    `SELECT SUM(leitos) AS total_leitos, SUM(complementares) AS total_complementares
     FROM (SELECT ${LEITOS_SQL} AS leitos, ${LEITOS_COMPLEMENTARES_SQL} AS complementares
           FROM estabelecimentos_pe) t`
  );
  const leitosSusAtual = await db.query(
    `SELECT SUM(COALESCE(NULLIF("QT_SUS", '')::int, 0)) AS total_sus
     FROM leitos_pe_historico
     WHERE competencia = (SELECT MAX(competencia) FROM leitos_pe_historico)`
  );
  const vinculoSus = await db.query(
    `SELECT COUNT(*) FILTER (WHERE "VINC_SUS" = '1') AS com_sus, COUNT(*) AS total
     FROM estabelecimentos_pe`
  );
  const associados = await db.query(`SELECT COUNT(*) AS total FROM identidade_associados`);

  return {
    evolucao_total: evolucaoTotal.rows.map((r) => ({ competencia: r.competencia, total: parseInt(r.total, 10) })),
    distribuicao_tipo: distribuicaoTipo.rows.map((r) => ({ codigo: r.codigo, label: rotulo(r.codigo), total: parseInt(r.total, 10) })),
    total_leitos: parseInt(leitosAtuais.rows[0].total_leitos || 0, 10),
    total_leitos_complementares: parseInt(leitosAtuais.rows[0].total_complementares || 0, 10),
    total_leitos_sus: parseInt(leitosSusAtual.rows[0].total_sus || 0, 10),
    total_estabelecimentos: parseInt(vinculoSus.rows[0].total, 10),
    total_com_vinculo_sus: parseInt(vinculoSus.rows[0].com_sus, 10),
    total_associados_sindhospe: parseInt(associados.rows[0].total, 10),
  };
}

// --- /api/representatividade ---
async function getRepresentatividade(db) {
  const totalEstado = await db.query(
    `SELECT
        SUM(${LEITOS_SQL}) AS leitos_estado,
        COUNT(*) AS estabelecimentos_estado,
        COUNT(*) FILTER (WHERE "VINC_SUS" = '1') AS estabelecimentos_sus_estado
      FROM estabelecimentos_pe`
  );
  const totalAssociados = await db.query(
    `SELECT
        SUM(${LEITOS_SQL}) AS leitos_associados,
        COUNT(DISTINCT e."CNES") AS estabelecimentos_associados
      FROM estabelecimentos_pe e
      JOIN identidade_associados a ON a.cnes = e."CNES"
      WHERE a.situacao = 'Filiado'`
  );
  const porTipo = await db.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cnes NOT LIKE 'REG%') AS com_cnes
      FROM identidade_associados WHERE situacao = 'Filiado'`
  );

  const leitosEstado = parseInt(totalEstado.rows[0].leitos_estado || 0, 10);
  const leitosAssociados = parseInt(totalAssociados.rows[0].leitos_associados || 0, 10);
  const pctLeitos = leitosEstado > 0 ? Math.round((leitosAssociados / leitosEstado) * 100) : 0;

  return {
    total_associados_filiados: parseInt(porTipo.rows[0].total, 10),
    associados_com_cnes: parseInt(porTipo.rows[0].com_cnes, 10),
    leitos_associados: leitosAssociados,
    leitos_estado: leitosEstado,
    percentual_leitos_representados: pctLeitos,
    estabelecimentos_associados_no_cnes: parseInt(totalAssociados.rows[0].estabelecimentos_associados, 10),
    estabelecimentos_totais_estado: parseInt(totalEstado.rows[0].estabelecimentos_estado, 10),
  };
}

// --- Listas usadas só pelo importador ---

/** Um item por CNES (deduplicado), ignorando linhas sem CNES. Mesmo critério de nome do DISTINCT ON da busca. */
async function listarAssociados(db) {
  const r = await db.query(
    `SELECT DISTINCT ON (cnes) cnes, nome_fantasia
     FROM identidade_associados
     WHERE cnes IS NOT NULL AND btrim(cnes) <> ''
     ORDER BY cnes`
  );
  return r.rows;
}

async function contarAssociadosSemCnes(db) {
  const r = await db.query(`SELECT COUNT(*) AS n FROM identidade_associados WHERE cnes IS NULL OR btrim(cnes) = ''`);
  return parseInt(r.rows[0].n, 10);
}

async function listarCombosMercado(db) {
  const r = await db.query(
    `SELECT DISTINCT "TP_UNID" AS tipo, "CODUFMUN" AS codufmun
     FROM estabelecimentos_pe_historico
     WHERE "TP_UNID" IS NOT NULL AND "CODUFMUN" IS NOT NULL
     ORDER BY 1, 2`
  );
  return r.rows;
}

async function listarTiposMercado(db) {
  const r = await db.query(
    `SELECT DISTINCT "TP_UNID" AS tipo FROM estabelecimentos_pe_historico WHERE "TP_UNID" IS NOT NULL ORDER BY 1`
  );
  return r.rows.map((x) => x.tipo);
}

async function getCompetenciaMax(db) {
  const r = await db.query(`SELECT MAX(competencia) AS max FROM estabelecimentos_pe_historico`);
  return r.rows[0].max;
}

module.exports = {
  abrirConexao,
  getEstabelecimento,
  getEvolucao,
  getMercado,
  getMunicipios,
  getTipos,
  getVisaoGeral,
  getRepresentatividade,
  listarAssociados,
  contarAssociadosSemCnes,
  listarCombosMercado,
  listarTiposMercado,
  getCompetenciaMax,
};
