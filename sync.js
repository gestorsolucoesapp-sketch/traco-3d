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
  function abreLogin(msg, modo) {
    if (!CFG) { dlg.innerHTML = `<form method="dialog"><h3>☁️ Sincronização</h3><p class="ras-sub">A sincronização está sendo ligada no servidor. Feche e abra o app em alguns minutos.</p><div class="ras-acoes"><button class="primary-button">Ok</button></div></form>`; dlg.showModal(); return; }
    const novo = modo === 'criar', email = LS.get('traco-email', '');
    dlg.innerHTML = `<form method="dialog" id="sgForm">
      <div class="sync-logo">traço<span>.</span></div>
      <div class="sync-abas"><button type="button" data-m="entrar" class="${novo ? '' : 'on'}">Entrar</button><button type="button" data-m="criar" class="${novo ? 'on' : ''}">Criar conta</button></div>
      <p class="ras-sub">${novo ? 'Crie sua conta uma vez e use o mesmo e-mail e senha no iPad, no celular e no PC.' : 'Entre com seu e-mail e senha: projetos, quadros e desenhos ficam iguais em todos os aparelhos.'}</p>
      <label class="sync-campo">E-mail<input type="email" id="sgEmail" autocomplete="username" inputmode="email" value="${esc(email)}" /></label>
      <label class="sync-campo">Senha<span class="sync-senha"><input type="password" id="sgSenha" autocomplete="${novo ? 'new-password' : 'current-password'}" minlength="6" /><button type="button" id="sgVer" aria-label="Mostrar senha">👁️</button></span></label>
      ${novo ? '<label class="sync-campo">Repita a senha<input type="password" id="sgSenha2" autocomplete="new-password" /></label>' : '<button type="button" class="sync-link" id="sgEsq">Esqueci a senha</button>'}
      <p class="sync-msg" id="sgMsg">${esc(msg || '')}</p>
      <div class="ras-acoes"><button type="button" class="secondary-button" data-x>Agora não</button><button type="submit" class="primary-button" id="sgOk">${novo ? 'Criar conta' : 'Entrar'}</button></div></form>`;
    if (!dlg.open) dlg.showModal();
    const f = $('sgForm'), m = $('sgMsg'), ok = $('sgOk');
    dlg.querySelector('[data-x]').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { LS.set('traco-email', $('sgEmail').value.trim()); abreLogin('', b.dataset.m); }));
    $('sgVer').onclick = () => { for (const id of ['sgSenha', 'sgSenha2']) { const el = $(id); if (el) el.type = el.type === 'password' ? 'text' : 'password'; } };
    $('sgEsq')?.addEventListener('click', async () => {
      const em = $('sgEmail').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(em)) { m.textContent = 'Digite seu e-mail primeiro.'; return; }
      m.textContent = 'Enviando…';
      try { await api(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', body: JSON.stringify({ email: em }) }); m.innerHTML = `✉️ Enviamos um link para <b>${esc(em)}</b>. Toque nele neste aparelho para criar uma senha nova.`; }
      catch (e) { m.textContent = e.status === 429 ? 'Muitos pedidos seguidos. Espere alguns minutos.' : `Não deu para enviar: ${e.message}`; }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const em = $('sgEmail').value.trim().toLowerCase(), se = $('sgSenha').value;
      if (!/^\S+@\S+\.\S+$/.test(em)) { m.textContent = 'Digite um e-mail válido.'; return; }
      if (se.length < 6) { m.textContent = 'A senha precisa de pelo menos 6 caracteres.'; return; }
      if (novo && se !== $('sgSenha2').value) { m.textContent = 'As duas senhas não estão iguais.'; return; }
      ok.disabled = true; m.textContent = novo ? 'Criando a conta…' : 'Entrando…';
      try {
        let j;
        if (novo) {
          j = await api('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: em, password: se }) });
          if (!j.access_token) { m.innerHTML = 'Conta criada. Confirme pelo link que chegou no seu e-mail e depois toque em <b>Entrar</b>.'; ok.disabled = false; return; }
        } else j = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: em, password: se }) });
        LS.set('traco-email', em); guarda(j, em); dlg.close(); pinta('sinc', 'Sincronizando…'); await sincroniza(true, true);
      } catch (err) {
        const t = String(err.message || '');
        m.textContent = /invalid login|invalid_credentials/i.test(t) ? 'E-mail ou senha errados.' : /already registered|already exists/i.test(t) ? 'Esse e-mail já tem conta. Toque em Entrar.' : /not confirmed/i.test(t) ? 'Confirme o e-mail pelo link que chegou e tente de novo.' : /weak|password should/i.test(t) ? 'Senha fraca: use letras e números, com 6 ou mais caracteres.' : err.status === 429 ? 'Muitas tentativas seguidas. Espere alguns minutos.' : `Não deu: ${t}`;
      }
      ok.disabled = false;
    };
    setTimeout(() => ($('sgEmail').value ? $('sgSenha') : $('sgEmail')).focus(), 60);
  }
  function novaSenha() {
    dlg.innerHTML = `<form method="dialog" id="sgNova"><h3>🔑 Nova senha</h3><p class="ras-sub">Escolha a senha nova da sua conta.</p>
      <label class="sync-campo">Senha nova<input type="password" id="sgN1" autocomplete="new-password" /></label><label class="sync-campo">Repita<input type="password" id="sgN2" autocomplete="new-password" /></label>
      <p class="sync-msg" id="sgNm"></p><div class="ras-acoes"><button type="submit" class="primary-button">Salvar senha</button></div></form>`;
    if (!dlg.open) dlg.showModal();
    $('sgNova').onsubmit = async (e) => {
      e.preventDefault(); const a1 = $('sgN1').value, m = $('sgNm');
      if (a1.length < 6) { m.textContent = 'Pelo menos 6 caracteres.'; return; } if (a1 !== $('sgN2').value) { m.textContent = 'As duas não estão iguais.'; return; }
      try { await api('/auth/v1/user', { method: 'PUT', headers: { Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ password: a1 }) }); dlg.close(); toast('✅ Senha nova salva'); sincroniza(true, true); }
      catch (err) { m.textContent = `Não deu: ${err.message}`; }
    };
  }
  // volta do link do e-mail: o endereço traz a sessão depois do "#"
  async function voltaDoLink() {
    const h = new URLSearchParams(location.hash.slice(1)); if (!h.get('access_token') && !h.get('error_description')) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('error_description')) { setTimeout(() => abreLogin(`O link não valeu (${h.get('error_description')}). Peça outro.`), 800); return; }
    const j = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600 };
    try { const u = await fetch(CFG.url + '/auth/v1/user', { headers: { apikey: CFG.chave, Authorization: `Bearer ${j.access_token}` } }).then((r) => r.json()); j.user = u; } catch { /* */ }
    guarda(j, j.user?.email);
    if (h.get('type') === 'recovery') { setTimeout(novaSenha, 700); return; }
    pinta('sinc', 'Sincronizando…'); setTimeout(() => { toast('✅ Conectado — sincronizando seus projetos'); sincroniza(true, true); }, 600);
  }
  function abreConta() {
    const ult = LS.get('traco-sync-ult', 0);
    dlg.innerHTML = `<form method="dialog"><h3>☁️ Sua conta</h3>
      <p class="ras-sub">Conectado como <b>${esc(sessao.email || '')}</b>. Projetos, quadros e desenhos sincronizam sozinhos quando há internet.</p>
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
  let primeira = true;
  async function sincroniza(avisar, recarregar) {
    const recarregarJa = recarregar || primeira; primeira = false;
    if (!sessao || !CFG || rodando) return; if (!navigator.onLine) { pinta('off', 'Sem internet · salvo aqui'); return; }
    rodando = true; pinta('sinc', 'Sincronizando…');
    try {
      const at = await token(), H = { Authorization: `Bearer ${at}` };
      const enviado = LS.get('traco-sync-env', {}); // tipo:id -> quando já enviado
      // 1) baixa
      const desde = LS.get('traco-sync-pull', '1970-01-01T00:00:00Z');
      const rem = await api(`/rest/v1/traco_dados?select=tipo,id,dados,quando,apagado,atualizado&atualizado=gt.${encodeURIComponent(desde)}&order=atualizado.asc&limit=1000`, { headers: H });
      let maior = desde, mudouAqui = { projeto: false, quadro: false };
      const loc = { projeto: await locais('projeto'), quadro: await locais('quadro') };
      for (const r of rem || []) {
        if (r.atualizado > maior) maior = r.atualizado; if (!BASES[r.tipo]) continue;
        const meu = loc[r.tipo].find((x) => x.id === r.id);
        if (r.apagado) { if (meu && (meu.quando || 0) <= r.quando) { await gravaLocal(r.tipo, r.id, true); mudouAqui[r.tipo] = true; } }
        else if (!meu || (meu.quando || 0) < r.quando) { await gravaLocal(r.tipo, r.dados); mudouAqui[r.tipo] = true; }
        enviado[`${r.tipo}:${r.id}`] = Math.max(enviado[`${r.tipo}:${r.id}`] || 0, r.quando);
      }
      // dados soltos do aparelho (Arquitetura, Mecânica, peças salvas, pranchas, estilos…)
      const lsq = window.tracoLS?.mapa() || {}; let lsMudou = false;
      for (const r of rem || []) {
        if (r.tipo !== 'ls' || !String(r.id).startsWith('traco-') || window.tracoLS?.LOCAL.test(r.id)) continue;
        if ((lsq[r.id] || 0) >= r.quando) continue;
        window.__tracoSyncAplicando = true;
        try { if (r.apagado || r.dados?.v == null) window.tracoLS.delCru(r.id); else window.tracoLS.setCru(r.id, r.dados.v); } catch { /* */ }
        window.__tracoSyncAplicando = false; lsq[r.id] = r.quando; lsMudou = true;
      }
      if (lsMudou) window.tracoLS.salvaMapa();
      LS.set('traco-sync-pull', maior);
      // 2) envia (o que é mais novo aqui do que o que já foi para a nuvem)
      const sobe = [];
      for (const tipo of Object.keys(BASES)) for (const it of mudouAqui[tipo] ? await locais(tipo) : loc[tipo]) {
        const vazio = tipo === 'quadro' ? !it.objs?.length && /^Meu primeiro quadro$/.test(it.nome) : /^Meu primeiro projeto$/.test(it.nome) && !it.ideia && !it.spec && !it.canvas && !it.crono;
        const q = it.quando || 0; if (!vazio && q > (enviado[`${tipo}:${it.id}`] || 0)) sobe.push({ tipo, id: it.id, dados: it, quando: q, apagado: false });
      }
      for (const [k, q] of Object.entries(window.tracoLS?.mapa() || {})) {
        if (window.tracoLS.LOCAL.test(k) || q <= (enviado[`ls:${k}`] || 0)) continue;
        const v = localStorage.getItem(k); sobe.push({ tipo: 'ls', id: k, dados: v == null ? null : { v }, quando: q, apagado: v == null });
      }
      for (const a of apagados) sobe.push({ tipo: a.tipo, id: a.id, dados: null, quando: a.quando, apagado: true });
      for (let i = 0; i < sobe.length; i += 20) {
        await api('/rest/v1/traco_dados?on_conflict=user_id,tipo,id', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(sobe.slice(i, i + 20)) });
        for (const s of sobe.slice(i, i + 20)) enviado[`${s.tipo}:${s.id}`] = s.quando;
      }
      apagados.length = 0; LS.set('traco-apagados', []); LS.set('traco-sync-env', enviado); LS.set('traco-sync-ult', Date.now());
      if (lsMudou) { if (recarregarJa) { toast('☁️ Trazendo seus desenhos de outro aparelho…'); setTimeout(() => location.reload(), 900); } else avisoAtualizar(); }
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
  function avisoAtualizar() {
    if (document.querySelector('.sync-aviso')) return;
    const d = document.createElement('div'); d.className = 'sync-aviso'; d.innerHTML = '☁️ Há desenhos novos de outro aparelho. <button type="button">Atualizar</button>';
    d.querySelector('button').onclick = () => location.reload(); document.body.appendChild(d);
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'sync-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

  if (CFG) voltaDoLink();
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
    setTimeout(() => abreLogin('Dica: crie uma conta para ver tudo também no celular e no PC.', 'criar'), 600);
  });
})();
