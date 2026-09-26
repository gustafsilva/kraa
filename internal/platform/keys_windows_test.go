//go:build windows

package platform

import (
	"testing"
	"unsafe"
)

func TestInputStructSizeMatchesWin32(t *testing.T) {
	want := uintptr(28) // 386
	if unsafe.Sizeof(uintptr(0)) == 8 {
		want = 40 // amd64, arm64
	}
	if got := unsafe.Sizeof(input{}); got != want {
		t.Fatalf("sizeof(INPUT) = %d, want %d", got, want)
	}
	if got := unsafe.Offsetof(input{}.ki); got != unsafe.Sizeof(uintptr(0)) {
		t.Fatalf("offsetof(INPUT.ki) = %d, want %d", got, unsafe.Sizeof(uintptr(0)))
	}
}
