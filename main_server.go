//go:build server

// Server-mode entrypoint used only by the E2E suite (e2e/). It serves the
// same frontend to a browser over HTTP (Wails server mode) with the real
// ImproveService → improver → llm stack, and replaces everything that needs
// the desktop (clipboard, keystrokes, windows, hotkeys, Accessibility) with
// internal/e2e fakes driven through /__e2e/*. Never shipped: release builds
// don't use the `server` tag.
package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/gustavofreitas/kraa/internal/app"
	"github.com/gustavofreitas/kraa/internal/e2e"
)

func main() {
	hooks := e2e.NewHooks()

	wailsApp := application.New(application.Options{
		Name:        "kraa",
		Description: "Kraa (server mode, E2E)",
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: hooks.Middleware,
		},
	})

	cfg, cfgPath, cfgErrMsg := app.LoadStartupConfig(app.LoadConfig)

	svc, host := app.New(app.Options{
		Config:        cfg,
		Runner:        app.NewRunner(cfg),
		Emitter:       app.WailsEmitter{App: wailsApp},
		Clipboard:     hooks.Clipboard,
		Keys:          hooks.Keys,
		Window:        hooks.Window,
		ProfileWindow: hooks.ProfileWindow,
		Session:       hooks.Session(),
	})
	hooks.Host = host
	wailsApp.RegisterService(application.NewService(svc))

	if cfgErrMsg != "" {
		host.SetError(cfgErrMsg)
	}

	reloader := app.NewReloader(app.ReloaderOptions{
		Host:          host,
		Shortcuts:     hooks.Shortcuts,
		Load:          app.LoadConfig,
		NewRunner:     app.NewRunner,
		DetectSession: hooks.Session,
		OnHotkey:      host.Trigger,
		Hotkey:        cfg.Hotkey,
		ConfigPath:    cfgPath,
	})
	reloader.RegisterHotkey()
	hooks.Reload = reloader.Reload
	hooks.Close = svc.Close
	host.SetModelSaver(reloader.SaveModel)
	host.SetProfileSaver(reloader.SaveProfile)

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
