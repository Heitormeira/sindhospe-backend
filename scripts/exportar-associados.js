#!/usr/bin/env node
/**
 * Exporta a lista de associados do SINDHOSPE (tabela identidade_associados do Neon)
 * para ../segredos/associados.json. Roda UMA vez: depois disso o importador não
 * precisa mais do Neon.
 *
 *   npm run exportar-associados
 *
 * - Conexão SOMENTE LEITURA (o script aborta se o banco não confirmar).
 * - O arquivo fica na pasta de segredos, FORA do repositório (que é público):
 *   tem CNPJ, razão social e registro dos associados.
 * - Um registro por CNES (mesmo critério do importador antigo: DISTINCT ON (cnes) ... ORDER BY cnes).
 * Precisa de DATABASE_URL em ../segredos/.env.
 */
const fs = require("node:fs");
const { Pool } = require("pg");
const { carregarSegredos } = require("./segredos");

async function abrirConexao(databaseUrl) {
  const u = new URL(databaseUrl);
  u.hostname = u.hostname.replace("-pooler.", "."); // endpoint direto: o read-only vale em toda conexão
  const db = new Pool({
    connectionString: u.toString(),
    ssl: { rejectUnauthorized: false },
    options: "-c default_transaction_read_only=on",
    max: 1,
    connectionTimeoutMillis: 60000, // o Neon gratuito pode estar "dormindo"
  });
  const r = await db.query("SHOW default_transaction_read_only");
  if (r.rows[0].default_transaction_read_only !== "on") {
    await db.end();
    throw new Error("Conexão com o Neon não ficou em modo somente leitura; abortando.");
  }
  return db;
}

async function main() {
  const segredos = carregarSegredos(undefined, { exigirSenha: false, exigirBanco: true, exigirCredencial: false });
  const db = await abrirConexao(segredos.databaseUrl);
  try {
    const lista = await db.query(
      `SELECT DISTINCT ON (cnes) * FROM identidade_associados
        WHERE cnes IS NOT NULL AND btrim(cnes) <> '' ORDER BY cnes`
    );
    const total = await db.query(`SELECT COUNT(*) AS n FROM identidade_associados`);
    const semCnes = await db.query(`SELECT COUNT(*) AS n FROM identidade_associados WHERE cnes IS NULL OR btrim(cnes) = ''`);
    const repetidos = await db.query(
      `SELECT COUNT(*) AS n FROM (SELECT cnes FROM identidade_associados
         WHERE cnes IS NOT NULL AND btrim(cnes) <> '' GROUP BY cnes HAVING COUNT(*) > 1) t`
    );

    // JSON puro (datas viram texto), como o importador antigo gravava no Firestore.
    const linhas = JSON.parse(JSON.stringify(lista.rows));
    fs.writeFileSync(segredos.associadosPath, JSON.stringify(linhas, null, 1) + "\n", { mode: 0o600 });
    console.log(`Gravado ${segredos.associadosPath}`);
    console.log(`  ${linhas.length} associados com CNES (de ${total.rows[0].n} linhas na tabela).`);
    console.log(`  ${semCnes.rows[0].n} linha(s) sem CNES ignoradas; ${repetidos.rows[0].n} CNES com mais de uma linha (fica uma).`);
    console.log(`  Campos: ${Object.keys(linhas[0] || {}).join(", ")}`);
  } finally {
    await db.end();
  }
}

main().catch((erro) => {
  console.error("Falha ao exportar:", erro.message);
  process.exit(1);
});
