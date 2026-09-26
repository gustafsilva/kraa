//go:build darwin

package app

// hideAppToReleaseFocus: on macOS hiding only the window does not reactivate
// the previous app, so the whole (accessory) app is hidden before pasting.
const hideAppToReleaseFocus = true
