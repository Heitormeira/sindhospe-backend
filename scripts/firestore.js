/**
 * Gravação dos documentos no Firestore (Admin SDK).
 * - trava de sanidade ANTES de gravar: se a importação trouxer bem menos
 *   associados do que já existem (ex.: Neon respondeu vazio), aborta sem tocar em
 *   nada, a menos que { forcar: true } (npm run importar -- --forcar);
 * - grava em lotes de no máximo 400 operações;
 * - apaga documentos de coleções gerenciadas que não vieram nesta importação.
 */
const COLECOES_GERENCIADAS = ["associados", "busca", "mercado", "publico"];
const TAMANHO_LOTE = 400;
const MINIMO_RELATIVO = 0.9; // a nova importação precisa ter >= 90% dos associados atuais

async function emLotes(firestore, operacoes) {
  for (let i = 0; i < operacoes.length; i += TAMANHO_LOTE) {
    const lote = firestore.batch();
    for (const op of operacoes.slice(i, i + TAMANHO_LOTE)) op(lote);
    await lote.commit();
  }
}

function contarAssociados(docs) {
  let n = 0;
  for (const chave of docs.keys()) if (chave.startsWith("associados/")) n++;
  return n;
}

async function gravarDocumentos(firestore, docs, { forcar = false } = {}) {
  const existentes = {};
  for (const colecao of COLECOES_GERENCIADAS) {
    existentes[colecao] = await firestore.collection(colecao).listDocuments();
  }

  const novos = contarAssociados(docs);
  const atuais = existentes.associados.length;
  if (!forcar && (novos === 0 || novos < atuais * MINIMO_RELATIVO)) {
    throw new Error(
      `Importação trouxe ${novos} associados, mas o Firestore tem ${atuais}. ` +
        "Abortado sem alterar nada. Se a redução for real, rode de novo com --forcar."
    );
  }

  const gravacoes = [...docs].map(([chave, dados]) => (lote) => lote.set(firestore.doc(chave), dados));
  await emLotes(firestore, gravacoes);

  const remocoes = [];
  for (const colecao of COLECOES_GERENCIADAS) {
    for (const ref of existentes[colecao]) {
      if (!docs.has(`${colecao}/${ref.id}`)) remocoes.push((lote) => lote.delete(ref));
    }
  }
  await emLotes(firestore, remocoes);

  return { gravados: gravacoes.length, apagados: remocoes.length };
}

module.exports = { gravarDocumentos, COLECOES_GERENCIADAS };
