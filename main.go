//go:build !server

package main

import (
	"log"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"

	"github.com/gustavofreitas/kraa/internal/app"
	"github.com/gustavofreitas/kraa/internal/autostart"
	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/platform"
)

// menuCheckbox adapts *application.MenuItem to autostart.Checkbox: it only
// discards MenuItem.SetChecked's chained return value, which
// internal/autostart's interface (kept Wails-free) doesn't need.
type menuCheckbox struct{ item *application.MenuItem }

func (c menuCheckbox) SetChecked(checked bool) { c.item.SetChecked(checked) }

// main is the application entry point. It creates the Wails app, a hidden
// frameless window, the ImproveService bound to the frontend, the global
// hotkey and a system tray. The window is never destroyed when
// closed/hidden: the app keeps running in the tray. The testable logic
// (reload/hotkey rollback, savers, second-instance queue, config fallback)
// lives in internal/app; this file is wiring only.
func main() {
	// A launch arriving before the handler is set is queued and replayed
	// on ApplicationStarted.
	var launches app.LaunchQueue

	wailsApp := application.New(application.Options{
		Name:        "kraa",
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
			UniqueID: "dev.matrixia.kraa",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				launches.OnSecondInstance(data.Args)
			},
		},
	})

	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:       "Kraa",
		Width:       560,
		Height:      580,
		Frameless:   true,
		AlwaysOnTop: true,
		Hidden:      true,
		// No HideOnEscape: Esc is bound below to svc.Close so the stream is
		// cancelled and focus is handed back to the source app.
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
		BackgroundColour: application.NewRGB(22, 23, 27), // --background (dark)
		URL:              "/",
	})
	// "Perfil do usuário": a regular (framed) window opened from the tray.
	// Same frontend bundle; main.tsx renders ProfileWindow for ?view=profile.
	profileWindow := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "profile",
		Title:            "Perfil do usuário",
		Width:            520,
		Height:           460,
		Hidden:           true,
		BackgroundColour: application.NewRGB(22, 23, 27), // --background (dark)
		URL:              "/?view=profile",
	})
	// macOS: ask once for the Accessibility permission (shows the system
	// prompt); without it canReplace stays false and a warning is shown.
	if runtime.GOOS == "darwin" {
		platform.AccessibilityTrusted(true)
	}

	cfg, cfgPath, cfgErrMsg := app.LoadStartupConfig(app.LoadConfig)

	svc, host := app.New(app.Options{
		Config:    cfg,
		Runner:    app.NewRunner(cfg),
		Emitter:   app.WailsEmitter{App: wailsApp},
		Clipboard: app.WailsClipboard{App: wailsApp},
		Keys:      platform.NewKeySender(),
		Window:    app.WailsWindow{App: wailsApp, Window: window},
		Session:   platform.DetectSession(),

		ProfileWindow: app.WailsWindow{App: wailsApp, Window: profileWindow},
	})
	wailsApp.RegisterService(application.NewService(svc))

	// Closing (e.g. Cmd+W / Alt+F4) and Esc go through Close: cancel the
	// stream, hide instead of destroying, and return focus (macOS).
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		svc.Close()
	})
	window.RegisterKeyBinding("escape", func(application.Window) {
		svc.Close()
	})

	// Closing the profile window only hides it (the app lives in the tray).
	profileWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		svc.CloseProfile()
	})
	profileWindow.RegisterKeyBinding("escape", func(application.Window) {
		svc.CloseProfile()
	})

	if cfgErrMsg != "" {
		host.SetError(cfgErrMsg)
	}

	onHotkey := func() {
		// Re-check each time so a permission granted after launch is
		// picked up without restarting.
		host.SetSession(platform.DetectSession())
		host.Trigger()
	}
	launches.SetHandler(func(capture bool) {
		if capture {
			onHotkey()
		} else {
			host.ShowWindow()
		}
	})

	reloader := app.NewReloader(app.ReloaderOptions{
		Host:          host,
		Shortcuts:     wailsApp.GlobalShortcut,
		Load:          app.LoadConfig,
		NewRunner:     app.NewRunner,
		DetectSession: platform.DetectSession,
		OnHotkey:      onHotkey,
		Hotkey:        cfg.Hotkey,
		ConfigPath:    cfgPath,
	})
	reloader.RegisterHotkey()
	// Model picker / profile window: persist in config.yaml, then reload.
	host.SetModelSaver(reloader.SaveModel)
	host.SetProfileSaver(reloader.SaveProfile)

	tray := wailsApp.SystemTray.New()
	tray.SetTooltip("Kraa")

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
	trayMenu.Add("Perfil do usuário…").OnClick(func(ctx *application.Context) {
		host.ShowProfile()
	})
	trayMenu.Add("Editar configuração").OnClick(func(ctx *application.Context) {
		path := reloader.ConfigPath()
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
		reloader.Reload()
	})

	// "Iniciar com o sistema": reuses internal/autostart, which produces the
	// exact same LaunchAgent/registry key/.desktop artifacts as the npm CLI
	// (`kraa autostart on|off`). If New fails (e.g. `wails3 dev`
	// running from a temp path outside a .app bundle on macOS), the item is
	// hidden since there's nothing autostart-able to toggle. Clicks go
	// through a Toggler, which serializes them: Wails runs every click's
	// OnClick in its own goroutine, so two quick clicks could otherwise run
	// Enable/Disable concurrently.
	autostartItem := trayMenu.AddCheckbox("Iniciar com o sistema", false)
	if autostartMgr, err := autostart.New(); err != nil {
		log.Printf("autostart: %v", err)
		autostartItem.SetHidden(true)
	} else {
		enabled, err := autostartMgr.Enabled()
		if err != nil {
			log.Printf("autostart: %v", err)
		}
		autostartItem.SetChecked(enabled)
		toggler := autostart.NewToggler(autostartMgr)
		autostartItem.OnClick(func(ctx *application.Context) {
			// want and gen are this click's own intent, captured before
			// Toggle blocks on the lock; see Toggler's doc comment for why
			// Toggle must not re-derive them from the checkbox itself.
			want := ctx.IsChecked()
			gen := toggler.NextGeneration()
			toggler.Toggle(want, gen, menuCheckbox{autostartItem}, func(msg string) {
				if msg != "" {
					log.Printf("autostart: %s", msg)
				}
				host.SetWarning(msg)
			})
		})
	}

	trayMenu.AddSeparator()

	trayMenu.Add("Sair").OnClick(func(ctx *application.Context) {
		wailsApp.Quit()
	})

	tray.SetMenu(trayMenu)

	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		hotkeyFailed := reloader.HotkeyFailed()
		// Without a working hotkey (or with a config error) the user would
		// never see the warning, so surface the window with it.
		switch launches.Drain(os.Args[1:], cfgErrMsg != "" || hotkeyFailed) {
		case app.StartupTrigger:
			// Launched (or re-launched early) via the --trigger shortcut.
			go onHotkey()
		case app.StartupShow:
			host.ShowWindow()
		}
	})

	// Run the application. This blocks until the application has been exited.
	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
