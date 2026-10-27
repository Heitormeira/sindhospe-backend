/**
 * gravarDocumentos + sincronizarContas contra os emuladores de Firestore e Auth:
 *   npm run test:regras   (sobe os dois emuladores e roda este arquivo também)
 */
const { test, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { gravarDocumentos } = require("../scripts/firestore");
const { sincronizarContas, emailDoAssociado } = require("../scripts/contas");

let firestore, auth;

async function limparEmuladores() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-sindhospe/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-sindhospe/accounts`, { method: "DELETE" });
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, "rode via emulators:exec");
  const app = initializeApp({ projectId: "demo-sindhospe" }, "teste-publicar");
  firestore = getFirestore(app);
  auth = getAuth(app);
});

beforeEach(limparEmuladores);

const contar = async (colecao) => (await firestore.collection(colecao).listDocuments()).length;

function base(nAssociados) {
  const docs = new Map();
  for (let i = 0; i < 450; i++) docs.set(`mercado/05_${i}`, { serie: [i] }); // > 1 lote
  for (let i = 0; i < nAssociados; i++) docs.set(`associados/C${i}`, { x: i });
  docs.set("publico/meta", { competencia_max: "202606" });
  return docs;
}

test("gravarDocumentos é idempotente e apaga órfãos", async () => {
  const docs = base(20);
  let r = await gravarDocumentos(firestore, docs);
  assert.deepEqual(r, { gravados: 471, apagados: 0 });
  r = await gravarDocumentos(firestore, docs);
  assert.deepEqual(r, { gravados: 471, apagados: 0 });
  assert.equal(await contar("mercado"), 450);

  docs.delete("associados/C19");
  docs.delete("mercado/05_0");
  r = await gravarDocumentos(firestore, docs);
  assert.equal(r.apagados, 2);
  assert.equal((await firestore.doc("associados/C19").get()).exists, false);
  assert.deepEqual((await firestore.doc("associados/C0").get()).data(), { x: 0 });
});

test("gravarDocumentos recusa importação que encolhe associados demais, sem tocar em nada", async () => {
  await gravarDocumentos(firestore, base(20));
  await assert.rejects(gravarDocumentos(firestore, base(10)), /--forcar/);
  assert.equal(await contar("associados"), 20, "nada apagado");
  await assert.rejects(gravarDocumentos(firestore, base(0)), /--forcar/);

  const r = await gravarDocumentos(firestore, base(10), { forcar: true });
  assert.equal(r.apagados, 10);
});

test("sincronizarContas cria, não mexe em quem já está certo, desativa e reativa", async () => {
  let r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.deepEqual(r, { criadas: 2, atualizadas: 0, desativadas: 0 });

  const antes = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.deepEqual(antes.customClaims, { cnes: "A" });

  // Reimportar não pode trocar senha nem revogar sessões de quem está logado.
  r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.deepEqual(r, { criadas: 0, atualizadas: 0, desativadas: 0 });
  const depois = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.equal(depois.tokensValidAfterTime, antes.tokensValidAfterTime);
  assert.equal(depois.passwordHash, antes.passwordHash);

  r = await sincronizarContas(auth, ["A"], "senha-demo");
  assert.deepEqual(r, { criadas: 0, atualizadas: 0, desativadas: 1 });
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, true);

  r = await sincronizarContas(auth, ["A", "B"], "senha-demo");
  assert.deepEqual(r, { criadas: 0, atualizadas: 1, desativadas: 0 });
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, false, "volta a ativar quem retornou");
});

test("sincronizarContas só troca senhas com resetarSenhas", async () => {
  await sincronizarContas(auth, ["A"], "senha-demo");
  const antes = await auth.getUserByEmail(emailDoAssociado("A"));
  const r = await sincronizarContas(auth, ["A"], "outra-senha", { resetarSenhas: true });
  assert.deepEqual(r, { criadas: 0, atualizadas: 1, desativadas: 0 });
  const depois = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.notEqual(depois.passwordHash, antes.passwordHash);
});
