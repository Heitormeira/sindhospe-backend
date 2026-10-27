/**
 * Índice de busca do login. O Firestore não faz ILIKE, então cada nome vira a
 * lista dos prefixos (2+ caracteres) das FRASES que começam em cada palavra:
 *   "Hospital Santa Joana" -> "ho".."hospital santa joana", "sa".."santa joana", "jo".."joana"
 * A busca vira um array-contains exato com o termo digitado normalizado, e o
 * limit(8) do Firestore já se aplica ao resultado filtrado (como o LIMIT 8 da API).
 * A mesma regra existe no frontend (src/app/busca.mjs) — manter as duas iguais.
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
  const lista = palavras(nome);
  const prefixos = new Set();
  for (let inicio = 0; inicio < lista.length; inicio++) {
    const frase = lista.slice(inicio).join(" ");
    for (let i = 2; i <= frase.length; i++) {
      if (frase[i - 1] !== " ") prefixos.add(frase.slice(0, i));
    }
  }
  return [...prefixos];
}

/** O que o usuário digitou, no formato do índice; null se tiver menos de 2 caracteres úteis. */
function termoDeBusca(digitado) {
  const termo = palavras(digitado).join(" ");
  return termo.length >= 2 ? termo : null;
}

module.exports = { normalizar, palavras, gerarPrefixos, termoDeBusca };
