//go:build !darwin

package app

// hideAppToReleaseFocus: on Windows/Linux hiding the window hands focus back
// to the previously active window, so nothing else is needed.
const hideAppToReleaseFocus = false
