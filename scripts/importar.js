#!/usr/bin/env node
/**
 * Importador: arquivos do DATASUS + lista de associados -> Firestore + Firebase Auth.
 * Não usa mais o Neon.
 *
 *   npm run importar:seco   grava os documentos em ./saida (nada vai para o Firebase)
 *   npm run importar        grava no Firestore, apaga documentos órfãos e sincroniza as contas
 *     -- --competencia AAAAMM  usa essa competência em vez da mais recente de dados/
 *     -- --saida PASTA         (modo seco) grava em outra pasta em vez de ./saida
 *     -- --forcar              aceita importação com bem menos associados que o Firestore atual
 *
 * Antes: npm run baixar-cnes -- AAAAMM --historico 202406   (dados públicos, ficam em dados/)
 *        segredos/associados.json                           (npm run exportar-associados)
 *
 * Contas novas recebem senha individual, gravada em ../segredos/senhas/ (nunca no terminal).
 * Para redefinir senhas de associados: npm run senhas (scripts/redefinir-senhas.js).
 *
 * Segredos (../segredos ou SEGREDOS_DIR): associados.json; para publicar, também
 * firebase-admin.json e .env (SENHA_SINDICATO).
 */
const fs = require("node:fs");
const path = require("node:path");
const { carregarSegredos } = require("./segredos");
const { carregarFontes } = require("./fontes");
const { montarDocumentos, contarPorColecao } = require("./documentos");

const PASTA_DADOS = path.resolve(__dirname, "../dados");

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function gravarSaida(docs, pasta) {
  fs.rmSync(pasta, { recursive: true, force: true });
  for (const [chave, dados] of docs) {
    const arquivo = path.join(pasta, `${chave}.json`);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  }
}

async function main() {
  const seco = process.argv.includes("--dry-run");
  const competencia = argumento("--competencia");
  if (competencia !== undefined && !/^\d{6}$/.test(competencia)) throw new Error("Use: --competencia AAAAMM");
  const segredos = carregarSegredos(undefined, { exigirSenha: false, exigirCredencial: !seco });

  const inicio = Date.now();
  console.log("Lendo arquivos do DATASUS e a lista de associados...");
  const fontes = carregarFontes({ pastaDados: PASTA_DADOS, associadosPath: segredos.associadosPath, competencia });
  const docs = montarDocumentos(fontes);
  console.log("Documentos por coleção:", contarPorColecao(docs));

  if (seco) {
    const pasta = path.resolve(argumento("--saida") || path.join(__dirname, "../saida"));
    gravarSaida(docs, pasta);
    console.log(`Modo seco: ${docs.size} documentos gravados em ${pasta}`);
  } else {
    const { publicar } = require("./publicar");
    await publicar(docs, segredos, { forcar: process.argv.includes("--forcar") });
  }
  console.log(`Concluído em ${Math.round((Date.now() - inicio) / 1000)}s.`);
}

main().catch((erro) => {
  console.error("Falha na importação:", erro.message);
  process.exit(1);
});
