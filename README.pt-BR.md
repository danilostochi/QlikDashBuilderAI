# Qlik DashBuilder AI

[English](README.md) · **Português (Brasil)**

Extensão de visualização para o Qlik Sense (Qlik Cloud e Client-Managed) que coloca um **assistente de IA dentro do seu app**. Você pergunta em linguagem natural e recebe a resposta com números calculados pelo motor do Qlik. O assistente também monta painéis, de três formas: objetos nativos do Qlik, um painel desenhado pela extensão ou uma página HTML autônoma para baixar.

Funciona com **Google Gemini**, **Anthropic Claude** ou **OpenRouter**. Não tem backend nem bibliotecas externas: o navegador fala direto com o provedor de IA, e a chave da API fica no navegador de cada usuário.

> Versão atual: **0.21.1** · Interface em **português** e **inglês**

---

## Sumário

- [Recursos](#recursos)
- [Como funciona](#como-funciona)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Primeiros passos](#primeiros-passos)
- [Modos do assistente](#modos-do-assistente)
- [Preparar o app para a IA (curadoria)](#preparar-o-app-para-a-ia-curadoria)
- [Referência das propriedades](#referência-das-propriedades)
- [HTML Complexo e sessão separada](#html-complexo-e-sessão-separada)
- [Indicadores consolidados por período](#indicadores-consolidados-por-período)
- [Filtros e visões segmentadas](#filtros-e-visões-segmentadas)
- [Custos e privacidade](#custos-e-privacidade)
- [Solução de problemas](#solução-de-problemas)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Gerar o zip](#gerar-o-zip)
- [Modos antigos](#modos-antigos)
- [Licença](#licença)

---

## Recursos

- **Conversa com os dados.** A IA pede ao Qlik os números de que precisa (totais, rankings, valores por campo, séries por período). O motor calcula na hora e a IA responde em texto.
- **Copiar e Excel.** As respostas podem ser copiadas com as tabelas formatadas (cole no Excel ou no Word) ou baixadas em `.xlsx`, com uma aba por tabela.
- **Painéis sob pedido.** Por exemplo, "analise meus dados e crie um painel executivo". O painel sai em três formatos:
  - **Objetos Qlik:** gráficos nativos na pasta, que você edita como qualquer objeto.
  - **Visual HTML:** painel desenhado pela extensão num objeto separado, que reage às seleções e tem uma coluna de filtros.
  - **HTML Complexo:** página HTML estática com os dados extraídos no momento, para baixar ou abrir numa nova aba.
- **As definições oficiais do seu app.** A IA usa as medidas e dimensões mestre que você marca com a tag, os comentários dos campos e uma variável de contexto.
- **Indicadores governados e não aditivos.** Medidas como turnover mensal e headcount nunca são somadas entre períodos. Elas são extraídas período a período, com seleções reais.
- **Suas seleções ficam intactas.** O HTML Complexo e as séries são calculados numa **sessão separada do Qlik** (`identity`).
- **Tela de prontidão.** O botão **ⓘ Contexto** mostra exatamente o que a IA recebe e se o app está pronto.
- **Bilíngue.** Uma propriedade troca toda a extensão entre português e inglês, inclusive as respostas da IA.
- **Aparência.** Cores da empresa, fundo transparente ou cor própria, e o modo "Somente o ícone IA", que deixa só um botão num canto da pasta.

## Como funciona

```
 App Qlik ──(estrutura, campos/itens mestres com tag, vContexto)──► Provedor de IA
    ▲                                                                  │
    │                                                                  ▼
    └──── motor do Qlik calcula ◄── JSON validado (consultas / painel)
```

1. A extensão lê a **estrutura do app**: tabelas, campos, tipos, itens mestres com a tag, comentários dos campos e a variável `vContexto`. Se você permitir, envia também alguns valores de exemplo de cada campo de texto. **A base de dados inteira nunca é enviada.**
2. A IA devolve um **JSON estruturado e validado**. Ele traz consultas a executar ou a especificação de um painel com expressões Qlik.
3. O motor do Qlik confere cada expressão. Se alguma falhar, a IA é chamada uma vez para corrigir.
4. Os resultados são desenhados a partir de hipercubos. Por isso o painel segue as seleções, e clicar num gráfico seleciona no app.

## Requisitos

- Qlik Sense **Qlik Cloud** ou **Client-Managed** (Enterprise).
- Uma chave de API de um destes provedores:
  - Google AI Studio: <https://aistudio.google.com/apikey>
  - Anthropic Console: <https://console.anthropic.com>
  - OpenRouter: <https://openrouter.ai/keys>
- **Só no Qlik Cloud:** um administrador precisa liberar o domínio do provedor na **Content Security Policy** (veja abaixo).

### Liberar a IA no Qlik Cloud (uma vez, feito por um administrador)

1. Abra **Administração → Content Security Policy → Adicionar**.
2. Em **Origem**, informe o domínio do seu provedor:

   | Provedor | Origem |
   |---|---|
   | Gemini | `generativelanguage.googleapis.com` |
   | Claude | `api.anthropic.com` |
   | OpenRouter | `openrouter.ai` |
3. Marque a diretiva **connect-src** e salve.
4. Recarregue o app com **Ctrl+F5**.

Se esse passo faltar, o chat mostra "Não foi possível falar com <domínio>…".

## Instalação

1. Gere o `QlikDashBuilderAI.zip` (veja [Gerar o zip](#gerar-o-zip)). Na raiz do zip precisam estar `QlikDashBuilderAI.qext` e `QlikDashBuilderAI.js`.
2. Envie o zip ao Qlik:
   - **Qlik Cloud:** Administração → Extensões → Adicionar.
   - **Client-Managed:** QMC → Extensions → Import.
3. Recarregue o app com **Ctrl+F5**, porque o navegador costuma guardar a versão antiga.
4. Abra o console do navegador (F12). Deve aparecer `Qlik DashBuilder AI 0.21.1 carregado.`

## Primeiros passos

1. Edite uma pasta, vá em **Objetos personalizados → Qlik DashBuilder AI**, arraste o objeto para a pasta e deixe-o grande.
2. Nas **Propriedades**, escolha o **Idioma / Language** e o **Provedor da IA**.
3. Clique em **✨ IA** e cole a sua chave. Ela fica salva só no seu navegador (localStorage), separada por provedor, e nunca é gravada no app.
4. Pergunte. Exemplos:
   - "Qual foi o turnover de cada mês de 2026?"
   - "Analise meus dados e crie um painel executivo"
   - "Troca a rosca por um ranking dos 10 maiores clientes"
   - "Adiciona a margem % por mês com meta de 30%"
   - "Por que o Nordeste caiu em março?" (a IA recebe os valores que o painel está mostrando)
   - Clique em 📎 para anexar o print de um painel que você goste e peça "faça parecido".

### Janela do assistente

- O assistente abre numa **janela popup do navegador**, que você pode deixar ao lado do app ou em outro monitor.
- O botão **▣** traz o assistente para dentro da página, numa caixa flutuante que dá para arrastar e redimensionar. O botão **⧉** volta para o popup.
- Os outros botões do cabeçalho são **ⓘ** Contexto, **↶** Desfazer, **＋** Nova conversa e **✕** Fechar. Passe o mouse sobre qualquer botão para ver o que ele faz.
- Para editar uma pergunta, passe o mouse sobre ela e clique em **✎**. Com a caixa de mensagem vazia, a tecla **↑** traz de volta a última pergunta.

## Modos do assistente

Acima da caixa de mensagem ficam quatro botões:

| Modo | O que entrega |
|---|---|
| **💬 Conversa** | Só a resposta em texto, com números calculados pelo Qlik. Se você pedir um gráfico ou relatório, entrega também uma página HTML Complexo, sem mexer na pasta. |
| **📊 Objetos Qlik** | Objetos nativos na pasta, fora do assistente: KPI, barras, linhas, pizza, medidor, dispersão, combinado, tabela e pivô. |
| **🎨 Visual HTML** | Painel desenhado pela extensão num **objeto separado** da pasta. Quando terminar, você pode excluir o assistente que o painel continua. |
| **🧩 HTML Complexo** | Página HTML estática com os dados extraídos no momento do pedido, para baixar ou abrir numa nova aba. |

Como a pasta é organizada:

- **Distribuição dos blocos:** em faixas alinhadas, com KPIs em cima, gráficos principais no meio e detalhes embaixo. Se o painel não couber, a pasta é estendida.
- **Pedidos seguintes:** só mudam os blocos que a IA alterou. Os seus ajustes nos outros objetos são mantidos.
- **Troca de modo:** vale a partir do próximo pedido. **Refazer agora** converte o painel na hora e **Desfazer** volta à versão anterior.
- **Permissão na pasta:** a pasta precisa ser sua e **não publicada**. Se não for, o painel aparece dentro do assistente.

### Conversa

- As consultas seguem as **seleções atuais**. Recortes citados na pergunta ("só a filial 10002") entram como filtro da consulta, sem mudar as suas seleções.
- Cada resposta tem **📋 Copiar** e, quando há tabelas, **⬇ Excel**. O `.xlsx` traz uma aba por tabela, com números, percentuais e moeda já formatados.
- **O período pedido é respeitado.** Se a pergunta é sobre 2026, os períodos de outros anos são descartados, mesmo que a IA os inclua.

## Preparar o app para a IA (curadoria)

Você decide o que a IA enxerga, marcando no próprio app. Os nomes da tag e da variável podem ser trocados nas propriedades.

| O quê | Como marcar | O que vai para a IA |
|---|---|---|
| Contexto geral | variável **`vContexto`** com um texto sobre o app | o texto inteiro, como orientação |
| Campos | tag **`I.A`** no campo | só os campos marcados, com o comentário de cada um |
| Itens mestres | tag **`I.A`** na medida ou dimensão mestre | só os marcados, com descrição e **expressão**; a IA prefere usá-los |

Exemplo no script de carga:

```qlik
SET vContexto = 'App de RH. Headcount = colaboradores ativos no último dia do mês. Turnover = desligamentos / headcount médio.';

TAG FIELD Departamento WITH 'I.A';
COMMENT FIELD Departamento WITH 'Departamento atual do colaborador';
TAG FIELD DataAdmissao WITH 'I.A';
COMMENT FIELD DataAdmissao WITH 'Data de admissão; use para contar admissões por mês';
```

Nos itens mestres, a tag é adicionada pela interface: **Itens mestres → Editar → Tags**.

Observações:

- A tag é reconhecida sem diferenciar maiúsculas, pontos ou espaços: `I.A`, `i.a` e `IA` valem igual.
- Se nenhum campo tiver a tag, todos os campos são enviados, para a IA não ficar sem nada.
- Itens mestres sem a tag nunca são enviados.
- O contexto é lido na primeira mensagem de cada conversa. Depois de mudar tags ou o `vContexto`, recarregue o app e clique em **＋ Nova conversa**.

### Conferir se está pronto (ⓘ Contexto)

O botão **ⓘ** mostra o que o assistente sabe do app e se está pronto:

- **Situação:** ✅ *Pronto para uso*, 🟡 *Pronto, com ressalvas* ou 🔴 *Falta configurar*, com a lista do que está certo (✓) e do que falta (!).
- **Variável `vContexto`:** o texto, ou um aviso se ela não existe ou está vazia.
- **Medidas e dimensões mestre com a tag:** nome, id, descrição e expressão.
- **Campos com a tag, por tabela:** tipo e comentário. Campos sem comentário aparecem com ⚠, porque é o comentário que explica o campo para a IA.
- **Texto completo enviado à IA.**

**↻ Ler de novo** relê o app.

## Referência das propriedades

**Seção Qlik DashBuilder AI**

| Propriedade | Descrição |
|---|---|
| **Idioma / Language** | `Português (Brasil)` ou `English`. Muda as propriedades, a interface, as mensagens, o formato dos números e o idioma das respostas e dos painéis da IA. Nomes de campos e valores continuam como estão no app. |
| **Modo** | `Painel IA (assistente)` (padrão) ou `Painel (somente visualização)`, que é criado pelo próprio assistente. |
| **Provedor da IA** | Google Gemini, Anthropic Claude ou OpenRouter. |
| **Modelo do Gemini / Claude / OpenRouter** | Modelos recomendados de cada provedor. |
| **Outro modelo** | Qualquer identificador de modelo do provedor, por exemplo `openai/gpt-6-sol` no OpenRouter. No OpenRouter, o modelo precisa aceitar *structured outputs*. |
| **Profundidade da análise** | Rápida (recomendado), Equilibrada ou Detalhada. Só vale para o Claude. |
| **Tag dos campos e itens mestres** | Padrão `I.A`. |
| **Variável com o contexto do app** | Padrão `vContexto`. |
| **Enviar exemplos de valores dos campos** | Até 5 valores por campo de texto. Desligue para dados sensíveis. |
| **Habilitar nova sessão (HTML Complexo)** | Vem marcada. Veja [abaixo](#html-complexo-e-sessão-separada). |
| **Painel (JSON)** | A especificação do painel gerado, editável à mão. |

**Aparência → Qlik DashBuilder AI**

| Propriedade | Descrição |
|---|---|
| **Mostrar no objeto** | `Painel completo` ou `Somente o ícone IA`, que mostra só o botão ✨ IA no centro. Só no assistente. |
| **Fundo do objeto** | `Automático` (transparente quando só o ícone), `Padrão do tema do Qlik`, `Transparente` ou `Cor personalizada` (seletor de cor). Vale para o cartão inteiro do objeto. Para esconder também o título, desligue **Mostrar títulos** em Aparência → Geral. |
| **Cores da empresa** | Lista de cores hex, por exemplo `#0055a5, #ffcc00`. Substitui a paleta escolhida pela IA. |
| **Rótulos de valor** | Mostra ou esconde os números nos gráficos. |
| **Animações** | Ligadas ou desligadas. |
| **Botão de exportação (PDF)** | Só no objeto do painel (somente visualização). |

## HTML Complexo e sessão separada

O **HTML Complexo** gera um único arquivo HTML estático, sem Qlik e sem scripts externos. Os gráficos são SVG com dica ao passar o mouse, e o rodapé informa a data da extração, o app e o filtro.

Com **Habilitar nova sessão (HTML Complexo)** marcada, que é o padrão:

- **Sessão separada:** os dados são extraídos numa **sessão separada do app**, aberta com uma `identity` própria. É o mesmo que abrir `…/sheet/<pasta>/state/analysis/identity/<x>`.
- **Seleções reais:** essa sessão usa o **estado padrão** e começa sem seleções. Os recortes do pedido (ano, negócio…) são aplicados nela como **seleções reais**. Por isso medidas governadas, como `$(=Max(Competência))`, calculam certo.
- **Sua tela:** não pisca e as suas seleções não mudam. A sessão é fechada no fim da extração.

Desmarcada, ou se o Qlik não permitir a segunda sessão:

- **HTML Complexo:** usa um estado alternativo, `DashBuilderAI_Snapshot`, criado no app na primeira vez.
- **Séries por período:** são selecionadas na sua própria sessão. As suas seleções ficam guardadas num favorito temporário e são devolvidas no fim.
- **Se nada disso for possível:** cada período é calculado por set analysis, e o chat avisa.

A mensagem "HTML Complexo pronto" sempre diz qual caminho foi usado.

## Indicadores consolidados por período

Alguns indicadores só fazem sentido um período por vez, como o **% Turnover** mensal, headcount, saldos e índices já consolidados. Quando você pede a evolução de um deles, por exemplo "turnover de 2026 mês a mês", o assistente extrai **um período de cada vez**:

1. Abre a sessão separada, sem seleções.
2. Aplica os filtros fixos do painel, por exemplo Ano = 2026.
3. Seleciona `01/2026` e guarda o valor, depois seleciona `02/2026` e guarda o valor, e assim por diante.
4. Fecha a sessão e desenha os valores guardados numa linha, em colunas ou numa tabela.

Detalhes:

- **Andamento:** o chat mostra o progresso, por exemplo "Filtrando Competência = 03/2026 (3 de 12)…".
- **Medidas mestre:** funcionam. A extensão lê a expressão e o formato numérico do item mestre.
- **Formatos reconhecidos:** `01/2026`, `2026-01`, `jan/2026` e `Jan`.
- **Limite:** até 60 períodos, em ordem cronológica.
- **Cache:** os valores ficam guardados durante a sessão. Baixar de novo não refaz a extração.

## Filtros e visões segmentadas

Peça "uma visão da filial 10002" e a IA seleciona o valor no app. Ao desmarcar, tudo volta a aparecer.

Os campos usados aparecem numa **coluna de filtros à esquerda do painel**:

- **Visual HTML:** uma lista por campo, com busca.
  - Digite `2026` e a lista mostra só os valores que batem, sem diferenciar acentos e maiúsculas.
  - **Enter** seleciona os encontrados e **Esc** limpa a busca.
  - Em campos com mais de 500 valores, a busca também consulta o Qlik.
- **Objetos Qlik:** um painel de filtros nativo.

Antes de aplicar o filtro, a extensão confere se o campo e os valores existem. Se a IA errar uma maiúscula ou um zero à esquerda, ela é chamada para corrigir.

**Filtro fixo:** diga "fixe o painel na filial 10002". O filtro entra como set analysis em todas as medidas, e o painel passa a ignorar as seleções. Para tirar, peça "remova o filtro fixo".

## Custos e privacidade

- **Gemini, plano gratuito do AI Studio:**
  - **Custo e limite:** sem custo, mas com limite de pedidos. Quando o limite estoura, aparece o erro 429.
  - **Uso dos dados:** pelos termos do Google, os dados enviados no plano gratuito podem ser usados para melhorar os produtos do Google. Para dados da empresa, ative o faturamento no projeto do Google Cloud ligado à chave ou desligue os valores de exemplo.
- **Gemini pago e Claude:** cobrança por tokens. Um pedido de painel costuma usar alguns milhares de tokens de entrada (a estrutura do app) e de 2 a 6 mil de saída. Flash-Lite, Sonnet e Haiku são mais baratos.
- **OpenRouter:**
  - **Créditos:** são pré-pagos. Quando acabam, aparece o erro 402.
  - **Modelos gratuitos:** os terminados em `:free` não custam nada, mas têm limites baixos e podem guardar os dados.
  - **Retenção dos dados:** em <https://openrouter.ai/settings/privacy> dá para bloquear provedores que treinam com os dados.
- **Chave da API:** fica no navegador do usuário (`localStorage`). Para oferecer a IA a muitos usuários sem chave própria, coloque um pequeno backend (proxy) entre a extensão e o provedor para guardar a chave.

## Solução de problemas

| Sintoma | O que verificar |
|---|---|
| "Não foi possível falar com <domínio>" | O domínio do provedor não está na Content Security Policy (`connect-src`). |
| Erro 401 / 403 | Chave inválida ou sem acesso ao modelo escolhido. Use **trocar chave** no chat. |
| Erro 429 | Limite de pedidos do provedor (comum no Gemini gratuito). Aguarde e tente de novo. |
| Erro 402 | Acabaram os créditos do OpenRouter. |
| Caixa vermelha no objeto | Abra o console (F12) e filtre por `DashBuilder AI`. |
| Versão antiga continua aparecendo | Envie o zip de novo e recarregue com **Ctrl+F5**. |
| Objetos não são criados na pasta | A pasta precisa ser sua e não publicada. |
| HTML Complexo segue as suas seleções | A sessão separada não abriu. A mensagem "pronto" diz qual caminho foi usado. |

## Estrutura do projeto

```
QlikDashBuilderAI/
├── QlikDashBuilderAI.qext    manifesto da extensão (nome, versão, ícone)
├── QlikDashBuilderAI.js      ponto de entrada: paint, estilos, fundo do objeto, exportação
├── properties.js             painel de propriedades (bilíngue) e valores padrão
└── lib/
    ├── assistant.js          chat, modos, prompts, tela de Contexto, copiar/Excel
    ├── ai.js                 clientes Gemini / Claude / OpenRouter (saída estruturada)
    ├── appinfo.js            lê estrutura do app, tags, itens mestres, vContexto
    ├── query.js              executa no motor do Qlik as consultas pedidas pela IA
    ├── extract.js            extração período a período (sessão, favorito, set analysis)
    ├── session.js            sessão separada via qlik.openApp(..., { identity })
    ├── snapshot.js           HTML Complexo: renderização fora da tela e página autônoma
    ├── dashboard.js          especificação do painel → hipercubos → gráficos
    ├── native.js             cria e atualiza objetos nativos na pasta
    ├── sidebar.js            coluna de filtros com busca
    ├── charts.js             gráficos SVG (linha, área, barras, rosca, medidor, calor…)
    ├── filters.js            filtros fixos como set analysis
    ├── xlsx.js               gerador de .xlsx sem dependências
    ├── i18n.js               utilitário de idioma T(pt, en)
    └── …                     tables, template, sanitize, export, util, data, actions, cssscope
```

Todo o código é JavaScript AMD puro (RequireJS `define`), carregado pelo próprio Qlik. Não há etapa de build nem dependências.

## Gerar o zip

Os arquivos precisam ficar na **raiz** do zip, e não dentro de uma pasta.

Windows (`tar` nativo):

```powershell
tar.exe -a -c -f QlikDashBuilderAI.zip QlikDashBuilderAI.qext QlikDashBuilderAI.js properties.js README.md lib
```

macOS / Linux:

```bash
zip -r QlikDashBuilderAI.zip QlikDashBuilderAI.qext QlikDashBuilderAI.js properties.js README.md lib
```

## Modos antigos

Objetos antigos podem usar os modos manuais das primeiras versões:

- **Gráfico (galeria):** 12 tipos de gráfico SVG.
- **Template HTML/CSS:** usa `{{#rows}}`, `{{d0}}`, `{{m0}}` e botões `data-action`.
- **Tabela.**
- **Pivô.**

Esses modos não aparecem mais para objetos novos. Só aparecem nos objetos que já usam um deles, marcados como "(modo antigo)".

## Licença

[MIT](LICENSE) © 2026 Danilo Stochi
