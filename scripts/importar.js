#!/usr/bin/env node
/**
 * Importador: Neon (somente leitura) -> Firestore + Firebase Auth.
 *
 *   npm run importar:seco   grava os documentos em ./saida (nada vai para o Firebase)
 *   npm run importar        grava no Firestore, apaga documentos órfãos e sincroniza as contas
 *     -- --forcar           aceita importação com bem menos associados que o Firestore atual
 *     -- --resetar-senhas   redefine a senha de TODAS as contas para SENHA_DEMO (derruba sessões)
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
const PASTA_DADOS = path.resolve(__dirname, "../dados");

/** Agregados do DATASUS mais recentes (npm run baixar-cnes -- AAAAMM). */
function lerDadosCnes() {
  const arquivos = fs.existsSync(PASTA_DADOS) ? fs.readdirSync(PASTA_DADOS).filter((f) => /^cnes-\d{6}\.json$/.test(f)).sort() : [];
  if (!arquivos.length) throw new Error("Faltam os agregados do DATASUS. Rode: npm run baixar-cnes -- AAAAMM");
  const arquivo = path.join(PASTA_DADOS, arquivos.at(-1));
  console.log(`Agregados do DATASUS: ${arquivos.at(-1)}`);
  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

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
    docs = await montarDocumentos(db, { extra: lerDadosCnes() });
  } finally {
    await db.end();
  }
  console.log("Documentos por coleção:", contarPorColecao(docs));

  if (seco) {
    gravarSaida(docs);
    console.log(`Modo seco: ${docs.size} documentos gravados em ${PASTA_SAIDA}`);
  } else {
    const { publicar } = require("./publicar");
    await publicar(docs, segredos, {
      forcar: process.argv.includes("--forcar"),
      resetarSenhas: process.argv.includes("--resetar-senhas"),
    });
  }
  console.log(`Concluído em ${Math.round((Date.now() - inicio) / 1000)}s.`);
}

main().catch((erro) => {
  console.error("Falha na importação:", erro.message);
  process.exit(1);
});
