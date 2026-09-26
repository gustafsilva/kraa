package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"runtime"
	"slices"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"

	"github.com/gustavofreitas/prompt-improve/internal/app"
	"github.com/gustavofreitas/prompt-improve/internal/config"
	"github.com/gustavofreitas/prompt-improve/internal/improver"
	"github.com/gustavofreitas/prompt-improve/internal/llm"
	"github.com/gustavofreitas/prompt-improve/internal/platform"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

// triggerArg makes a second launch run the hotkey flow (manual fallback for
// Wayland/GNOME, where a custom system shortcut runs `prompt-improve --trigger`).
const triggerArg = "--trigger"

// loadConfig loads the user config from the default path.
func loadConfig() (*config.Config, string, error) {
	path, err := config.DefaultPath()
	if err != nil {
		return nil, "", err
	}
	cfg, err := config.Load(path)
	return cfg, path, err
}

// newRunner builds the LLM client + improver for cfg.
func newRunner(cfg *config.Config) app.Runner {
	p := cfg.Provider
	client := llm.NewOpenAIClient(p.BaseURL, p.APIKey, p.Model, time.Duration(p.TimeoutSeconds)*time.Second)
	return improver.New(cfg, client)
}

// main is the application entry point. It creates the Wails app, a hidden
// frameless window, the ImproveService bound to the frontend, the global
// hotkey and a system tray. The window is never destroyed when
// closed/hidden: the app keeps running in the tray.
func main() {
	// Declared before application.New so the SingleInstance callback can
	// close over it; it only runs after main() has assigned it.
	var trigger func(capture bool)

	wailsApp := application.New(application.Options{
		Name:        "prompt-improve",
		Description: "Melhora o texto selecionado via LLM compatível com OpenAI",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ActivationPolicy: application.ActivationPolicyAccessory,
			// Keep the app running in the tray after the window closes/hides.
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "dev.matrixia.prompt-improve",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if trigger != nil {
					trigger(slices.Contains(data.Args, triggerArg))
				}
			},
		},
	})

	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:        "Prompt Improve",
		Width:        560,
		Height:       520,
		Frameless:    true,
		AlwaysOnTop:  true,
		Hidden:       true,
		HideOnEscape: true,
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
	// Closing (e.g. Cmd+W / Alt+F4) hides instead of destroying the window.
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		window.Hide()
	})

	// macOS: ask once for the Accessibility permission (shows the system
	// prompt); without it canReplace stays false and a warning is shown.
	if runtime.GOOS == "darwin" {
		platform.AccessibilityTrusted(true)
	}

	cfg, cfgPath, cfgErr := loadConfig()
	if cfgErr != nil {
		log.Printf("config: %v", cfgErr)
		cfg = config.Default()
	}

	svc, host := app.New(app.Options{
		Config:    cfg,
		Runner:    newRunner(cfg),
		Emitter:   app.WailsEmitter{App: wailsApp},
		Clipboard: app.WailsClipboard{App: wailsApp},
		Keys:      platform.NewKeySender(),
		Window:    app.WailsWindow{App: wailsApp, Window: window},
		Session:   platform.DetectSession(),
	})
	wailsApp.RegisterService(application.NewService(svc))

	if cfgErr != nil {
		host.SetError(fmt.Sprintf("Erro ao carregar a configuração: %v. Usando a configuração padrão.", cfgErr))
	}

	onHotkey := func() {
		// Re-check each time so a permission granted after launch is
		// picked up without restarting.
		host.SetSession(platform.DetectSession())
		host.Trigger()
	}
	trigger = func(capture bool) {
		if capture {
			onHotkey()
		} else {
			host.ShowWindow()
		}
	}

	// mu guards currentHotkey and cfgPath (tray callbacks run on goroutines).
	var mu sync.Mutex
	currentHotkey := cfg.Hotkey
	if err := wailsApp.GlobalShortcut.Register(currentHotkey, onHotkey); err != nil {
		log.Printf("atalho: %v", err)
		host.SetHotkeyWarning(fmt.Sprintf("Não foi possível registrar o atalho %s. Use \"Abrir\" na bandeja.", currentHotkey))
	}

	reload := func() {
		newCfg, path, err := loadConfig()
		if err != nil {
			log.Printf("config: %v", err)
			host.SetError(fmt.Sprintf("Erro ao recarregar a configuração: %v. A configuração anterior foi mantida.", err))
			host.ShowWindow()
			return
		}
		host.Configure(newCfg, newRunner(newCfg))
		host.SetSession(platform.DetectSession())

		mu.Lock()
		defer mu.Unlock()
		cfgPath = path
		if newCfg.Hotkey == currentHotkey && wailsApp.GlobalShortcut.IsRegistered(currentHotkey) {
			host.SetHotkeyWarning("")
			return
		}
		_ = wailsApp.GlobalShortcut.Unregister(currentHotkey)
		if err := wailsApp.GlobalShortcut.Register(newCfg.Hotkey, onHotkey); err != nil {
			log.Printf("atalho: %v", err)
			host.SetHotkeyWarning(fmt.Sprintf("Não foi possível registrar o atalho %s. Mantido %s.", newCfg.Hotkey, currentHotkey))
			if err := wailsApp.GlobalShortcut.Register(currentHotkey, onHotkey); err != nil {
				log.Printf("atalho: %v", err)
			}
			return
		}
		currentHotkey = newCfg.Hotkey
		host.SetHotkeyWarning("")
	}

	tray := wailsApp.SystemTray.New()
	tray.SetTooltip("Prompt Improve")

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	} else {
		tray.SetDarkModeIcon(icons.SystrayDark)
		tray.SetIcon(icons.SystrayLight)
	}

	trayMenu := wailsApp.Menu.New()

	trayMenu.Add("Abrir").OnClick(func(ctx *application.Context) {
		host.ShowWindow()
	})
	trayMenu.Add("Editar configuração").OnClick(func(ctx *application.Context) {
		mu.Lock()
		path := cfgPath
		mu.Unlock()
		if path == "" {
			p, err := config.DefaultPath()
			if err != nil {
				log.Printf("config: %v", err)
				return
			}
			path = p
		}
		if err := app.OpenFile(path); err != nil {
			log.Printf("config: %v", err)
		}
	})
	trayMenu.Add("Recarregar configuração").OnClick(func(ctx *application.Context) {
		reload()
	})

	trayMenu.AddSeparator()

	trayMenu.Add("Sair").OnClick(func(ctx *application.Context) {
		wailsApp.Quit()
	})

	tray.SetMenu(trayMenu)

	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		switch {
		case slices.Contains(os.Args[1:], triggerArg):
			// First launch came from the --trigger shortcut itself.
			go onHotkey()
		case cfgErr != nil:
			host.ShowWindow()
		}
	})

	// Run the application. This blocks until the application has been exited.
	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
