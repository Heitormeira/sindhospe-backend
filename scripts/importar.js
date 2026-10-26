#!/usr/bin/env node
/**
 * Importador: Neon (somente leitura) -> Firestore + Firebase Auth.
 *
 *   npm run importar:seco   grava os documentos em ./saida (nada vai para o Firebase)
 *   npm run importar        grava no Firestore, apaga documentos órfãos e sincroniza as contas
 *
 * Segredos: ../segredos/.env (DATABASE_URL, SENHA_DEMO) e ../segredos/firebase-admin.json,
 * ou a pasta indicada em SEGREDOS_DIR.
 */
const fs = require("node:fs");
const path = require("node:path");
const { carregarSegredos } = require("./segredos");
const { abrirConexao } = require("./consultas");
const { montarDocumentos, contarPorColecao } = require("./documentos");

const PASTA_SAIDA = path.resolve(__dirname, "../saida");

function gravarSaida(docs) {
  fs.rmSync(PASTA_SAIDA, { recursive: true, force: true });
  for (const [chave, dados] of docs) {
    const arquivo = path.join(PASTA_SAIDA, `${chave}.json`);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  }
}

async function main() {
  const seco = process.argv.includes("--dry-run");
  const segredos = carregarSegredos(undefined, { exigirSenha: !seco });

  const inicio = Date.now();
  console.log("Conectando ao Neon (somente leitura)...");
  const db = await abrirConexao(segredos.databaseUrl);
  let docs;
  try {
    console.log("Calculando documentos...");
    docs = await montarDocumentos(db);
  } finally {
    await db.end();
  }
  console.log("Documentos por coleção:", contarPorColecao(docs));

  if (seco) {
    gravarSaida(docs);
    console.log(`Modo seco: ${docs.size} documentos gravados em ${PASTA_SAIDA}`);
  } else {
    const { publicar } = require("./publicar");
    await publicar(docs, segredos);
  }
  console.log(`Concluído em ${Math.round((Date.now() - inicio) / 1000)}s.`);
}

main().catch((erro) => {
  console.error("Falha na importação:", erro.message);
  process.exit(1);
});
