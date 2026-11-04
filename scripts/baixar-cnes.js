#!/usr/bin/env node
/**
 * Baixa do DATASUS os arquivos do CNES de Pernambuco que não estão no Neon,
 * agrega por estabelecimento e grava dados/cnes-AAAAMM.json (só contagens).
 *
 *   npm run baixar-cnes -- 202606
 *
 * Arquivos: EQ (equipamentos), PF (profissionais), SR (serviços especializados),
 * HB (habilitações) e o pacote de dicionários TAB_CNES.zip.
 * LGPD: o arquivo PF tem nomes e CNS; aqui eles só servem para contar
 * profissionais distintos e nunca são gravados.
 * Requer `curl` e `tar` (vêm com o Windows 10+, macOS e Linux).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { dbcParaDbf, lerDbf, lerCnv } = require("./datasus");
const { grupoProfissional } = require("./categorias");

const FTP = "ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_";
const PASTA_DADOS = path.resolve(__dirname, "../dados");
const PASTA_BRUTOS = path.join(PASTA_DADOS, "brutos");
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

function main() {
  const competencia = process.argv[2];
  if (!/^\d{6}$/.test(competencia || "")) throw new Error("Informe a competência: npm run baixar-cnes -- AAAAMM");
  const aamm = competencia.slice(2);
  fs.mkdirSync(path.join(PASTA_BRUTOS, "tab"), { recursive: true });

  const brutos = {};
  for (const tipo of ["EQ", "PF", "SR", "HB"]) {
    const nome = `${tipo}PE${aamm}.dbc`;
    baixar(`Dados/${tipo}/${nome}`, path.join(PASTA_BRUTOS, nome));
    brutos[tipo.toLowerCase()] = lerDbf(dbcParaDbf(fs.readFileSync(path.join(PASTA_BRUTOS, nome)))).registros;
    console.log(`  ${nome}: ${brutos[tipo.toLowerCase()].length} registros`);
  }

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

module.exports = { agregarCnes, limparRotulo };
