// ler-desenho — lê a FOTO de um desenho à mão (planta em metros ou peça em mm)
// e devolve os segmentos com as medidas ESCRITAS no papel. Não estima nada:
// medida que não está escrita volta como null para o usuário preencher.
// Segredo necessário: ANTHROPIC_API_KEY. Publicada com --no-verify-jwt (o app não tem login),
// por isso aceita só a origem do app e limita o tamanho da imagem.

const ORIGENS = [
  "https://gestorsolucoesapp-sketch.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const MODELO = Deno.env.get("TRACO_MODELO") ?? "claude-sonnet-5-5";
const MAX_IMAGEM = 3_500_000; // ~2,6 MB de JPEG em base64

function cors(origin: string | null) {
  const ok = origin && ORIGENS.includes(origin);
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
- planta: cada parede é um segmento; ambientes separados viram contornos separados.`;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Use POST." }), { status: 405, headers: h });
  if (!origin || !ORIGENS.includes(origin))
    return new Response(JSON.stringify({ erro: "Origem não autorizada." }), { status: 403, headers: h });

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return new Response(JSON.stringify({ erro: "Servidor sem ANTHROPIC_API_KEY." }), { status: 500, headers: h });

  let corpo: { imagem?: string; tipo?: string; midia?: string };
  try { corpo = await req.json(); } catch {
    return new Response(JSON.stringify({ erro: "Corpo inválido." }), { status: 400, headers: h });
  }
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
      max_tokens: 3000,
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
    return new Response(JSON.stringify({ erro: `IA respondeu ${r.status}.` }), { status: 502, headers: h });
  }
  const dados = await r.json();
  const texto: string = (dados.content ?? []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n");
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  try {
    const json = JSON.parse(texto.slice(ini, fim + 1));
    return new Response(JSON.stringify(json), { headers: h });
  } catch {
    return new Response(JSON.stringify({ erro: "A IA não devolveu um resultado legível. Tente outra foto." }), { status: 502, headers: h });
  }
});
