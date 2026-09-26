//go:build !darwin

package platform

// AccessibilityTrusted exists on every OS; only macOS has an Accessibility
// permission gate, so elsewhere it always reports true (prompt is ignored).
func AccessibilityTrusted(prompt bool) bool { return true }
