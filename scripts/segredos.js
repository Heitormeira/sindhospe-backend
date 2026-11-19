/**
 * Lê os segredos do importador de uma pasta FORA do repositório
 * (padrão: ../segredos, ao lado das pastas dos dois repositórios).
 *   .env                -> SENHA_SINDICATO (opcional, conta do SINDHOSPE), SENHA_DEMO (legado)
 *                          e DATABASE_URL (opcional: só para exportar a lista de associados do Neon)
 *   firebase-admin.json -> chave da conta de serviço do Firebase
 *   associados.json     -> lista de associados do SINDHOSPE (npm run exportar-associados)
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

/**
 * exigirSenha:     SENHA_DEMO obrigatória (legado; o importador não usa mais).
 * exigirBanco:     DATABASE_URL obrigatória (só o exportar-associados precisa).
 * exigirCredencial: firebase-admin.json obrigatório (tudo que grava no Firebase; o modo seco não precisa).
 */
function carregarSegredos(
  dir = process.env.SEGREDOS_DIR || PASTA_PADRAO,
  { exigirSenha = true, exigirBanco = false, exigirCredencial = true } = {}
) {
  const arquivoEnv = path.join(dir, ".env");
  const env = fs.existsSync(arquivoEnv) ? lerEnv(arquivoEnv) : null;
  if (!env && (exigirSenha || exigirBanco)) {
    throw new Error(`Arquivo de segredos não encontrado: ${arquivoEnv}`);
  }
  const valores = env || {};

  if (exigirBanco && !valores.DATABASE_URL) throw new Error(`DATABASE_URL ausente em ${arquivoEnv}`);
  if (exigirSenha && (!valores.SENHA_DEMO || valores.SENHA_DEMO.length < 6)) {
    throw new Error(`SENHA_DEMO ausente ou com menos de 6 caracteres em ${arquivoEnv} (exigência do Firebase Auth)`);
  }

  const credencialPath = path.join(dir, "firebase-admin.json");
  if (exigirCredencial && !fs.existsSync(credencialPath)) {
    throw new Error(`Chave da conta de serviço não encontrada: ${credencialPath} (firebase-admin.json)`);
  }

  if (valores.SENHA_SINDICATO !== undefined && valores.SENHA_SINDICATO.length < 8) {
    throw new Error(`SENHA_SINDICATO precisa ter pelo menos 8 caracteres em ${arquivoEnv}`);
  }

  return {
    pasta: dir,
    databaseUrl: valores.DATABASE_URL,
    senhaDemo: valores.SENHA_DEMO,
    senhaSindicato: valores.SENHA_SINDICATO,
    credencialPath,
    associadosPath: path.join(dir, "associados.json"),
  };
}

module.exports = { carregarSegredos };
