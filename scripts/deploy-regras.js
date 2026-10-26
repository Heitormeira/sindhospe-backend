#!/usr/bin/env node
/**
 * Publica firestore.rules e firestore.indexes.json no projeto sindhospe-portal,
 * autenticando com a chave da conta de serviço (../segredos/firebase-admin.json).
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { carregarSegredos } = require("./segredos");

const { credencialPath } = carregarSegredos(undefined, { exigirSenha: false });
const r = spawnSync(
  "npx",
  ["-y", "firebase-tools@15", "deploy", "--only", "firestore:rules,firestore:indexes", "--project", "sindhospe-portal", "--non-interactive"],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credencialPath },
  }
);
process.exit(r.status ?? 1);
