# Identidade visual: Kraa

Kraa é o nome do app e do seu mascote: um corvo preto, esperto, com olho e detalhes âmbar. O
nome vem da onomatopeia do corvo ("kraa!"). O corvo combina com o app porque é inteligente,
imita fala e coleta coisas brilhantes: pega o seu texto e devolve polido.

Este diretório guarda todas as imagens da marca, os prompts usados para gerá-las e o processo
para criar ou editar imagens novas mantendo o mesmo personagem.

## Regras do personagem

- Corvo preto com reflexos azulados, traço vetorial plano, silhueta forte.
- Olho âmbar com um ponto branco de brilho; alguns detalhes âmbar nas penas.
- **Nunca** colocar estrela ou brilho (✦) no bico. Foi testado e rejeitado.
- Âmbar só em detalhes e brilhos; o resto fica na paleta escura.
- Poses de corpo inteiro usam estilo sticker, com contorno branco fino e fundo transparente.

### Paleta

| Nome | Hex | Uso |
|---|---|---|
| near-black | `#0B0B0F` | Fundos escuros (banner, hero, site) |
| charcoal | `#18181B` | Fundo do ícone do app |
| zinc | `#3F3F46` | Sombras e penas |
| off-white | `#FAFAFA` | Texto sobre fundo escuro, contorno dos stickers |
| amber | `#F5B324` | Olho, detalhes e brilhos (acento único) |

## Estrutura

```
docs/brand/
├── README.md              este arquivo
├── kraa-mark.png          cabeça do corvo, fundo transparente, 1024×1024 (logo principal)
├── kraa-banner.png        logo horizontal "kraa", 1600px (README)
├── kraa-app-icon.png      ícone do app (squircle), 1024×1024, transparência real
├── kraa-glyph.png         glifo monocromático (preto + alfa), 1024×1024, base da bandeja
├── kraa-hero.png          hero da home do site, 1672×941 (logo do Gmail removido)
├── mascot/                poses do mascote, 768px, fundo transparente
│   ├── wave.png  typing.png  success.png  error.png  empty.png  profile.png
├── spot/                  ilustrações das páginas da docs, 768px, fundo transparente
│   ├── install.png  shortcuts.png  config.png  models.png  troubleshooting.png  linux.png
└── source/                originais do ChatGPT, sem nenhum tratamento
```

Os arquivos de `source/` são a fonte de verdade. Tudo o que está fora dela é derivado e pode
ser regenerado com os comandos de [Pós-processamento](#pós-processamento).

## Imagens e onde são usadas

| Imagem | Original | Onde é usada |
|---|---|---|
| `kraa-mark.png` | `source/chatgpt-mark.png` | Logo do header do site (`site/public/kraa-mark.png`), favicons, camada do `build/appicon.icon` |
| `kraa-banner.png` | `source/chatgpt-banner.png` | Topo do `README.md`, `site/public/brand/banner.webp`, `site/public/brand/og.png` (preview de links) |
| `kraa-app-icon.png` | montado a partir de `kraa-mark.png` (ver abaixo) | `build/appicon.png` → `build/darwin/icons.icns`, `build/windows/icon.ico` |
| `kraa-glyph.png` | `source/chatgpt-tray-glyph.png` | Bandeja: `internal/trayicon/{mac-template,light,dark}.png` |
| `kraa-hero.png` | `source/chatgpt-hero.png` | Seção "Conheça o Kraa" da home (`site/public/brand/hero.webp`) |
| `mascot/wave.png` | `source/chatgpt-mascot-wave.png` | Modal: preview vazio com texto, aguardando ação. Docs: "Primeiros passos" |
| `mascot/typing.png` | `source/chatgpt-mascot-typing.png` | Modal: gerando, antes do primeiro trecho do stream |
| `mascot/success.png` | `source/chatgpt-mascot-success.png` | Ainda não usada (o "Copiar" fecha a janela na hora) |
| `mascot/error.png` | `source/chatgpt-mascot-error.png` | Modal: alerta "Não foi possível melhorar o texto" (ex.: Ollama parado) |
| `mascot/empty.png` | `source/chatgpt-mascot-empty.png` | Modal: preview vazio sem texto selecionado |
| `mascot/profile.png` | `source/chatgpt-mascot-profile.png` | Cabeçalho da janela "Perfil do usuário". Docs: "Perfil do usuário" |
| `spot/install.png` | `source/chatgpt-spot-install.png` | Docs: instalação (npm, script) |
| `spot/shortcuts.png` | `source/chatgpt-spot-shortcuts.png` | Docs: atalhos |
| `spot/config.png` | `source/chatgpt-spot-config.png` | Docs: arquivo de configuração, providers |
| `spot/models.png` | `source/chatgpt-spot-models.png` | Docs: Ollama, seletor de modelo |
| `spot/troubleshooting.png` | `source/chatgpt-spot-troubleshooting.png` | Docs: solução de problemas |
| `spot/linux.png` | `source/chatgpt-spot-linux.png` | Docs: plataforma Linux |

`source/chatgpt-app-icon.png` não é usado: o ChatGPT desenhou o xadrez de "transparência" nos
pixels. O ícone final foi montado localmente a partir de `kraa-mark.png`.

No código:
- **App:** `frontend/src/assets/mascot/*.webp` (256px) e o componente
  `frontend/src/components/Mascot.tsx` (`<Mascot pose="error" />`).
- **Site:** `site/public/brand/*.webp` (512px). As ilustrações entram pelo frontmatter
  `illustration: spot-install` das páginas `.mdx`, renderizadas por
  `site/src/components/SpotIllustration.astro`.

## Processo no ChatGPT

Todas as imagens foram geradas com a geração de imagem do próprio ChatGPT (chatgpt.com), com
o seletor de modelo em "Instantânea". Foram dois chats, que só abrem na conta do autor:

1. **"Logo de corvo geométrico"**
   (<https://chatgpt.com/c/6ab7f256-e52c-83e9-a6a5-e0849a66f5c9>): exploração do logo. Saíram
   daqui a cabeça (`chatgpt-mark.png`) e o banner (`chatgpt-banner.png`).
2. **"Generate macOS icon"**
   (<https://chatgpt.com/c/6ab82a1f-8c80-83e9-9287-ca1b18254e39>): todas as outras imagens,
   usando a cabeça aprovada como referência de personagem.

A skill de projeto `/brand-image` automatiza este processo pelo Claude in Chrome (abrir o chat,
enviar o prompt, baixar, comparar os candidatos nos tamanhos de uso e pedir a aprovação).

### Passo a passo para gerar uma imagem nova

1. Abra um chat novo no ChatGPT.
2. Anexe `docs/brand/kraa-mark.png` como referência.
3. Envie a [mensagem de referência](#mensagem-de-referência) primeiro. Ela fixa personagem,
   estilo, paleta e a regra do bico.
4. Peça **uma imagem por mensagem**, sempre começando com
   `Next image (same Kraa crow and style, no sparkle in the beak): ...` e terminando com o
   formato (`Square 1:1.` ou `wide 16:9 landscape`).
5. Para ilustrações de sticker, inclua
   `transparent background, sticker style with thin white outline`.
6. Se algo vier com texto legível, logo de terceiros ou estrela no bico, peça o ajuste no
   mesmo chat (ex.: `Tire a estrela do bico, e deixa o fundo transparente como ja ta`) ou
   corrija no pós-processamento.
7. Baixe a imagem, salve em `source/chatgpt-<nome>.png` sem editar e gere as versões
   derivadas com os comandos abaixo.

Para **editar** uma imagem existente, anexe o original de `source/` e descreva só a mudança.
Isso funcionou bem para tirar a estrela do bico da cabeça.

## Prompts usados

### Bloco de estilo base

Anexado ao fim dos prompts do primeiro chat. No segundo chat, a mensagem de referência faz
esse papel.

```
Style: modern flat vector illustration, clean geometric shapes, bold silhouette, minimal detail, smooth curves, subtle rim light. Character: "Kraa", a clever black crow (raven-like), glossy blue-black feathers, sharp curious eye with a small white highlight, slightly mischievous smirk. Palette: near-black #0B0B0F, charcoal #18181B, zinc gray #3F3F46, off-white #FAFAFA, single accent amber gold #F5B324 used only for sparkles and highlights. No gradients heavier than two tones, no photorealism, no text unless specified.
```

### Cabeça (`chatgpt-mark.png`)

Em duas etapas. Primeiro o logo, que veio com uma estrela no bico:

```
Minimal geometric logo mark of a crow head in profile facing right, built from
a few bold triangular and circular shapes, holding a small amber four-point
sparkle (✦) in its beak. Solid black silhouette on transparent/white
background, centered, generous padding, works at 16px, iconic like a tech
startup logo.

<bloco de estilo base>
```

Depois, com essa imagem anexada, veio a versão final:

```
Tire a estrela do bico, e deixa o fundo transparente como ja ta
```

Para uma cabeça nova, gere direto sem a estrela: troque o trecho do bico por
`amber eye and a few amber feather highlights, nothing in its beak`.

### Banner (`chatgpt-banner.png`)

```
Horizontal logo lockup: crow head mark on the left, the lowercase word "kraa" on the right in a bold geometric sans-serif, tight letter spacing, a small sparkle in amber #F5B324 above the last letter. Version on dark background #0B0B0F with off-white text.
<bloco de estilo base>
```

A estrela acima do último "a" é intencional; a regra vale só para o bico.

### Mensagem de referência

Primeira mensagem do segundo chat, com `kraa-mark.png` anexada. Ela gerou o
`chatgpt-app-icon.png`.

```
This attached image is the approved character and style reference for "Kraa", a crow mascot. For EVERY image I ask in this chat: keep the same crow, same flat vector style, same amber eye and amber #F5B324 feather accents, near-black #0B0B0F / charcoal #18181B / zinc #3F3F46 palette, transparent background whenever possible. RULE: never put a star or sparkle in the beak. Generate one image per message. First image: macOS app icon, 1024x1024, rounded squircle shape, dark charcoal background #18181B with subtle top-down gradient, the crow head from the reference centered in profile facing right, soft inner shadow, subtle depth like Apple Big Sur icons. No sparkle, no text.
```

### Mascote

`mascot/wave.png`:
```
Next image (same Kraa crow and style as the reference, no sparkle in the beak): full body mascot illustration of Kraa the crow standing confidently, one wing raised waving hello, friendly smirk, centered on transparent background, sticker style with thin white outline. Square 1:1.
```

`mascot/typing.png`:
```
Next image (same Kraa crow and style, no sparkle in the beak): Kraa the crow typing fast on a tiny mechanical keyboard, small amber sparkles flying off the keys (not from the beak), focused expression, motion lines, transparent background, sticker style with thin white outline. Square 1:1.
```

`mascot/success.png`:
```
Next image (same Kraa crow and style, no sparkle in the beak): Kraa the crow proudly holding a shiny amber gem up high with one wing (the gem is held by the wing, not in the beak), satisfied closed-eye smile, tiny confetti, transparent background, sticker style with thin white outline. Square 1:1.
```

`mascot/error.png`:
```
Next image (same Kraa crow and style, no sparkle in the beak): Kraa the crow confused, head tilted, holding an unplugged power cable with its wing, small question mark above head, gentle humorous tone, transparent background, sticker style with thin white outline. Square 1:1.
```

`mascot/empty.png`:
```
Next image (same Kraa crow and style, no sparkle in the beak): Kraa the crow peeking curiously into an empty blank paper sheet, minimal composition, lots of negative space, transparent background, sticker style with thin white outline. Square 1:1.
```

`mascot/profile.png`:
```
Next image (same Kraa crow and style, no sparkle in the beak): Kraa the crow wearing small round glasses, reading a profile / ID card held in one wing, thoughtful pose with the other wing on chin, transparent background, sticker style with thin white outline. Square 1:1.
```

### Glifo da bandeja (`chatgpt-tray-glyph.png`)

Pedido no chat "Generate macOS icon". Veio com transparência real (alfa), não com o xadrez.

```
Next image (same Kraa crow head as the approved reference, no sparkle in the beak): a MENU BAR GLYPH of the crow head. A single solid black (#000000) silhouette of the same crow head in profile facing right, with a LARGE round eye as a cutout showing the white background, no inner feather lines, no gradients, no outline, no amber, nothing in the beak. Bold simplified shapes that stay readable at 16px, like an SF Symbol. Centered with generous padding, pure flat white background (#FFFFFF), no checkerboard. Square 1:1.
```

Uma segunda tentativa, bem mais simples (bico reto, olho grande sem pupila), lia melhor em
16 px, mas a escolhida foi esta primeira, mais fiel ao estilo do mascote.

### Hero (`kraa-hero.png`)

```
Next image, wide 16:9 landscape (same Kraa crow and style, no sparkle in the beak): hero illustration for a developer tool website, dark background #0B0B0F. Kraa the crow flying across multiple floating app windows (code editor, chat, email), collecting highlighted text snippets from each window like shiny objects with its feet, leaving a trail of amber sparkles behind its wings. Isometric-lite perspective, clean flat vector, no readable text.
```

O ChatGPT desenhou o logo do Gmail na janela de e-mail. Ele foi coberto no pós-processamento.
Numa próxima versão, acrescente `no real brand logos` ao prompt.

### Ilustrações da docs

`spot/install.png`:
```
Next image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow flying while carrying a small cardboard package with its feet, transparent background, sticker style with thin white outline.
```

`spot/shortcuts.png`:
```
Next image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow pressing a giant keyboard key with its foot, the key shows the command symbol ⌘, transparent background, sticker style with thin white outline.
```

`spot/config.png`:
```
Next image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow adjusting a large wrench on a gear, with a scroll of config-file lines behind it (no readable text), transparent background, sticker style with thin white outline.
```

`spot/models.png`:
```
Next image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow sitting relaxed on top of a small server box with blinking amber lights, transparent background, sticker style with thin white outline.
```

`spot/troubleshooting.png`:
```
Next image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow holding a magnifying glass with its wing, inspecting a small cute bug (insect), detective vibe, transparent background, sticker style with thin white outline.
```

`spot/linux.png`:
```
Last image, square 1:1 spot illustration (same Kraa crow and style, no sparkle in the beak): Kraa the crow standing next to a friendly cartoon penguin, both looking at a small terminal window (no readable text), transparent background, sticker style with thin white outline.
```

Esta é a menos fiel ao personagem (penas mais amarelas, traço mais cartunesco). É uma boa
candidata a regerar.

## Pós-processamento

Precisa do ImageMagick (`brew install imagemagick`). Rode os comandos na raiz do repositório.

**Cabeça e banner:**
```bash
magick docs/brand/source/chatgpt-mark.png -trim +repage -background none -gravity center \
  -resize 1000x1000 -extent 1024x1024 -strip docs/brand/kraa-mark.png
magick docs/brand/source/chatgpt-banner.png -resize 1600x -strip docs/brand/kraa-banner.png
```

**Mascote e ilustrações.** Troque `wave` pelo nome da pose, e use `spot/` e `site/public/brand/spot-` para as ilustrações:
```bash
magick docs/brand/source/chatgpt-mascot-wave.png -trim +repage -resize 768x768 -strip docs/brand/mascot/wave.png
magick docs/brand/mascot/wave.png -resize 512x512 -quality 86 site/public/brand/mascot-wave.webp
magick docs/brand/mascot/wave.png -resize 256x256 -quality 86 frontend/src/assets/mascot/wave.webp
```

**Hero.** Estas coordenadas cobrem o logo do Gmail com um quadrado neutro. Numa imagem nova, confira as posições:
```bash
magick docs/brand/source/chatgpt-hero.png \
  -fill "srgb(34,35,49)" -draw "rectangle 1172,572 1230,636" \
  -fill "srgb(72,77,100)" -draw "roundrectangle 1182,583 1220,621 8,8" docs/brand/kraa-hero.png
magick docs/brand/kraa-hero.png -resize 1600x -quality 84 site/public/brand/hero.webp
```

**Ícone do app.** Squircle `#18181B` de 824px com gradiente, centralizado num canvas de 1024 (grade do macOS), com a cabeça em 640px por cima:
```bash
magick -size 1024x1024 xc:none \
  \( -size 824x824 xc:none -fill "#18181B" -draw "roundrectangle 0,0 823,823 185,185" \
     \( -size 824x824 gradient:"#2A2A31-#121215" \) -compose SrcIn -composite \) \
  -gravity center -compose Over -composite \
  \( docs/brand/kraa-mark.png -resize 640x640 \) -gravity center -geometry +0+10 -compose Over -composite \
  -strip docs/brand/kraa-app-icon.png
cp docs/brand/kraa-app-icon.png build/appicon.png
cp docs/brand/kraa-mark.png build/appicon.icon/Assets/kraa-mark.png
cd build && wails3 generate icons -input appicon.png -macfilename darwin/icons.icns \
  -windowsfilename windows/icon.ico -iconcomposerinput appicon.icon -macassetdir darwin
```
O `Assets.car` do macOS depende do `actool` do Xcode. Se o `wails3` pular esse passo sem
avisar, rode `xcrun actool --version`. Se aparecer "A required plugin failed to load", rode
`sudo xcodebuild -runFirstLaunch` e gere de novo.

**Glifo da bandeja.** Achatar sobre branco antes do threshold funciona tanto com alfa real
quanto com fundo branco. Depois do glifo mestre, os três PNG de 64 px da bandeja:
```bash
magick docs/brand/source/chatgpt-tray-glyph.png -background white -flatten -colorspace Gray \
  -threshold 50% -negate -trim +repage -resize 960x960 -background black -gravity center \
  -extent 1024x1024 -write mpr:mask +delete \
  -size 1024x1024 xc:black mpr:mask -alpha off -compose CopyOpacity -composite \
  -strip docs/brand/kraa-glyph.png
magick docs/brand/kraa-glyph.png -resize 64x64 -strip internal/trayicon/mac-template.png
magick docs/brand/kraa-glyph.png -fill "#18181B" -colorize 100 -resize 64x64 -strip internal/trayicon/light.png
magick docs/brand/kraa-glyph.png -fill "#FAFAFA" -colorize 100 -resize 64x64 -strip internal/trayicon/dark.png
go test ./internal/trayicon/
```
Sem uma imagem gerada, dá para derivar a máscara do próprio `kraa-mark.png` (os detalhes
âmbar viram recortes; ajuste o `-fuzz` olhando o resultado) e seguir com ela no lugar do original:
```bash
magick docs/brand/kraa-mark.png -fuzz 25% -fill none -opaque "#F5B324" \
  -alpha extract -threshold 50% -negate "$TMPDIR/kraa-mask.png"
```

**Favicons e logo do site:**
```bash
magick docs/brand/kraa-mark.png -resize 512x512 site/public/kraa-mark.png
magick docs/brand/kraa-mark.png -resize 32x32 site/public/favicon-32.png
magick docs/brand/kraa-mark.png -define icon:auto-resize=48,32,16 site/public/favicon.ico
magick docs/brand/kraa-mark.png -resize 160x160 -background "#0B0B0F" -gravity center \
  -extent 180x180 site/public/apple-touch-icon.png
magick docs/brand/kraa-banner.png -resize 1600x -quality 88 site/public/brand/banner.webp
```
