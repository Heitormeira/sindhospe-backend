/**
 * Leitura dos arquivos públicos do CNES/DATASUS sem dependências nativas:
 *   .dbc = DBF com o corpo comprimido em PKWARE DCL (implode)
 *   .dbf = dBase III
 *   .cnv = dicionário do TabWin (código -> rótulo)
 */
const { explode } = require("node-pkware/simple");

/** DBC -> DBF: o cabeçalho do DBF vem aberto, seguido de 4 bytes de CRC e do corpo comprimido. */
function dbcParaDbf(buf) {
  const tamCab = buf.readUInt16LE(8);
  const comprimido = buf.subarray(tamCab + 4);
  const ab = comprimido.buffer.slice(comprimido.byteOffset, comprimido.byteOffset + comprimido.length);
  return Buffer.concat([buf.subarray(0, tamCab), Buffer.from(explode(ab))]);
}

/**
 * DBF (dBase III) -> { campos, registros }, com textos sem espaços nas pontas.
 * `apenas`: lista de campos a ler (o ST tem mais de 200 colunas; ler só as usadas
 * economiza memória e deixa de fora dados que não interessam, como CPF/CNPJ e CEP).
 */
function lerDbf(buf, { filtro, apenas } = {}) {
  const n = buf.readUInt32LE(4);
  const tamCab = buf.readUInt16LE(8);
  const tamReg = buf.readUInt16LE(10);
  const campos = [];
  // Os arquivos do DATASUS nem sempre trazem o terminador 0x0D da lista de campos
  // (o ST não traz): o limite é o tamanho do cabeçalho.
  let desloc = 1; // 1º byte do registro = marca de apagado
  for (let p = 32; p + 32 <= tamCab && buf[p] !== 0x0d; p += 32) {
    const c = { nome: buf.toString("latin1", p, p + 11).replace(/\0.*$/s, ""), tam: buf[p + 16], desloc };
    desloc += c.tam;
    campos.push(c);
  }
  const lidos = apenas ? campos.filter((c) => apenas.includes(c.nome)) : campos;
  const registros = [];
  for (let i = 0; i < n; i++) {
    const p = tamCab + i * tamReg;
    if (buf[p] === 0x2a) continue; // registro apagado
    const r = {};
    for (const c of lidos) r[c.nome] = buf.toString("latin1", p + c.desloc, p + c.desloc + c.tam).trim();
    if (!filtro || filtro(r)) registros.push(r);
  }
  return { campos: campos.map((c) => c.nome), registros };
}

/**
 * CNV do TabWin -> { codigo: rotulo }.
 * Linhas: "<índice>  <rótulo com largura fixa>  <códigos>", códigos separados por vírgula,
 * com faixas "a-b". Códigos negativos/ignorados ("-9999") são descartados.
 */
function lerCnv(buf) {
  const mapa = {};
  const linhas = buf.toString("latin1").split(/\r?\n/).slice(1);
  for (const linha of linhas) {
    const m = linha.match(/^\s*\d+\s{2}(.+?)\s{2,}(\S+)\s*$/);
    if (!m) continue;
    const rotulo = m[1].trim();
    for (const parte of m[2].split(",")) {
      if (parte.startsWith("-")) continue;
      const [a, b] = parte.split("-");
      if (b === undefined) {
        mapa[a] ??= rotulo;
        continue;
      }
      const largura = a.length;
      for (let x = parseInt(a, 10); x <= parseInt(b, 10); x++) mapa[String(x).padStart(largura, "0")] ??= rotulo;
    }
  }
  return mapa;
}

module.exports = { dbcParaDbf, lerDbf, lerCnv };
