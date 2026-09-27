#!/usr/bin/env bash
# Gera docs/brand/demo.gif e docs/brand/demo.png a partir da gravação de tela do fluxo
# completo (Gemini → atalho → Melhorar prompt → Substituir).
#
# Os tempos e as caixas abaixo valem para a gravação de 2026-09-26 (2704x1520). Ao regravar,
# meça de novo: trechos (digitação, modal, resultado), a caixa da saudação com o nome e a
# caixa da foto de perfil.
#
# Uso: docs/brand/source/make-demo.sh "<gravação.mov>"
set -euo pipefail

INPUT="${1:?uso: make-demo.sh <gravação.mov>}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GREETING="630:160:1080:460"   # w:h:x:y da saudação "Vamos lá, <nome>"
AVATAR="80:80:10:1420"        # w:h:x:y da foto de perfil
CROP="1390:1220:700:80"       # enquadramento final (campo + modal)
MODAL_START=6.4               # modal cobre a saudação entre estes tempos
MODAL_END=11.35

blur_filters() {
  local g_w g_h g_x g_y a_w a_h a_x a_y
  IFS=: read -r g_w g_h g_x g_y <<<"$GREETING"
  IFS=: read -r a_w a_h a_x a_y <<<"$AVATAR"
  printf '%s' \
    "[0:v]split=2[base][g];" \
    "[g]crop=${g_w}:${g_h}:${g_x}:${g_y},boxblur=20:3[gb];" \
    "[base][gb]overlay=${g_x}:${g_y}:enable='not(between(t,${MODAL_START},${MODAL_END}))'[b1];" \
    "[b1]split=2[base2][a];" \
    "[a]crop=${a_w}:${a_h}:${a_x}:${a_y},boxblur=20:3[ab];" \
    "[base2][ab]overlay=${a_x}:${a_y},crop=${CROP}"
}

GIF_FILTER="$(blur_filters),split=3[s1][s2][s3];\
[s1]trim=1.0:6.4,setpts=(PTS-STARTPTS)/3[p1];\
[s2]trim=6.4:11.3,setpts=PTS-STARTPTS[p2];\
[s3]trim=11.3:13.5,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.5[p3];\
[p1][p2][p3]concat=n=3:v=1:a=0,fps=12,scale=800:-1:flags=lanczos,split[x][y];\
[x]palettegen=max_colors=128:stats_mode=diff[pal];\
[y][pal]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"

ffmpeg -v error -y -i "$INPUT" -filter_complex "$GIF_FILTER" -an "$OUT_DIR/demo.gif"

# Quadro com o resultado pronto e o foco em "Substituir". O -ss vai DEPOIS do -i para manter
# o relógio original (t=10.8) e o blur da saudação continuar desligado durante o modal.
ffmpeg -v error -y -i "$INPUT" -ss 10.8 -filter_complex "$(blur_filters),scale=1200:-1:flags=lanczos" \
  -frames:v 1 "$OUT_DIR/demo.png"

ls -lh "$OUT_DIR/demo.gif" "$OUT_DIR/demo.png"
