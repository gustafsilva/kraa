//go:build darwin

package platform

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreFoundation
#include <stdbool.h>
#include <ApplicationServices/ApplicationServices.h>

static bool pi_ax_trusted(bool prompt) {
	const void *keys[] = { kAXTrustedCheckOptionPrompt };
	const void *values[] = { prompt ? kCFBooleanTrue : kCFBooleanFalse };
	CFDictionaryRef opts = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	if (opts == NULL) {
		return AXIsProcessTrusted();
	}
	bool trusted = AXIsProcessTrustedWithOptions(opts);
	CFRelease(opts);
	return trusted;
}

// pi_post_cmd_key posts key down + key up with ONLY the Command flag set, so
// modifiers the user is still physically holding (e.g. Shift from the global
// hotkey) do not leak into the synthetic event. Returns 0 on success.
static int pi_post_cmd_key(CGKeyCode key) {
	CGEventRef down = CGEventCreateKeyboardEvent(NULL, key, true);
	if (down == NULL) {
		return 1;
	}
	CGEventRef up = CGEventCreateKeyboardEvent(NULL, key, false);
	if (up == NULL) {
		CFRelease(down);
		return 1;
	}
	CGEventSetFlags(down, kCGEventFlagMaskCommand);
	CGEventSetFlags(up, kCGEventFlagMaskCommand);
	CGEventPost(kCGHIDEventTap, down);
	CGEventPost(kCGHIDEventTap, up);
	CFRelease(down);
	CFRelease(up);
	return 0;
}
*/
import "C"

import "errors"

// Virtual keycodes on the ANSI layout (kVK_ANSI_C / kVK_ANSI_V).
const (
	keycodeC = 8
	keycodeV = 9
)

// AccessibilityTrusted reports whether the app has the macOS Accessibility
// permission (required for CGEventPost to reach other apps). With prompt=true
// macOS shows its "grant access" dialog if the app is not yet trusted; pass
// false when only checking state.
func AccessibilityTrusted(prompt bool) bool {
	return bool(C.pi_ax_trusted(C.bool(prompt)))
}

type darwinKeySender struct{}

// NewKeySender returns a KeySender that posts Cmd+C / Cmd+V via CoreGraphics.
func NewKeySender() KeySender { return darwinKeySender{} }

func (darwinKeySender) Copy() error  { return postCmdKey(keycodeC) }
func (darwinKeySender) Paste() error { return postCmdKey(keycodeV) }

func postCmdKey(key C.CGKeyCode) error {
	// Without the permission CGEventPost fails silently; report it instead.
	if !AccessibilityTrusted(false) {
		return errors.New("permissão de Acessibilidade não concedida")
	}
	if C.pi_post_cmd_key(key) != 0 {
		return errors.New("falha ao criar o evento de teclado")
	}
	return nil
}
