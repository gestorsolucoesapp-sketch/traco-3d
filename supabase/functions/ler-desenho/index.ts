// ler-desenho — lê a FOTO de um desenho à mão (planta em metros ou peça em mm)
// e devolve os segmentos com as medidas ESCRITAS no papel. Não estima nada:
// medida que não está escrita volta como null para o usuário preencher.
// Segredo necessário: ANTHROPIC_API_KEY. Publicada com --no-verify-jwt (o app não tem login),
// por isso aceita só a origem do app e limita o tamanho da imagem.

const ORIGENS = [
  "https://gestorsolucoesapp-sketch.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "https://traco-estudio.vercel.app",
];
const permitida = (o: string | null) => !!o && ORIGENS.includes(o);
const MODELO = Deno.env.get("TRACO_MODELO") ?? "claude-sonnet-5-5";
const MAX_IMAGEM = 3_500_000; // ~2,6 MB de JPEG em base64

function cors(origin: string | null) {
  const ok = permitida(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ORIGENS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

const PROMPT = `Você vai ler a FOTO de um desenho técnico feito à mão e devolver a geometria como JSON.

REGRAS ABSOLUTAS
- Use SOMENTE medidas que estejam ESCRITAS no desenho. Nunca estime pelo tamanho do traço.
- Se um lado não tiver medida escrita, ou a escrita estiver ilegível, use null em comprimento e explique em "avisos".
- "texto_lido" é exatamente o que está escrito ao lado do traço (ex.: "2,50", "1.20 m", "35mm"), ou null.
- Direção em graus: 0 = para a direita, 90 = para cima, 180 = para a esquerda, 270 = para baixo. Use o ângulo real do traço; paredes retas costumam ser 0/90/180/270.
- Percorra cada contorno em sequência, segmento após segmento, sem pular, começando por um canto.

DECIDA O TIPO
- "planta": paredes/ambientes, medidas em metros (ex.: 2,50 ; 3.20 m ; 250 cm). Converta tudo para METROS.
- "peca": peça mecânica, medidas em milímetros. Converta tudo para MILÍMETROS.
- Se o usuário indicou o tipo, respeite: TIPO_PEDIDO.

FORMATO (responda só o JSON, sem texto em volta)
{
  "tipo": "planta" | "peca",
  "planta": { "contornos": [ { "fechado": true|false, "segmentos": [ { "angulo": 0, "comprimento_m": 2.5 | null, "texto_lido": "2,50" | null } ] } ] },
  "peca": { "segmentos": [ { "angulo": 0, "comprimento_mm": 40 | null, "texto_lido": "40" | null } ],
            "operacao": "extrusao" | "revolucao", "profundidade_mm": 20 | null, "texto_profundidade": "20" | null,
            "parede_mm": 0.5 | null, "parede_fundo_mm": 1 | null },
  "avisos": [ "frase curta em português" ]
}
- Preencha só o bloco do tipo escolhido; o outro fica null.
- peca: o perfil é um contorno FECHADO. Para "revolucao", descreva meio perfil começando no eixo de giro. "profundidade_mm" só se estiver escrita (espessura/profundidade); senão null.
- planta: cada parede é um segmento; ambientes separados viram contornos separados.

DESENHO TÉCNICO (CAD, com cotas de diâmetro Ø, alturas, espessuras)
- Pode ser peça de revolução (pote, copo, tampa, flange): use "revolucao" e descreva MEIO perfil começando no eixo (x = 0) na base, raio = Ø/2.
- Pode calcular comprimentos e ângulos a partir das COTAS ESCRITAS (soma, subtração, metade do Ø, ângulo de parede inclinada por atan das cotas). Isso não é estimar. O que não sair das cotas escritas fica null com aviso.
- Seja econômico: no máximo 60 segmentos; detalhes pequenos sem cota (raios de canto, chanfros) podem ser simplificados, avisando.
- FUNDO DE POTE TERMOFORMADO / INJETADO (muito comum): o centro do fundo costuma ser uma PLACA levantada (rebaixo por baixo), com uma cota de altura do chão até a face de cima da placa (ex.: 3,00), uma cota de espessura da placa (ex.: 1,00) e DOIS diâmetros próximos na borda da placa (ex.: Ø55 e Ø57: o menor é a face de cima, o maior é a face de baixo), e o pé/anel de apoio num Ø maior (ex.: Ø81) encostado no chão. NÃO simplifique esse fundo como plano. O contorno de FORA (o que você devolve) passa por BAIXO da placa: comece no eixo na altura (altura da face de cima − espessura da placa) (ex.: 3 − 1 = 2), vá para a direita até o raio do Ø MAIOR da borda (ex.: 28,5), desça em rampa até o raio do pé no chão (ex.: 40,5 na altura 0) e depois siga a parede. O último segmento volta pelo eixo até a altura em que começou.
- "parede_fundo_mm": espessura da placa do centro do fundo, só se estiver cotada (ex.: 1,00). "parede_mm": espessura da parede lateral, só se estiver cotada; senão null. Explique nos avisos qual cota virou o quê.
- Responda SÓ o JSON, sem crases nem explicação.`;

const PROMPT_NARRAR = `O usuário descreveu, falando ou escrevendo, peças mecânicas que quer modelar em 3D.
Transforme a descrição em JSON. Medidas em MILÍMETROS.

REGRAS ABSOLUTAS
- Use SOMENTE medidas ditas pelo usuário. Medida não dita = null. Nunca invente altura, comprimento ou tipo de cabeça.
- Rosca métrica: "rosca de 6 mm", "M6" → rosca "M6", diametro 6. Passo só se o usuário disser (ex.: "M6x0,75" → passo 0.75); senão null.
- "profundidade" de furo/rosca = quanto entra na peça. "passante"/"vazado de lado a lado" → passante true.
- Se pedir um parafuso/porca "para essa rosca", use a mesma rosca do furo.
- O que não couber nos tipos abaixo vai em "nao_suportado" (frase curta). Não force.

TIPOS SUPORTADOS
- "cilindro": diametro, altura, furos[]
- "bloco": largura, comprimento, altura, furos[]
- "parafuso": rosca, diametro, passo, comprimento (só a parte roscada, sem a cabeça), cabeca ("sextavada" | "allen" | "sem_cabeca" | null)
- "porca": rosca, diametro, passo
- "mola": diametro (diâmetro EXTERNO), fio (diâmetro do arame), espiras (número de voltas), passo (distância entre voltas). "15 espiras"/"15 voltas" → espiras 15. "mola M8" ou "mola para M8" → diametro 8 e um aviso "Mola: usei 8 mm (de M8) como diâmetro externo — confira." Arame e passo só se forem ditos.
- "engrenagens" (par de engrenagens retas): modulo, dentes1, dentes2, espessura
- "cremalheira" (pinhão e cremalheira): modulo, dentes (do pinhão), comprimento (da cremalheira), espessura
- "biela_manivela": manivela (raio da manivela), biela (comprimento entre centros), pistao (diâmetro do pistão), espessura
- "came" (came excêntrico com seguidor): raio (do came), excentricidade, espessura, haste (diâmetro da haste do seguidor)
- "dobradica": comprimento, largura (de cada aba), espessura (da aba), pino (diâmetro do pino), abertura (graus)
- "polias" (duas polias com correia): diametro1, diametro2, distancia (entre centros), largura
- furo (sempre no centro da face): { "face": "topo" | "base", "diametro", "rosca" (ex. "M6" ou null se for furo liso), "passo", "profundidade", "passante" }

FORMATO (só o JSON)
{ "pecas": [ { "tipo": "...", "nome": "nome curto", ...campos } ], "avisos": ["..."], "nao_suportado": ["..."] }`;

const PROMPT_RASCUNHO = `Você ajuda num QUADRO LIVRE de rascunhos (estilo Freeform) de um engenheiro brasileiro.
O usuário pede ideias, listas, mapas mentais, fluxos ou DESENHOS de objetos. Monte os elementos para colocar no quadro.

ÁREA: coordenadas em pixels, x de 0 a 1200 (direita), y de 0 a 900 (para baixo). Não sobreponha elementos.

ELEMENTOS (lista "itens")
- { "tipo": "nota", "id": "n1", "x": 0, "y": 0, "texto": "frase curta", "cor": "amarelo"|"rosa"|"verde"|"azul"|"lilas" } — nota adesiva de 160x160; texto de até ~90 caracteres.
- { "tipo": "texto", "x": 0, "y": 0, "texto": "título ou lista (use \\n para quebrar linha)", "tam": 18 a 44 }
- { "tipo": "desenho", "id": "d1", "x": 0, "y": 0, "w": 300, "h": 300, "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 300\">...</svg>" } — desenho vetorial limpo do objeto (traço escuro #222, preenchimentos suaves, estilo esboço técnico/ilustração). Sem texto longo, sem imagens externas, sem script. Até 15000 caracteres.
- { "tipo": "seta", "de": "n1", "para": "n2" } — liga dois elementos pelo id.
- { "tipo": "ret" | "circ" | "linha", "x": 0, "y": 0, "x2": 100, "y2": 100, "cor": "#2e6fd8" } — moldura ou destaque.

COMO ESCOLHER
- Ideias / brainstorm: um título (texto) + 5 a 12 notas organizadas em grade ou em volta do tema; cores por grupo.
- Mapa mental: nota central + ramos ligados por setas.
- Fluxo / processo: notas em sequência ligadas por setas.
- Objeto / "desenhe": 1 desenho grande e bem feito (pode ter vistas) + notas curtas com partes ou medidas se fizer sentido.
- Escreva em português do Brasil, frases curtas e práticas. Se o pedido citar o que já está no quadro, use isso como contexto.

FORMATO (só o JSON, sem crases)
{ "titulo": "curto", "itens": [ ... ] }`;

const PROMPT_PROJETO = `Você é um engenheiro de produto que projeta peças para IMPRESSÃO 3D FDM (impressoras Bambu Lab P2S / U1, mesa 256 × 256 × 256 mm).
Recebe a ideia do projeto (e às vezes notas de um quadro de rascunhos) e devolve as peças como FORMAS SÓLIDAS com PARÂMETROS.

PARÂMETROS (o mais importante)
- Toda medida relevante vira um parâmetro com id curto (letras, números, _), ex.: {"id":"tela_L","nome":"Largura da placa da tela","valor":86,"unidade":"mm","origem":"componente","obs":"ILI9341 2,8\" módulo vermelho comum"}.
- "origem": "usuario" (o usuário disse), "componente" (medida da ficha técnica de um componente comprado pronto — diga qual em obs), "projeto" (regra de projeto: parede, folga, raio), "estimado" (você chutou porque não sabe). Use "estimado" sempre que não tiver certeza — o app pinta de vermelho para o usuário conferir. NUNCA esconda uma suposição.
- As formas usam os ids em expressões: "tela_L + 2*folga + 2*parede". Funções: min, max, sqrt, abs, round. Parâmetro pode depender de outro já declarado antes.

FORMAS (mm, Z para cima, "centro" = centro geométrico da forma, "rot" = [rx, ry, rz] graus, opcional)
- {"tipo":"caixa","tam":[x,y,z],"raio":r,"centro":[x,y,z]}  (raio arredonda as quinas; 0 = quina viva)
- {"tipo":"cilindro","d":d,"h":h,"centro":[...]}  (eixo Z; para furo de lado use rot [0,90,0] ou [90,0,0])
- {"tipo":"cone","d1":d_baixo,"d2":d_cima,"h":h,"centro":[...]}
- {"tipo":"esfera","d":d,"centro":[...]}   {"tipo":"hexagono","s":medida_entre_faces,"h":h,"centro":[...]}   {"tipo":"toro","D":d_maior,"d":d_tubo,"centro":[...]}
- {"op":"uniao","itens":[...]}  {"op":"diferenca","itens":[corpo, furo1, furo2, ...]} (primeiro menos os outros)  {"op":"intersecao","itens":[...]}
- {"op":"repetir","item":forma,"n":[nx,ny,nz],"passo":[dx,dy,dz],"centro":[...]}  (cópias centradas; ótimo para furos de ventilação)
- {"op":"espelho","eixo":"x","item":forma}  (a forma + a cópia espelhada)
- Qualquer nó aceita "centro" e "rot" (move/gira o grupo inteiro).

REGRAS DE IMPRESSÃO 3D
- Parede mínima 1,6 mm (caixas: 2 a 2,4 mm). Folga de encaixe entre peças 0,2–0,3 mm; folga em volta de placas eletrônicas 0,5 mm.
- Furo para parafuso M3 passante 3,4 mm; para M3 rosqueado direto no plástico 2,8 mm; inserto quente M3 = furo 4,0 mm × 5 mm de fundo. Torre de parafuso com Ø 7 mm.
- Evite balanço maior que 45° e pontes longas. Cada peça deve ter uma face plana para apoiar na mesa; diga como imprimir em "impressao" e, se precisar girar para imprimir, "imprimir_rot":[rx,ry,rz].
- Peças em posição de MONTAGEM (todas no mesmo sistema de coordenadas, encaixadas). O app separa e deita cada uma para imprimir.
- Componentes eletrônicos e peças compradas (sensor, placa, bateria, parafuso) NÃO são impressos: não vire peça, só os espaços/fixações para eles.
- Seja fiel à ideia: janelas para tela/sensor, furos de botões, conectores, ventilação, encaixes.

ETAPAS: o app pede em duas etapas para responder rápido. Siga o FORMATO da etapa pedida no fim da mensagem.`;

const FORMATO_PLANO = `ETAPA 1 — PLANO (só o JSON, compacto, sem crases)
{ "nome": "nome curto", "resumo": "1 frase",
  "parametros": [ ... as medidas que as peças vão usar, no máximo 30; "obs" só quando ajudar, até 60 caracteres ],
  "pecas": [ { "nome": "Caixa (base)", "descricao": "até 400 caracteres: o que a peça tem e onde, citando ids dos parâmetros e as posições (ex.: janela da tela centrada em x=0,y=tela_y na face +Z; 4 torres M3 nos cantos a 5 mm das paredes)", "impressao": "como imprimir", "imprimir_rot": [0,0,0] } ],
  "montagem": [ "passo curto" ], "conferir": [ "o que medir antes" ] }
No máximo 6 peças; montagem e conferir com no máximo 6 itens curtos cada. JSON numa linha só, sem espaços sobrando. Defina bem o sistema de coordenadas comum (onde fica a origem) na descrição da primeira peça.`;

const FORMATO_PECA = `ETAPA 2 — UMA PEÇA (só o JSON, compacto, sem crases)
{ "forma": { ... árvore de formas da peça pedida, usando os ids dos parâmetros do plano ... }, "parametros_novos": [ toda medida com nome que você usar e que NÃO está no plano ] }
Regra: todo id usado nas expressões tem que estar no plano ou em "parametros_novos" — senão a peça não sai.`;

async function chamar(system: string, texto: string, chave: string, h: Record<string, string>, max: number, pensar = "") {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: max, system, messages: [{ role: "user", content: texto }], ...(["low", "medium", "high"].includes(pensar) ? { output_config: { effort: pensar } } : {}) }),
  });
  if (!r.ok) {
    console.error("anthropic", r.status, (await r.text()).slice(0, 500));
    return new Response(JSON.stringify({ erro: [429, 500, 502, 503, 529].includes(r.status) ? "A IA está ocupada agora (" + r.status + "). Tente de novo em instantes." : `IA respondeu ${r.status}.` }), { status: [429, 500, 502, 503, 529].includes(r.status) ? 503 : 502, headers: h });
  }
  const dados = await r.json();
  const t: string = (dados.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").replace(/```(?:json)?/gi, "");
  try {
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); j._uso = { ...dados.usage, tipos: (dados.content ?? []).map((c: { type: string }) => c.type) };
    return new Response(JSON.stringify(j), { headers: h });
  } catch {
    console.error("json", dados.stop_reason, JSON.stringify(dados.usage), t.slice(0, 300));
    return new Response(JSON.stringify({ erro: dados.stop_reason === "max_tokens" ? "Resposta grande demais. Peça menos detalhes de uma vez." : "A IA não conseguiu montar a resposta. Tente de novo." }), { status: 422, headers: h });
  }
}


async function projeto(p: Record<string, string>, chave: string, h: Record<string, string>) {
  if (p.fase === "peca") {
    const txt = `PLANO DO PROJETO (JSON):\n${(p.plano || "").slice(0, 30000)}\n\nGere a forma da peça número ${Number(p.indice) + 1}: "${(p.nome || "").slice(0, 200)}".${p.ajuste ? `\nAjuste pedido pelo usuário: ${p.ajuste.slice(0, 1500)}` : ""}\n\n${FORMATO_PECA}`;
    return chamar(PROMPT_PROJETO, txt, chave, h, 12000, p.pensar || "medium");
  }
  const partes = [`Ideia: ${(p.ideia || "").slice(0, 3000)}`];
  if (p.quadro) partes.push(`Notas do quadro de rascunhos:\n${p.quadro.slice(0, 4000)}`);
  if (p.pedido) partes.push(`O que imprimir: ${p.pedido.slice(0, 1500)}`);
  if (p.medidas) partes.push(`Medidas que o usuário já tem (origem "usuario"): ${p.medidas.slice(0, 1500)}`);
  if (p.atual) partes.push(`Projeto atual (JSON):\n${p.atual.slice(0, 30000)}`);
  if (p.ajuste) partes.push(`AJUSTE pedido: ${p.ajuste.slice(0, 1500)} — devolva o plano completo já ajustado, mantendo ids e valores que o usuário mudou.`);
  partes.push(FORMATO_PLANO);
  return chamar(PROMPT_PROJETO, partes.join("\n\n"), chave, h, 12000, p.pensar || "medium");
}

async function rascunho(pedido: string, contexto: string, chave: string, h: Record<string, string>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 12000, system: PROMPT_RASCUNHO,
      messages: [{ role: "user", content: (contexto ? `Já está no quadro:\n${contexto.slice(0, 3000)}\n\n` : "") + `Pedido: ${pedido.slice(0, 1500)}` }] }),
  });
  if (!r.ok) {
    console.error("anthropic", r.status, (await r.text()).slice(0, 500));
    return new Response(JSON.stringify({ erro: [429, 500, 502, 503, 529].includes(r.status) ? "A IA está ocupada agora (" + r.status + "). Tente de novo em instantes." : `IA respondeu ${r.status}.` }), { status: [429, 500, 502, 503, 529].includes(r.status) ? 503 : 502, headers: h });
  }
  const dados = await r.json();
  const t: string = (dados.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").replace(/```(?:json)?/gi, "");
  try {
    return new Response(JSON.stringify(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1))), { headers: h });
  } catch {
    console.error("json", dados.stop_reason, t.slice(0, 300));
    return new Response(JSON.stringify({ erro: dados.stop_reason === "max_tokens" ? "Pedido grande demais de uma vez. Peça menos itens ou um desenho por vez." : "A IA não conseguiu montar o quadro. Tente explicar de outro jeito." }), { status: 422, headers: h });
  }
}

async function narrar(texto: string, chave: string, h: Record<string, string>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 2000, system: PROMPT_NARRAR,
      messages: [{ role: "user", content: texto.slice(0, 2000) }] }),
  });
  if (!r.ok) {
    console.error("anthropic", r.status, (await r.text()).slice(0, 500));
    return new Response(JSON.stringify({ erro: [429, 500, 502, 503, 529].includes(r.status) ? "A IA está ocupada agora (" + r.status + "). Tente de novo em instantes." : `IA respondeu ${r.status}.` }), { status: [429, 500, 502, 503, 529].includes(r.status) ? 503 : 502, headers: h });
  }
  const dados = await r.json();
  const t: string = (dados.content ?? []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n");
  try {
    const json = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    return new Response(JSON.stringify(json), { headers: h });
  } catch {
    return new Response(JSON.stringify({ erro: "Não entendi a descrição. Tente de novo com as medidas." }), { status: 502, headers: h });
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Use POST." }), { status: 405, headers: h });
  if (!permitida(origin))
    return new Response(JSON.stringify({ erro: "Origem não autorizada." }), { status: 403, headers: h });

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return new Response(JSON.stringify({ erro: "Servidor sem ANTHROPIC_API_KEY." }), { status: 500, headers: h });

  let corpo: { imagem?: string; tipo?: string; midia?: string; texto?: string; rascunho?: string; contexto?: string; projeto?: Record<string, string> };
  try { corpo = await req.json(); } catch {
    return new Response(JSON.stringify({ erro: "Corpo inválido." }), { status: 400, headers: h });
  }
  if (corpo.projeto && typeof corpo.projeto === "object") return projeto(corpo.projeto, chave, h);
  if (typeof corpo.rascunho === "string" && corpo.rascunho.trim()) return rascunho(corpo.rascunho.trim(), typeof corpo.contexto === "string" ? corpo.contexto : "", chave, h);
  if (typeof corpo.texto === "string" && corpo.texto.trim()) return narrar(corpo.texto.trim(), chave, h);
  const imagem = (corpo.imagem ?? "").replace(/^data:[^,]+,/, "");
  if (!imagem || imagem.length > MAX_IMAGEM)
    return new Response(JSON.stringify({ erro: "Imagem ausente ou grande demais." }), { status: 413, headers: h });
  const midia = ["image/jpeg", "image/png", "image/webp"].includes(corpo.midia ?? "") ? corpo.midia! : "image/jpeg";
  const tipo = corpo.tipo === "planta" || corpo.tipo === "peca" ? corpo.tipo : "decida pela foto";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: midia, data: imagem } },
          { type: "text", text: PROMPT.replace("TIPO_PEDIDO", tipo) },
        ],
      }],
    }),
  });
  if (!r.ok) {
    const det = await r.text();
    console.error("anthropic", r.status, det.slice(0, 500));
    return new Response(JSON.stringify({ erro: [429, 500, 502, 503, 529].includes(r.status) ? "A IA está ocupada agora (" + r.status + "). Tente de novo em instantes." : `IA respondeu ${r.status}.` }), { status: [429, 500, 502, 503, 529].includes(r.status) ? 503 : 502, headers: h });
  }
  const dados = await r.json();
  const texto: string = (dados.content ?? []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n");
  const limpo = texto.replace(/```(?:json)?/gi, "");
  const ini = limpo.indexOf("{"), fim = limpo.lastIndexOf("}");
  try {
    const json = JSON.parse(limpo.slice(ini, fim + 1));
    return new Response(JSON.stringify(json), { headers: h });
  } catch {
    console.error("json", dados.stop_reason, limpo.slice(0, 300));
    const motivo = dados.stop_reason === "max_tokens"
      ? "O desenho tem detalhes demais para ler de uma vez. Recorte a foto mostrando só o perfil (meia peça) ou use \"Narrar\"."
      : "A IA não conseguiu montar as medidas desta foto. Tente uma foto mais reta e nítida, ou use \"Narrar\".";
    return new Response(JSON.stringify({ erro: motivo }), { status: 422, headers: h });
  }
});
