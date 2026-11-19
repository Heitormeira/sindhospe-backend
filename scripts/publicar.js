/** Publica uma importação: Firestore primeiro, contas depois. */
const path = require("node:path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { gravarDocumentos } = require("./firestore");
const { sincronizarContas, sincronizarContaSindicato } = require("./contas");
const { gravarListaDeSenhas } = require("./senhas");

async function publicar(docs, { credencialPath, senhaSindicato }, { forcar = false } = {}) {
  const app = initializeApp({ credential: cert(credencialPath), projectId: "sindhospe-portal" });
  const firestore = getFirestore(app);
  const auth = getAuth(app);

  console.log("Gravando no Firestore...");
  const resultado = await gravarDocumentos(firestore, docs, { forcar });
  console.log(`  gravados: ${resultado.gravados}, apagados (órfãos): ${resultado.apagados}`);

  const cnesLista = [...docs.keys()].filter((k) => k.startsWith("associados/")).map((k) => k.split("/")[1]);
  console.log("Sincronizando contas do Firebase Auth...");
  const contas = await sincronizarContas(auth, cnesLista);
  console.log(`  criadas: ${contas.criadas}, atualizadas: ${contas.atualizadas}, desativadas: ${contas.desativadas}`);

  if (contas.novasSenhas.length) {
    // Associados novos: a senha individual vai para um CSV fora do repositório, nunca para o terminal.
    const linhas = contas.novasSenhas.map(({ cnes, senha }) => ({
      cnes,
      estabelecimento: docs.get(`associados/${cnes}`)?.identidade?.nome_fantasia || "",
      senha,
    }));
    const arquivo = gravarListaDeSenhas(path.dirname(credencialPath), linhas, "contas-novas");
    console.log(`  senhas das contas novas gravadas em ${arquivo}`);
  }

  if (senhaSindicato) {
    const r = await sincronizarContaSindicato(auth, senhaSindicato);
    console.log(`  conta do sindicato: ${r}`);
  } else {
    console.log("  conta do sindicato: SENHA_SINDICATO ausente em segredos/.env, conta não sincronizada");
  }
}

module.exports = { publicar };
