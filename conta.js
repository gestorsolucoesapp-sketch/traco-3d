// Conta nos campos de medida: 56/2, 10+2,5, (40-3)*2, 3x4. Vírgula = decimal. Sem eval.
window.tracoConta = (txt) => {
  let s = String(txt ?? '').trim().replace(/\s+/g, '').replace(/[x×]/gi, '*').replace(/÷/g, '/').replace(/,/g, '.');
  s = s.replace(/(mm|cm|m|°)$/i, '');
  if (!s || !/^[-+*/().\d]+$/.test(s)) return null;
  let i = 0;
  const num = () => { const m = /^\d*\.?\d+(e[-+]?\d+)?/i.exec(s.slice(i)) || /^\d+\.?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
  const fator = () => {
    if (s[i] === '+') { i++; return fator(); }
    if (s[i] === '-') { i++; return -fator(); }
    if (s[i] === '(') { i++; const v = soma(); if (s[i] !== ')') throw 0; i++; return v; }
    return num();
  };
  const termo = () => { let v = fator(); while (s[i] === '*' || s[i] === '/') { const op = s[i++], w = fator(); v = op === '*' ? v * w : v / w; } return v; };
  const soma = () => { let v = termo(); while (s[i] === '+' || s[i] === '-') { const op = s[i++], w = termo(); v = op === '+' ? v + w : v - w; } return v; };
  try { const v = soma(); return i === s.length && Number.isFinite(v) ? v : null; } catch { return null; }
};
// mostra o resultado da conta ao lado do campo enquanto digita (ex.: "= 28")
document.addEventListener('input', (e) => {
  const el = e.target; if (!(el instanceof HTMLInputElement) || el.type !== 'text' && el.inputMode !== 'decimal') return;
  const temConta = /\d\s*[-+*/x×÷]\s*[\d(]/i.test(el.value);
  let dica = el.parentElement?.querySelector(':scope > .conta-dica');
  if (!temConta) { dica?.remove(); return; }
  const v = window.tracoConta(el.value);
  if (!dica) { dica = document.createElement('span'); dica.className = 'conta-dica'; el.insertAdjacentElement('afterend', dica); }
  dica.textContent = v == null ? '= ?' : `= ${Number(v.toFixed(3)).toString().replace('.', ',')}`;
}, true);

// teclas de conta (÷ × − +) junto do campo de medida: o teclado numérico do celular não tem esses sinais
(() => {
  const montar = () => {
    for (const id of ['profileLength', 'measureInput']) {
      const inp = document.getElementById(id); if (!inp || inp.dataset.contaTeclas) continue; inp.dataset.contaTeclas = '1';
      const bar = document.createElement('span'); bar.className = 'conta-teclas';
      for (const [t, c] of [['÷', '/'], ['×', '*'], ['−', '-'], ['+', '+']]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.tabIndex = -1; b.title = 'Conta: ' + t;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (inp.disabled) return; const a = inp.selectionStart ?? inp.value.length, z = inp.selectionEnd ?? a;
          inp.value = inp.value.slice(0, a) + c + inp.value.slice(z); inp.focus(); try { inp.setSelectionRange(a + 1, a + 1); } catch { /* */ } inp.dispatchEvent(new Event('input', { bubbles: true })); });
        bar.appendChild(b);
      }
      (inp.closest('label') || inp).insertAdjacentElement('afterend', bar);
    }
    const sim = document.getElementById('simetrico');
    if (sim && !sim.dataset.ok) { sim.dataset.ok = '1'; sim.addEventListener('click', () => { const on = window.tracoSimetrico?.(); sim.setAttribute('aria-pressed', String(!!on)); sim.classList.toggle('primary-button', !!on); sim.classList.toggle('secondary-button', !on); }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
