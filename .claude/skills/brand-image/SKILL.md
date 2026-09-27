---
name: brand-image
description: Use quando precisar gerar ou editar uma imagem da marca Kraa (mascote, ícone, glifo da bandeja, ilustração do site) com um gerador de imagens por IA no navegador. Hoje usa o ChatGPT pelo Claude in Chrome.
argument-hint: "[nome-da-imagem] [descrição]"
---

# Imagens da marca Kraa

As regras do personagem, a paleta, a mensagem de referência, os prompts já usados e os comandos
de pós-processamento ficam em `docs/brand/README.md`. **Leia esse arquivo antes de gerar
qualquer imagem.** Esta skill cobre só o "como operar o gerador".

## Fluxo

1. **Defina o nome** da imagem em kebab-case (ex.: `tray-glyph`, `mascot-wave`). O original será
   salvo em `docs/brand/source/<provider>-<nome>.png`.
2. **Monte o prompt** a partir do README: comece com a mensagem de referência (chat novo) ou
   com `Next image (same Kraa crow and style, no sparkle in the beak): ...` (chat já com a
   referência). Termine com o formato (`Square 1:1.` / `wide 16:9 landscape`).
3. **Transparência:** o ChatGPT desenha o xadrez de "transparente" nos pixels. Para glifos e
   ícones que precisam de alfa exato, peça `pure flat white background (#FFFFFF), no checkerboard`
   e gere o alfa localmente com o ImageMagick. Para stickers, o fundo transparente dele costuma
   servir; confira.
4. **Escolha o provider.** Padrão: `chatgpt` → siga `providers/chatgpt.md`.
5. **Mostre o resultado ao usuário antes de aceitar.** Se vier estrela no bico, texto legível ou
   logo de terceiros, peça o ajuste no mesmo chat.
6. **Salve o original sem editar** em `docs/brand/source/`, gere os derivados com os comandos do
   README e atualize a tabela "Imagens e onde são usadas" do README (e os prompts usados, se
   forem novos).

## Providers

| Provider | Arquivo | Estado |
|---|---|---|
| ChatGPT (chatgpt.com) | `providers/chatgpt.md` | Em uso |

Para adicionar um provider (ex.: Gemini), crie `providers/<nome>.md` com as mesmas seções do
`chatgpt.md` (Pré-requisitos, Abrir o chat, Anexar referência, Enviar o prompt, Aguardar,
Baixar, Limitações conhecidas), acrescente uma linha na tabela acima e use o prefixo
`<nome>-` nos arquivos de `docs/brand/source/`.
