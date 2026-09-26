package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// SaveModel grava model em provider.model no arquivo em path, alterando só
// essa linha: comentários, ordem, linhas em branco e finais de linha (LF ou
// CRLF) do restante do arquivo ficam intactos. Se provider.model (ou o
// próprio provider) não existir, a chave é criada. A escrita é atômica e
// mantém as permissões do arquivo.
func SaveModel(path, model string) error {
	model = strings.TrimSpace(model)
	if model == "" {
		return fmt.Errorf("config: model não pode ser vazio")
	}

	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}

	updated, err := setProviderModel(string(data), model)
	if err != nil {
		return fmt.Errorf("config: %s: %w", path, err)
	}
	return writeFileAtomic(path, []byte(updated), info.Mode().Perm())
}

// setProviderModel devolve content com provider.model = model. O yaml.Node
// só localiza as linhas; a edição é feita no texto original, porque
// re-serializar com yaml.v3 perderia linhas em branco e a formatação.
func setProviderModel(content, model string) (string, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return "", fmt.Errorf("YAML inválido: %w", err)
	}

	quoted, _ := json.Marshal(model) // string JSON = escalar YAML entre aspas duplas
	value := string(quoted)

	nl := "\n"
	if strings.Contains(content, "\r\n") {
		nl = "\r\n"
	}
	lines := strings.Split(content, "\n")

	var root *yaml.Node
	if doc.Kind == yaml.DocumentNode && len(doc.Content) > 0 {
		root = doc.Content[0]
	}
	if root != nil && root.Kind != yaml.MappingNode {
		return "", fmt.Errorf("o arquivo precisa ser um mapa YAML")
	}

	providerKey, provider := mappingEntry(root, "provider")
	if providerKey == nil {
		out := content
		if out != "" && !strings.HasSuffix(out, "\n") {
			out += nl
		}
		return out + "provider:" + nl + "  model: " + value + nl, nil
	}
	if provider.Kind != yaml.MappingNode || provider.Style&yaml.FlowStyle != 0 {
		return "", fmt.Errorf("provider precisa ser um mapa em blocos para trocar o model")
	}

	modelKey, modelVal := mappingEntry(provider, "model")
	if modelKey == nil {
		indent := "  "
		if len(provider.Content) > 0 {
			indent = strings.Repeat(" ", provider.Content[0].Column-1)
		}
		i := providerKey.Line // índice 0-based da linha seguinte a "provider:"
		newLine := indent + "model: " + value + carriageReturn(lines[providerKey.Line-1])
		lines = append(lines[:i], append([]string{newLine}, lines[i:]...)...)
		return strings.Join(lines, "\n"), nil
	}
	if modelVal.Line != modelKey.Line {
		return "", fmt.Errorf("provider.model em várias linhas não é suportado")
	}

	i := modelKey.Line - 1
	old := lines[i]
	newLine := old[:modelKey.Column-1] + "model: " + value
	comment := modelVal.LineComment
	if comment == "" {
		comment = modelKey.LineComment
	}
	if comment != "" {
		newLine += " " + comment
	}
	lines[i] = newLine + carriageReturn(old)
	return strings.Join(lines, "\n"), nil
}

// carriageReturn devolve "\r" quando line veio de um arquivo CRLF.
func carriageReturn(line string) string {
	if strings.HasSuffix(line, "\r") {
		return "\r"
	}
	return ""
}

// mappingEntry devolve o nó da chave e do valor de key em m (nil se ausente).
func mappingEntry(m *yaml.Node, key string) (*yaml.Node, *yaml.Node) {
	if m == nil {
		return nil, nil
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i], m.Content[i+1]
		}
	}
	return nil, nil
}

// writeFileAtomic grava data num temporário no mesmo diretório e o renomeia
// sobre path, para que uma falha no meio nunca deixe o config truncado.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".config-*.yaml")
	if err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op após o Rename

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	return nil
}
