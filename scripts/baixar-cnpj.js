#!/usr/bin/env node
/**
 * Dados abertos do CNPJ (Receita Federal) dos estabelecimentos de saúde de Pernambuco.
 *
 *   npm run baixar-cnpj -- 2026-11
 *
 * 1. Lê o cadastro do CNES (ST) da competência atual e pega o CNPJ de cada estabelecimento
 *    que é pessoa jurídica (PF_PJ = 3). CPF de pessoa física nunca é lido para fora do script.
 * 2. Baixa (se preciso) os arquivos Estabelecimentos*, Empresas*, Cnaes e Municipios da Receita
 *    para dados/brutos/receita/AAAA-MM/ (~6,5 GB, fora do git) e filtra só esses CNPJs.
 * 3. Grava dados/receita/AAAA-MM.json (pequeno, versionado).
 *
 * LGPD: o arquivo de sócios não é baixado; telefone e e-mail não são guardados; endereço só
 * de empresas (não de empresário individual, natureza 2135, que costuma ser a casa da pessoa).
 * O arquivo cobre TODOS os estabelecimentos PJ do CNES de PE, sem marcar quem é associado.
 * Fonte: https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9 (WebDAV público).
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const { dbcParaDbf, lerDbf } = require("./datasus");

const WEBDAV = "https://arquivos.receitafederal.gov.br/public.php/webdav";
const COMPARTILHAMENTO = "YggdBLfdninEJX9"; // usuário do WebDAV público (sem senha)
const PASTA_DADOS = path.resolve(__dirname, "../dados");
const PASTA_BRUTOS = path.join(PASTA_DADOS, "brutos");
const EMPRESARIO_INDIVIDUAL = "2135";

const SITUACOES = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
const PORTES = { "00": "Não informado", "01": "Microempresa", "03": "Empresa de pequeno porte", "05": "Demais (médio e grande porte)" };

const tarExe = () => (process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar");

function baixar(remoto, local) {
  if (fs.existsSync(local) && fs.statSync(local).size > 0) return;
  console.log(`Baixando ${remoto}...`);
  const r = spawnSync("curl", ["-f", "-s", "-S", "-C", "-", "--retry", "5", "-u", `${COMPARTILHAMENTO}:`, "-o", local, `${WEBDAV}/${remoto}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`Falhou o download de ${remoto}`);
}

/** Linha do CSV da Receita ("a";"b";...) -> campos. Todos os campos vêm entre aspas. */
function campos(linha) {
  const l = linha.trim();
  return l.slice(1, -1).split('";"');
}

/** Lê o(s) CSV(s) de dentro de um zip, linha a linha (latin1), sem extrair para o disco. */
async function cadaLinha(zip, fn) {
  const tar = spawn(tarExe(), ["-xOf", zip], { stdio: ["ignore", "pipe", "inherit"] });
  tar.stdout.setEncoding("latin1");
  const rl = readline.createInterface({ input: tar.stdout, crlfDelay: Infinity });
  let n = 0;
  for await (const linha of rl) {
    if (linha) fn(campos(linha));
    n++;
  }
  const codigo = await new Promise((ok) => (tar.exitCode !== null ? ok(tar.exitCode) : tar.on("close", ok)));
  if (codigo !== 0) throw new Error(`Não consegui ler ${zip} (tar saiu com ${codigo})`);
  return n;
}

const data = (d) => (/^\d{8}$/.test(d || "") && d !== "00000000" ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);

/** CNES -> CNPJ (14 dígitos) dos estabelecimentos pessoa jurídica, a partir do ST. */
function cnpjsDoCnes(arquivoSt) {
  const { registros } = lerDbf(dbcParaDbf(fs.readFileSync(arquivoSt)), { apenas: ["CNES", "PF_PJ", "CPF_CNPJ", "NAT_JUR"] });
  const porCnes = {};
  const natureza = {};
  for (const r of registros) {
    if (r.PF_PJ !== "3" || !/^\d{14}$/.test(r.CPF_CNPJ)) continue;
    porCnes[r.CNES] = r.CPF_CNPJ;
    natureza[r.CPF_CNPJ] = r.NAT_JUR;
  }
  return { porCnes, natureza };
}

/** Monta o registro de um estabelecimento da Receita (layout oficial do arquivo Estabelecimentos). */
function registroEstabelecimento(c, natureza, municipios) {
  const r = {
    matriz: c[3] === "1",
    nome_fantasia: c[4] || null,
    situacao: c[5],
    data_situacao: data(c[6]),
    inicio_atividade: data(c[10]),
    cnae: c[11],
    cnaes_secundarios: c[12] ? c[12].split(",").filter(Boolean) : [],
  };
  if (natureza !== EMPRESARIO_INDIVIDUAL) {
    r.endereco = {
      logradouro: [c[13], c[14]].filter(Boolean).join(" "),
      numero: c[15] || null,
      complemento: c[16] || null,
      bairro: c[17] || null,
      cep: c[18] || null,
      municipio: municipios[c[20]] || null,
      uf: c[19],
    };
  }
  return r;
}

async function main() {
  const referencia = process.argv[2];
  if (!/^\d{4}-\d{2}$/.test(referencia || "")) throw new Error("Informe o mês dos dados da Receita: npm run baixar-cnpj -- AAAA-MM");

  // Competência atual do CNES (a mesma do importador) e o ST bruto dela.
  const agregados = fs.readdirSync(PASTA_DADOS).filter((f) => /^cnes-\d{6}\.json$/.test(f)).sort();
  const competencia = agregados.at(-1).slice(5, 11);
  const arquivoSt = path.join(PASTA_BRUTOS, `STPE${competencia.slice(2)}.dbc`);
  if (!fs.existsSync(arquivoSt)) throw new Error(`Falta ${arquivoSt}. Rode antes: npm run baixar-cnes -- ${competencia}`);
  const { porCnes, natureza } = cnpjsDoCnes(arquivoSt);
  const alvo = new Set(Object.values(porCnes));
  const basicos = new Set([...alvo].map((c) => c.slice(0, 8)));
  console.log(`CNES ${competencia}: ${Object.keys(porCnes).length} estabelecimentos PJ, ${alvo.size} CNPJs.`);

  const pasta = path.join(PASTA_BRUTOS, "receita", referencia);
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = (nome) => {
    const local = path.join(pasta, `${nome}.zip`);
    baixar(`${referencia}/${nome}.zip`, local);
    return local;
  };

  const cnaes = {};
  await cadaLinha(arquivo("Cnaes"), (c) => (cnaes[c[0]] = c[1]));
  const municipios = {};
  await cadaLinha(arquivo("Municipios"), (c) => (municipios[c[0]] = c[1]));

  const porCnpj = {};
  for (let i = 0; i < 10; i++) {
    const n = await cadaLinha(arquivo(`Estabelecimentos${i}`), (c) => {
      const cnpj = c[0] + c[1] + c[2];
      if (alvo.has(cnpj)) porCnpj[cnpj] = registroEstabelecimento(c, natureza[cnpj], municipios);
    });
    console.log(`  Estabelecimentos${i}: ${n} linhas lidas, ${Object.keys(porCnpj).length} CNPJs encontrados até agora`);
  }
  const empresas = {};
  for (let i = 0; i < 10; i++) {
    await cadaLinha(arquivo(`Empresas${i}`), (c) => {
      if (basicos.has(c[0])) empresas[c[0]] = { razao_social: c[1], porte: c[5] };
    });
  }
  for (const [cnpj, r] of Object.entries(porCnpj)) {
    const e = empresas[cnpj.slice(0, 8)];
    if (e) Object.assign(r, e);
  }

  const usados = new Set(Object.values(porCnpj).flatMap((r) => [r.cnae, ...r.cnaes_secundarios]));
  const saida = {
    referencia,
    competencia_cnes: competencia,
    gerado_em: new Date().toISOString(),
    fonte: "Receita Federal — Dados abertos do CNPJ (Estabelecimentos, Empresas, Cnaes, Municipios); CNPJ dos estabelecimentos PJ do CNES/DATASUS de PE",
    rotulos: {
      cnae: Object.fromEntries([...usados].filter((c) => cnaes[c]).map((c) => [c, cnaes[c]])),
      situacao: SITUACOES,
      porte: PORTES,
    },
    cnes: porCnes,
    cnpj: porCnpj,
  };
  fs.mkdirSync(path.join(PASTA_DADOS, "receita"), { recursive: true });
  const destino = path.join(PASTA_DADOS, "receita", `${referencia}.json`);
  fs.writeFileSync(destino, JSON.stringify(saida));
  const semReceita = alvo.size - Object.keys(porCnpj).length;
  console.log(`Gravado ${destino}: ${Object.keys(porCnpj).length} CNPJs (${semReceita} do CNES não achados na Receita), ${(fs.statSync(destino).size / 1e6).toFixed(1)} MB`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Falha:", e.message);
    process.exit(1);
  });
}

module.exports = { campos, registroEstabelecimento, cnpjsDoCnes, SITUACOES, PORTES };
