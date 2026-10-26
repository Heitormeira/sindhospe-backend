/**
 * Gravação dos documentos no Firestore (Admin SDK).
 * - grava em lotes de no máximo 400 operações;
 * - apaga documentos de coleções gerenciadas que não vieram nesta importação
 *   (ex.: associado que saiu do sindicato), para o Firestore espelhar o Neon.
 */
const COLECOES_GERENCIADAS = ["associados", "busca", "mercado", "publico"];
const TAMANHO_LOTE = 400;

async function emLotes(firestore, operacoes) {
  for (let i = 0; i < operacoes.length; i += TAMANHO_LOTE) {
    const lote = firestore.batch();
    for (const op of operacoes.slice(i, i + TAMANHO_LOTE)) op(lote);
    await lote.commit();
  }
}

async function gravarDocumentos(firestore, docs) {
  const gravacoes = [...docs].map(([chave, dados]) => (lote) => lote.set(firestore.doc(chave), dados));
  await emLotes(firestore, gravacoes);

  const remocoes = [];
  for (const colecao of COLECOES_GERENCIADAS) {
    const existentes = await firestore.collection(colecao).listDocuments();
    for (const ref of existentes) {
      if (!docs.has(`${colecao}/${ref.id}`)) remocoes.push((lote) => lote.delete(ref));
    }
  }
  await emLotes(firestore, remocoes);

  return { gravados: gravacoes.length, apagados: remocoes.length };
}

module.exports = { gravarDocumentos, COLECOES_GERENCIADAS };
