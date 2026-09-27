package trayicon

import (
	"bytes"
	"image/color"
	"image/png"
	"testing"
)

type iconStats struct {
	width, height int
	opaque        int     // pixels com alfa > 0
	transparent   int     // pixels com alfa == 0
	maxRGB        uint8   // maior canal de cor entre os pixels visíveis
	meanLum       float64 // luminância média (0..1) dos pixels visíveis
}

func statsOf(t *testing.T, name string, data []byte) iconStats {
	t.Helper()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("%s: PNG inválido: %v", name, err)
	}
	b := img.Bounds()
	s := iconStats{width: b.Dx(), height: b.Dy()}
	var lumSum float64
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			if c.A == 0 {
				s.transparent++
				continue
			}
			s.opaque++
			s.maxRGB = max(s.maxRGB, c.R, c.G, c.B)
			lumSum += (0.2126*float64(c.R) + 0.7152*float64(c.G) + 0.0722*float64(c.B)) / 255
		}
	}
	if s.opaque > 0 {
		s.meanLum = lumSum / float64(s.opaque)
	}
	return s
}

var all = map[string][]byte{"mac-template": MacTemplate, "light": Light, "dark": Dark}

func TestIconsAre64Square(t *testing.T) {
	for name, data := range all {
		s := statsOf(t, name, data)
		if s.width != 64 || s.height != 64 {
			t.Errorf("%s: %dx%d, esperado 64x64", name, s.width, s.height)
		}
	}
}

func TestIconsHaveGlyphAndTransparency(t *testing.T) {
	for name, data := range all {
		s := statsOf(t, name, data)
		total := s.width * s.height
		if s.transparent == 0 {
			t.Errorf("%s: sem pixels transparentes (fundo não recortado)", name)
		}
		if s.opaque < total/10 {
			t.Errorf("%s: glifo pequeno demais (%d de %d pixels visíveis)", name, s.opaque, total)
		}
	}
}

func TestMacTemplateIsBlackWithAlpha(t *testing.T) {
	// No macOS o template usa só o alfa; cor diferente de preto indica arte errada.
	if s := statsOf(t, "mac-template", MacTemplate); s.maxRGB > 8 {
		t.Errorf("mac-template: canal de cor até %d, esperado preto (<= 8)", s.maxRGB)
	}
}

func TestLightIconIsDarkGlyph(t *testing.T) {
	if s := statsOf(t, "light", Light); s.meanLum > 0.35 {
		t.Errorf("light: luminância média %.2f, esperado glifo escuro (<= 0.35)", s.meanLum)
	}
}

func TestDarkIconIsLightGlyph(t *testing.T) {
	if s := statsOf(t, "dark", Dark); s.meanLum < 0.65 {
		t.Errorf("dark: luminância média %.2f, esperado glifo claro (>= 0.65)", s.meanLum)
	}
}
