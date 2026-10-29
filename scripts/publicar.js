/** Publica uma importação: Firestore primeiro, contas depois. */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { gravarDocumentos } = require("./firestore");
const { sincronizarContas } = require("./contas");

async function publicar(docs, { credencialPath, senhaDemo }, { forcar = false, resetarSenhas = false } = {}) {
  const app = initializeApp({ credential: cert(credencialPath), projectId: "sindhospe-portal" });
  const firestore = getFirestore(app);
  const auth = getAuth(app);

  console.log("Gravando no Firestore...");
  const resultado = await gravarDocumentos(firestore, docs, { forcar });
  console.log(`  gravados: ${resultado.gravados}, apagados (órfãos): ${resultado.apagados}`);

  const cnesLista = [...docs.keys()].filter((k) => k.startsWith("associados/")).map((k) => k.split("/")[1]);
  console.log("Sincronizando contas do Firebase Auth...");
  const contas = await sincronizarContas(auth, cnesLista, senhaDemo, { resetarSenhas });
  console.log(`  criadas: ${contas.criadas}, atualizadas: ${contas.atualizadas}, desativadas: ${contas.desativadas}`);
}

module.exports = { publicar };
