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
5. **Salve cada tentativa sem editar** em `docs/brand/source/<provider>-<nome>-v<N>.png` assim
   que baixar. **Nunca sobrescreva** uma tentativa anterior: o usuário pode preferir uma
   versão antiga depois de comparar. Com a aprovação, renomeie a escolhida para
   `<provider>-<nome>.png` e apague as outras.
6. **Compare e mostre antes de confirmar** (ver [Comparar e aprovar](#comparar-e-aprovar)). Se
   vier estrela no bico, texto legível ou logo de terceiros, peça o ajuste no mesmo chat.
7. Com a aprovação, gere os derivados com os comandos do README e atualize a tabela "Imagens e
   onde são usadas" do README (e os prompts usados, se forem novos).

## Comparar e aprovar

Vale para qualquer provider. O usuário decide olhando a imagem, não a descrição dela.

1. Monte uma **folha de comparação** em `$TMPDIR` (ou no scratchpad da sessão) com o candidato
   novo ao lado do que existe hoje e das alternativas já geradas, **nos tamanhos em que a
   imagem será usada**, sobre fundo claro (`#ECECEC`) e escuro (`#1E1E1E`). Uma linha por
   candidato. Ex.: ícones e glifos em 16/22/32/64/128 px ampliados com `-filter point`
   (mostra o pixel real); ilustrações em 256/512 px.
   ```bash
   row=(); for bg in "#ECECEC" "#1E1E1E"; do for s in 16 32 64 128; do
     magick cand.png -resize ${s}x${s} -background "$bg" -gravity center -extent 136x136 "p-${#row[@]}.png"
     row+=("p-${#row[@]}.png"); done; done
   magick "${row[@]}" +append row-cand.png   # repita por candidato e junte com -append
   ```
2. Olhe a folha você mesmo (`Read`) e forme uma recomendação.
3. **Abra para o usuário:** `open <folha.png> <original.png>` (abre no Preview do macOS).
4. Pergunte com `AskUserQuestion`: uma opção por candidato + "nova tentativa", com a sua
   recomendação primeiro e o porquê em uma linha. Nunca aceite uma imagem sem essa resposta.

## Pós-processamento: cuidados

- Alguns geradores entregam **alfa real**, outros desenham o xadrez. Confira com
  `magick identify -format "%[channels] opaque=%[opaque]\n" arquivo.png`. Para gerar máscara a
  partir de qualquer um dos dois, achate sobre branco antes do threshold:
  `-background white -flatten -colorspace Gray -threshold 50% -negate`.

## Providers

| Provider | Arquivo | Estado |
|---|---|---|
| ChatGPT (chatgpt.com) | `providers/chatgpt.md` | Em uso |

Para adicionar um provider (ex.: Gemini), crie `providers/<nome>.md` com as mesmas seções do
`chatgpt.md` (Pré-requisitos, Abrir o chat, Anexar referência, Enviar o prompt, Aguardar,
Baixar, Limitações conhecidas), acrescente uma linha na tabela acima e use o prefixo
`<nome>-` nos arquivos de `docs/brand/source/`.
