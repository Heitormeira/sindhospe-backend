/**
 * Índice de busca do login: o Firestore não faz ILIKE, então cada nome vira
 * a lista dos prefixos (2+ letras) de cada palavra, já normalizados.
 * A mesma regra de normalização existe no frontend (src/app/busca.js).
 */

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function palavras(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

function gerarPrefixos(nome) {
  const prefixos = new Set();
  for (const palavra of palavras(nome)) {
    for (let i = 2; i <= palavra.length; i++) prefixos.add(palavra.slice(0, i));
  }
  return [...prefixos];
}

module.exports = { normalizar, palavras, gerarPrefixos };
