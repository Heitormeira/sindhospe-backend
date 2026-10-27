#!/usr/bin/env node
/**
 * Paridade: compara os documentos gerados por `npm run importar:seco` (pasta ./saida)
 * com as respostas da API Express original (server.js, sem alterações), rodando
 * localmente contra o mesmo Neon. Critério de aceite: 0 divergências.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { carregarSegredos } = require("./segredos");
const { emParalelo } = require("./documentos");
const { palavras, termoDeBusca } = require("./prefixos");

const PORTA = 3099;
const API = `http://localhost:${PORTA}/api`;
const SAIDA = path.resolve(__dirname, "../saida");
const TERMOS_BUSCA = ["ho", "hosp", "clin", "real", "sao", "santa", "memorial", "lab", "imip", "unimed",
  "centro", "med", "maternidade", "oftalmo", "cardio", "rec", "olinda", "caruaru", "petrolina", "di"];

const lerDoc = (chave) => JSON.parse(fs.readFileSync(path.join(SAIDA, `${chave}.json`), "utf8"));
const listar = (colecao) => fs.readdirSync(path.join(SAIDA, colecao)).map((f) => f.replace(/\.json$/, ""));

async function get(rota) {
  const r = await fetch(API + rota);
  if (!r.ok) throw new Error(`${rota} -> HTTP ${r.status}`);
  return r.json();
}

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try { await get("/health"); return; } catch { await new Promise((ok) => setTimeout(ok, 1000)); }
  }
  throw new Error("server.js não respondeu em 120s");
}

// Sorteio determinístico (semente fixa) para a amostra de mercado por município.
function amostra(lista, n, semente = 42) {
  let s = semente;
  const aleatorio = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

async function main() {
  if (!fs.existsSync(SAIDA)) throw new Error("Rode antes: npm run importar:seco");
  const { databaseUrl } = carregarSegredos(undefined, { exigirSenha: false });

  const servidor = spawn(process.execPath, [path.resolve(__dirname, "../server.js")], {
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(PORTA) },
    stdio: "ignore",
  });
  const divergencias = [];
  let comparados = 0;
  const comparar = (nome, real, esperado) => {
    comparados++;
    try { assert.deepStrictEqual(real, JSON.parse(JSON.stringify(esperado))); }
    catch (e) { divergencias.push(`${nome}\n${e.message.split("\n").slice(0, 25).join("\n")}`); }
  };

  try {
    await esperarServidor();

    // Rotas públicas
    comparar("publico/visao-geral", lerDoc("publico/visao-geral"), await get("/visao-geral"));
    comparar("publico/representatividade", lerDoc("publico/representatividade"), await get("/representatividade"));
    comparar("publico/municipios", lerDoc("publico/municipios").lista, await get("/municipios"));
    comparar("publico/tipos", lerDoc("publico/tipos").lista, await get("/tipos"));

    // Associados: ficha + evolução, todos
    const associados = listar("associados");
    await emParalelo(associados, 4, async (cnes) => {
      const { evolucao, ...ficha } = lerDoc(`associados/${cnes}`);
      comparar(`associados/${cnes} (ficha)`, ficha, await get(`/estabelecimento/${cnes}`));
      comparar(`associados/${cnes} (evolucao)`, evolucao, await get(`/evolucao/${cnes}`));
    });

    // Mercado: todos os do estado + 50 combinações de município sorteadas
    const mercado = listar("mercado");
    const estado = mercado.filter((id) => id.endsWith("_PE"));
    const municipios = amostra(mercado.filter((id) => !id.endsWith("_PE")), 50);
    await emParalelo([...estado, ...municipios], 4, async (id) => {
      const [tipo, municipio] = id.split("_");
      const rota = municipio === "PE" ? `/mercado?tipo=${tipo}` : `/mercado?tipo=${tipo}&municipio=${municipio}`;
      comparar(`mercado/${id}`, lerDoc(`mercado/${id}`).serie, await get(rota));
    });

    // Busca: simula o Firestore (array-contains + limit 8, ordem por id = CNES, como
    // o ORDER BY cnes LIMIT 8 da API). Termos: lista fixa + as duas primeiras
    // palavras do nome de cada associado (o caso que antes falhava).
    // A API usa ILIKE '%termo%' (mais amplo); comparamos com os resultados dela em
    // que o termo começa numa palavra, quando ela devolve menos de 8.
    const busca = listar("busca").map((cnes) => ({ cnes, ...lerDoc(`busca/${cnes}`) })).sort((a, b) => (a.cnes < b.cnes ? -1 : 1));
    const pesquisar = (termo) => busca.filter((b) => b.prefixos.includes(termoDeBusca(termo))).slice(0, 8).map((b) => b.cnes);
    const comecaEmPalavra = (nome, termo) => (" " + palavras(nome).join(" ")).includes(" " + termoDeBusca(termo));
    const termos = [...TERMOS_BUSCA, ...busca.map((b) => palavras(b.nome_fantasia).slice(0, 2).join(" "))];
    for (const termo of new Set(termos)) {
      if (!termoDeBusca(termo)) continue;
      const nosso = new Set(pesquisar(termo));
      comparados++;
      // 1) quem tem esse começo de nome aparece, se couber nos 8
      const todos = busca.filter((b) => comecaEmPalavra(b.nome_fantasia, termo));
      if (todos.length <= 8) {
        const faltando = todos.filter((b) => !nosso.has(b.cnes)).map((b) => b.cnes);
        if (faltando.length) divergencias.push(`busca "${termo}": faltam ${faltando.join(", ")}`);
      }
      // 2) nada que a API devolvia (começando em palavra) some
      const api = await get(`/estabelecimentos/buscar?q=${encodeURIComponent(termo)}`);
      if (api.length >= 8) continue;
      const esperado = api.filter((a) => comecaEmPalavra(a.nome_fantasia, termo)).map((a) => a.cnes);
      const faltandoApi = esperado.filter((cnes) => !nosso.has(cnes));
      if (faltandoApi.length) divergencias.push(`busca "${termo}" (vs API): faltam ${faltandoApi.join(", ")}`);
    }
  } finally {
    servidor.kill();
  }

  console.log(`Comparações: ${comparados}`);
  if (divergencias.length) {
    console.log(`${divergencias.length} divergência(s):\n`);
    console.log(divergencias.slice(0, 10).join("\n\n"));
    process.exit(1);
  }
  console.log("0 divergências");
}

main().catch((e) => { console.error("Falha na paridade:", e.message); process.exit(1); });
