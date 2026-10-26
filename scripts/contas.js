/**
 * Uma conta do Firebase Auth por associado:
 *   e-mail {cnes}@sindhospe.app, senha SENHA_DEMO, custom claim { cnes }.
 * Idempotente: conta existente tem senha e claim regravadas.
 * Contas de associados que saíram são DESATIVADAS (não apagadas).
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

async function sincronizarContas(auth, cnesLista, senhaDemo) {
  const existentes = new Map((await listarContasDoPortal(auth)).map((u) => [u.email.toLowerCase(), u]));
  let criadas = 0, atualizadas = 0, desativadas = 0;

  for (const cnes of cnesLista) {
    const email = emailDoAssociado(cnes);
    const atual = existentes.get(email);
    let uid;
    if (atual) {
      await auth.updateUser(atual.uid, { password: senhaDemo, disabled: false });
      uid = atual.uid;
      atualizadas++;
    } else {
      uid = (await auth.createUser({ email, password: senhaDemo, emailVerified: true })).uid;
      criadas++;
    }
    await auth.setCustomUserClaims(uid, { cnes });
    existentes.delete(email);
  }

  for (const sobra of existentes.values()) {
    if (!sobra.disabled) {
      await auth.updateUser(sobra.uid, { disabled: true });
      desativadas++;
    }
  }
  return { criadas, atualizadas, desativadas };
}

module.exports = { sincronizarContas, emailDoAssociado };
