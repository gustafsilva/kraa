# Provider: ChatGPT (chatgpt.com) via Claude in Chrome

## Pré-requisitos

- Chrome com a extensão Claude in Chrome conectada e o usuário **logado** em chatgpt.com.
- Carregue as ferramentas numa chamada só:
  `ToolSearch("select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__file_upload")`.
- Se o site pedir login ou captcha, pare e peça ao usuário para resolver na janela do Chrome.

## Abrir o chat

1. `tabs_context_mcp` e depois `tabs_create_mcp` (aba nova; não reutilize abas do usuário).
2. `navigate` para `https://chatgpt.com/`. Para continuar um chat existente da marca, use a URL
   dele (o `docs/brand/README.md` lista os chats usados).
3. Confira o seletor de modelo: o processo documentado usa **"Instantânea"**.

## Anexar referência

- Use `file_upload` no input de arquivo do compositor com o caminho absoluto da referência
  (normalmente `docs/brand/kraa-mark.png`; para editar, o original em `docs/brand/source/`).
- Confirme por screenshot (`computer` → `screenshot`) que a miniatura apareceu antes de enviar.

## Enviar o prompt

- Clique no compositor (`find` "campo de mensagem" → `computer` `left_click`), digite o prompt
  com `computer` `type` e envie com `key` `Return`.
- **Uma imagem por mensagem.**

## Aguardar

- A geração leva de 30 s a 2 min. Tire um screenshot a cada ~20 s até a imagem final aparecer
  (sem a barra de progresso/"Criando imagem"). Não reenvie o prompt enquanto gera.

## Baixar

1. Passe o mouse sobre a imagem (ou clique para abrir em tela cheia) e clique no botão de
   download (ícone de seta para baixo).
2. O arquivo vai para `~/Downloads/` com nome parecido com `ChatGPT Image <data>.png`. Pegue o
   mais recente e mova para o destino:
   ```bash
   f=$(ls -t ~/Downloads/*.png | head -1) && echo "$f" && \
     mv "$f" docs/brand/source/chatgpt-<nome>.png
   ```
3. Mostre a imagem ao usuário (`Read` no PNG) antes de seguir para o pós-processamento.

## Limitações conhecidas

- Transparência vira xadrez desenhado nos pixels: peça fundo branco puro e recorte localmente.
- Às vezes volta a desenhar estrela no bico ou texto/logos: peça a correção no mesmo chat.
- Resolução típica: 1024×1024 (quadrado) ou 1536×1024 (paisagem).
- Os chats ficam na conta do usuário; registre a URL do chat no README se ele virar referência.
