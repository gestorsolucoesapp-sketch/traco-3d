// ☁️ Conta e sincronização: entra com um código enviado ao e-mail e mantém Projetos e Quadros iguais em todos os aparelhos.
// Continua funcionando sem internet: grava no aparelho e envia quando a conexão voltar.
(() => {
  const CFG = window.TRACO_SUPA; // { url, chave } — preenchido na publicação
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
  let sessao = LS.get('traco-sessao', null);

  // ---------- pílula do topo ----------
  const pill = document.querySelector('.status-pill');
  function pinta(estado, txt) {
    if (!pill) return;
    pill.classList.add('sync-pill'); pill.dataset.s = estado; pill.setAttribute('role', 'button'); pill.tabIndex = 0;
    pill.innerHTML = `<span class="status-light"></span> ${esc(txt)}`;
  }
  pill?.addEventListener('click', () => (sessao ? abreConta() : abreLogin()));
  const estadoInicial = () => pinta(sessao ? 'ok' : 'local', sessao ? 'Sincronizado' : 'Entrar para sincronizar');

  // ---------- autenticação (código de 6 dígitos no e-mail) ----------
  const api = async (caminho, opc = {}) => {
    const r = await fetch(CFG.url + caminho, { ...opc, headers: { apikey: CFG.chave, 'Content-Type': 'application/json', ...(opc.headers || {}) } });
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* */ }
    if (!r.ok) { const e = new Error(j?.msg || j?.error_description || j?.message || `Erro ${r.status}`); e.status = r.status; throw e; }
    return j;
  };
  const guarda = (j, email) => { sessao = { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, email: email || j.user?.email || sessao?.email, uid: j.user?.id || sessao?.uid }; LS.set('traco-sessao', sessao); };
  async function token() {
    if (!sessao) return null;
    if (Date.now() < sessao.exp) return sessao.at;
    try { guarda(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: sessao.rt }) })); return sessao.at; }
    catch (e) { if (e.status === 400 || e.status === 401) { sair(true); } throw e; }
  }

  // ---------- telas de login e conta ----------
  const dlg = document.createElement('dialog'); dlg.className = 'ras-dlg sync-dlg'; document.body.appendChild(dlg);
  function abreLogin(msg) {
    if (!CFG) { dlg.innerHTML = `<form method="dialog"><h3>☁️ Sincronização</h3><p class="ras-sub">A sincronização está sendo ligada no servidor. Feche e abra o app em alguns minutos.</p><div class="ras-acoes"><button class="primary-button">Ok</button></div></form>`; dlg.showModal(); return; }
    const email = LS.get('traco-email', '');
    dlg.innerHTML = `<form method="dialog" id="sgForm">
      <div class="sync-logo">traço<span>.</span></div>
      <h3>Entrar para sincronizar</h3>
      <p class="ras-sub">Seus projetos e quadros ficam iguais no iPad, no celular e no PC. Sem senha: mandamos um código para o seu e-mail.</p>
      <label class="sync-campo">E-mail<input type="email" id="sgEmail" autocomplete="email" inputmode="email" value="${esc(email)}" /></label>
      <div id="sgCodigo" hidden><label class="sync-campo">Código que chegou no e-mail<input id="sgCod" inputmode="numeric" autocomplete="one-time-code" maxlength="8" /></label>
        <button type="button" class="sync-link" id="sgReenvia">Reenviar código</button></div>
      <p class="sync-msg" id="sgMsg">${esc(msg || '')}</p>
      <div class="ras-acoes"><button type="button" class="secondary-button" data-x>Agora não</button><button type="submit" class="primary-button" id="sgOk">Enviar código</button></div></form>`;
    dlg.showModal();
    const f = $('sgForm'), m = $('sgMsg'), ok = $('sgOk');
    dlg.querySelector('[data-x]').onclick = () => dlg.close();
    let etapa = 'email';
    const envia = async () => {
      const em = $('sgEmail').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(em)) { m.textContent = 'Digite um e-mail válido.'; return; }
      ok.disabled = true; m.textContent = 'Enviando o código…';
      try {
        await api('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email: em, create_user: true }) });
        LS.set('traco-email', em); etapa = 'codigo'; $('sgCodigo').hidden = false; $('sgEmail').readOnly = true; ok.textContent = 'Entrar';
        m.textContent = `Código enviado para ${em}. Confira também a caixa de spam.`; setTimeout(() => $('sgCod').focus(), 50);
      } catch (e) { m.textContent = e.status === 429 ? 'Muitos pedidos de código seguidos. Espere uns minutos e tente de novo.' : `Não deu para enviar: ${e.message}`; }
      ok.disabled = false;
    };
    $('sgReenvia').onclick = envia;
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (etapa === 'email') return envia();
      const cod = $('sgCod').value.replace(/\D/g, ''); if (cod.length < 6) { m.textContent = 'Digite o código de 6 dígitos.'; return; }
      ok.disabled = true; m.textContent = 'Conferindo…';
      try {
        const em = $('sgEmail').value.trim().toLowerCase();
        guarda(await api('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email: em, token: cod }) }), em);
        dlg.close(); pinta('sinc', 'Sincronizando…'); await sincroniza(true);
      } catch (err) { m.textContent = err.status === 403 || err.status === 400 ? 'Código errado ou vencido. Peça outro.' : `Não deu para entrar: ${err.message}`; }
      ok.disabled = false;
    };
  }
  function abreConta() {
    const ult = LS.get('traco-sync-ult', 0);
    dlg.innerHTML = `<form method="dialog"><h3>☁️ Sua conta</h3>
      <p class="ras-sub">Conectado como <b>${esc(sessao.email || '')}</b>. Projetos e quadros sincronizam sozinhos quando há internet.</p>
      <p class="sync-msg">${ult ? `Última sincronização: ${new Date(ult).toLocaleString('pt-BR')}` : 'Ainda não sincronizou.'}</p>
      <div class="ras-acoes"><button type="button" class="secondary-button" data-sair>Sair desta conta</button><button type="button" class="secondary-button" data-ag>Sincronizar agora</button><button class="primary-button">Fechar</button></div></form>`;
    dlg.showModal();
    dlg.querySelector('[data-ag]').onclick = async () => { dlg.close(); await sincroniza(true); };
    dlg.querySelector('[data-sair]').onclick = () => { if (confirm('Sair da conta neste aparelho? Seus dados continuam salvos aqui e na nuvem.')) { sair(); dlg.close(); } };
  }
  function sair(expirou) {
    sessao = null; try { localStorage.removeItem('traco-sessao'); localStorage.removeItem('traco-sync-pull'); } catch { /* */ }
    pinta('local', expirou ? 'Entre de novo para sincronizar' : 'Entrar para sincronizar');
  }

  // ---------- dados locais (IndexedDB de cada módulo) ----------
  const BASES = { projeto: ['traco-projetos', 'p'], quadro: ['traco-rascunhos', 'quadros'] };
  const abre = (nome, loja) => new Promise((ok) => { try { const r = indexedDB.open(nome, 1); r.onupgradeneeded = () => r.result.createObjectStore(loja, { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch { ok(null); } });
  async function locais(tipo) { const [n, l] = BASES[tipo], db = await abre(n, l); if (!db) return []; return new Promise((ok) => { const r = db.transaction(l).objectStore(l).getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); }); }
  async function gravaLocal(tipo, item, apagar) { const [n, l] = BASES[tipo], db = await abre(n, l); if (!db) return; await new Promise((ok) => { const t = db.transaction(l, 'readwrite'); apagar ? t.objectStore(l).delete(item.id || item) : t.objectStore(l).put(item); t.oncomplete = ok; t.onerror = ok; }); }
  const apagados = LS.get('traco-apagados', []); // [{tipo,id,quando}] ainda não enviados
  window.tracoSync = {
    apagou(tipo, id) { apagados.push({ tipo, id, quando: Date.now() }); LS.set('traco-apagados', apagados); pede(); },
    mudou: () => pede(),
    entrar: () => abreLogin(),
    logado: () => Boolean(sessao),
  };

  // ---------- sincronizar: baixa o que mudou na nuvem, envia o que mudou aqui ----------
  let rodando = false, tPede = 0;
  function pede() { if (!sessao) return; clearTimeout(tPede); tPede = setTimeout(() => sincroniza(false), 2500); }
  async function sincroniza(avisar) {
    if (!sessao || !CFG || rodando) return; if (!navigator.onLine) { pinta('off', 'Sem internet · salvo aqui'); return; }
    rodando = true; pinta('sinc', 'Sincronizando…');
    try {
      const at = await token(), H = { Authorization: `Bearer ${at}` };
      const enviado = LS.get('traco-sync-env', {}); // tipo:id -> quando já enviado
      // 1) baixa
      const desde = LS.get('traco-sync-pull', '1970-01-01T00:00:00Z');
      const rem = await api(`/rest/v1/traco_dados?select=tipo,id,dados,quando,apagado,atualizado&atualizado=gt.${encodeURIComponent(desde)}&order=atualizado.asc&limit=500`, { headers: H });
      let maior = desde, mudouAqui = { projeto: false, quadro: false };
      const loc = { projeto: await locais('projeto'), quadro: await locais('quadro') };
      for (const r of rem || []) {
        if (!BASES[r.tipo]) continue; if (r.atualizado > maior) maior = r.atualizado;
        const meu = loc[r.tipo].find((x) => x.id === r.id);
        if (r.apagado) { if (meu && (meu.quando || 0) <= r.quando) { await gravaLocal(r.tipo, r.id, true); mudouAqui[r.tipo] = true; } }
        else if (!meu || (meu.quando || 0) < r.quando) { await gravaLocal(r.tipo, r.dados); mudouAqui[r.tipo] = true; }
        enviado[`${r.tipo}:${r.id}`] = Math.max(enviado[`${r.tipo}:${r.id}`] || 0, r.quando);
      }
      LS.set('traco-sync-pull', maior);
      // 2) envia (o que é mais novo aqui do que o que já foi para a nuvem)
      const sobe = [];
      for (const tipo of Object.keys(BASES)) for (const it of mudouAqui[tipo] ? await locais(tipo) : loc[tipo]) {
        const vazio = tipo === 'quadro' ? !it.objs?.length && /^Meu primeiro quadro$/.test(it.nome) : /^Meu primeiro projeto$/.test(it.nome) && !it.ideia && !it.spec && !it.canvas && !it.crono;
        const q = it.quando || 0; if (!vazio && q > (enviado[`${tipo}:${it.id}`] || 0)) sobe.push({ tipo, id: it.id, dados: it, quando: q, apagado: false });
      }
      for (const a of apagados) sobe.push({ tipo: a.tipo, id: a.id, dados: null, quando: a.quando, apagado: true });
      for (let i = 0; i < sobe.length; i += 20) {
        await api('/rest/v1/traco_dados?on_conflict=user_id,tipo,id', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(sobe.slice(i, i + 20)) });
        for (const s of sobe.slice(i, i + 20)) enviado[`${s.tipo}:${s.id}`] = s.quando;
      }
      apagados.length = 0; LS.set('traco-apagados', []); LS.set('traco-sync-env', enviado); LS.set('traco-sync-ult', Date.now());
      if (mudouAqui.projeto) await window.tracoProjetos?.recarregar?.();
      if (mudouAqui.quadro) await window.tracoRascunhos?.recarregar?.();
      pinta('ok', 'Sincronizado');
      if (avisar && (rem?.length || sobe.length)) toast(`☁️ ${rem?.length || 0} baixado(s) · ${sobe.length} enviado(s)`);
    } catch (e) {
      if (!sessao) return;
      pinta('erro', e.status === 404 || /traco_dados/.test(e.message) ? 'Nuvem ainda sendo ligada' : 'Falha ao sincronizar · salvo aqui');
      console.warn('sync', e);
    } finally { rodando = false; }
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'sync-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

  // quando sincroniza: ao abrir, ao voltar para o app, ao ficar online e a cada minuto
  estadoInicial();
  window.addEventListener('online', () => sincroniza(false));
  window.addEventListener('offline', () => sessao && pinta('off', 'Sem internet · salvo aqui'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincroniza(false); });
  setInterval(() => { if (!document.hidden) sincroniza(false); }, 60000);
  setTimeout(() => sincroniza(false), 2500);
  // convite discreto na primeira vez que abrir Projetos ou Rascunhos sem conta
  for (const id of ['projetosTab', 'rascunhosTab']) $(id)?.addEventListener('click', () => {
    if (sessao || !CFG || LS.get('traco-convite-sync', false)) return; LS.set('traco-convite-sync', true);
    setTimeout(() => abreLogin('Dica: entre com seu e-mail para ver estes projetos também no celular e no PC.'), 600);
  });
})();
