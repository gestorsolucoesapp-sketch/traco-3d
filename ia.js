// Chamada à IA (narrar/foto). Fica separado de config.js porque a publicação do servidor reescreve config.js.

// Chamada à IA com nova tentativa automática e mensagem clara quando a rede falha.
window.tracoChamarIA = async (corpo) => {
  const ok = ['https://traco-estudio.vercel.app', 'https://gestorsolucoesapp-sketch.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
  if (!ok.includes(location.origin)) throw new Error(`A IA só atende pelo endereço oficial: abra https://traco-estudio.vercel.app (você está em ${location.origin}).`);
  let ultimo = null;
  for (let tent = 0; tent < 3; tent++) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 200000);
      const r = await fetch(window.TRACO_LER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: ctl.signal });
      clearTimeout(tm);
      const j = await r.json().catch(() => ({ erro: `Resposta inválida do servidor (erro ${r.status}).` }));
      if ((r.status === 503 || r.status === 504 || (r.status >= 500 && !j.erro)) && tent < 2) { ultimo = new Error(j.erro || `Erro ${r.status}`); await new Promise((q) => setTimeout(q, 1500 * (tent + 1))); continue; }
      if (!r.ok || j.erro) throw Object.assign(new Error(j.erro || `Erro ${r.status}`), { final: true });
      return j;
    } catch (e) {
      if (e.final) throw e;
      ultimo = e;
      if (tent < 2) await new Promise((q) => setTimeout(q, 1500 * (tent + 1)));
    }
  }
  const msg = String(ultimo?.message || ultimo);
  if (/fetch|network|abort|load failed/i.test(msg) || ultimo?.name === 'AbortError')
    throw new Error(navigator.onLine === false ? 'Sem internet agora. Confira a conexão e tente de novo, ou use "Montar sem IA".'
      : 'Não consegui falar com o servidor da IA (tentei 3 vezes). Pode ser a rede/firewall desse computador ou o servidor ocupado. Tente de novo em instantes, ou use "Montar sem IA".');
  throw ultimo;
};
