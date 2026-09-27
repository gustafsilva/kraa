//go:build darwin

package platform

const reasonAccessibility = "Permita o Kraa em Ajustes do Sistema › Privacidade e Segurança › Acessibilidade para colar automaticamente."

// DetectSession checks the Accessibility permission without prompting.
func DetectSession() Session {
	if AccessibilityTrusted(false) {
		return Session{CanSimulateKeys: true}
	}
	return Session{CanSimulateKeys: false, Reason: reasonAccessibility}
}
