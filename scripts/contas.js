/**
 * Uma conta do Firebase Auth por associado:
 *   e-mail {cnes}@sindhospe.app, senha INDIVIDUAL aleatória (gerada na criação), custom claim { cnes }.
 * - Contas novas recebem senha própria; a lista {cnes, senha} volta para quem chamou,
 *   que grava o CSV em segredos/senhas/ para o SINDHOSPE distribuir.
 * - Idempotente e conservador: conta que já está certa não é tocada — trocar a senha
 *   revogaria as sessões abertas e anularia a senha que o associado escolheu.
 * - redefinirSenhas(): troca a senha só das contas pedidas ("esqueci minha senha"),
 *   e derruba as sessões abertas dessas contas.
 * - Contas de associados que saíram são DESATIVADAS (não apagadas) e têm as sessões revogadas.
 */
const { gerarSenha: gerarSenhaPadrao } = require("./senhas");

const DOMINIO = "sindhospe.app";
const emailDoAssociado = (cnes) => `${cnes}@${DOMINIO}`.toLowerCase();
const EMAIL_SINDICATO = `sindicato@${DOMINIO}`;

async function listarContasDoPortal(auth) {
  const contas = [];
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    contas.push(...r.users.filter((u) => u.email && u.email.endsWith(`@${DOMINIO}`) && u.email.toLowerCase() !== EMAIL_SINDICATO));
    pagina = r.pageToken;
  } while (pagina);
  return contas;
}

async function sincronizarContas(auth, cnesLista, { gerarSenha = gerarSenhaPadrao } = {}) {
  const existentes = new Map((await listarContasDoPortal(auth)).map((u) => [u.email.toLowerCase(), u]));
  let criadas = 0, atualizadas = 0, desativadas = 0;
  const novasSenhas = [];

  for (const cnes of cnesLista) {
    const email = emailDoAssociado(cnes);
    const atual = existentes.get(email);
    existentes.delete(email);

    if (!atual) {
      const senha = gerarSenha();
      const { uid } = await auth.createUser({ email, password: senha, emailVerified: true });
      await auth.setCustomUserClaims(uid, { cnes });
      novasSenhas.push({ cnes, senha });
      criadas++;
      continue;
    }

    const claimCerta = atual.customClaims?.cnes === cnes;
    if (atual.disabled) await auth.updateUser(atual.uid, { disabled: false });
    if (!claimCerta) await auth.setCustomUserClaims(atual.uid, { cnes });
    if (atual.disabled || !claimCerta) atualizadas++;
  }

  for (const sobra of existentes.values()) {
    if (!sobra.disabled) {
      await auth.updateUser(sobra.uid, { disabled: true });
      await auth.revokeRefreshTokens(sobra.uid);
      desativadas++;
    }
  }
  return { criadas, atualizadas, desativadas, novasSenhas };
}

/** Nova senha aleatória para cada CNES pedido; sessões abertas dessas contas caem. */
async function redefinirSenhas(auth, cnesLista, { gerarSenha = gerarSenhaPadrao } = {}) {
  const redefinidas = [];
  const semConta = [];
  for (const cnes of cnesLista) {
    let conta;
    try {
      conta = await auth.getUserByEmail(emailDoAssociado(cnes));
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      semConta.push(cnes);
      continue;
    }
    const senha = gerarSenha();
    await auth.updateUser(conta.uid, { password: senha });
    await auth.revokeRefreshTokens(conta.uid);
    redefinidas.push({ cnes, senha });
  }
  return { redefinidas, semConta };
}

/**
 * Conta única do SINDHOSPE (claim { perfil: "sindicato" }), com senha própria (SENHA_SINDICATO).
 * Mesma política das outras: a senha só é definida na criação ou com resetarSenha.
 */
async function sincronizarContaSindicato(auth, senha, { resetarSenha = false } = {}) {
  const claims = { perfil: "sindicato" };
  let conta;
  try {
    conta = await auth.getUserByEmail(EMAIL_SINDICATO);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    const { uid } = await auth.createUser({ email: EMAIL_SINDICATO, password: senha, emailVerified: true });
    await auth.setCustomUserClaims(uid, claims);
    return "criada";
  }
  const mudancas = {};
  if (conta.disabled) mudancas.disabled = false;
  if (resetarSenha) mudancas.password = senha;
  const claimCerta = JSON.stringify(conta.customClaims || {}) === JSON.stringify(claims);
  if (Object.keys(mudancas).length) await auth.updateUser(conta.uid, mudancas);
  if (!claimCerta) await auth.setCustomUserClaims(conta.uid, claims);
  return Object.keys(mudancas).length || !claimCerta ? "atualizada" : "sem_mudanca";
}

module.exports = { sincronizarContas, redefinirSenhas, sincronizarContaSindicato, emailDoAssociado, EMAIL_SINDICATO };
