const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { carregarSegredos } = require("../scripts/segredos");

const URL_FALSA = "postgresql://usuario:segredo123@exemplo.neon.tech/banco";

function pastaCom({ env, credencial = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "segredos-"));
  if (env !== undefined) fs.writeFileSync(path.join(dir, ".env"), env);
  if (credencial) fs.writeFileSync(path.join(dir, "firebase-admin.json"), "{}");
  return dir;
}

test("lê DATABASE_URL sem aspas", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\n` });
  const s = carregarSegredos(dir);
  assert.equal(s.databaseUrl, URL_FALSA);
  assert.equal(s.senhaDemo, "abcdef");
  assert.equal(s.credencialPath, path.join(dir, "firebase-admin.json"));
});

test("lê valores com aspas e CRLF", () => {
  const dir = pastaCom({ env: `DATABASE_URL="${URL_FALSA}"\r\nSENHA_DEMO='abcdefg'\r\n` });
  const s = carregarSegredos(dir);
  assert.equal(s.databaseUrl, URL_FALSA);
  assert.equal(s.senhaDemo, "abcdefg");
});

test("erro cita SENHA_DEMO quando ausente", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\n` });
  assert.throws(() => carregarSegredos(dir), (e) => /SENHA_DEMO/.test(e.message) && !e.message.includes("segredo123"));
});

test("erro cita SENHA_DEMO quando tem menos de 6 caracteres", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=12345\n` });
  assert.throws(() => carregarSegredos(dir), /SENHA_DEMO/);
});

test("exigirSenha=false aceita SENHA_DEMO curta ou ausente", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=12345\n` });
  assert.equal(carregarSegredos(dir, { exigirSenha: false }).databaseUrl, URL_FALSA);
});

test("DATABASE_URL só é exigida com exigirBanco (o importador não usa mais o Neon)", () => {
  const dir = pastaCom({ env: `SENHA_DEMO=abcdef\n` });
  assert.equal(carregarSegredos(dir).databaseUrl, undefined);
  assert.throws(() => carregarSegredos(dir, { exigirBanco: true }), /DATABASE_URL/);
});

test("modo seco: funciona sem .env e sem chave do Firebase", () => {
  const dir = pastaCom({ env: undefined, credencial: false });
  const s = carregarSegredos(dir, { exigirSenha: false, exigirCredencial: false });
  assert.equal(s.associadosPath, path.join(dir, "associados.json"));
  assert.throws(() => carregarSegredos(dir, { exigirSenha: false }), /firebase-admin\.json/);
});

test("erro cita firebase-admin.json quando a chave falta", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\n`, credencial: false });
  assert.throws(() => carregarSegredos(dir), (e) => /firebase-admin\.json/.test(e.message) && !e.message.includes("segredo123"));
});

test("SENHA_SINDICATO é opcional, mas se vier precisa de 8+ caracteres", () => {
  const sem = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\n` });
  assert.equal(carregarSegredos(sem).senhaSindicato, undefined);
  const ok = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\nSENHA_SINDICATO=abcdefgh\n` });
  assert.equal(carregarSegredos(ok).senhaSindicato, "abcdefgh");
  const curta = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\nSENHA_SINDICATO=abc\n` });
  assert.throws(() => carregarSegredos(curta), (e) => /SENHA_SINDICATO/.test(e.message) && !e.message.includes("abc\n"));
});
