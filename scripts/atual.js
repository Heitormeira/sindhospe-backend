/**
 * Bloco `atual` dos documentos (pedidos da reunião de 28/10/2026).
 * Tudo vem de UMA competência (a mais recente do CNES):
 *  - leitos só do arquivo LT, com totais e participação no município/estado (sem médias);
 *  - conteúdo por categoria (hospital -> leitos; clínica/SADT -> equipamentos, profissionais, serviços);
 *  - cadastro: última atualização no CNES e licença sanitária informada.
 * Funções puras: recebem a base carregada por consultas-atual.js.
 */
const { CATEGORIAS, categoriaDoTipo, GRUPOS_PROFISSIONAIS, mediana, percentil, perfilDeServico } = require("./categorias");

const GRUPOS_EQUIPAMENTO = {
  "01": "Diagnóstico por imagem",
  "02": "Infraestrutura",
  "03": "Métodos ópticos",
  "04": "Métodos gráficos",
  "05": "Manutenção da vida",
  "06": "Outros equipamentos",
  "07": "Odontologia",
  "08": "Audiologia",
  "09": "Telessaúde",
  "10": "Diálise",
};
const ORGAO_LICENCA = { 1: "Vigilância Sanitária Estadual (APEVISA)", 2: "Vigilância Sanitária Municipal" };
const MESES_EM_DIA = 6;
const MINIMO_PARES = 3; // menos que isso, a comparação não diz nada
const TIPOS_HOSPITAL = { "05": "Hospital geral", "07": "Hospital especializado", "15": "Unidade mista", "62": "Hospital/dia" };

/** Grupo de comparação: hospitais pelo tipo de unidade; os demais por categoria + serviço principal. */
function grupoComparacao(cad, x) {
  if (!cad) return null;
  const categoria = categoriaDoTipo(cad.tp_unid);
  if (categoria === "hospital") return { chave: `tp:${cad.tp_unid}`, label: TIPOS_HOSPITAL[cad.tp_unid] || "Hospital" };
  const perfil = perfilDeServico(x.sr);
  return {
    chave: `${categoria}|${perfil?.codigo || "geral"}`,
    label: CATEGORIAS[categoria].label + (perfil ? ` · ${perfil.label}` : ""),
  };
}

function comparar(grupo, lista, valor) {
  const pares = lista.filter((v) => v > 0);
  if (!grupo || pares.length < MINIMO_PARES) return null;
  return { grupo: grupo.label, estabelecimentos: pares.length, mediana: mediana(pares), percentil: percentil(pares, valor) };
}

const vazio = { eq: {}, pf: { t: 0, g: {} }, sr: [], hb: 0 };
const pct = (parte, todo) => (todo > 0 ? Math.round((parte * 1000) / todo) / 10 : 0);
const somaEq = (eq) => Object.values(eq).reduce((s, [e]) => s + e, 0);
const complementares = (l) => (l?.tipos?.["3"]?.e || 0);

/** Meses entre AAAAMM e a competência (null se não houver data). */
function situacaoCadastro(dtAtual, competencia) {
  if (!/^\d{6}$/.test(dtAtual || "")) return null;
  const meses = (x) => parseInt(x.slice(0, 4), 10) * 12 + parseInt(x.slice(4, 6), 10);
  return Math.max(0, meses(competencia) - meses(dtAtual));
}

/** Índices calculados uma vez por base: totais por município e listas por tipo de unidade. */
function indices(base) {
  if (base._indices) return base._indices;
  const leitosMunicipio = {};
  let leitosEstado = 0;
  const porGrupo = {}; // chave do grupo de comparação -> { eq: [], pf: [] }
  for (const [cnes, c] of base.cadastros) {
    const total = base.leitos.get(cnes)?.total || 0;
    leitosMunicipio[c.codufmun] = (leitosMunicipio[c.codufmun] || 0) + total;
    leitosEstado += total;
    const x = base.extra.estabelecimentos[cnes] || vazio;
    const t = (porGrupo[grupoComparacao(c, x).chave] ??= { eq: [], pf: [] });
    t.eq.push(somaEq(x.eq));
    t.pf.push(x.pf.t);
  }
  base._indices = { leitosMunicipio, leitosEstado, porGrupo };
  return base._indices;
}

/** O CNES repete nomes de especialidade em tipos diferentes (ex.: Cardiologia clínica e cirúrgica). */
function desambiguar(itens, rotulosTipo) {
  const vezes = {};
  for (const i of itens) vezes[i.label] = (vezes[i.label] || 0) + 1;
  return itens.map((i) => (vezes[i.label] > 1 ? { ...i, label: `${i.label} (${(rotulosTipo[i.tipo] || i.tipo).toLowerCase()})` } : i));
}

function blocoLeitos(base, cnes, cad) {
  const l = base.leitos.get(cnes);
  if (!l) return null;
  const { leitosMunicipio, leitosEstado } = indices(base);
  const r = base.extra.rotulos;
  const comp = complementares(l);
  const totalMunicipio = leitosMunicipio[cad.codufmun] || 0;
  return {
    total: l.total,
    gerais: l.total - comp,
    complementares: comp,
    sus: l.sus,
    nao_sus: l.nao_sus,
    por_tipo: Object.entries(l.tipos)
      .map(([codigo, t]) => ({ codigo, label: r.leitos_tipo[codigo] || `Tipo ${codigo}`, total: t.e, sus: t.s }))
      .sort((a, b) => b.total - a.total),
    por_especialidade: desambiguar(
      Object.entries(l.esp)
        .map(([codigo, t]) => ({ codigo, label: r.leitos_especialidade[codigo] || `Especialidade ${codigo}`, tipo: t.tipo, total: t.e, sus: t.s }))
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total),
      r.leitos_tipo
    ),
    contexto: {
      municipio: { nome: base.municipios[cad.codufmun] || cad.codufmun, total: totalMunicipio, percentual: pct(l.total, totalMunicipio) },
      estado: { total: leitosEstado, percentual: pct(l.total, leitosEstado) },
    },
  };
}

function blocoEquipamentos(base, x, grupo) {
  const r = base.extra.rotulos.equipamentos;
  const itens = Object.entries(x.eq)
    .map(([codigo, [existentes, em_uso, sus]]) => ({
      codigo,
      label: r[codigo] || `Equipamento ${codigo}`,
      grupo: GRUPOS_EQUIPAMENTO[codigo.slice(0, 2)] || "Outros equipamentos",
      existentes,
      em_uso,
      sus,
    }))
    .sort((a, b) => b.existentes - a.existentes || a.label.localeCompare(b.label));
  const total = somaEq(x.eq);
  const lista = (grupo && indices(base).porGrupo[grupo.chave]?.eq) || [];
  return {
    total,
    em_uso: itens.reduce((s, i) => s + i.em_uso, 0),
    sus: itens.reduce((s, i) => s + i.sus, 0),
    tipos: itens.length,
    itens,
    comparacao: comparar(grupo, lista, total),
  };
}

function blocoProfissionais(base, x, grupo) {
  const grupos = Object.entries(x.pf.g)
    .map(([codigo, n]) => ({ codigo, label: GRUPOS_PROFISSIONAIS[codigo]?.label || codigo, total: n }))
    .sort((a, b) => (a.codigo === "outros") - (b.codigo === "outros") || b.total - a.total);
  const lista = (grupo && indices(base).porGrupo[grupo.chave]?.pf) || [];
  return {
    total: x.pf.t,
    grupos,
    comparacao: comparar(grupo, lista, x.pf.t),
  };
}

function blocoCadastro(base, cad) {
  if (!cad) return { encontrado: false };
  const meses = situacaoCadastro(cad.dt_atual, base.competencia);
  const data = (d) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);
  return {
    encontrado: true,
    ultima_atualizacao: meses === null ? null : `${cad.dt_atual.slice(0, 4)}-${cad.dt_atual.slice(4, 6)}`,
    meses_sem_atualizar: meses,
    situacao: meses === null ? "sem_data" : meses <= MESES_EM_DIA ? "em_dia" : "desatualizado",
    licenca: cad.alvara
      ? { numero: cad.alvara, expedicao: data(cad.dt_exped), orgao: ORGAO_LICENCA[cad.orgexped] || "Não informado" }
      : null,
  };
}

function montarAtual(base, cnes) {
  const cad = base.cadastros.get(cnes);
  const x = base.extra.estabelecimentos[cnes] || vazio;
  const tpUnid = cad?.tp_unid || null;
  const categoria = categoriaDoTipo(tpUnid);
  const leitos = cad ? blocoLeitos(base, cnes, cad) : null;
  const mostraLeitos = CATEGORIAS[categoria].mostraLeitos || (leitos?.total || 0) > 0;
  const rotServ = base.extra.rotulos.servicos;
  return {
    competencia: base.competencia,
    categoria,
    categoria_label: CATEGORIAS[categoria].label,
    tp_unid: tpUnid,
    municipio: cad ? { codigo: cad.codufmun, nome: base.municipios[cad.codufmun] || cad.codufmun } : null,
    mostra_leitos: mostraLeitos,
    leitos: mostraLeitos ? leitos : null,
    estrutura: cad
      ? {
          vinculo_sus: cad.vinc_sus,
          urgencia: cad.urgencia,
          centro_cirurgico: cad.centro_cirurgico,
          centro_obstetrico: cad.centro_obstetrico,
          ambulatorio: cad.ambulatorio,
        }
      : null,
    grupo_comparacao: grupoComparacao(cad, x)?.label || null,
    equipamentos: blocoEquipamentos(base, x, grupoComparacao(cad, x)),
    profissionais: blocoProfissionais(base, x, grupoComparacao(cad, x)),
    servicos: x.sr.map((codigo) => ({ codigo, label: rotServ[codigo] || `Serviço ${codigo}` })),
    habilitacoes: x.hb,
    cadastro: blocoCadastro(base, cad),
    evolucao: base.evolucao.porCnes.get(cnes) || [],
  };
}

function totaisDe(base, lista) {
  const t = { estabelecimentos: 0, com_leitos: 0, leitos: 0, leitos_sus: 0, leitos_complementares: 0, equipamentos: 0, profissionais: 0 };
  for (const cnes of lista) {
    const l = base.leitos.get(cnes);
    const x = base.extra.estabelecimentos[cnes] || vazio;
    t.estabelecimentos++;
    if ((l?.total || 0) > 0) t.com_leitos++;
    t.leitos += l?.total || 0;
    t.leitos_sus += l?.sus || 0;
    t.leitos_complementares += complementares(l);
    t.equipamentos += somaEq(x.eq);
    t.profissionais += x.pf.t;
  }
  return t;
}

/** publico/setores: o estado e os associados divididos por categoria. */
function montarSetores(base) {
  const porCategoria = {};
  for (const [cnes, c] of base.cadastros) (porCategoria[categoriaDoTipo(c.tp_unid)] ??= { estado: [], associados: [] }).estado.push(cnes);
  const associadosCnes = new Set(base.associados.map((a) => a.cnes));
  for (const cnes of associadosCnes) {
    const c = base.cadastros.get(cnes);
    if (c) (porCategoria[categoriaDoTipo(c.tp_unid)] ??= { estado: [], associados: [] }).associados.push(cnes);
  }
  const categorias = Object.keys(CATEGORIAS)
    .filter((codigo) => porCategoria[codigo])
    .map((codigo) => ({
      codigo,
      label: CATEGORIAS[codigo].label,
      estado: totaisDe(base, porCategoria[codigo].estado),
      associados: totaisDe(base, porCategoria[codigo].associados),
    }));
  const comLeitos = [...associadosCnes].filter((c) => (base.leitos.get(c)?.total || 0) > 0).length;
  return {
    competencia: base.competencia,
    categorias,
    associados: {
      total: associadosCnes.size,
      com_leitos: comLeitos,
      sem_leitos: associadosCnes.size - comLeitos,
      sem_cadastro_cnes: [...associadosCnes].filter((c) => !base.cadastros.has(c)).length,
    },
  };
}

/** sindicato/painel: visão consolidada só para o perfil do sindicato. */
function montarPainelSindicato(base) {
  const setores = montarSetores(base);
  const lista = base.associados.map(({ cnes, nome, situacao }) => {
    const a = montarAtual(base, cnes);
    return {
      cnes,
      nome,
      situacao,
      categoria: a.categoria,
      municipio: a.municipio?.nome || null,
      leitos: base.leitos.get(cnes)?.total || 0,
      leitos_sus: base.leitos.get(cnes)?.sus || 0,
      equipamentos: a.equipamentos.total,
      profissionais: a.profissionais.total,
      cadastro: a.cadastro.encontrado ? a.cadastro.situacao : "nao_encontrado",
      ultima_atualizacao: a.cadastro.ultima_atualizacao || null,
      licenca: Boolean(a.cadastro.licenca),
    };
  });
  const leitosAssociados = lista.reduce((s, x) => s + x.leitos, 0);
  const leitosEstado = indices(base).leitosEstado;

  const eq = {};
  for (const { cnes } of base.associados) {
    for (const [codigo, [e]] of Object.entries((base.extra.estabelecimentos[cnes] || vazio).eq)) eq[codigo] = (eq[codigo] || 0) + e;
  }
  const rotEq = base.extra.rotulos.equipamentos;

  return {
    competencia: base.competencia,
    resumo: {
      associados: lista.length,
      filiados: lista.filter((x) => x.situacao === "Filiado").length,
      com_leitos: setores.associados.com_leitos,
      sem_leitos: setores.associados.sem_leitos,
      sem_cadastro_cnes: setores.associados.sem_cadastro_cnes,
      leitos_associados: leitosAssociados,
      leitos_sus_associados: lista.reduce((s, x) => s + x.leitos_sus, 0),
      leitos_estado: leitosEstado,
      percentual_leitos: pct(leitosAssociados, leitosEstado),
      equipamentos_associados: lista.reduce((s, x) => s + x.equipamentos, 0),
      profissionais_associados: lista.reduce((s, x) => s + x.profissionais, 0),
      cadastros_desatualizados: lista.filter((x) => x.cadastro === "desatualizado").length,
      sem_licenca_informada: lista.filter((x) => !x.licenca && x.cadastro !== "nao_encontrado").length,
    },
    setores: setores.categorias,
    evolucao_leitos: base.evolucao.estado.map(({ competencia, total }) => ({
      competencia,
      associados: base.associados.reduce(
        (s, { cnes }) => s + ((base.evolucao.porCnes.get(cnes) || []).find((x) => x.competencia === competencia)?.total || 0),
        0
      ),
      estado: total,
    })),
    equipamentos_associados: Object.entries(eq)
      .map(([codigo, quantidade]) => ({ codigo, label: rotEq[codigo] || `Equipamento ${codigo}`, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 15),
    lista: lista.sort((a, b) => (a.nome || a.cnes).localeCompare(b.nome || b.cnes, "pt-BR")),
  };
}

module.exports = { montarAtual, montarSetores, montarPainelSindicato, situacaoCadastro, GRUPOS_EQUIPAMENTO };
