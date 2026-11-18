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

// Login de verdade no emulador do Auth (confere a senha, não só o hash).
async function entra(email, senha) {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  return r.ok;
}

let n = 0;
const senhaFalsa = () => `Senha-${++n}x9`;

test("sincronizarContas cria contas com senha individual, devolve a lista, não mexe em quem já está certo, desativa e reativa", async () => {
  let r = await sincronizarContas(auth, ["A", "B"], { gerarSenha: senhaFalsa });
  assert.equal(r.criadas, 2);
  assert.equal(r.novasSenhas.length, 2);
  assert.notEqual(r.novasSenhas[0].senha, r.novasSenhas[1].senha, "cada conta com a sua senha");
  const senhaA = r.novasSenhas.find((x) => x.cnes === "A").senha;
  assert.equal(await entra(emailDoAssociado("A"), senhaA), true);
  assert.equal(await entra(emailDoAssociado("A"), r.novasSenhas.find((x) => x.cnes === "B").senha), false, "senha de B não abre A");

  const antes = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.deepEqual(antes.customClaims, { cnes: "A" });

  // Reimportar não pode trocar senha nem revogar sessões de quem está logado.
  r = await sincronizarContas(auth, ["A", "B"], { gerarSenha: senhaFalsa });
  assert.deepEqual(r, { criadas: 0, atualizadas: 0, desativadas: 0, novasSenhas: [] });
  const depois = await auth.getUserByEmail(emailDoAssociado("A"));
  assert.equal(depois.tokensValidAfterTime, antes.tokensValidAfterTime);
  assert.equal(await entra(emailDoAssociado("A"), senhaA), true);

  r = await sincronizarContas(auth, ["A"], { gerarSenha: senhaFalsa });
  assert.equal(r.desativadas, 1);
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, true);

  r = await sincronizarContas(auth, ["A", "B"], { gerarSenha: senhaFalsa });
  assert.deepEqual([r.criadas, r.atualizadas, r.desativadas], [0, 1, 0]);
  assert.equal((await auth.getUserByEmail(emailDoAssociado("B"))).disabled, false, "volta a ativar quem retornou");
});

test("redefinirSenhas troca só as contas pedidas, invalida a senha antiga e ignora CNES sem conta", async () => {
  const { redefinirSenhas } = require("../scripts/contas");
  const r0 = await sincronizarContas(auth, ["A", "B"], { gerarSenha: senhaFalsa });
  const antigaA = r0.novasSenhas.find((x) => x.cnes === "A").senha;
  const antigaB = r0.novasSenhas.find((x) => x.cnes === "B").senha;

  const r = await redefinirSenhas(auth, ["A", "NAOEXISTE"], { gerarSenha: senhaFalsa });
  assert.deepEqual(r.semConta, ["NAOEXISTE"]);
  assert.equal(r.redefinidas.length, 1);
  assert.equal(await entra(emailDoAssociado("A"), antigaA), false, "senha antiga deixa de valer");
  assert.equal(await entra(emailDoAssociado("A"), r.redefinidas[0].senha), true);
  assert.equal(await entra(emailDoAssociado("B"), antigaB), true, "B não foi tocada");
});

test("conta do sindicato: criada com perfil, sem cnes, e não é desativada pela sincronização dos associados", async () => {
  const { sincronizarContaSindicato, EMAIL_SINDICATO } = require("../scripts/contas");
  assert.equal(await sincronizarContaSindicato(auth, "senha-sindicato"), "criada");
  const u = await auth.getUserByEmail(EMAIL_SINDICATO);
  assert.deepEqual(u.customClaims, { perfil: "sindicato" });
  assert.equal(await sincronizarContaSindicato(auth, "senha-sindicato"), "sem_mudanca");

  const r = await sincronizarContas(auth, ["A"], { gerarSenha: senhaFalsa });
  assert.equal(r.criadas, 1);
  assert.equal(r.desativadas, 0);
  assert.equal((await auth.getUserByEmail(EMAIL_SINDICATO)).disabled, false);

  await auth.setCustomUserClaims(u.uid, { cnes: "X" });
  assert.equal(await sincronizarContaSindicato(auth, "senha-sindicato"), "atualizada");
  assert.deepEqual((await auth.getUserByEmail(EMAIL_SINDICATO)).customClaims, { perfil: "sindicato" });
});

test("gravarDocumentos gerencia a coleção sindicato", async () => {
  const docs = base(20);
  docs.set("sindicato/painel", { resumo: { associados: 20 } });
  await gravarDocumentos(firestore, docs);
  assert.equal((await firestore.doc("sindicato/painel").get()).data().resumo.associados, 20);
  docs.delete("sindicato/painel");
  docs.set("sindicato/velho", {});
  await gravarDocumentos(firestore, docs);
  assert.equal((await firestore.doc("sindicato/painel").get()).exists, false);
});
