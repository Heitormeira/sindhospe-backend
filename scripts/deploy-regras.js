#!/usr/bin/env node
/**
 * Publica firestore.rules no projeto sindhospe-portal usando o Admin SDK
 * (API Firebase Rules), autenticado pela chave da conta de serviço.
 * Não usa o firebase-tools: a conta de serviço padrão não tem permissão de
 * Service Usage, que o `firebase deploy` exige. firestore.indexes.json está
 * vazio (nenhum índice composto), então não há índices a publicar.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getSecurityRules } = require("firebase-admin/security-rules");
const { carregarSegredos } = require("./segredos");

async function main() {
  const { credencialPath } = carregarSegredos(undefined, { exigirSenha: false });
  const app = initializeApp({ credential: cert(credencialPath), projectId: "sindhospe-portal" });
  const regras = getSecurityRules(app);

  const fonte = fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8");
  const ruleset = await regras.releaseFirestoreRulesetFromSource(fonte);
  console.log(`Regras publicadas: ${ruleset.name} (${ruleset.createTime})`);

  const ativo = await regras.getFirestoreRuleset();
  const confere = ativo.source[0].content === fonte;
  console.log(`Ruleset ativo confere com firestore.rules: ${confere ? "sim" : "NÃO"}`);
  if (!confere) process.exit(1);
}

main().catch((e) => { console.error("Falha ao publicar regras:", e.message); process.exit(1); });
