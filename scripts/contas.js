/**
 * Uma conta do Firebase Auth por associado:
 *   e-mail {cnes}@sindhospe.app, senha SENHA_DEMO (só na criação), custom claim { cnes }.
 * Idempotente e conservador: conta que já está certa não é tocada — trocar a senha
 * revogaria as sessões abertas. Para redefinir todas as senhas: { resetarSenhas: true }
 * (npm run importar -- --resetar-senhas).
 * Contas de associados que saíram são DESATIVADAS (não apagadas) e têm as sessões revogadas.
 */
const DOMINIO = "sindhospe.app";
const emailDoAssociado = (cnes) => `${cnes}@${DOMINIO}`.toLowerCase();

async function listarContasDoPortal(auth) {
  const contas = [];
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    contas.push(...r.users.filter((u) => u.email && u.email.endsWith(`@${DOMINIO}`)));
    pagina = r.pageToken;
  } while (pagina);
  return contas;
}

async function sincronizarContas(auth, cnesLista, senhaDemo, { resetarSenhas = false } = {}) {
  const existentes = new Map((await listarContasDoPortal(auth)).map((u) => [u.email.toLowerCase(), u]));
  let criadas = 0, atualizadas = 0, desativadas = 0;

  for (const cnes of cnesLista) {
    const email = emailDoAssociado(cnes);
    const atual = existentes.get(email);
    existentes.delete(email);

    if (!atual) {
      const { uid } = await auth.createUser({ email, password: senhaDemo, emailVerified: true });
      await auth.setCustomUserClaims(uid, { cnes });
      criadas++;
      continue;
    }

    const mudancas = {};
    if (atual.disabled) mudancas.disabled = false;
    if (resetarSenhas) mudancas.password = senhaDemo;
    const claimCerta = atual.customClaims?.cnes === cnes;

    if (Object.keys(mudancas).length) await auth.updateUser(atual.uid, mudancas);
    if (!claimCerta) await auth.setCustomUserClaims(atual.uid, { cnes });
    if (Object.keys(mudancas).length || !claimCerta) atualizadas++;
  }

  for (const sobra of existentes.values()) {
    if (!sobra.disabled) {
      await auth.updateUser(sobra.uid, { disabled: true });
      await auth.revokeRefreshTokens(sobra.uid);
      desativadas++;
    }
  }
  return { criadas, atualizadas, desativadas };
}

module.exports = { sincronizarContas, emailDoAssociado };
