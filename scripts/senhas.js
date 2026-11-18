/**
 * Senhas individuais dos associados.
 * - gerarSenha(): 10 caracteres aleatórios (crypto), sem caracteres ambíguos
 *   (0/O, 1/l/I), sempre com letra e número. ~57 bits de entropia.
 * - paraCsv(): lista para o SINDHOSPE distribuir (abre direto no Excel pt-BR).
 * - gravarListaDeSenhas(): grava o CSV em segredos/senhas/, FORA do repositório.
 *   As senhas nunca são impressas no terminal.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const TAMANHO = 10;

function gerarSenha() {
  for (;;) {
    let s = "";
    for (let i = 0; i < TAMANHO; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (/[a-zA-Z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}

const campo = (v) => (/[;"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function paraCsv(linhas) {
  const corpo = linhas.map((l) => [l.cnes, l.estabelecimento, l.senha].map(campo).join(";"));
  return "\uFEFF" + ["cnes;estabelecimento;senha", ...corpo].join("\r\n") + "\r\n";
}

/** Grava a lista em <segredos>/senhas/senhas-AAAAMMDD-HHMMSS-<motivo>.csv e devolve o caminho. */
function gravarListaDeSenhas(pastaSegredos, linhas, motivo) {
  const pasta = path.join(pastaSegredos, "senhas");
  fs.mkdirSync(pasta, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const arquivo = path.join(pasta, `senhas-${carimbo}-${motivo}.csv`);
  fs.writeFileSync(arquivo, paraCsv(linhas), { mode: 0o600 });
  return arquivo;
}

module.exports = { gerarSenha, paraCsv, gravarListaDeSenhas, ALFABETO };
