package main

import "embed"

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend. Shared by main.go (desktop) and
// main_server.go (-tags server, E2E only).
//
//go:embed all:frontend/dist
var assets embed.FS
