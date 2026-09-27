// Command llmfake serves internal/llmfake on a TCP address for the
// Playwright suite (e2e/playwright.config.ts starts it as a webServer).
package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/gustavofreitas/kraa/internal/llmfake"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:18766", "endereço de escuta")
	flag.Parse()
	log.Printf("llmfake ouvindo em http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, llmfake.New("fake-a", "fake-b")))
}
