// Package trayicon guarda os ícones da bandeja do Kraa como PNG embutidos.
// Os arquivos são gerados a partir de docs/brand/kraa-glyph.png (ver docs/brand/README.md).
package trayicon

import _ "embed"

// MacTemplate é o glifo preto com alfa usado como template image na barra de menus do macOS
// (o sistema pinta de claro ou escuro conforme o tema).
//
//go:embed mac-template.png
var MacTemplate []byte

// Light é o glifo escuro para bandejas de tema claro (Windows/Linux).
//
//go:embed light.png
var Light []byte

// Dark é o glifo claro para bandejas de tema escuro (Windows/Linux).
//
//go:embed dark.png
var Dark []byte
