/**
 * Lê os segredos do importador de uma pasta FORA do repositório
 * (padrão: ../segredos, ao lado das pastas dos dois repositórios).
 *   .env               -> DATABASE_URL e SENHA_DEMO
 *   firebase-admin.json -> chave da conta de serviço do Firebase
 * As mensagens de erro nunca incluem o valor dos segredos.
 */
const fs = require("node:fs");
const path = require("node:path");

const PASTA_PADRAO = path.resolve(__dirname, "../../segredos");

function lerEnv(arquivo) {
  const valores = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    valores[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return valores;
}

// exigirSenha=false serve ao modo seco e à paridade, que não criam contas.
function carregarSegredos(dir = process.env.SEGREDOS_DIR || PASTA_PADRAO, { exigirSenha = true } = {}) {
  const arquivoEnv = path.join(dir, ".env");
  if (!fs.existsSync(arquivoEnv)) {
    throw new Error(`Arquivo de segredos não encontrado: ${arquivoEnv}`);
  }
  const env = lerEnv(arquivoEnv);

  if (!env.DATABASE_URL) throw new Error(`DATABASE_URL ausente em ${arquivoEnv}`);
  if (exigirSenha && (!env.SENHA_DEMO || env.SENHA_DEMO.length < 6)) {
    throw new Error(`SENHA_DEMO ausente ou com menos de 6 caracteres em ${arquivoEnv} (exigência do Firebase Auth)`);
  }

  const credencialPath = path.join(dir, "firebase-admin.json");
  if (!fs.existsSync(credencialPath)) {
    throw new Error(`Chave da conta de serviço não encontrada: ${credencialPath} (firebase-admin.json)`);
  }

  return { databaseUrl: env.DATABASE_URL, senhaDemo: env.SENHA_DEMO, credencialPath };
}

module.exports = { carregarSegredos };
