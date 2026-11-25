// ❓ Tirar dúvidas: assistente de IA sobre o app e sobre os conceitos (kick-off, caminho crítico, sprint…).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INICIAIS = ['O que é kick-off?', 'O que é caminho crítico?', 'Como fixo a data de uma tarefa?', 'Como exporto o projeto em HTML?'];
  let hist = [];

  // botão no topo (e no menu Janela do modo PC)
  const bt = document.createElement('button'); bt.type = 'button'; bt.id = 'ajudaBt'; bt.className = 'ajd-bt'; bt.innerHTML = '❓ <span>Dúvidas</span>'; bt.title = 'Tirar dúvidas do app com a IA';
  (document.querySelector('.topbar-right') || document.body).prepend(bt);

  const dlg = document.createElement('dialog'); dlg.className = 'ras-dlg ajd-dlg'; dlg.id = 'ajdDlg';
  dlg.innerHTML = `<div class="ajd-topo"><h3>❓ Tirar dúvidas</h3><button type="button" class="ajd-x" data-x title="Fechar">×</button></div>
    <p class="ras-sub">Pergunte sobre o app ou sobre gestão de projetos. Ex.: “o que é kick-off?”</p>
    <div class="ajd-conv" id="ajdConv"></div>
    <div class="ajd-sug" id="ajdSug"></div>
    <form class="ajd-form" id="ajdForm"><textarea id="ajdTxt" rows="1" placeholder="Escreva sua dúvida…"></textarea><button class="primary-button" id="ajdEnv">Perguntar</button></form>`;
  document.body.appendChild(dlg);

  function md(t) { // **negrito**, listas e quebras de linha
    const linhas = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
    let h = '', lista = '';
    for (const l of linhas) {
      const m = /^\s*(?:[-•]|(\d+)[.)])\s+(.*)$/.exec(l);
      if (m) { const tipo = m[1] ? 'ol' : 'ul'; if (lista !== tipo) { if (lista) h += `</${lista}>`; h += `<${tipo}>`; lista = tipo; } h += `<li>${m[2]}</li>`; continue; }
      if (lista) { h += `</${lista}>`; lista = ''; }
      if (l.trim()) h += `<p>${l}</p>`;
    }
    return h + (lista ? `</${lista}>` : '');
  }
  function onde() {
    const ab = document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim() || '';
    const sub = !$('projetosMode')?.hidden ? document.querySelector('#projetosMode .prj-abas button.on')?.textContent?.trim() : '';
    return [ab, sub].filter(Boolean).join(' › ');
  }
  function desenha(sug) {
    $('ajdConv').innerHTML = hist.length ? hist.map((x) => `<div class="ajd-q">${esc(x.q)}</div><div class="ajd-r">${x.r ? md(x.r) : '<span class="ajd-pensa">Pensando<i>.</i><i>.</i><i>.</i></span>'}</div>`).join('') : '<p class="ajd-vazio">Toque numa sugestão ou escreva abaixo.</p>';
    $('ajdSug').innerHTML = (sug || INICIAIS).map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('');
    $('ajdConv').scrollTop = 1e6;
  }
  async function pergunta(q) {
    q = q.trim(); if (!q || $('ajdEnv').disabled) return;
    $('ajdTxt').value = ''; ajusta(); const item = { q, r: '' }; hist.push(item); desenha([]); $('ajdEnv').disabled = true;
    try {
      const r = await window.tracoChamarIA({ ajuda: { pergunta: q, onde: onde(), historico: hist.slice(0, -1).slice(-6) } });
      item.r = String(r.resposta || 'Não consegui responder agora.'); desenha(Array.isArray(r.sugestoes) ? r.sugestoes.slice(0, 3).map(String) : INICIAIS);
    } catch (e) { item.r = '⚠️ ' + (e.message || e); desenha(INICIAIS); }
    $('ajdEnv').disabled = false;
  }
  function ajusta() { const t = $('ajdTxt'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }

  bt.onclick = () => { desenha(); dlg.showModal(); setTimeout(() => $('ajdTxt').focus(), 60); };
  dlg.querySelector('[data-x]').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); const s = e.target.closest('[data-s]'); if (s) pergunta(s.dataset.s); });
  $('ajdForm').onsubmit = (e) => { e.preventDefault(); pergunta($('ajdTxt').value); };
  $('ajdTxt').addEventListener('input', ajusta);
  $('ajdTxt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pergunta($('ajdTxt').value); } });
  window.tracoAjuda = { abrir: () => bt.click(), pergunta: (q) => { bt.click(); pergunta(q); } };
})();
