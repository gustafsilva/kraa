#!/bin/sh
# Instalador do Prompt Improve para macOS e Linux (sem Node).
#
#   curl -fsSL https://raw.githubusercontent.com/gustavofreitas/prompt-improve/main/scripts/install.sh | sh
#
# Variáveis de ambiente:
#   PROMPT_IMPROVE_VERSION  versão a instalar (ex.: 0.1.0); padrão: o último release
#   PROMPT_IMPROVE_REPO     repositório "dono/repo" no GitHub; padrão: gustavofreitas/prompt-improve
#
# Mesmas regras do instalador npm (npm/src/install.ts): nome do asset,
# conferência do SHA-256 contra o checksums.txt e diretório de instalação.
set -eu

REPO="${PROMPT_IMPROVE_REPO:-gustavofreitas/prompt-improve}"
VERSION="${PROMPT_IMPROVE_VERSION:-}"
VERSION="${VERSION#v}"

fail() {
	echo "Erro: $*" >&2
	exit 1
}

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
Darwin)
	asset="prompt-improve-darwin-universal.app.zip"
	;;
Linux)
	case "$arch" in
	x86_64 | amd64) asset="prompt-improve-linux-amd64" ;;
	aarch64 | arm64) asset="prompt-improve-linux-arm64" ;;
	*) fail "a arquitetura $arch não é suportada no Linux (suportadas: x86_64, arm64)." ;;
	esac
	;;
*)
	fail "o sistema $os não é suportado por este script (no Windows, use scripts/install.ps1)."
	;;
esac

if [ -n "$VERSION" ]; then
	base="https://github.com/$REPO/releases/download/v$VERSION"
	label="v$VERSION"
else
	base="https://github.com/$REPO/releases/latest/download"
	label="último release"
fi

download() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL -o "$2" "$1"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O "$2" "$1"
	else
		fail "é preciso ter curl ou wget instalado."
	fi
}

sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		fail "é preciso ter sha256sum ou shasum instalado."
	fi
}

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t prompt-improve)"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM

echo "Baixando Prompt Improve ($label, $asset)..."
download "$base/checksums.txt" "$tmp/checksums.txt" ||
	fail "não foi possível baixar $base/checksums.txt"
download "$base/$asset" "$tmp/$asset" ||
	fail "não foi possível baixar $base/$asset"

expected="$(awk -v n="$asset" '{ f = $2; sub(/^\*/, "", f); if (f == n) { print tolower($1); exit } }' "$tmp/checksums.txt")"
[ -n "$expected" ] || fail "$asset não aparece no checksums.txt."
actual="$(sha256 "$tmp/$asset")"
if [ "$actual" != "$expected" ]; then
	rm -f "$tmp/$asset"
	fail "SHA-256 não confere para $asset (esperado $expected, obtido $actual); instalação abortada."
fi

if [ "$os" = "Darwin" ]; then
	apps="$HOME/Applications"
	target="$apps/Prompt Improve.app"
	mkdir -p "$apps"
	ditto -x -k "$tmp/$asset" "$tmp/app"
	bundle="$(find "$tmp/app" -maxdepth 1 -name '*.app' | head -n 1)"
	[ -n "$bundle" ] || fail "o zip $asset não contém um .app."
	rm -rf "$target"
	ditto "$bundle" "$target"
	echo "Prompt Improve instalado em $target"
	echo
	echo "Para iniciar:  open -a \"$target\""
	echo "Na primeira vez, conceda a permissão de Acessibilidade quando o app pedir."
else
	dir="$HOME/.local/share/prompt-improve"
	target="$dir/prompt-improve"
	mkdir -p "$dir"
	chmod +x "$tmp/$asset"
	# Copia para um nome temporário e renomeia: substitui atomicamente mesmo
	# com o app em execução.
	cp "$tmp/$asset" "$target.new"
	mv -f "$target.new" "$target"
	echo "Prompt Improve instalado em $target"
	echo
	echo "Para iniciar:  \"$target\" &"
	echo "Atalho no Wayland (GNOME): aponte um atalho personalizado para: \"$target\" --trigger"
fi
