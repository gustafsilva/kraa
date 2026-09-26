//go:build windows

package platform

// DetectSession: SendInput needs no permission on Windows. (It cannot reach
// elevated windows from a non-elevated process — UIPI — which surfaces as a
// SendInput error at paste time.)
func DetectSession() Session { return Session{CanSimulateKeys: true} }
