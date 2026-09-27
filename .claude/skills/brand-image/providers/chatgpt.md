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

- Clique no compositor (`find` "campo de mensagem" → `computer` `left_click`) e digite o prompt
  com `computer` `type`. O `key` `Return` pode não enviar: clique no botão azul de enviar
  (seta, à direita do compositor) e confirme por screenshot que apareceu "Criando imagem".
- Continuar no chat "Generate macOS icon" (URL no README) dispensa anexar a referência de novo.
- **Uma imagem por mensagem.**

## Aguardar

- A geração leva de 30 s a 2 min. Tire um screenshot a cada ~20 s até a imagem final aparecer
  (sem a barra de progresso/"Criando imagem"). Não reenvie o prompt enquanto gera.

## Baixar

1. Antes de clicar, crie um marcador de tempo: `touch "$TMPDIR/brand-dl-marker"`.
2. Clique na imagem para abrir o editor em tela cheia e clique no botão de download (seta
   para baixo, no topo à direita). A barra lateral do editor lista as imagens do chat: clique
   na miniatura certa antes de baixar se quiser uma anterior.
3. O arquivo vai para `~/Downloads/` com nome parecido com `Imagem do ChatGPT <data>.png`
   (`ChatGPT Image <data>.png` com a interface em inglês). Pegue só o que chegou depois do
   marcador e salve como **nova tentativa** (`-v<N>`, sem sobrescrever; ver o SKILL.md):
   ```bash
   f=$(find ~/Downloads -maxdepth 1 \( -name 'Imagem do ChatGPT*.png' -o -name 'ChatGPT Image*.png' \) \
     -newer "$TMPDIR/brand-dl-marker" | head -1) && echo "$f" && \
     mv "$f" docs/brand/source/chatgpt-<nome>-v<N>.png
   ```
4. Siga para "Comparar e aprovar" do SKILL.md antes de qualquer pós-processamento.

## Limitações conhecidas

- Transparência varia: às vezes vem alfa real, às vezes o xadrez desenhado nos pixels (e às vezes
  ignora o pedido de fundo branco). Confira o arquivo e recorte localmente (ver SKILL.md).
- Imagem preta com fundo transparente fica invisível na página escura do chat: não é erro, baixe.
- Às vezes volta a desenhar estrela no bico ou texto/logos: peça a correção no mesmo chat.
- Resolução típica: 1024×1024 (quadrado) ou 1536×1024 (paisagem).
- Os chats ficam na conta do usuário; registre a URL do chat no README se ele virar referência.
