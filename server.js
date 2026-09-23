/**
 * Backend do Portal SINDHOSPE — lê direto do PostgreSQL (dados reais do CNES).
 *
 * Endpoints:
 *   GET /api/health                    -> teste de conexão
 *   GET /api/estabelecimentos          -> lista os estabelecimentos com identidade conhecida (para o seletor "logar como")
 *   GET /api/estabelecimento/:cnes     -> ficha completa + comparativo com o município E com o estado inteiro
 */

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());

// Usa a DATABASE_URL do Neon (produção/nuvem) se existir; senão, cai no banco
// local do WSL (desenvolvimento). Isso permite rodar em ambos os lugares
// sem mudar código, só trocando a variável de ambiente.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon exige SSL
    })
  : new Pool({
      host: "localhost",
      port: 5432,
      user: "postgres",
      password: "sindhospe123",
      database: "sindhospe",
    });

// Expressão usada em várias queries para somar os leitos (cirúrgico + clínico + complementar)
const LEITOS_SQL = `
  COALESCE(NULLIF("QTLEITP1", '')::int, 0)
  + COALESCE(NULLIF("QTLEITP2", '')::int, 0)
  + COALESCE(NULLIF("QTLEITP3", '')::int, 0)
`;

// Leitos complementares (UTI adulto/neonatal/pediátrica, isolamento, etc.) —
// soma dos campos QTLEIT05..40 já presentes no arquivo ST (não precisa do grupo LT)
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

// Dicionário TP_UNID (confirmado contra a tabela oficial do CNES/DATASUS)
// Dicionário TP_UNID — fonte: cnes2.datasus.gov.br/Mod_Ind_Unidade.asp (consulta oficial
// do DATASUS, relatório nacional com totais reais). Substituiu uma versão anterior que
// tinha alguns códigos errados (confirmados como incorretos contra essa fonte primária).
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

// --- Teste de conexão ---
app.get("/api/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json({ status: "ok", horario_banco: r.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "erro", mensagem: err.message });
  }
});

// --- Lista de estabelecimentos com identidade conhecida (para popular o seletor) ---
// DISTINCT ON evita duplicatas quando mais de uma linha do SINDHOSPE bateu no mesmo CNES.
app.get("/api/estabelecimentos", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DISTINCT ON (cnes)
        cnes, nome_fantasia, razao_social, codufmun, cnpj
      FROM identidade_associados
      ORDER BY cnes, nome_fantasia
    `);
    // reordena por nome depois de deduplicar por cnes
    const linhas = r.rows.sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia));
    res.json(linhas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Ficha completa de um estabelecimento, com comparativo municipal E estadual ---
app.get("/api/estabelecimento/:cnes", async (req, res) => {
  const { cnes } = req.params;

  try {
    // 1) Identidade (nome, CNPJ, endereço) — vem da base de identidade real do SINDHOSPE
    const identidadeResult = await pool.query(
      `SELECT DISTINCT ON (cnes) * FROM identidade_associados WHERE cnes = $1`,
      [cnes]
    );
    if (identidadeResult.rows.length === 0) {
      return res.status(404).json({ mensagem: "Estabelecimento não encontrado na base de identidade." });
    }
    const identidade = identidadeResult.rows[0];

    // 2) Dados estruturais do próprio estabelecimento
    const estruturaResult = await pool.query(
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
      // Associado real, mas sem CNES/estrutura no DATASUS (ex: empresa prestadora
      // de serviço - consultoria, locação, higienização - sem estabelecimento
      // de saúde próprio). Não é erro: retorna só a identidade.
      return res.json({
        identidade,
        estrutura: null,
        indicadores: null,
        comparativo: null,
        sem_dados_cnes: true,
      });
    }
    const estrutura = estruturaResult.rows[0];

    // 3a) Comparativo MUNICIPAL: mesmo tipo de unidade, mesmo município + percentil de leitos
    const compMunicipioResult = await pool.query(
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

    // 3b) Comparativo ESTADUAL: mesmo tipo de unidade, em toda Pernambuco + percentil
    const compEstadoResult = await pool.query(
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

    // 4) Contagem de serviços especializados e habilitações do próprio estabelecimento
    const servicosResult = await pool.query(
      `SELECT COUNT(DISTINCT "SERV_ESP") AS total FROM servicos_pe WHERE "CNES" = $1`,
      [cnes]
    );
    const habilitacoesResult = await pool.query(
      `SELECT COUNT(DISTINCT "SGRUPHAB") AS total FROM habilitacoes_pe WHERE "CNES" = $1`,
      [cnes]
    );

    // Média de serviços entre estabelecimentos do mesmo tipo no município
    const mediaServicosResult = await pool.query(
      `SELECT AVG(qtd) AS media FROM (
         SELECT sp."CNES", COUNT(DISTINCT sp."SERV_ESP") AS qtd
         FROM servicos_pe sp
         JOIN estabelecimentos_pe e ON e."CNES" = sp."CNES"
         WHERE e."CODUFMUN" = $1 AND e."TP_UNID" = $2
         GROUP BY sp."CNES"
       ) sub`,
      [estrutura.codufmun, estrutura.tp_unid]
    );

    res.json({
      identidade,
      estrutura: {
        ...estrutura,
        tp_unid_label: TP_UNID_LABELS[estrutura.tp_unid] || `Código ${estrutura.tp_unid}`,
      },
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Lista de municípios (código + nome, para seletores no frontend) ---
app.get("/api/municipios", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT codufmun, nome_municipio FROM municipios_pe ORDER BY nome_municipio`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Lista de tipos de unidade presentes na base (código + label) ---
app.get("/api/tipos", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT "TP_UNID" AS codigo, COUNT(*) AS total
       FROM estabelecimentos_pe
       GROUP BY "TP_UNID"
       ORDER BY COUNT(*) DESC`
    );
    const tipos = r.rows.map((row) => ({
      codigo: row.codigo,
      label: TP_UNID_LABELS[row.codigo] || `Código ${row.codigo}`,
      total: parseInt(row.total, 10),
    }));
    res.json(tipos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Evolução histórica de UM estabelecimento (leitos ao longo do tempo) ---
app.get("/api/evolucao/:cnes", async (req, res) => {
  const { cnes } = req.params;
  try {
    const r = await pool.query(
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
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Mercado agregado: evolução do NÚMERO de estabelecimentos por tipo,
// opcionalmente filtrado por município (sem município = agregado do estado inteiro) ---
app.get("/api/mercado", async (req, res) => {
  const { municipio, tipo } = req.query;
  if (!tipo) {
    return res.status(400).json({ mensagem: "Parâmetro 'tipo' é obrigatório." });
  }
  try {
    const condMunicipio = municipio ? `AND h."CODUFMUN" = $2` : "";
    const params = municipio ? [tipo, municipio] : [tipo];

    const r = await pool.query(
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
    res.json(
      r.rows.map((row) => ({
        competencia: row.competencia,
        total: parseInt(row.total, 10),
        total_sus: parseInt(row.total_sus, 10),
        media_leitos: parseFloat(row.media_leitos || 0).toFixed(1),
        media_complementares: parseFloat(row.media_complementares || 0).toFixed(1),
        media_leitos_sus: parseFloat(row.media_leitos_sus || 0).toFixed(1),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

// --- Visão geral de Pernambuco: números agregados do estado inteiro ---
app.get("/api/visao-geral", async (req, res) => {
  try {
    const [evolucaoTotal, distribuicaoTipo, leitosAtuais, leitosSusAtual, vinculoSus, associados] =
      await Promise.all([
        pool.query(
          `SELECT competencia, COUNT(*) AS total
           FROM estabelecimentos_pe_historico
           GROUP BY competencia ORDER BY competencia`
        ),
        pool.query(
          `SELECT "TP_UNID" AS codigo, COUNT(*) AS total
           FROM estabelecimentos_pe GROUP BY "TP_UNID" ORDER BY COUNT(*) DESC LIMIT 6`
        ),
        pool.query(
          `SELECT SUM(leitos) AS total_leitos, SUM(complementares) AS total_complementares
           FROM (SELECT ${LEITOS_SQL} AS leitos, ${LEITOS_COMPLEMENTARES_SQL} AS complementares
                 FROM estabelecimentos_pe) t`
        ),
        pool.query(
          `SELECT SUM(COALESCE(NULLIF("QT_SUS", '')::int, 0)) AS total_sus
           FROM leitos_pe_historico
           WHERE competencia = (SELECT MAX(competencia) FROM leitos_pe_historico)`
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE "VINC_SUS" = '1') AS com_sus, COUNT(*) AS total
           FROM estabelecimentos_pe`
        ),
        pool.query(`SELECT COUNT(*) AS total FROM identidade_associados`),
      ]);

    res.json({
      evolucao_total: evolucaoTotal.rows.map((r) => ({
        competencia: r.competencia,
        total: parseInt(r.total, 10),
      })),
      distribuicao_tipo: distribuicaoTipo.rows.map((r) => ({
        codigo: r.codigo,
        label: TP_UNID_LABELS[r.codigo] || `Código ${r.codigo}`,
        total: parseInt(r.total, 10),
      })),
      total_leitos: parseInt(leitosAtuais.rows[0].total_leitos || 0, 10),
      total_leitos_complementares: parseInt(leitosAtuais.rows[0].total_complementares || 0, 10),
      total_leitos_sus: parseInt(leitosSusAtual.rows[0].total_sus || 0, 10),
      total_estabelecimentos: parseInt(vinculoSus.rows[0].total, 10),
      total_com_vinculo_sus: parseInt(vinculoSus.rows[0].com_sus, 10),
      total_associados_sindhospe: parseInt(associados.rows[0].total, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend do Portal SINDHOSPE rodando em http://localhost:${PORT}`);
});
