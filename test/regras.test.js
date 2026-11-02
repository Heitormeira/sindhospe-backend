/**
 * Testes das regras do Firestore. Rodam no emulador:
 *   npm run test:regras
 */
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc, getDoc, setDoc, addDoc, collection, getDocs, query, where, limit, serverTimestamp, Timestamp,
} = require("firebase/firestore");

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sindhospe",
    firestore: { rules: fs.readFileSync(process.env.REGRAS || path.resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});

after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "associados/A"), { identidade: { nome_fantasia: "Hospital A" } });
    await setDoc(doc(db, "associados/B"), { identidade: { nome_fantasia: "Hospital B" } });
    await setDoc(doc(db, "publico/visao-geral"), { total_leitos: 1 });
    await setDoc(doc(db, "mercado/05_PE"), { serie: [] });
    await setDoc(doc(db, "busca/A"), { nome_fantasia: "Hospital A", prefixos: ["ho", "hos", "hosp"] });
    await setDoc(doc(db, "solicitacoes_revisao/x"), { cnes: "A", nome: "Fulano" });
  });
});

const comoA = () => env.authenticatedContext("uidA", { cnes: "A" }).firestore();
const semLogin = () => env.unauthenticatedContext().firestore();
const buscaHosp = (db, n) => {
  const q = [where("prefixos", "array-contains", "hosp")];
  if (n !== undefined) q.push(limit(n));
  return getDocs(query(collection(db, "busca"), ...q));
};

// --- associados ---
test("associado A lê o próprio documento", async () => { await assertSucceeds(getDoc(doc(comoA(), "associados/A"))); });
test("associado A não lê o documento de B", async () => { await assertFails(getDoc(doc(comoA(), "associados/B"))); });
test("ninguém lista a coleção associados", async () => { await assertFails(getDocs(collection(comoA(), "associados"))); });
test("logado sem claim cnes não lê associados", async () => {
  const db = env.authenticatedContext("semClaim").firestore();
  await assertFails(getDoc(doc(db, "associados/A")));
});
test("conta criada por fora (sem claim cnes) não lê publico nem mercado", async () => {
  const db = env.authenticatedContext("semClaim").firestore();
  await assertFails(getDoc(doc(db, "publico/visao-geral")));
  await assertFails(getDoc(doc(db, "mercado/05_PE")));
});

// --- sem login ---
test("sem login não lê associados", async () => { await assertFails(getDoc(doc(semLogin(), "associados/A"))); });
test("sem login não lê publico", async () => { await assertFails(getDoc(doc(semLogin(), "publico/visao-geral"))); });
test("sem login não lê mercado", async () => { await assertFails(getDoc(doc(semLogin(), "mercado/05_PE"))); });

// --- logado ---
test("logado lê publico", async () => { await assertSucceeds(getDoc(doc(comoA(), "publico/visao-geral"))); });
test("logado lê mercado", async () => { await assertSucceeds(getDoc(doc(comoA(), "mercado/05_PE"))); });
test("logado lê mercado inexistente (combinação sem dados)", async () => {
  await assertSucceeds(getDoc(doc(comoA(), "mercado/99_999999")));
});

// --- busca ---
test("sem login busca com limit(8)", async () => { await assertSucceeds(buscaHosp(semLogin(), 8)); });
test("busca com limit(9) é negada", async () => { await assertFails(buscaHosp(semLogin(), 9)); });
test("busca sem limite é negada", async () => { await assertFails(buscaHosp(semLogin())); });
test("get direto em busca/A é negado", async () => { await assertFails(getDoc(doc(semLogin(), "busca/A"))); });

// --- solicitacoes_revisao ---
const solicitacoes = (db) => collection(db, "solicitacoes_revisao");
const valida = (extra = {}) => ({ cnes: "A", nome: "Fulano", mensagem: "Leitos desatualizados", criado_em: serverTimestamp(), ...extra });

test("cria solicitação válida", async () => { await assertSucceeds(addDoc(solicitacoes(comoA()), valida())); });
test("cria solicitação sem mensagem", async () => {
  const { mensagem, ...semMensagem } = valida();
  await assertSucceeds(addDoc(solicitacoes(comoA()), semMensagem));
});
test("solicitação com cnes de outro é negada", async () => { await assertFails(addDoc(solicitacoes(comoA()), valida({ cnes: "B" }))); });
test("solicitação com campo extra é negada", async () => { await assertFails(addDoc(solicitacoes(comoA()), valida({ admin: true }))); });
test("solicitação com nome vazio é negada", async () => { await assertFails(addDoc(solicitacoes(comoA()), valida({ nome: "" }))); });
test("solicitação com mensagem de 2001 caracteres é negada", async () => {
  await assertFails(addDoc(solicitacoes(comoA()), valida({ mensagem: "x".repeat(2001) })));
});
test("solicitação com criado_em forjado é negada", async () => {
  await assertFails(addDoc(solicitacoes(comoA()), valida({ criado_em: Timestamp.fromDate(new Date("2020-01-01")) })));
});
test("solicitação sem login é negada", async () => { await assertFails(addDoc(solicitacoes(semLogin()), valida())); });
test("ninguém lê solicitações pelo app", async () => { await assertFails(getDoc(doc(comoA(), "solicitacoes_revisao/x"))); });

// --- perfil do sindicato (claim perfil = "sindicato") ---
const comoSindicato = () => env.authenticatedContext("uidSind", { perfil: "sindicato" }).firestore();
const seedPainel = () =>
  env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "sindicato/painel"), { resumo: {} }); });

test("sindicato lê o painel", async () => { await seedPainel(); await assertSucceeds(getDoc(doc(comoSindicato(), "sindicato/painel"))); });
test("associado não lê o painel do sindicato", async () => { await seedPainel(); await assertFails(getDoc(doc(comoA(), "sindicato/painel"))); });
test("sem login não lê o painel do sindicato", async () => { await seedPainel(); await assertFails(getDoc(doc(semLogin(), "sindicato/painel"))); });
test("perfil forjado diferente de sindicato não lê o painel", async () => {
  await seedPainel();
  const db = env.authenticatedContext("x", { perfil: "admin" }).firestore();
  await assertFails(getDoc(doc(db, "sindicato/painel")));
});
test("sindicato lê a ficha de qualquer associado, publico e mercado", async () => {
  const db = comoSindicato();
  await assertSucceeds(getDoc(doc(db, "associados/A")));
  await assertSucceeds(getDoc(doc(db, "associados/B")));
  await assertSucceeds(getDoc(doc(db, "publico/visao-geral")));
  await assertSucceeds(getDoc(doc(db, "mercado/05_PE")));
});
test("sindicato lista as solicitações de revisão", async () => { await assertSucceeds(getDocs(solicitacoes(comoSindicato()))); });
test("associado não lista as solicitações de revisão", async () => { await assertFails(getDocs(solicitacoes(comoA()))); });
test("sindicato não grava nada", async () => {
  const db = comoSindicato();
  await assertFails(setDoc(doc(db, "sindicato/painel"), { x: 1 }));
  await assertFails(setDoc(doc(db, "associados/A"), { x: 1 }));
  await assertFails(addDoc(solicitacoes(db), valida({ cnes: "A" })));
});
