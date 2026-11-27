# Traço — planta para 3D

Editor web híbrido. **Arquitetura** desenha paredes em planta e vê o resultado em 3D, com portas, janelas e piso. **Mecânica · peças** transforma um contorno 2D em sólido por extrusão ou revolução, em milímetros. Abra `index.html` em um navegador moderno. Funciona com mouse, dedo ou caneta, sem conta.

## Desenho preciso

O modo Arquitetura começa em **Alicerce**, com os traços na planta e uma base baixa na vista 3D. Use **Retângulo** e arraste dois cantos para criar quatro lados fechados de uma vez, ou use **Linha** para montar o contorno por segmentos. A prévia do retângulo mostra largura e comprimento em metros.

Depois de desenhar, use **Equidistância** para informar a espessura entre 10 e 30 cm. A espessura é aplicada igualmente para os dois lados da linha central; a planta mostra as duas bordas. Use **Empurrar/Puxar paredes** no painel 3D para elevar o alicerce: arraste para cima/baixo ou digite diretamente a altura em metros enquanto move o modelo e pressione **Enter**. A vista muda para Perspectiva para mostrar a elevação. **Esc** cancela a prévia.

1. Selecione **Linha**, clique ou toque no ponto inicial e aponte a direção. No PC, digite a medida diretamente no teclado, sem clicar no campo, e pressione **Enter** para concluir. A linha só vira parede quando você informar a medida.
2. Pontos existentes, eixos horizontal/vertical e a grade de 10 cm atraem a linha. O toque tem uma área de encaixe maior no celular. Segure **Alt** para ignorar o encaixe com mouse.
3. Digite uma medida como `2,50 m`, `250 cm` ou `2500 mm` e pressione **Enter**. A prévia assume a medida enquanto você digita. Você também pode digitar antes do segundo clique: esse clique conclui a parede. Sem medida, o segundo clique no PC abre a caixa e a linha permanece em prévia; cliques fora dela pedem a medida, sem apagar o desenho anterior. Se o fim estiver encaixado em outra ponta e a medida for incompatível, a linha aguarda a correção. **Esc** cancela a prévia.
4. Antes de confirmar a medida, arraste a ponta da prévia para ajustar a direção. No celular, o teclado só abre quando você toca na caixa de medida. Depois de confirmar, arraste a parede pelo meio para movê-la sem alterar o comprimento. Toque no meio da parede, digite outra medida e pressione **Enter** para alterar o comprimento. Paredes ligadas acompanham o movimento; **Desfazer** recupera o desenho anterior.
5. Use **Livre** para rascunhar sem pontos discretos. Use **Apagar** ou **Desfazer** para corrigir.

## Inferência estilo SketchUp (Linha)

- **Clique conclui a linha** no ponto inferido (no PC). A próxima linha já sai da ponta da anterior; **Esc** encerra. Fechar num ponto já desenhado encerra a sequência.
- Marcadores com etiqueta junto ao cursor: **Ponto final** (verde), **Ponto médio** (ciano), **Na aresta** (vermelho), **No eixo vermelho** (horizontal), **No eixo verde** (vertical) e **A partir do ponto** (guia tracejada até um ponto já desenhado, na mesma altura ou coluna).
- **Enter** sem medida conclui quando há inferência (ponto, médio, aresta ou alinhamento). Digitando a medida, ela manda.
- **Tecla A**: digite um ângulo (0° = direita, 90° = cima) e Enter — a direção trava nesse ângulo; puxe com o mouse ou digite a medida. Vale na Arquitetura e na Linha mm das peças.
- **Shift** (segurar) trava a direção atual. **Seta →** trava no eixo vermelho, **Seta ←** no eixo verde; aperte de novo para soltar.

## Elementos arquitetônicos

- **Porta**: selecione e toque numa parede. Abre um vão de 90 cm com altura de até 2,10 m.
- **Janela**: selecione e toque numa parede. Abre um vão de 1,20 m entre peitoril de 90 cm e verga de até 2,10 m.
- Cada segmento aceita uma abertura nesta versão. **Apagar** remove a abertura quando você toca nela; caso contrário, remove a parede tocada.
- **Espessura da parede** ajusta todas as paredes entre 10 e 30 cm.
- **Piso no contorno fechado** gera uma laje de 14 cm apenas quando existe um ciclo simples de paredes. A área mostrada usa a linha central das paredes e é aproximada. Planta aberta não recebe piso automático.

Use **Perspectiva**, **Alicerce** ou **Frontal** para mudar a câmera. Fora da ferramenta Empurrar/Puxar, arraste o painel 3D para girar e use a roda do mouse para ampliar. Ajuste a altura preparada para a elevação e a escala do plano. **Ver exemplo** carrega um alicerce de demonstração.
Defina a escala antes de desenhar. Depois da primeira parede, ela fica travada para preservar as medidas já confirmadas.

## Foto do desenho → 3D

**📷 Foto do desenho** (nos dois modos) envia a foto para a função `ler-desenho` (Supabase + API Claude), que devolve os traços com as medidas **escritas no papel**. Uma folha de conferência mostra cada traço (direção, medida, o que estava escrito); medida que não estava escrita fica em vermelho e precisa ser digitada — nada é estimado. **Gerar 3D** cria as paredes (planta, em metros) ou o perfil da peça (mm, extrusão ou revolução). O app avisa quando as medidas não fecham o contorno.

Publicação: `.github/workflows/deploy-ler-desenho.yml` publica a função e grava o endereço em `config.js`. Precisa dos segredos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` e `ANTHROPIC_API_KEY` no repositório.

## Narrar peça

**🎙️ Narrar peça** (Mecânica): fale (microfone do navegador, pt-BR) ou escreva a peça com as medidas. A IA (mesma função `ler-desenho`, modo texto) devolve as peças com **só as medidas ditas**; um formulário mostra tudo e marca em vermelho o que faltou — **Gerar 3D** só libera completo. Passo da rosca (ISO grossa), cabeça sextavada ISO 4017, allen ISO 4762 e porca ISO 4032 vêm de tabela de norma e aparecem marcados "ISO". **Montar sem IA** usa o mesmo formulário sem servidor.

Tipos: cilindro e bloco (com até 2 furos centrais, topo/base, liso ou roscado, cego ou passante), parafuso (sextavado, allen ou barra roscada) e porca, M3 a M24, com rosca helicoidal real e campo de folga para impressão 3D. Malhas fechadas; **Exportar STL** gera um arquivo por peça.

## Ferramentas estilo SketchUp (Arquitetura)

◯ **Círculo/Polígono** (raio digitado; "6l" muda para 6 lados) · ⌒ **Arco** (início, fim, bojo) · ✥ **Mover/Copiar** (Ctrl ou "＋ Cópia"; depois "3x" repete em matriz) · ⟲ **Girar** (centro, referência, ângulo digitado; trava a cada 15°) · ⇋ **Espelhar** (eixo por 2 pontos) · 📏 **Fita métrica** (guia paralela à parede na distância digitada, as guias entram na inferência; em dois pontos só mede) · ↔ **Cota** e **A Texto** (anotações salvas no projeto; o Apagar remove). Esc cancela a ferramenta.

## Objetos (🪑)

Biblioteca própria (cama, sofá, mesa, cadeira, cozinha, banheiro, escada, pilar, árvore, carro) com medidas editáveis; modelos grátis do **Poly Haven** (CC0, baixados na hora, cor média da textura); e importação de **OBJ, GLB/glTF, DAE (Collada — o formato que o 3D Warehouse oferece) e STL**, com escolha de unidade e opção de pôr em pé. Modelos grandes são simplificados (até 3.500 triângulos). Na planta: arrastar move (encaixe de 5 cm), **R** gira 90°, **Delete** apaga, painel com largura/profundidade/altura, duplicar. Tudo vai junto no 3D, no projeto salvo e no OBJ exportado.

## Prancha PDF e vinheta

**🖨️ Prancha PDF** (nos dois modos): folha A4/A3 deitada com moldura, carimbo com a marca (projeto, cliente, responsável, data, escala, unidade, folha), escala normalizada automática. Arquitetura: planta baixa com paredes cheias, portas (com giro) e janelas, cota de cada parede e totais, área do piso, objetos, cotas/textos do usuário e perspectiva. Peças: vistas frontal, superior e lateral esquerda em 1º diedro (NBR 10067) com cotas gerais, linhas de centro, notas técnicas (roscas ISO, furos, folga) e perspectiva. **Imprimir / Salvar PDF** ou **Baixar SVG**. Vinheta de abertura uma vez por sessão (toque pula).

## 🧊 Modelagem 3D

Aba **🧊 Modelagem 3D**: monta peças com vários **corpos**. Cada corpo é um contorno (retângulo com cantos arredondados, círculo, rasgo, contorno livre ou o contorno desenhado na aba Peças) extrudado numa espessura, com **furos, rasgos e recortes em qualquer posição**. Corpos com o mesmo nome de **peça (grupo)** viram um arquivo de impressão.

- **Adicionar corpo**: Chapa, Cilindro/bucha, Caixa oca (fundo + paredes), Do desenho (usa o perfil fechado da aba Mecânica · peças) e STL (importa uma malha para posicionar junto).
- **Furos**: Furo redondo, Rasgo oblongo e Recorte retangular. O novo furo nasce no lugar livre mais perto do centro. Com um furo escolhido: **Padrão circular** (n cópias em volta de um centro), **Matriz** (colunas × linhas com passo) e **Espelhar**. No quadro 2D, arraste o furo para mover (passo 0,5 mm; Alt = 0,1 mm). Furo fora do contorno ou encostando em outro fica **vermelho** e não é aplicado — nada é corrigido sozinho.
- **Posição**: X/Y/Z e giro em X/Y/Z por corpo e também da peça inteira (ex.: berço inclinado da câmera).
- **Material** (PETG, PLA, ASA, ABS, TPU, PLA-CF, PETG-CF) dá o peso a 100% de preenchimento. **Referência** aparece no 3D (motor, hélice, bateria) mas não entra no peso nem no STL.
- **Vista 3D**: Perspectiva, Cima, Frente, Lado, Explodir e mostrar/ocultar Referências.
- **Peças para imprimir**: peso de cada peça e **⬇ STL** (binário, mm) por peça ou todas.
- **⭐ Exemplo**: chassi do drone térmico ORION-T3 (3", 136 mm motor a motor, AIO 25,5 mm, motores 1404, carcaça, ninho do GPS, trem de pouso TPU, apoio da bateria e berço da câmera térmica inclinado 30°).
- Desfazer/refazer (Ctrl+Z), salvar/abrir modelo em arquivo (💾/📂). Tudo fica no aparelho e funciona sem internet.

Limites: corpos são extrusões (não há fusão booleana entre corpos; o fatiador junta os que se sobrepõem numa mesma peça) e furos atravessam o corpo inteiro.

## Zoom e tela cheia

Nos quadros de desenho (Arquitetura e Peças): **roda do mouse / pinça do trackpad** aproxima no ponto do cursor; **arrastar com o botão do meio, o direito ou segurando Espaço** move a vista; botões **− / Ver tudo / +** no canto. **⛶ Tela cheia** (computador) abre o desenho na janela inteira com o **3D numa janelinha no canto**, atualizando ao vivo; **Esc** ou o botão saem. Textos, cotas e marcadores mantêm o tamanho na tela com qualquer zoom.

## Arquivos

- **Importar STL** carrega um STL binário ou ASCII como referência visível na cena 3D. Escolha se as coordenadas do arquivo estão em mm, cm ou m; STL não registra essa unidade. A prévia é centralizada no plano e limitada a 4.000 triângulos para manter o navegador responsivo. Arquivos de até 20 MB e 400.000 faces são aceitos.
- **Exportar 3D** baixa paredes com vãos e piso em OBJ, com coordenadas em metros. O STL importado não é incluído nessa exportação.
- **Salvar projeto** baixa JSON com paredes, aberturas, configurações e amostra da prévia STL. **Abrir projeto** restaura esses dados. O navegador também tenta manter uma cópia local.

Este é um estudo geométrico, não um projeto executivo. Ele não interpreta fotos, móveis ou anotações desenhadas, não dimensiona estrutura e não produz renderização fotorrealista por IA. Medidas, acessibilidade, estrutura e normas devem ser conferidas por profissional habilitado antes de construir.

## Peças em milímetros

1. Abra **Mecânica · peças**. O exemplo inicial é um copo cônico oco: topo de 90 mm, base de 65 mm, altura de 110 mm, parede de 2,5 mm e fundo de 4 mm.
2. Altere os cinco campos para atualizar imediatamente o corte 2D e o sólido 3D. Arraste o modelo para girar.
3. Use o menu **Desenho 2D** para Linha mm, Mão livre, Retângulo, Círculo ou Ponto por mm. Retângulo e Círculo são criados arrastando no plano e já formam um contorno fechado. **Novo perfil** limpa a peça atual. A escala do plano fica fixa durante o traço; **Enquadrar** a ajusta manualmente.
4. O menu **Modelagem 3D** oferece Extrusão, Revolução, Empurrar/puxar, Furo passante, Rosca e Mola. Extrusão mantém o contorno e acrescenta profundidade. Ao digitar a profundidade, toque em **OK** (ou pressione **Enter**) para aplicar. Empurrar/puxar edita essa profundidade. Revolução gira o perfil 360° em torno do eixo. O furo passante é central e está disponível em retângulos e círculos extrudados. Rosca e mola são geradores helicoidais simples com diâmetro, passo, voltas e espessura configuráveis.
5. Para linhas exatas, selecione **Linha mm**. Clique no ponto inicial, aponte a direção, digite o comprimento em mm diretamente no teclado e pressione **Enter**. A prévia assume a medida antes de confirmar. Também pode digitar antes do clique final para concluir nesse clique. O campo **Ângulo** trava a direção em graus; vazio, a direção segue o cursor. Para inserir vértices por coordenadas, desligue as ferramentas de desenho, informe **X** (ou **Raio** na revolução) e **Altura** e use **Ponto por mm**.
6. Clique em **Fechar perfil** para gerar o sólido desenhado por linhas ou mão livre. Um contorno aberto ou que cruza a si mesmo não gera STL. **Exportar STL** baixa um STL binário em milímetros. **Salvar peça** e **Abrir peça** usam um JSON próprio; o modo de arquitetura conserva seu projeto separado.

Contornos simples fechados podem ser extrudados; perfis simétricos ao redor de um eixo podem ser revolucionados. Um traço aberto mostra uma prévia de superfície, mas ainda não é um sólido exportável. Furos são centrais e limitados a círculos e retângulos; roscas e molas são aproximações geométricas sem padrão de fabricação, tolerância ou análise estrutural. O modo ainda não oferece montagem ou operações booleanas gerais. As coordenadas aceitam até 10.000.000 mm por segurança numérica, mas STL usa ponto flutuante de 32 bits e perde precisão em medidas extremas. Confira malha, espessura e processo de fabricação em uma ferramenta de engenharia antes de produzir.
