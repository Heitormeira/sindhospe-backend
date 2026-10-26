/**
 * gravarDocumentos + sincronizarContas contra os emuladores de Firestore e Auth:
 *   npm run test:regras   (sobe os dois emuladores e roda este arquivo também)
 */
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { gravarDocumentos } = require("../scripts/firestore");
const { sincronizarContas, emailDoAssociado } = require("../scripts/contas");

let firestore, auth;

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, "rode via emulators:exec");
  const app = initializeApp({ projectId: "demo-sindhospe" }, "teste-publicar");
  firestore = getFirestore(app);
  auth = getAuth(app);
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-sindhospe/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-sindhospe/accounts`, { method: "DELETE" });
});

async function contar(colecao) {
  return (await firestore.collection(colecao).listDocuments()).length;
}

test("gravarDocumentos é idempotente e apaga órfãos", async () => {
  const docs = new Map();
  for (let i = 0; i < 450; i++) docs.set(`mercado/05_${i}`, { serie: [i] }); // > 1 lote
  docs.set("associados/A", { x: 1 });
  docs.set("associados/B", { x: 2 });
  docs.set("publico/meta", { competencia_max: "202606" });

  let r = await gravarDocumentos(firestore, docs);
  assert.deepEqual(r, { gravados: 453, apagados: 0 });
  r = await gravarDocumentos(firestore, docs);
  assert.deepEqual(r, { gravados: 453, apagados: 0 });
  assert.equal(await contar("mercado"), 450);

  docs.delete("associados/B");
  docs.delete("mercado/05_0");
  r = await gravarDocumentos(firestore, docs);
  assert.equal(r.apagados, 2);
  assert.equal((await firestore.doc("associados/B").get()).exists, false);
  assert.deepEqual((await firestore.doc("associados/A").get()).data(), { x: 1 });
});

test("sincronizarContas cria, atualiza, desativa e grava a claim", async () => {
  let r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.deepEqual(r, { criadas: 2, atualizadas: 0, desativadas: 0 });

  r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.deepEqual(r, { criadas: 0, atualizadas: 2, desativadas: 0 });

  const a = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.deepEqual(a.customClaims, { cnes: "A" });
  assert.equal(a.disabled, false);

  r = await sincronizarContas(auth, ["A"], "senha-demo");
  assert.deepEqual(r, { criadas: 0, atualizadas: 1, desativadas: 1 });
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, true);

  r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, false, "volta a ativar quem retornou");
});
