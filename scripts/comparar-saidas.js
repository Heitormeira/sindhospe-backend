#!/usr/bin/env node
/**
 * Compara duas saídas do modo seco: a do importador antigo (Neon) e a do novo (arquivos do DATASUS).
 *
 *   npm run comparar -- saida-neon saida
 *
 * Critério de aceite: nenhuma diferença INESPERADA. As esperadas são as mudanças de propósito:
 *   - associados: saem `indicadores`, `comparativo` (médias) e `evolucao` (leitos do ST);
 *     `estrutura` passa a vir do cadastro da competência atual (antes: tabela de 06/2024);
 *   - publico/visao-geral e publico/representatividade deixam de existir (nenhuma tela usa);
 *   - publico/tipos passa a contar a competência atual (antes: 06/2024);
 *   - publico/meta: muda a hora da importação.
 * Valores da identidade dos associados (CNPJ etc.) não são impressos, só o nome do campo.
 */
const fs = require("node:fs");
const path = require("node:path");

const CAMPOS_REMOVIDOS_ASSOCIADO = ["indicadores", "comparativo", "evolucao"];
const DOCS_REMOVIDOS = ["publico/visao-geral", "publico/representatividade"];
const DOCS_QUE_MUDAM = ["publico/tipos", "publico/meta"];

function listarDocs(pasta) {
  const docs = [];
  for (const colecao of fs.readdirSync(pasta)) {
    const dir = path.join(pasta, colecao);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) docs.push(`${colecao}/${f.slice(0, -5)}`);
  }
  return docs.sort();
}

const ler = (pasta, chave) => JSON.parse(fs.readFileSync(path.join(pasta, `${chave}.json`), "utf8"));

/** Primeira diferença entre dois valores (ignora ordem das chaves): { caminho, a, b } ou null. */
function primeiraDiferenca(a, b, caminho = "") {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object" || Array.isArray(a) !== Array.isArray(b)) {
    return { caminho: caminho || "(raiz)", a, b };
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return { caminho: `${caminho}.length`, a: a.length, b: b.length };
    for (let i = 0; i < a.length; i++) {
      const d = primeiraDiferenca(a[i], b[i], `${caminho}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = primeiraDiferenca(a[k], b[k], caminho ? `${caminho}.${k}` : k);
    if (d) return d;
  }
  return null;
}

const curto = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? "(ausente)" : s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

function comparar(pastaA, pastaB) {
  const a = new Set(listarDocs(pastaA));
  const b = new Set(listarDocs(pastaB));
  const inesperadas = [];
  const esperadas = { removidos: [], estrutura: 0, mudam: [] };
  const iguais = {};
  const conta = (chave) => (iguais[chave.split("/")[0]] = (iguais[chave.split("/")[0]] || 0) + 1);

  for (const chave of a) {
    if (b.has(chave)) continue;
    if (DOCS_REMOVIDOS.includes(chave)) esperadas.removidos.push(chave);
    else inesperadas.push({ chave, motivo: "só existe na saída antiga" });
  }
  for (const chave of b) if (!a.has(chave)) inesperadas.push({ chave, motivo: "só existe na saída nova" });

  for (const chave of [...a].filter((k) => b.has(k))) {
    const x = ler(pastaA, chave);
    const y = ler(pastaB, chave);
    if (DOCS_QUE_MUDAM.includes(chave)) {
      if (primeiraDiferenca(x, y)) esperadas.mudam.push(chave);
      else conta(chave);
      continue;
    }
    if (chave.startsWith("associados/")) {
      for (const campo of CAMPOS_REMOVIDOS_ASSOCIADO) delete x[campo];
      if (primeiraDiferenca(x.estrutura, y.estrutura)) esperadas.estrutura++;
      delete x.estrutura;
      delete y.estrutura;
      const d = primeiraDiferenca(x, y);
      if (d && d.caminho.startsWith("identidade")) inesperadas.push({ chave, motivo: `campo ${d.caminho} diferente (valor não exibido)` });
      else if (d) inesperadas.push({ chave, motivo: `${d.caminho}: antigo ${curto(d.a)} × novo ${curto(d.b)}` });
      else conta(chave);
      continue;
    }
    const d = primeiraDiferenca(x, y);
    if (d) inesperadas.push({ chave, motivo: `${d.caminho}: antigo ${curto(d.a)} × novo ${curto(d.b)}` });
    else conta(chave);
  }
  return { inesperadas, esperadas, iguais };
}

function main() {
  const [pastaA, pastaB] = process.argv.slice(2);
  if (!pastaA || !pastaB) throw new Error("Use: npm run comparar -- PASTA_ANTIGA PASTA_NOVA");
  const { inesperadas, esperadas, iguais } = comparar(path.resolve(pastaA), path.resolve(pastaB));

  console.log("Documentos iguais por coleção:", iguais);
  console.log("Diferenças esperadas:");
  console.log(`  documentos que deixam de existir: ${esperadas.removidos.join(", ") || "nenhum"}`);
  console.log(`  associados com \`estrutura\` atualizada (06/2024 -> competência atual): ${esperadas.estrutura}`);
  console.log(`  documentos que mudam de propósito: ${esperadas.mudam.join(", ") || "nenhum"}`);
  if (!inesperadas.length) {
    console.log("\nOK: nenhuma diferença inesperada.");
    return;
  }
  console.log(`\nDIFERENÇAS INESPERADAS: ${inesperadas.length}`);
  const porColecao = {};
  for (const d of inesperadas) (porColecao[d.chave.split("/")[0]] ??= []).push(d);
  for (const [colecao, lista] of Object.entries(porColecao)) {
    console.log(`  ${colecao}: ${lista.length}`);
    for (const d of lista.slice(0, 10)) console.log(`    ${d.chave} — ${d.motivo}`);
    if (lista.length > 10) console.log(`    ... e mais ${lista.length - 10}`);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("Falha:", e.message);
    process.exit(1);
  }
}

module.exports = { comparar, primeiraDiferenca };
