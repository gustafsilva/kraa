package main

import (
	"embed"
	"log"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

// main is the application entry point. It creates the Wails app, a hidden
// frameless window and a system tray with "Abrir"/"Sair", then runs the
// application. The window is never destroyed when closed/hidden: the app
// keeps running in the tray.
func main() {
	// Declared before the window is created so the SingleInstance callback
	// below can close over it: the callback only runs after main() has
	// assigned the real window value.
	var window *application.WebviewWindow

	app := application.New(application.Options{
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
				if window != nil {
					window.Show()
					window.Center()
					window.Focus()
				}
			},
		},
	})

	window = app.Window.NewWithOptions(application.WebviewWindowOptions{
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

	tray := app.SystemTray.New()
	tray.SetTooltip("Prompt Improve")

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	} else {
		tray.SetDarkModeIcon(icons.SystrayDark)
		tray.SetIcon(icons.SystrayLight)
	}

	trayMenu := app.Menu.New()

	trayMenu.Add("Abrir").OnClick(func(ctx *application.Context) {
		window.Show()
		window.Center()
		window.Focus()
	})

	trayMenu.AddSeparator()

	trayMenu.Add("Sair").OnClick(func(ctx *application.Context) {
		app.Quit()
	})

	tray.SetMenu(trayMenu)

	// Run the application. This blocks until the application has been exited.
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
