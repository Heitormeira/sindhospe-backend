#!/usr/bin/env node
/**
 * Baixa do DATASUS os arquivos do CNES de Pernambuco e grava, só com contagens:
 *   dados/cnes-AAAAMM.json        equipamentos, profissionais, serviços e habilitações (+ dicionários)
 *   dados/historico/AAAAMM.json   cadastro (ST) e leitos (LT): competência atual e série histórica
 *
 *   npm run baixar-cnes -- 202609                     só a competência
 *   npm run baixar-cnes -- 202609 --historico 202406  também ST e LT de cada trimestre desde 06/2024
 *                                                     (os que já existem em dados/historico não são baixados de novo)
 *
 * Arquivos: ST (cadastro), LT (leitos), EQ (equipamentos), PF (profissionais),
 * SR (serviços especializados), HB (habilitações) e o pacote de dicionários TAB_CNES.zip.
 * LGPD: do PF só são lidos CNES, CBO e o identificador do profissional, que serve
 * apenas para contar pessoas distintas e nunca é gravado (nomes nem são lidos).
 * Do ST só saem os campos listados em scripts/historico.js.
 * Requer `curl` e `tar` (vêm com o Windows 10+, macOS e Linux).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { dbcParaDbf, lerDbf, lerCnv } = require("./datasus");
const { grupoProfissional } = require("./categorias");
const { compactarHistorico, CAMPOS_LIDOS_ST, CAMPOS_LIDOS_LT } = require("./historico");

const FTP = "ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_";
const PASTA_DADOS = path.resolve(__dirname, "../dados");
const PASTA_BRUTOS = path.join(PASTA_DADOS, "brutos");
const PASTA_HISTORICO = path.join(PASTA_DADOS, "historico");
// Só os campos usados: menos memória e nenhum dado pessoal carregado à toa.
const CAMPOS_LIDOS = {
  EQ: ["CNES", "TIPEQUIP", "CODEQUIP", "QT_EXIST", "QT_USO", "IND_SUS"],
  PF: ["CNES", "CBO", "CNS_PROF", "CPF_PROF"],
  SR: ["CNES", "SERV_ESP"],
  HB: ["CNES", "SGRUPHAB"],
  ST: CAMPOS_LIDOS_ST,
  LT: CAMPOS_LIDOS_LT,
};
const DICIONARIOS = [
  "CNV/Equip_Tp.cnv", "CNV/equipam2507.cnv", "CNV/equipam2508.cnv", "CNV/Esp_leit.CNV", "CNV/tip1leit.cnv", "DBF/SRN_ORD_N.dbf",
];

function executar(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`Falhou: ${cmd} ${args.join(" ")}`);
}

function baixar(remoto, local) {
  if (fs.existsSync(local) && fs.statSync(local).size > 0) return;
  console.log(`Baixando ${remoto}...`);
  executar("curl", ["-f", "-s", "-S", "--retry", "3", "-o", local, `${FTP}/${remoto}`]);
}

const inteiro = (x) => parseInt(x, 10) || 0;

/** Extrai os dicionários do zip: bsdtar (Windows/macOS) ou unzip (Linux). Caminhos relativos de propósito. */
function extrairDicionarios() {
  const opcoes = { cwd: PASTA_BRUTOS, stdio: "ignore" };
  const bsdtar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  const tentativas = [
    [bsdtar, ["-xf", "TAB_CNES.zip", "-C", "tab", ...DICIONARIOS]],
    ["unzip", ["-o", "-q", "TAB_CNES.zip", ...DICIONARIOS, "-d", "tab"]],
  ];
  for (const [cmd, args] of tentativas) {
    if (spawnSync(cmd, args, opcoes).status === 0) return;
  }
  throw new Error("Não consegui extrair TAB_CNES.zip (precisa de tar com suporte a zip ou unzip).");
}

/** Agrega os registros brutos por CNES. Saída: { cnes: { eq, pf, sr, hb } }. */
function agregarCnes({ eq, pf, sr, hb }) {
  const out = {};
  const de = (cnes) => (out[cnes] ??= { eq: {}, pf: { t: 0, g: {} }, sr: [], hb: 0 });

  for (const r of eq) {
    const item = (de(r.CNES).eq[r.TIPEQUIP + r.CODEQUIP] ??= [0, 0, 0]);
    item[0] += inteiro(r.QT_EXIST);
    item[1] += inteiro(r.QT_USO);
    if (r.IND_SUS === "1") item[2] += inteiro(r.QT_EXIST);
  }

  const vistos = new Map(); // cnes -> { todos: Set, porGrupo: Map<grupo, Set> }
  for (const r of pf) {
    const v = vistos.get(r.CNES) || { todos: new Set(), porGrupo: new Map() };
    vistos.set(r.CNES, v);
    const pessoa = r.CNS_PROF || r.CPF_PROF;
    v.todos.add(pessoa);
    const g = grupoProfissional(r.CBO);
    if (!v.porGrupo.has(g)) v.porGrupo.set(g, new Set());
    v.porGrupo.get(g).add(pessoa);
  }
  for (const [cnes, v] of vistos) {
    const p = de(cnes).pf;
    p.t = v.todos.size;
    for (const [g, s] of v.porGrupo) p.g[g] = s.size;
  }

  const servicos = new Map();
  for (const r of sr) {
    if (!servicos.has(r.CNES)) servicos.set(r.CNES, new Set());
    servicos.get(r.CNES).add(r.SERV_ESP);
  }
  for (const [cnes, s] of servicos) de(cnes).sr = [...s].sort();

  const habs = new Map();
  for (const r of hb) {
    if (!habs.has(r.CNES)) habs.set(r.CNES, new Set());
    habs.get(r.CNES).add(r.SGRUPHAB);
  }
  for (const [cnes, s] of habs) de(cnes).hb = s.size;

  return out;
}

function limparRotulo(texto) {
  const t = String(texto).replace(/^\d+-/, "").trim();
  if (t !== t.toUpperCase()) return t;
  const frase = t.charAt(0) + t.slice(1).toLowerCase();
  return frase.replace(/\b(i{1,3}|iv|uti|uci|ucin|sus|aids|hiv|dst|caps|sadt|rx)\b/gi, (s) => s.toUpperCase());
}

function lerDicionarios() {
  const ler = (f) => fs.readFileSync(path.join(PASTA_BRUTOS, "tab", f));
  const limpar = (mapa) => Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, limparRotulo(v)]));
  return {
    // Equip_Tp por último: é o dicionário com acentos (os outros dois só cobrem códigos que faltam nele).
    equipamentos: limpar({ ...lerCnv(ler("CNV/equipam2507.cnv")), ...lerCnv(ler("CNV/equipam2508.cnv")), ...lerCnv(ler("CNV/Equip_Tp.cnv")) }),
    leitos_tipo: limpar(lerCnv(ler("CNV/tip1leit.cnv"))),
    leitos_especialidade: limpar(lerCnv(ler("CNV/Esp_leit.CNV"))),
    servicos: Object.fromEntries(lerDbf(ler("DBF/SRN_ORD_N.dbf")).registros.map((r) => [r.CHAVE, limparRotulo(r.DS_SERV)])),
  };
}

/** Baixa (se preciso) e lê um arquivo do CNES de PE: tipo "EQ", "ST"... */
function lerArquivo(tipo, competencia) {
  const nome = `${tipo}PE${competencia.slice(2)}.dbc`;
  baixar(`Dados/${tipo}/${nome}`, path.join(PASTA_BRUTOS, nome));
  const { registros } = lerDbf(dbcParaDbf(fs.readFileSync(path.join(PASTA_BRUTOS, nome))), { apenas: CAMPOS_LIDOS[tipo] });
  console.log(`  ${nome}: ${registros.length} registros`);
  return registros;
}

/** Competências trimestrais de `desde` até `ate` (de 3 em 3 meses, terminando em `ate`). */
function trimestres(desde, ate) {
  const meses = (c) => parseInt(c.slice(0, 4), 10) * 12 + parseInt(c.slice(4, 6), 10) - 1;
  const lista = [];
  for (let m = meses(ate); m >= meses(desde); m -= 3) {
    lista.unshift(`${Math.floor(m / 12)}${String((m % 12) + 1).padStart(2, "0")}`);
  }
  return lista;
}

/** Grava dados/historico/AAAAMM.json com o ST e o LT da competência. */
function gravarHistorico(competencia) {
  const h = compactarHistorico(competencia, { st: lerArquivo("ST", competencia), lt: lerArquivo("LT", competencia) });
  const saida = { ...h, gerado_em: new Date().toISOString(), fonte: "DATASUS/CNES — arquivos ST e LT de Pernambuco" };
  fs.mkdirSync(PASTA_HISTORICO, { recursive: true });
  const destino = path.join(PASTA_HISTORICO, `${competencia}.json`);
  fs.writeFileSync(destino, JSON.stringify(saida));
  const repetidos = h.st_repetidos.length ? `, ${h.st_repetidos.length} CNES repetido(s) no ST` : "";
  console.log(`Gravado ${destino} (${Object.keys(h.st).length} estabelecimentos, ${Object.keys(h.lt).length} com leitos${repetidos})`);
}

function main() {
  const args = process.argv.slice(2);
  const competencia = args[0];
  if (!/^\d{6}$/.test(competencia || "")) throw new Error("Informe a competência: npm run baixar-cnes -- AAAAMM");
  const i = args.indexOf("--historico");
  const desde = i >= 0 ? args[i + 1] : null;
  if (i >= 0 && !/^\d{6}$/.test(desde || "")) throw new Error("Use: npm run baixar-cnes -- AAAAMM --historico AAAAMM");
  fs.mkdirSync(path.join(PASTA_BRUTOS, "tab"), { recursive: true });

  // Série histórica: ST e LT de cada trimestre anterior que ainda não está em dados/historico.
  if (desde) {
    for (const c of trimestres(desde, competencia).slice(0, -1)) {
      if (!fs.existsSync(path.join(PASTA_HISTORICO, `${c}.json`))) gravarHistorico(c);
    }
  }
  gravarHistorico(competencia);

  const brutos = {};
  for (const tipo of ["EQ", "PF", "SR", "HB"]) brutos[tipo.toLowerCase()] = lerArquivo(tipo, competencia);

  const zip = path.join(PASTA_BRUTOS, "TAB_CNES.zip");
  baixar("Auxiliar/TAB_CNES.zip", zip);
  extrairDicionarios();

  const saida = {
    competencia,
    gerado_em: new Date().toISOString(),
    fonte: "DATASUS/CNES — arquivos EQ, PF, SR e HB de Pernambuco; dicionários TAB_CNES",
    rotulos: lerDicionarios(),
    estabelecimentos: agregarCnes(brutos),
  };
  const destino = path.join(PASTA_DADOS, `cnes-${competencia}.json`);
  fs.writeFileSync(destino, JSON.stringify(saida));
  console.log(`Gravado ${destino} (${Object.keys(saida.estabelecimentos).length} estabelecimentos, ${(fs.statSync(destino).size / 1e6).toFixed(1)} MB)`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("Falha:", e.message);
    process.exit(1);
  }
}

module.exports = { agregarCnes, limparRotulo, trimestres };
