//go:build windows

package platform

import (
	"fmt"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procSendInput        = user32.NewProc("SendInput")
	procGetAsyncKeyState = user32.NewProc("GetAsyncKeyState")
)

const (
	inputKeyboard  = 1      // INPUT_KEYBOARD
	keyeventfKeyUp = 0x0002 // KEYEVENTF_KEYUP

	vkShift   = 0x10
	vkControl = 0x11
	vkMenu    = 0x12 // Alt
	vkLWin    = 0x5B
	vkRWin    = 0x5C
	vkC       = 0x43 // 'C'
	vkV       = 0x56 // 'V'

	modifierReleaseTimeout = 500 * time.Millisecond
	modifierReleaseStep    = 10 * time.Millisecond
)

// keybdInput mirrors KEYBDINPUT. Go inserts the same padding as MSVC before
// dwExtraInfo (4 bytes on 64-bit), giving 24 bytes on 64-bit / 16 on 32-bit.
type keybdInput struct {
	wVk         uint16
	wScan       uint16
	dwFlags     uint32
	time        uint32
	dwExtraInfo uintptr
}

// input mirrors INPUT { DWORD type; union { MOUSEINPUT; KEYBDINPUT; HARDWAREINPUT } }.
// The union is sized by MOUSEINPUT (32 bytes on 64-bit, 24 on 32-bit), which
// is 8 bytes larger than KEYBDINPUT on both, hence the trailing padding.
// Result: 40 bytes on amd64/arm64, 28 on 386 (asserted in keys_windows_test.go).
type input struct {
	typ     uint32
	ki      keybdInput
	padding [8]byte
}

type windowsKeySender struct{}

// NewKeySender returns a KeySender that sends Ctrl+C / Ctrl+V via SendInput.
func NewKeySender() KeySender { return windowsKeySender{} }

func (windowsKeySender) Copy() error  { return sendCtrlKey(vkC) }
func (windowsKeySender) Paste() error { return sendCtrlKey(vkV) }

func keyEvent(vk uint16, flags uint32) input {
	return input{typ: inputKeyboard, ki: keybdInput{wVk: vk, dwFlags: flags}}
}

func sendCtrlKey(vk uint16) error {
	// The user may still be holding the hotkey modifiers (e.g. Ctrl+Shift);
	// a physical Shift/Alt/Win would turn Ctrl+C into another shortcut.
	waitModifiersReleased()

	inputs := []input{
		keyEvent(vkControl, 0),
		keyEvent(vk, 0),
		keyEvent(vk, keyeventfKeyUp),
		keyEvent(vkControl, keyeventfKeyUp),
	}
	n, _, lastErr := procSendInput.Call(
		uintptr(len(inputs)),
		uintptr(unsafe.Pointer(&inputs[0])),
		unsafe.Sizeof(inputs[0]),
	)
	if int(n) != len(inputs) {
		return fmt.Errorf("SendInput enviou %d de %d eventos: %v", n, len(inputs), lastErr)
	}
	return nil
}

// waitModifiersReleased polls until Shift, Alt and Win are released, up to
// modifierReleaseTimeout; after that it proceeds anyway (best effort).
func waitModifiersReleased() {
	deadline := time.Now().Add(modifierReleaseTimeout)
	for anyModifierDown() && time.Now().Before(deadline) {
		time.Sleep(modifierReleaseStep)
	}
}

func anyModifierDown() bool {
	for _, vk := range []uintptr{vkShift, vkMenu, vkLWin, vkRWin} {
		state, _, _ := procGetAsyncKeyState.Call(vk)
		if uint16(state)&0x8000 != 0 {
			return true
		}
	}
	return false
}
