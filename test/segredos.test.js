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

test("erro cita DATABASE_URL quando ausente", () => {
  const dir = pastaCom({ env: `SENHA_DEMO=abcdef\n` });
  assert.throws(() => carregarSegredos(dir), /DATABASE_URL/);
});

test("erro cita firebase-admin.json quando a chave falta", () => {
  const dir = pastaCom({ env: `DATABASE_URL=${URL_FALSA}\nSENHA_DEMO=abcdef\n`, credencial: false });
  assert.throws(() => carregarSegredos(dir), (e) => /firebase-admin\.json/.test(e.message) && !e.message.includes("segredo123"));
});
