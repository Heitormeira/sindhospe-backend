const { test } = require("node:test");
const assert = require("node:assert/strict");
const { implode } = require("node-pkware/simple");
const { lerDbf, dbcParaDbf, lerCnv } = require("../scripts/datasus");

/** Monta um DBF mínimo (dBase III) com campos de texto. */
function dbfFalso(campos, registros) {
  const tamCab = 32 + campos.length * 32 + 1;
  const tamReg = 1 + campos.reduce((s, c) => s + c.tam, 0);
  const buf = Buffer.alloc(tamCab + registros.length * tamReg + 1, 0x20);
  buf.fill(0, 0, tamCab);
  buf[0] = 0x03;
  buf.writeUInt32LE(registros.length, 4);
  buf.writeUInt16LE(tamCab, 8);
  buf.writeUInt16LE(tamReg, 10);
  campos.forEach((c, i) => {
    const p = 32 + i * 32;
    buf.write(c.nome, p, "latin1");
    buf[p + 11] = 0x43; // 'C'
    buf[p + 16] = c.tam;
  });
  buf[tamCab - 1] = 0x0d;
  registros.forEach((r, i) => {
    let p = tamCab + i * tamReg + 1;
    for (const c of campos) {
      buf.write(String(r[c.nome]).padEnd(c.tam).slice(0, c.tam), p, "latin1");
      p += c.tam;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

const CAMPOS = [{ nome: "CNES", tam: 7 }, { nome: "NOME", tam: 10 }];
const REGS = [{ CNES: "2355906", NOME: "Esperança" }, { CNES: "0000001", NOME: "Clínica" }];

test("lerDbf lê campos e registros, com acentos (latin1) e sem espaços", () => {
  const { campos, registros } = lerDbf(dbfFalso(CAMPOS, REGS));
  assert.deepEqual(campos, ["CNES", "NOME"]);
  assert.deepEqual(registros, REGS);
});

test("dbcParaDbf descomprime o corpo e preserva o cabeçalho", () => {
  const dbf = dbfFalso(CAMPOS, REGS);
  const tamCab = dbf.readUInt16LE(8);
  const corpo = dbf.subarray(tamCab);
  const comprimido = Buffer.from(implode(corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.length), "binary", "large"));
  const dbc = Buffer.concat([dbf.subarray(0, tamCab), Buffer.from([0, 0, 0, 0]), comprimido]);
  assert.deepEqual(lerDbf(dbcParaDbf(dbc)).registros, REGS);
});

test("lerCnv mapeia códigos, listas e faixas para o rótulo", () => {
  const cnv = [
    "4 4",
    "      1  Gama Câmara                                        0101",
    "      2  Tomógrafo Computadorizado                          0111,0112",
    "      3  Faixa                                              0201-0203",
    "      4  Outros/Ignorados                                   -9999",
  ].join("\r\n");
  const m = lerCnv(Buffer.from(cnv, "latin1"));
  assert.equal(m["0101"], "Gama Câmara");
  assert.equal(m["0112"], "Tomógrafo Computadorizado");
  assert.equal(m["0202"], "Faixa");
  assert.equal(m["9999"], undefined);
});
