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
            "operacao": "extrusao" | "revolucao", "profundidade_mm": 20 | null, "texto_profundidade": "20" | null },
  "avisos": [ "frase curta em português" ]
}
- Preencha só o bloco do tipo escolhido; o outro fica null.
- peca: o perfil é um contorno FECHADO. Para "revolucao", descreva meio perfil começando no eixo de giro. "profundidade_mm" só se estiver escrita (espessura/profundidade); senão null.
- planta: cada parede é um segmento; ambientes separados viram contornos separados.

DESENHO TÉCNICO (CAD, com cotas de diâmetro Ø, alturas, espessuras)
- Pode ser peça de revolução (pote, copo, tampa, flange): use "revolucao" e descreva MEIO perfil começando no eixo (x = 0) na base, raio = Ø/2.
- Pode calcular comprimentos e ângulos a partir das COTAS ESCRITAS (soma, subtração, metade do Ø, ângulo de parede inclinada por atan das cotas). Isso não é estimar. O que não sair das cotas escritas fica null com aviso.
- Seja econômico: no máximo 60 segmentos; detalhes pequenos sem cota (raios de canto, chanfros) podem ser simplificados, avisando.
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

  let corpo: { imagem?: string; tipo?: string; midia?: string; texto?: string };
  try { corpo = await req.json(); } catch {
    return new Response(JSON.stringify({ erro: "Corpo inválido." }), { status: 400, headers: h });
  }
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
