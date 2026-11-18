#!/usr/bin/env node
/**
 * Senhas individuais dos associados ("esqueci minha senha" e entrega inicial).
 *
 *   npm run senhas -- 2355906 3141020   nova senha só para esses CNES
 *   npm run senhas -- --todos           nova senha para TODAS as contas de associados
 *
 * - As senhas são aleatórias (scripts/senhas.js) e vão para
 *   ../segredos/senhas/senhas-<data>-<motivo>.csv, FORA do repositório. Nada é impresso.
 * - As sessões abertas dessas contas caem (o associado entra de novo com a senha nova).
 * - O associado pode trocar a senha depois, no Perfil do portal.
 * - A conta do sindicato não é afetada.
 */
const path = require("node:path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { carregarSegredos } = require("./segredos");
const { redefinirSenhas, emailDoAssociado, EMAIL_SINDICATO } = require("./contas");
const { gravarListaDeSenhas } = require("./senhas");

async function todosOsCnes(auth) {
  const lista = [];
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    for (const u of r.users) {
      if (!u.disabled && u.email !== EMAIL_SINDICATO && u.customClaims?.cnes && u.email === emailDoAssociado(u.customClaims.cnes)) {
        lista.push(u.customClaims.cnes);
      }
    }
    pagina = r.pageToken;
  } while (pagina);
  return lista.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const todos = args.includes("--todos");
  const pedidos = args.filter((a) => !a.startsWith("--"));
  if (!todos && !pedidos.length) throw new Error("Informe os CNES (npm run senhas -- 2355906) ou --todos.");
  if (todos && pedidos.length) throw new Error("Use --todos OU uma lista de CNES, não os dois.");

  const { credencialPath } = carregarSegredos(undefined, { exigirSenha: false });
  const app = initializeApp({ credential: cert(credencialPath), projectId: "sindhospe-portal" });
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  const cnesLista = todos ? await todosOsCnes(auth) : pedidos;
  console.log(`Redefinindo ${cnesLista.length} senha(s)...`);
  const { redefinidas, semConta } = await redefinirSenhas(auth, cnesLista);

  const linhas = [];
  for (const { cnes, senha } of redefinidas) {
    const doc = await firestore.doc(`associados/${cnes}`).get();
    linhas.push({ cnes, estabelecimento: doc.data()?.identidade?.nome_fantasia || "", senha });
  }
  linhas.sort((a, b) => a.estabelecimento.localeCompare(b.estabelecimento, "pt-BR"));
  if (linhas.length) {
    const arquivo = gravarListaDeSenhas(path.dirname(credencialPath), linhas, todos ? "todos" : "redefinidas");
    console.log(`  ${linhas.length} senha(s) gravada(s) em ${arquivo}`);
  }
  if (semConta.length) console.log(`  sem conta no portal (ignorados): ${semConta.join(", ")}`);
}

main().catch((e) => {
  console.error("Falha:", e.message);
  process.exit(1);
});
