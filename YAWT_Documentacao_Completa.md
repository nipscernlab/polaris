# YAWT - Yet Another Wave Tracer
## Documentação Técnica Completa

---

# 1. Introdução

O YAWT (Yet Another Wave Tracer) é uma aplicação de visualização de sinais digitais que permite a análise de arquivos VCD (Value Change Dump). Este documento fornece uma explicação completa e detalhada de todos os componentes, funções e fluxos de dados do sistema.

## 1.1 Propósito do Sistema

O YAWT foi desenvolvido para permitir que engenheiros e desenvolvedores visualizem e analisem o comportamento temporal de sinais digitais provenientes de simulações de hardware. O sistema lê arquivos no formato VCD, processa os dados e renderiza formas de onda interativas em um canvas gráfico de alta performance.

## 1.2 Tecnologias Utilizadas

| Tecnologia | Descrição |
|-----------|-----------|
| PIXI.js | Biblioteca de renderização 2D acelerada por WebGL para desenho de gráficos de alta performance |
| Tauri API | Framework para aplicações desktop que permite comunicação entre JavaScript e backend Rust |
| JavaScript ES6 | Linguagem de programação moderna com suporte a módulos, classes e funções assíncronas |

---

# 2. Fluxo de Dados Completo do Sistema

Esta seção descreve o fluxo completo de informações desde a seleção do arquivo VCD até a renderização final das formas de onda na tela.

## 2.1 Etapa 1: Abertura do Arquivo

**Localização no código:** Função `openWavetraceViewer` (linhas 148-175)

O processo inicia quando o usuário seleciona um arquivo VCD para visualização. A função `openWavetraceViewer` recebe dois parâmetros: o caminho completo do arquivo (`filePath`) e o nome do arquivo (`fileName`). Esta função é exportada como ponto de entrada do módulo e pode ser chamada por outros componentes da aplicação.

**Passos executados:**

1. Log inicial no console registrando qual arquivo está sendo aberto
2. Chamada assíncrona para `invoke('read_file')` da API Tauri
3. O backend Rust lê o conteúdo completo do arquivo e retorna como string
4. Armazenamento do caminho e nome do arquivo no estado global

## 2.2 Etapa 2: Parsing do Arquivo VCD

**Localização no código:** Classe `VCDParser` (linhas 56-145)

Após a leitura do arquivo, o conteúdo bruto (string) é passado para uma instância da classe VCDParser. Esta classe é responsável por transformar o texto VCD em estruturas de dados JavaScript manipuláveis.

**Etapas do parsing:**

1. Divisão do conteúdo em linhas individuais usando `split('\n')`
2. Inicialização de estruturas de dados: Map para sinais, Map para valores, array para tempos
3. Leitura sequencial linha por linha com máquina de estados (inHeader = true/false)
4. Na seção de cabeçalho: extração de timescale, scope hierarchy e declarações de variáveis
5. Construção do caminho completo de cada sinal concatenando scope + nome
6. Criação de mapa id-to-signal para lookup rápido durante parsing de valores
7. Após `$enddefinitions`: transição para modo de parsing de valores
8. Detecção de timestamps (#número) e atualização do tempo atual
9. Parsing de mudanças de valor (formato 'b' para buses, formato simples para bits)
10. Associação de cada mudança de valor ao sinal correspondente via ID
11. Ordenação cronológica de todos os timestamps coletados
12. Retorno de objeto estruturado contendo: timescale, array de sinais, timeRange

## 2.3 Etapa 3: Atribuição de Cores aos Sinais

**Localização no código:** Função `assignSignalColors` (linhas 177-184)

Após o parsing bem-sucedido, cada sinal precisa de configurações visuais. A função `assignSignalColors` itera sobre todos os sinais e atribui:

1. **Cor:** Selecionada de uma paleta pré-definida usando operação módulo sobre o índice
2. **Radix:** Sistema numérico para exibição (hexadecimal para sinais multi-bit, binário para bits únicos)
3. **Modo de renderização:** Digital para sinais de 1 bit, analógico para sinais multi-bit
4. **Armazenamento:** Em Maps usando signal.id como chave para acesso O(1)

## 2.4 Etapa 4: Construção da Interface do Usuário

**Localização no código:** Função `initWavetraceUI` (linhas 186-529)

A interface é construída dinamicamente usando manipulação de DOM. Esta é uma das funções mais extensas do código e cria toda a estrutura HTML da aplicação.

**Componentes criados:**

1. **Header:** Barra superior com logo YAWT, nome do arquivo, timescale e controles
2. **Botões de controle:** Zoom In, Zoom Out, Expand Height, Shrink Height, Fit All, Close
3. **Sidebar:** Painel lateral esquerdo contendo lista de todos os sinais disponíveis
4. **Canvas container:** Área principal onde as formas de onda serão desenhadas
5. **Info panel:** Painel inferior com informações detalhadas sobre cursor e sinal selecionado
6. **Inserção:** Do HTML completo no container principal via innerHTML

## 2.5 Etapa 5: População da Lista de Sinais

**Localização no código:** Função `populateSignalList` (linhas 531-597)

Após a criação da estrutura HTML, a lista de sinais precisa ser preenchida com dados reais. Esta função:

1. Organiza sinais em hierarquia de scopes (estrutura em árvore)
2. Cria elementos DOM para cada scope e sinal
3. Adiciona checkboxes para seleção de sinais a serem exibidos
4. Implementa collapse/expand para navegação na hierarquia
5. Anexa event listeners para interação do usuário
6. Renderiza a árvore completa no elemento sidebar

## 2.6 Etapa 6: Inicialização do Canvas PIXI

**Localização no código:** Função `initializeCanvas` (linhas 599-650)

O canvas de renderização é o coração visual do aplicativo. Esta etapa cria uma aplicação PIXI.js configurada especificamente para desenho de formas de onda.

**Configurações do canvas:**

1. Cálculo de dimensões baseado no tamanho da janela menos sidebar e header
2. Criação de PIXI.Application com opções: background color, antialiasing, resolution
3. Anexação do canvas view ao elemento DOM apropriado
4. Criação de container principal para todos os elementos gráficos
5. Habilitação de interatividade no container
6. Adição do container ao stage da aplicação PIXI
7. Armazenamento de referências no estado global
8. Configuração de observers para redimensionamento automático

## 2.7 Etapa 7: Configuração de Event Listeners

**Localização no código:** Função `setupEventListeners` (linhas 652-880)

A interatividade do sistema depende de uma extensa configuração de event listeners. Esta função vincula ações do usuário a comportamentos do sistema.

**Eventos configurados:**

1. Click em botão Close: Chama `closeWavetraceViewer`
2. Click em Zoom In: Aumenta `timeScale` em 20%
3. Click em Zoom Out: Diminui `timeScale` em 20%
4. Click em Vertical Expand: Aumenta altura dos sinais
5. Click em Vertical Shrink: Diminui altura dos sinais
6. Click em Fit All: Ajusta zoom para mostrar todo o intervalo temporal
7. Checkbox de sinais: Adiciona ou remove sinal da lista de exibição
8. MouseMove no canvas: Atualiza posição do cursor temporal
9. MouseDown no cursor: Inicia arrasto de cursor
10. MouseWheel: Implementa scroll horizontal e zoom
11. Click direito: Inicia panning (arrasto da timeline)
12. Resize da janela: Recalcula dimensões e re-renderiza
13. Click em nome de sinal: Seleciona sinal e mostra detalhes
14. Double-click em sinal: Abre menu de configurações

## 2.8 Etapa 8: Renderização Inicial

**Localização no código:** Funções `render` e `drawWaveform` (linhas 882-1329)

Após todas as configurações, a primeira renderização é executada. Este é o processo mais complexo do sistema, envolvendo múltiplas sub-rotinas.

**Pipeline de renderização:**

1. Limpeza de todo conteúdo anterior do container
2. Desenho do background grid (linhas verticais de tempo)
3. Desenho de labels de tempo no eixo horizontal
4. Iteração sobre `displayedSignals` array
5. Para cada sinal: criação de PIXI.Graphics objeto
6. Desenho de background do sinal (faixa horizontal)
7. Desenho do nome do sinal no lado esquerdo
8. Cálculo de conversão tempo-para-pixel
9. Iteração sobre `signal.values` array (todas as mudanças de valor)
10. Para cada mudança: determinação do tipo de waveform
11. Chamada da função de desenho apropriada (digital, bus ou analog)
12. Desenho de cursor temporal se posicionado
13. Aplicação de scroll offset vertical
14. Adição de todos os graphics ao stage

## 2.9 Ciclo de Interação Contínua

Após a renderização inicial, o sistema entra em um ciclo de resposta a eventos do usuário. Cada ação dispara uma cadeia de atualizações:

1. Usuário move o mouse: Cursor é atualizado, `render()` é chamado
2. Usuário dá scroll: `timeOffset` é modificado, `render()` é chamado
3. Usuário faz zoom: `timeScale` é alterado, `render()` é chamado
4. Usuário seleciona sinal: `displayedSignals` é atualizado, `render()` é chamado
5. A função `render()` sempre redesenha completamente o canvas
6. PIXI.js otimiza automaticamente a renderização usando WebGL

---

# 3. Arquitetura do Sistema

## 3.1 Estrutura Modular

O código é organizado em módulos funcionais distintos, cada um com responsabilidade bem definida:

| Módulo | Responsabilidade |
|--------|------------------|
| Estado Global | Armazena todo estado da aplicação em um único objeto JavaScript |
| VCD Parser | Converte arquivo VCD texto em estruturas de dados JavaScript |
| UI Builder | Constrói interface HTML dinamicamente |
| Canvas Renderer | Desenha formas de onda usando PIXI.js e WebGL |
| Event Handler | Gerencia todas as interações do usuário e eventos de sistema |

---

# 4. Estruturas de Dados Detalhadas

## 4.1 wavetraceState

O objeto `wavetraceState` (linhas 5-53) é o repositório central de todo o estado da aplicação. Cada propriedade tem um propósito específico:

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| active | Boolean | Indica se o visualizador está atualmente aberto e ativo |
| filePath | String | Caminho completo do arquivo VCD no sistema de arquivos |
| fileName | String | Nome do arquivo para exibição no header |
| vcdData | Object | Dados parseados do VCD contendo timescale, signals array, timeRange |
| signals | Array | Array contendo todos os sinais encontrados no arquivo VCD |
| displayedSignals | Array | Subconjunto de signals que está sendo renderizado no canvas |
| signalColors | Map | Mapeamento de signal.id para valor de cor hexadecimal (0xRRGGBB) |
| signalRadix | Map | Mapeamento de signal.id para radix ('hex', 'decimal', 'binary', 'octal') |
| signalRenderMode | Map | Mapeamento de signal.id para modo de renderização ('digital', 'analog') |
| timeScale | Number | Fator de escala temporal - quanto maior, mais comprimida a visualização |
| timeOffset | Number | Deslocamento horizontal da timeline em unidades de tempo |
| cursorPosition | Number/null | Posição temporal do cursor (null se não posicionado) |
| selectedSignalId | String/null | ID do sinal atualmente selecionado |
| signalHeight | Number | Altura em pixels de cada faixa de sinal |
| headerHeight | Number | Altura em pixels do header superior |
| sidebarWidth | Number | Largura em pixels da sidebar lateral |
| sidebarCollapsed | Boolean | Indica se sidebar está colapsada |
| canvasScrollY | Number | Offset vertical de scroll do canvas |
| isDragging | Boolean | Flag indicando se está arrastando um elemento |
| isDraggingCursor | Boolean | Flag indicando se está arrastando o cursor |
| isPanning | Boolean | Flag indicando se está fazendo panning da timeline |
| isResizingSidebar | Boolean | Flag indicando se está redimensionando sidebar |
| dragStartX | Number | Posição X inicial do arrasto |
| dragStartY | Number | Posição Y inicial do arrasto |
| panStartOffset | Number | Offset inicial antes de começar panning |
| infoPanelMinimized | Boolean | Indica se info panel está minimizado |
| resizeObserver | ResizeObserver | Observer para detectar mudanças de tamanho |
| mutationObserver | MutationObserver | Observer para detectar mudanças no DOM |
| colorPalette | Array | Array de cores hexadecimais para atribuição aos sinais |
| colors | Object | Objeto contendo todas as cores do tema |
| app | PIXI.Application | Instância principal do PIXI.js gerenciando renderização WebGL |
| container | PIXI.Container | Container raiz contendo todos os elementos gráficos |

## 4.2 Estrutura de Signal

Cada sinal no array `signals` possui a seguinte estrutura:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | Identificador único do sinal no formato VCD (ex: '!', '@', '#') |
| name | String | Nome do sinal sem hierarquia de scope |
| path | String | Caminho completo hierárquico (ex: 'top.cpu.alu.result') |
| type | String | Tipo VCD: 'wire', 'reg', 'integer', etc. |
| width | Number | Número de bits do sinal (1 para sinais digitais, >1 para buses) |
| values | Array | Array de objetos {time, value} representando mudanças de estado |

**Exemplo de objeto signal:**

```javascript
{
  id: "!",
  name: "clk",
  path: "top.clk",
  type: "wire",
  width: 1,
  values: [
    { time: 0, value: "0" },
    { time: 10, value: "1" },
    { time: 20, value: "0" },
    { time: 30, value: "1" }
  ]
}
```

## 4.3 Estrutura de VCDData

Objeto retornado pelo parser após processar arquivo VCD:

```javascript
{
  timescale: "1ns",  // String: unidade de tempo
  signals: [...],    // Array: todos os sinais parseados
  timeRange: {
    start: 0,        // Number: primeiro timestamp
    end: 100000      // Number: último timestamp
  }
}
```

---

# 5. Documentação Completa das Funções

## 5.1 Classe VCDParser

### constructor()

**Localização:** Linhas 57-63

**Parâmetros:** Nenhum

**Retorno:** Instância de VCDParser

**Descrição:** Inicializa uma nova instância do parser VCD. Define valores padrão para todas as propriedades: timescale como '1ns', scope como array vazio para rastrear hierarquia, signals como Map vazio para armazenar definições de sinais, values como Map vazio para mudanças de valor, e timeValues como array vazio para timestamps únicos.

**Código:**
```javascript
constructor() {
    this.timescale = '1ns';
    this.scope = [];
    this.signals = new Map();
    this.values = new Map();
    this.timeValues = [];
}
```

### parse(vcdContent)

**Localização:** Linhas 65-144

**Parâmetros:**
- `vcdContent` (String): Conteúdo completo do arquivo VCD como texto

**Retorno:** Object contendo {timescale, signals, timeRange}

**Descrição:** Função principal de parsing que processa o arquivo VCD completo. Opera em duas fases: primeira fase (inHeader=true) processa declarações de escopo, timescale e definições de variáveis. Segunda fase processa timestamps e mudanças de valor. Usa máquina de estados para alternar entre modos. Mantém mapa id-to-signal para lookup rápido durante associação de valores. Retorna estrutura de dados normalizada pronta para renderização.

**Algoritmo detalhado:**

1. Divide conteúdo em linhas individuais
2. Inicializa estado: inHeader=true, currentTime=0, idToSignal Map
3. Itera cada linha do arquivo
4. Remove espaços e ignora linhas vazias ou comentários
5. Se em modo header:
   - `$timescale`: extrai próxima linha como valor
   - `$scope`: adiciona nome do scope ao array
   - `$upscope`: remove último scope do array
   - `$var`: extrai type, width, id, name e cria objeto signal
   - `$enddefinitions`: muda para modo de valores
6. Se em modo valores:
   - Linha com `#`: extrai timestamp e adiciona a timeValues
   - Linha com 'b': parse de valor binário multi-bit
   - Outras linhas: parse de valor single-bit
   - Busca signal por ID e adiciona {time, value} ao array
7. Ordena timeValues cronologicamente
8. Converte Map de signals para Array
9. Determina timeRange (primeiro e último timestamp)
10. Retorna objeto estruturado

**Exemplo de parsing:**

Entrada VCD:
```
$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var wire 8 " data $end
$upscope $end
$enddefinitions $end
#0
0!
b00000000 "
#10
1!
b11111111 "
```

Saída:
```javascript
{
  timescale: "1ns",
  signals: [
    { id: "!", name: "clk", path: "top.clk", type: "wire", width: 1, 
      values: [{time: 0, value: "0"}, {time: 10, value: "1"}] },
    { id: "\"", name: "data", path: "top.data", type: "wire", width: 8,
      values: [{time: 0, value: "00000000"}, {time: 10, value: "11111111"}] }
  ],
  timeRange: { start: 0, end: 10 }
}
```

## 5.2 openWavetraceViewer(filePath, fileName)

**Localização:** Linhas 148-175

**Parâmetros:**
- `filePath` (String): Caminho completo do arquivo no sistema
- `fileName` (String): Nome do arquivo para exibição

**Retorno:** Promise<void> (função assíncrona)

**Descrição:** Ponto de entrada principal da aplicação. Orquestra todo o processo de abertura de um arquivo VCD. Faz leitura assíncrona do arquivo via Tauri API, instancia parser, processa dados, configura cores, constrói UI e renderiza visualização inicial. Trata erros e exibe alertas ao usuário em caso de falha.

**Fluxo de execução:**

1. Log inicial para debugging
2. Try-catch para tratamento de erros
3. Await invoke('read_file') - comunica com backend Rust
4. Cria nova instância VCDParser
5. Chama parser.parse(content) e obtém vcdData
6. Atualiza wavetraceState: filePath, fileName, vcdData, signals, active
7. Obtém referência ao container DOM
8. Adiciona classe CSS 'active' ao container
9. Chama assignSignalColors() para configurar aparência
10. Chama initWavetraceUI() para construir interface
11. Log de confirmação com quantidade de sinais
12. Se erro: log no console e alert para usuário

**Código:**
```javascript
export async function openWavetraceViewer(filePath, fileName) {
    console.log('Opening Wavetrace viewer for:', fileName);

    try {
        const content = await invoke('read_file', { path: filePath });
        const parser = new VCDParser();
        const vcdData = parser.parse(content);
        
        wavetraceState.filePath = filePath;
        wavetraceState.fileName = fileName;
        wavetraceState.vcdData = vcdData;
        wavetraceState.signals = vcdData.signals;
        wavetraceState.active = true;

        const container = document.getElementById('wavetraceContainer');
        if (container) {
            container.classList.add('active');
        }

        assignSignalColors();
        initWavetraceUI();
        
        console.log(`Loaded ${vcdData.signals.length} signals from VCD file`);
    } catch (error) {
        console.error('Error opening VCD file:', error);
        alert(`Failed to open VCD file: ${error}`);
    }
}
```

## 5.3 assignSignalColors()

**Localização:** Linhas 177-184

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Atribui configurações visuais a cada sinal. Itera sobre wavetraceState.signals e para cada sinal define: cor da paleta usando módulo do índice, radix baseado na largura (hex para multi-bit, binário para single-bit), modo de renderização (digital para 1 bit, analógico para multi-bit). Armazena em Maps separados usando signal.id como chave.

**Lógica de seleção:**
- Cor: `colorIndex = index % colorPalette.length` (distribuição cíclica)
- Radix: 'hex' se width > 1, 'binary' se width === 1
- RenderMode: 'digital' se width === 1, 'analog' se width > 1

**Código:**
```javascript
function assignSignalColors() {
    wavetraceState.signals.forEach((signal, index) => {
        const colorIndex = index % wavetraceState.colorPalette.length;
        wavetraceState.signalColors.set(signal.id, wavetraceState.colorPalette[colorIndex]);
        wavetraceState.signalRadix.set(signal.id, signal.width > 1 ? 'hex' : 'binary');
        wavetraceState.signalRenderMode.set(signal.id, signal.width === 1 ? 'digital' : 'analog');
    });
}
```

## 5.4 initWavetraceUI()

**Localização:** Linhas 186-529

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Constrói toda a interface HTML do aplicativo. Cria estrutura completa incluindo header, sidebar, canvas container e info panel. Define innerHTML do container principal com template HTML contendo todos os elementos necessários. Após inserção, chama funções auxiliares para popular lista de sinais, inicializar canvas PIXI e configurar event listeners.

**Componentes criados:**

1. **wt-header:** Barra superior com título, filename e controles
2. **wt-logo:** Logo YAWT em roxo
3. **wt-filename:** Nome do arquivo VCD
4. **wt-timescale:** Escala de tempo do VCD
5. **wt-controls:** Grupo de botões (zoom, fit, close)
6. **wt-sidebar:** Painel lateral com lista de sinais
7. **wt-canvas-container:** Área de renderização do canvas
8. **wt-info-panel:** Painel inferior com informações

**Estrutura HTML gerada:**

```html
<div class="wt-header">
    <div class="wt-title-group">
        <div class="wt-logo">YAWT</div>
        <div class="wt-divider"></div>
        <span class="wt-filename">${fileName}</span>
        <span class="wt-timescale">${timescale}</span>
    </div>
    <div class="wt-controls">
        <button class="wt-btn" id="wtZoomIn">Zoom In</button>
        <button class="wt-btn" id="wtZoomOut">Zoom Out</button>
        <button class="wt-btn" id="wtFitAll">Fit All</button>
        <button class="wt-btn wt-btn-close" id="wtClose">Close</button>
    </div>
</div>
<div class="wt-main">
    <div class="wt-sidebar" id="wtSidebar">...</div>
    <div class="wt-canvas-container" id="wtCanvasContainer">...</div>
</div>
<div class="wt-info-panel" id="wtInfoPanel">...</div>
```

## 5.5 populateSignalList()

**Localização:** Linhas 531-597

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Organiza sinais em estrutura hierárquica de scopes e renderiza árvore navegável na sidebar. Processa signal.path de cada sinal, divide em componentes de scope, constrói estrutura de árvore aninhada, cria elementos DOM para scopes (com collapse/expand) e sinais (com checkboxes), e insere na sidebar.

**Algoritmo:**

1. Cria Map vazio para hierarquia de scopes
2. Para cada signal:
   - Split path por '.' para obter partes
   - Navega hierarquia criando scopes conforme necessário
   - Adiciona signal ao scope apropriado
3. Renderiza recursivamente a árvore:
   - Para cada scope: cria div com nome e ícone expand/collapse
   - Para cada signal no scope: cria div com checkbox e nome
   - Anexa event listeners para clicks
4. Insere HTML final na sidebar

**Exemplo de hierarquia:**

```
top
├── clk
├── cpu
│   ├── alu
│   │   ├── result
│   │   └── overflow
│   └── registers
│       ├── r0
│       └── r1
└── memory
    ├── addr
    └── data
```

## 5.6 initializeCanvas()

**Localização:** Linhas 599-650

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Inicializa instância PIXI.Application para renderização acelerada por WebGL. Calcula dimensões do canvas baseado em tamanho de janela, cria aplicação PIXI com configurações otimizadas, anexa view ao DOM, cria container principal, habilita interatividade e configura observers para redimensionamento responsivo.

**Configurações PIXI:**

```javascript
const app = new PIXI.Application({
    width: window.innerWidth - wavetraceState.sidebarWidth,
    height: window.innerHeight - wavetraceState.headerHeight,
    backgroundColor: wavetraceState.colors.background,
    antialias: true,
    resolution: window.devicePixelRatio
});
```

**Propriedades importantes:**
- **width/height:** Dimensões do canvas
- **backgroundColor:** Cor de fundo escura (0x0a0a0f)
- **antialias:** true para linhas suaves
- **resolution:** Ajusta para displays retina

## 5.7 setupEventListeners()

**Localização:** Linhas 652-880

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Configura todos os event listeners para interatividade do usuário. Vincula clicks de botões, movimentos de mouse, scroll wheel, drag and drop, resize de janela e outras interações a suas respectivas handlers. Cada evento atualiza estado e triggera re-renderização conforme necessário.

**Eventos principais:**

```javascript
// Botão Close
document.getElementById('wtClose').addEventListener('click', () => {
    closeWavetraceViewer();
});

// Zoom In
document.getElementById('wtZoomIn').addEventListener('click', () => {
    wavetraceState.timeScale *= 1.2;
    render();
});

// Zoom Out
document.getElementById('wtZoomOut').addEventListener('click', () => {
    wavetraceState.timeScale /= 1.2;
    render();
});

// MouseMove no canvas
wavetraceState.container.on('mousemove', (event) => {
    const x = event.data.global.x;
    const time = (x / wavetraceState.timeScale) + wavetraceState.timeOffset;
    wavetraceState.cursorPosition = time;
    render();
});

// MouseWheel para scroll/zoom
window.addEventListener('wheel', (event) => {
    if (event.ctrlKey) {
        // Zoom
        wavetraceState.timeScale *= (1 + event.deltaY * 0.001);
    } else {
        // Scroll horizontal
        wavetraceState.timeOffset += event.deltaY;
    }
    render();
});
```

## 5.8 render()

**Localização:** Linhas 882-1095

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Função central de renderização que redesenha completamente o canvas. Remove todos os elementos existentes, desenha grid de fundo, labels de tempo, formas de onda para cada sinal exibido, cursor temporal e aplica transformações de scroll/zoom. Chamada sempre que qualquer aspecto visual precisa ser atualizado.

**Pipeline completo:**

1. Valida estado (app e container existem)
2. Remove todos children do container
3. Chama drawBackground() para grid
4. Chama drawTimeLabels() para marcadores temporais
5. Calcula yOffset baseado em scroll vertical
6. Para cada signal em displayedSignals:
   - Calcula posição Y do sinal
   - Chama drawWaveform(signal, yPos)
7. Se cursorPosition definido: chama drawCursor()
8. Atualiza info panel com dados do cursor

**Pseudocódigo:**

```javascript
function render() {
    if (!wavetraceState.app || !wavetraceState.container) return;
    
    // Limpa canvas
    wavetraceState.container.removeChildren();
    
    // Desenha fundo
    drawBackground();
    drawTimeLabels();
    
    // Desenha sinais
    let yPosition = wavetraceState.headerHeight - wavetraceState.canvasScrollY;
    for (const signal of wavetraceState.displayedSignals) {
        drawWaveform(signal, yPosition);
        yPosition += wavetraceState.signalHeight;
    }
    
    // Desenha cursor
    if (wavetraceState.cursorPosition !== null) {
        drawCursor();
    }
    
    // Atualiza info panel
    updateInfoPanel();
}
```

## 5.9 drawBackground()

**Localização:** Linhas 1097-1155

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Desenha grid de fundo com linhas verticais representando intervalos de tempo. Calcula espaçamento apropriado baseado em zoom atual, desenha linhas maiores em intervalos regulares e linhas menores entre elas. Usa cores diferentes para linhas principais e secundárias.

**Algoritmo de espaçamento:**

1. Calcula baseInterval a partir de timeScale
2. Arredonda para potência de 10 mais próxima
3. Determina firstVisibleTime e lastVisibleTime
4. Itera de firstVisible a lastVisible em incrementos de interval
5. Para cada intervalo: desenha linha vertical
6. Linhas principais (múltiplos de interval * 5) mais espessas
7. Linhas secundárias mais finas e transparentes

**Código simplificado:**

```javascript
function drawBackground() {
    const graphics = new PIXI.Graphics();
    
    // Calcula intervalo baseado em zoom
    const baseInterval = Math.pow(10, Math.floor(Math.log10(1000 / wavetraceState.timeScale)));
    const interval = baseInterval * 5;
    
    // Determina range visível
    const firstVisibleTime = wavetraceState.timeOffset;
    const lastVisibleTime = firstVisibleTime + (wavetraceState.app.view.width / wavetraceState.timeScale);
    
    // Desenha linhas
    for (let time = firstVisibleTime; time <= lastVisibleTime; time += baseInterval) {
        const x = (time - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        if (time % interval === 0) {
            // Linha principal
            graphics.lineStyle(1, wavetraceState.colors.gridMajor, 1);
        } else {
            // Linha secundária
            graphics.lineStyle(1, wavetraceState.colors.grid, 0.5);
        }
        
        graphics.moveTo(x, 0);
        graphics.lineTo(x, wavetraceState.app.view.height);
    }
    
    wavetraceState.container.addChild(graphics);
}
```

## 5.10 drawTimeLabels()

**Localização:** Linhas 1157-1210

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Desenha labels numéricos de tempo ao longo do eixo horizontal superior. Calcula posições baseado no mesmo intervalo usado no grid, formata números com unidades apropriadas (ns, us, ms), posiciona texto PIXI.Text em cada marcador principal.

**Formatação de valores:**

```javascript
function formatTime(time) {
    if (time < 1000) {
        return time + 'ns';
    } else if (time < 1000000) {
        return (time / 1000).toFixed(1) + 'us';
    } else {
        return (time / 1000000).toFixed(1) + 'ms';
    }
}
```

**Código simplificado:**

```javascript
function drawTimeLabels() {
    const interval = calculateInterval();
    const firstVisibleTime = wavetraceState.timeOffset;
    const lastVisibleTime = firstVisibleTime + (width / timeScale);
    
    for (let time = firstVisibleTime; time <= lastVisibleTime; time += interval) {
        const x = (time - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        const text = new PIXI.Text(formatTime(time), {
            fontFamily: 'JetBrains Mono',
            fontSize: 11,
            fill: wavetraceState.colors.textMuted
        });
        
        text.x = x + 5;
        text.y = 5;
        
        wavetraceState.container.addChild(text);
    }
}
```

## 5.11 drawWaveform(signal, yPosition)

**Localização:** Linhas 1212-1329

**Parâmetros:**
- `signal` (Object): Objeto de sinal contendo id, name, values, width
- `yPosition` (Number): Posição Y onde desenhar a forma de onda

**Retorno:** void

**Descrição:** Desenha a forma de onda completa para um sinal. Cria PIXI.Graphics para linhas e container para gradientes, desenha background do sinal, renderiza nome, itera sobre todos os valores do sinal e chama drawWaveformSegment para cada transição. Otimiza renderização pulando segmentos fora da viewport.

**Fluxo:**

1. Cria novo PIXI.Graphics e PIXI.Container
2. Desenha retângulo de background na cor apropriada
3. Renderiza PIXI.Text com nome do sinal
4. Obtém cor e renderMode do signal.id
5. Calcula waveformY e waveformHeight
6. Para cada value em signal.values:
   - Converte time para posição X em pixels
   - Determina nextValue (próxima mudança)
   - Chama drawWaveformSegment com parâmetros
7. Adiciona graphics e gradientContainer ao container principal

**Código simplificado:**

```javascript
function drawWaveform(signal, yPosition) {
    const graphics = new PIXI.Graphics();
    const gradientContainer = new PIXI.Container();
    
    // Desenha background
    graphics.beginFill(wavetraceState.colors.signalBg);
    graphics.drawRect(0, yPosition, width, wavetraceState.signalHeight);
    graphics.endFill();
    
    // Desenha nome
    const nameText = new PIXI.Text(signal.name, {
        fontFamily: 'JetBrains Mono',
        fontSize: 12,
        fill: wavetraceState.colors.text
    });
    nameText.x = 10;
    nameText.y = yPosition + 10;
    graphics.addChild(nameText);
    
    // Obtém configurações
    const color = wavetraceState.signalColors.get(signal.id);
    const renderMode = wavetraceState.signalRenderMode.get(signal.id);
    
    // Desenha waveform
    const waveformY = yPosition + 30;
    const waveformHeight = wavetraceState.signalHeight - 40;
    
    for (let i = 0; i < signal.values.length; i++) {
        const value = signal.values[i];
        const nextValue = signal.values[i + 1];
        
        const x1 = (value.time - timeOffset) * timeScale;
        const x2 = nextValue ? (nextValue.time - timeOffset) * timeScale : width;
        
        drawWaveformSegment(graphics, gradientContainer, x1, x2, 
                          waveformY, waveformHeight, value.value, 
                          signal.width, color, signal, renderMode, 
                          nextValue?.value);
    }
    
    wavetraceState.container.addChild(gradientContainer);
    wavetraceState.container.addChild(graphics);
}
```

## 5.12 drawWaveformSegment()

**Localização:** Linhas 1331-1344

**Parâmetros:**
- `graphics` (PIXI.Graphics): Objeto para desenho de linhas
- `gradientContainer` (PIXI.Container): Container para fills
- `x1` (Number): Posição X inicial do segmento
- `x2` (Number): Posição X final do segmento
- `y` (Number): Posição Y base
- `height` (Number): Altura disponível para waveform
- `value` (String): Valor atual do sinal
- `width` (Number): Largura do sinal em bits
- `color` (Number): Cor hexadecimal
- `signal` (Object): Objeto signal completo
- `renderMode` (String): 'digital', 'analog' ou 'bus'
- `nextValue` (String): Próximo valor para transições suaves

**Retorno:** void

**Descrição:** Roteia para função de desenho apropriada baseado em renderMode e width. Verifica culling (se segmento está visível na viewport), clipa coordenadas aos limites da tela, determina tipo de waveform e delega para drawAnalogWaveform, drawDigitalWaveform ou drawBusWaveform.

**Código:**

```javascript
function drawWaveformSegment(graphics, gradientContainer, x1, x2, y, height, value, width, color, signal, renderMode, nextValue) {
    // Culling - pula se fora da viewport
    if (x2 <= -100 || x1 >= wavetraceState.app.view.width + 100) return;
    
    // Clipping
    x1 = Math.max(-50, x1);
    x2 = Math.min(wavetraceState.app.view.width + 50, x2);
    
    // Roteamento baseado em tipo
    if (renderMode === 'analog' && width > 1) {
        drawAnalogWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal, nextValue);
    } else if (width === 1 && renderMode === 'digital') {
        drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, value, color);
    } else {
        drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal);
    }
}
```

## 5.13 drawDigitalWaveform()

**Localização:** Linhas 1346-1369

**Parâmetros:** graphics, gradientContainer, x1, x2, y, height, value, color

**Descrição:** Desenha waveform digital clássica (high/low). Para value='1': linha no topo com fill superior. Para value='0': linha na base com fill inferior. Para outros valores (x, z): linha central pontilhada. Usa semi-transparência para fills de fundo.

**Código:**

```javascript
function drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, value, color) {
    graphics.lineStyle(2.5, color, 0.9);
    
    if (value === '1') {
        // Fill superior semi-transparente
        gradientContainer.beginFill(color, 0.12);
        gradientContainer.drawRect(x1, y, x2 - x1, height / 2);
        gradientContainer.endFill();
        
        // Linha no topo
        graphics.moveTo(x1, y);
        graphics.lineTo(x2, y);
    } else if (value === '0') {
        // Fill inferior semi-transparente
        gradientContainer.beginFill(color, 0.06);
        gradientContainer.drawRect(x1, y + height / 2, x2 - x1, height / 2);
        gradientContainer.endFill();
        
        // Linha na base
        graphics.moveTo(x1, y + height);
        graphics.lineTo(x2, y + height);
    } else {
        // Valor indefinido (x, z) - linha central
        const midY = y + height / 2;
        graphics.lineStyle(2, color, 0.5);
        graphics.moveTo(x1, midY);
        graphics.lineTo(x2, midY);
    }
}
```

## 5.14 drawBusWaveform()

**Localização:** Linhas 1371-1403

**Parâmetros:** graphics, gradientContainer, x1, x2, y, height, value, color, signal

**Descrição:** Desenha waveform de bus (sinal multi-bit) com formato trapezoidal característico. Cria polígono com slant nas bordas verticais para indicar transições. Desenha valor formatado (hex, decimal, etc) no centro se houver espaço suficiente. Usa gradientes para dar profundidade visual.

**Geometria:**

```
    x1+slant -------- x2
        |                |
        |                |
    x1 -------- x2-slant
```

**Código:**

```javascript
function drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal) {
    graphics.lineStyle(2.5, color, 0.9);
    
    const slant = 6;
    const points = [
        x1 + slant, y,           // Topo esquerdo
        x2, y,                   // Topo direito
        x2 - slant, y + height,  // Base direita
        x1, y + height           // Base esquerda
    ];
    
    // Fill primário
    gradientContainer.beginFill(color, 0.12);
    gradientContainer.drawPolygon(points);
    gradientContainer.endFill();
    
    // Fill secundário (profundidade)
    gradientContainer.beginFill(color, 0.05);
    gradientContainer.drawPolygon([
        x1 + slant, y + height * 0.4,
        x2, y + height * 0.4,
        x2 - slant, y + height,
        x1, y + height
    ]);
    gradientContainer.endFill();
    
    // Contorno
    graphics.moveTo(x1 + slant, y);
    graphics.lineTo(x2, y);
    graphics.lineTo(x2 - slant, y + height);
    graphics.lineTo(x1, y + height);
    graphics.lineTo(x1 + slant, y);
    
    // Valor (se houver espaço)
    if (x2 - x1 > 40) {
        const displayValue = formatBusValue(value, signal);
        const valueText = new PIXI.Text(displayValue, {
            fontFamily: 'JetBrains Mono',
            fontSize: 10,
            fill: wavetraceState.colors.text,
            fontWeight: '700'
        });
        valueText.x = (x1 + x2) / 2 - valueText.width / 2;
        valueText.y = y + height / 2 - 5;
        graphics.addChild(valueText);
    }
}
```

## 5.15 drawAnalogWaveform()

**Localização:** Linhas 1405-1475

**Parâmetros:** graphics, gradientContainer, x1, x2, y, height, value, color, signal, nextValue

**Descrição:** Desenha waveform analógica com níveis variáveis. Converte valor binário para numérico, normaliza para altura disponível, desenha linha horizontal no nível apropriado, cria transição suave para próximo valor usando easing function, preenche área abaixo da linha com gradiente.

**Cálculos:**

```javascript
// Conversão e normalização
const numericValue = parseInt(value, 2);
const maxValue = Math.pow(2, signal.width) - 1;
const normalizedValue = numericValue / maxValue;  // 0.0 a 1.0

// Posição Y (inverte porque Y cresce para baixo)
const levelY = y + height - (normalizedValue * height);
```

**Easing function (ease-in-out):**

```javascript
function easeInOut(t) {
    return t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
```

**Código simplificado:**

```javascript
function drawAnalogWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal, nextValue) {
    // Trata valores indefinidos
    if (value.includes('x') || value.includes('z')) {
        const midY = y + height / 2;
        graphics.lineStyle(2, color, 0.4);
        graphics.moveTo(x1, midY);
        graphics.lineTo(x2, midY);
        return;
    }
    
    // Calcula nível Y
    const numericValue = parseInt(value, 2);
    const maxValue = Math.pow(2, signal.width) - 1;
    const normalizedValue = numericValue / maxValue;
    const levelY = y + height - (normalizedValue * height);
    
    // Calcula próximo nível
    let nextLevelY = levelY;
    if (nextValue && !nextValue.includes('x') && !nextValue.includes('z')) {
        const nextNumeric = parseInt(nextValue, 2);
        const nextNormalized = nextNumeric / maxValue;
        nextLevelY = y + height - (nextNormalized * height);
    }
    
    graphics.lineStyle(2.5, color, 0.9);
    
    // Linha horizontal
    const transitionWidth = Math.min(12, (x2 - x1) * 0.15);
    graphics.moveTo(x1, levelY);
    graphics.lineTo(x2 - transitionWidth, levelY);
    
    // Transição suave para próximo nível
    if (levelY !== nextLevelY) {
        for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const px = x2 - transitionWidth + (transitionWidth * t);
            const py = levelY + (nextLevelY - levelY) * eased;
            graphics.lineTo(px, py);
        }
    }
    
    // Fill área
    const fillPoints = [x1, y + height, x1, levelY];
    // ... adiciona pontos da curva ...
    fillPoints.push(x2, y + height);
    
    gradientContainer.beginFill(color, 0.15);
    gradientContainer.drawPolygon(fillPoints);
    gradientContainer.endFill();
}
```

## 5.16 formatBusValue()

**Localização:** Linhas 1477-1493

**Parâmetros:**
- `value` (String): Valor binário do bus
- `signal` (Object): Objeto signal para obter configurações

**Retorno:** String formatada para exibição

**Descrição:** Formata valores de bus para exibição legível. Obtém radix preferido do signalRadix Map, trata valores especiais (x, z), converte binário para decimal e formata segundo radix: hexadecimal (0xFF), decimal (255), binário (0b11111111), ou octal (0o377).

**Código:**

```javascript
function formatBusValue(value, signal) {
    const radix = wavetraceState.signalRadix.get(signal.id) || 'hex';
    
    // Valores especiais
    if (value.includes('x') || value.includes('X')) return 'X';
    if (value.includes('z') || value.includes('Z')) return 'Z';
    
    // Converte para decimal
    const decimal = parseInt(value, 2);
    if (isNaN(decimal)) return value;
    
    // Formata segundo radix
    switch (radix) {
        case 'hex':
            return '0x' + decimal.toString(16).toUpperCase();
        case 'decimal':
            return decimal.toString(10);
        case 'binary':
            return '0b' + value;
        case 'octal':
            return '0o' + decimal.toString(8);
        default:
            return '0x' + decimal.toString(16).toUpperCase();
    }
}
```

**Exemplos:**

```javascript
formatBusValue("11111111", signal)  // radix='hex'  → "0xFF"
formatBusValue("11111111", signal)  // radix='decimal' → "255"
formatBusValue("11111111", signal)  // radix='binary' → "0b11111111"
formatBusValue("11111111", signal)  // radix='octal' → "0o377"
formatBusValue("xxxxxxxx", signal)  // → "X"
formatBusValue("zzzzzzzz", signal)  // → "Z"
```

## 5.17 closeWavetraceViewer()

**Localização:** Linhas 1496-1542

**Parâmetros:** Nenhum

**Retorno:** void

**Descrição:** Realiza cleanup completo ao fechar o visualizador. Remove todos os event listeners globais, desconecta observers, destrói aplicação PIXI e libera recursos WebGL, limpa container DOM, reseta todo o wavetraceState para valores iniciais. Garante que não há vazamentos de memória.

**Operações de cleanup:**

1. Remove event listeners de mouse (drag, pan)
2. Disconnecta resizeObserver
3. Disconnecta mutationObserver
4. Destrói PIXI.Application com opções completas
5. Destrói PIXI.Container principal
6. Remove classe 'active' do container DOM
7. Limpa innerHTML do container
8. Reseta todas as propriedades de wavetraceState
9. Limpa todos os Maps (signalColors, signalRadix, etc)

**Código:**

```javascript
export function closeWavetraceViewer() {
    console.log('Closing Wavetrace viewer');
    
    // Remove event listeners globais
    window.removeEventListener('mousemove', handleCursorDrag);
    window.removeEventListener('mouseup', handleCursorDragEnd);
    window.removeEventListener('mousemove', handlePanDrag);
    window.removeEventListener('mouseup', handlePanDragEnd);
    
    // Disconnecta observers
    if (wavetraceState.resizeObserver) {
        wavetraceState.resizeObserver.disconnect();
        wavetraceState.resizeObserver = null;
    }
    
    if (wavetraceState.mutationObserver) {
        wavetraceState.mutationObserver.disconnect();
        wavetraceState.mutationObserver = null;
    }
    
    // Destrói PIXI
    if (wavetraceState.app) {
        wavetraceState.app.destroy(true, { 
            children: true, 
            texture: true, 
            baseTexture: true 
        });
        wavetraceState.app = null;
    }
    
    if (wavetraceState.container) {
        wavetraceState.container.destroy({ 
            children: true, 
            texture: true, 
            baseTexture: true 
        });
        wavetraceState.container = null;
    }
    
    // Limpa DOM
    const container = document.getElementById('wavetraceContainer');
    if (container) {
        container.classList.remove('active');
        container.innerHTML = '';
    }
    
    // Reseta estado
    wavetraceState.active = false;
    wavetraceState.filePath = null;
    wavetraceState.fileName = null;
    wavetraceState.vcdData = null;
    wavetraceState.signals = [];
    wavetraceState.displayedSignals = [];
    wavetraceState.signalColors.clear();
    wavetraceState.signalRadix.clear();
    wavetraceState.signalRenderMode.clear();
    wavetraceState.cursorPosition = null;
    wavetraceState.selectedSignalId = null;
    wavetraceState.canvasScrollY = 0;
}
```

---

# 6. Interações com Bibliotecas Externas

## 6.1 PIXI.js

**Import:** linha 1 - `import * as PIXI from 'pixi.js'`

**Uso:** PIXI.js é a biblioteca central de renderização gráfica. Fornece abstração sobre WebGL para desenho 2D acelerado por hardware.

### Classes utilizadas:

#### PIXI.Application

Gerencia ciclo de renderização e canvas WebGL. Configurado com width, height, backgroundColor, antialias e resolution. Propriedade `view` contém o elemento canvas HTML.

**Criação:**
```javascript
const app = new PIXI.Application({
    width: 1920,
    height: 1080,
    backgroundColor: 0x0a0a0f,
    antialias: true,
    resolution: window.devicePixelRatio
});
```

**Propriedades importantes:**
- `app.view`: Elemento `<canvas>` HTML
- `app.stage`: Container raiz da cena
- `app.renderer`: Renderizador WebGL
- `app.screen`: Retângulo representando área visível

#### PIXI.Container

Agrupa elementos gráficos. Suporta hierarquia de cena, transformações, culling. Container principal armazena todos os elementos visíveis.

**Uso:**
```javascript
const container = new PIXI.Container();
container.interactive = true;
container.x = 0;
container.y = 0;
app.stage.addChild(container);
```

**Métodos principais:**
- `addChild(child)`: Adiciona elemento filho
- `removeChildren()`: Remove todos os filhos
- `destroy(options)`: Destrói container e libera recursos

#### PIXI.Graphics

Desenha formas vetoriais (linhas, retângulos, polígonos). Métodos principais: lineStyle, moveTo, lineTo, beginFill, drawRect, drawPolygon, endFill.

**Exemplo:**
```javascript
const graphics = new PIXI.Graphics();

// Linha
graphics.lineStyle(2, 0xFF0000, 1);
graphics.moveTo(0, 0);
graphics.lineTo(100, 100);

// Retângulo
graphics.beginFill(0x00FF00, 0.5);
graphics.drawRect(10, 10, 50, 50);
graphics.endFill();

// Polígono
graphics.beginFill(0x0000FF);
graphics.drawPolygon([0,0, 100,0, 100,100, 0,100]);
graphics.endFill();
```

#### PIXI.Text

Renderiza texto com fonte customizável. Propriedades: fontFamily, fontSize, fill, fontWeight. Posicionado via x e y.

**Exemplo:**
```javascript
const text = new PIXI.Text('Hello World', {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: 0xFFFFFF,
    fontWeight: 'bold'
});
text.x = 100;
text.y = 50;
```

### Fluxo de renderização PIXI:

1. Application cria contexto WebGL
2. Container adicionado ao stage
3. Graphics e Text adicionados ao container
4. PIXI renderiza automaticamente em loop
5. Quando elementos mudam, próximo frame reflete mudanças

**Otimizações automáticas:**
- Batching de draw calls
- Culling de objetos fora da viewport
- Dirty rectangle tracking
- Texture atlas para sprites

## 6.2 Tauri API

**Import:** linha 2 - `import { invoke } from '@tauri-apps/api/core'`

**Uso:** Tauri fornece bridge entre frontend JavaScript e backend Rust. Permite chamadas de funções do backend a partir do frontend web.

### Função invoke('command', args)

**Parâmetros:**
- `command` (String): Nome do comando Rust a executar
- `args` (Object): Objeto com argumentos para o comando

**Retorno:** Promise que resolve com resultado do backend

**Funcionamento:**

1. JavaScript chama `invoke`
2. Tauri serializa argumentos para JSON
3. Envia para processo Rust via IPC
4. Rust executa função correspondente
5. Retorna resultado
6. Tauri deserializa e resolve Promise JavaScript

**Exemplo no código:**

```javascript
const content = await invoke('read_file', { path: filePath });
```

**Backend Rust correspondente:**

```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| e.to_string())
}
```

**Tratamento de erros:**

```javascript
try {
    const result = await invoke('read_file', { path: '/path/to/file' });
    console.log('Success:', result);
} catch (error) {
    console.error('Error:', error);
}
```

### Comunicação bidirecional:

**JavaScript → Rust:**
```javascript
await invoke('process_data', { 
    data: largeArray,
    options: { format: 'json' }
});
```

**Rust → JavaScript (eventos):**
```rust
// Backend Rust
use tauri::Manager;

app.emit_all("progress", 50).unwrap();
```

```javascript
// Frontend JavaScript
import { listen } from '@tauri-apps/api/event';

await listen('progress', (event) => {
    console.log('Progress:', event.payload);
});
```

---

# 7. Glossário Técnico

| Termo | Definição |
|-------|-----------|
| VCD | Value Change Dump - formato de arquivo texto que registra mudanças de sinais digitais ao longo do tempo em simulações de hardware |
| WebGL | Web Graphics Library - API JavaScript para renderização 2D e 3D acelerada por GPU em browsers |
| Scope | Hierarquia de módulos em design de hardware - organiza sinais em estrutura de árvore |
| Timescale | Unidade de tempo base do VCD - define resolução temporal das mudanças de sinal |
| Bus | Sinal multi-bit - grupo de fios digitais tratados como unidade única |
| Radix | Base numérica para exibição de valores - hexadecimal (16), decimal (10), binário (2) ou octal (8) |
| Cursor | Marcador vertical que indica posição temporal específica para análise de valores |
| Viewport | Área visível do canvas - determina quais elementos precisam ser renderizados |
| Culling | Otimização que evita renderizar elementos fora da viewport |
| Easing | Função matemática que suaviza transições entre valores criando movimento natural |
| Stage | Container raiz do PIXI.js que contém todos os elementos gráficos |
| Graphics | Objeto PIXI para desenho de formas vetoriais |
| Container | Objeto PIXI que agrupa e organiza elementos gráficos |
| Antialiasing | Técnica de suavização de bordas para reduzir efeito serrilhado |
| Resolution | Razão entre pixels físicos e pixels lógicos (importante para displays retina) |
| IPC | Inter-Process Communication - comunicação entre processos JavaScript e Rust no Tauri |
| Map | Estrutura de dados JavaScript que armazena pares chave-valor com lookup O(1) |
| Promise | Objeto JavaScript representando eventual conclusão ou falha de operação assíncrona |
| Async/Await | Sintaxe moderna para lidar com código assíncrono de forma síncrona |
| Event Listener | Função que executa quando evento específico ocorre |
| DOM | Document Object Model - representação em árvore do documento HTML |
| Canvas | Elemento HTML para desenho gráfico via JavaScript |
| GPU | Graphics Processing Unit - processa renderização gráfica |

---

# 8. Considerações Finais

O YAWT representa uma solução moderna e eficiente para visualização de sinais digitais. A arquitetura modular, uso de tecnologias web modernas e otimizações de renderização garantem uma experiência fluida mesmo com arquivos VCD complexos contendo milhares de sinais e milhões de transições.

A separação clara de responsabilidades entre parsing, gerenciamento de estado, construção de UI e renderização facilita manutenção e extensão do código. O uso de PIXI.js para renderização acelerada por GPU garante performance excelente, enquanto a integração com Tauri permite acesso nativo ao sistema de arquivos.

## Pontos Fortes da Arquitetura:

1. **Estado centralizado:** Todo o estado da aplicação em um único objeto facilita debugging e rastreamento
2. **Renderização otimizada:** PIXI.js com WebGL proporciona 60 FPS mesmo com muitos sinais
3. **Parser robusto:** Suporta formato VCD completo incluindo hierarquias complexas
4. **UI responsiva:** Redimensionamento automático e observers garantem boa experiência
5. **Código modular:** Separação clara de responsabilidades facilita manutenção

## Possíveis Melhorias Futuras:

1. **Virtualização:** Renderizar apenas sinais visíveis para melhorar performance com milhares de sinais
2. **Cache de renderização:** Cachear segmentos de waveform que não mudaram
3. **Workers:** Mover parsing VCD para Web Worker para não bloquear UI
4. **Exportação:** Adicionar funcionalidade de exportar imagens ou PDFs das waveforms
5. **Análise:** Ferramentas de medição de timing, detecção de glitches, etc.

Este documento forneceu uma visão completa e detalhada de todos os aspectos do sistema, desde estruturas de dados até algoritmos de renderização, permitindo compreensão total do funcionamento do YAWT.
