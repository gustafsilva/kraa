package config

import (
	"bytes"
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// SaveProfile grava p no bloco profile do arquivo em path, reescrevendo só
// as linhas desse bloco: comentários, ordem, linhas em branco e finais de
// linha (LF ou CRLF) do restante do arquivo ficam intactos (um comentário
// na mesma linha de "profile:" é descartado). Se profile não existir, o
// bloco é acrescentado ao fim. CRLF dentro de p.Text vira LF. A escrita é
// atômica e mantém as permissões do arquivo.
func SaveProfile(path string, p Profile) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}

	updated, err := setProfile(string(data), p)
	if err != nil {
		return fmt.Errorf("config: %s: %w", path, err)
	}
	return writeFileAtomic(path, []byte(updated), info.Mode().Perm())
}

// setProfile devolve content com o bloco profile trocado por p. O yaml.Node
// só localiza as linhas; o bloco novo é gerado pelo encoder do yaml.v3, que
// escolhe o estilo de escalar capaz de representar qualquer texto.
func setProfile(content string, p Profile) (string, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return "", fmt.Errorf("YAML inválido: %w", err)
	}
	var root *yaml.Node
	if doc.Kind == yaml.DocumentNode && len(doc.Content) > 0 {
		root = doc.Content[0]
	}
	if root != nil && root.Kind != yaml.MappingNode {
		return "", fmt.Errorf("o arquivo precisa ser um mapa YAML")
	}
	if root != nil && root.Style&yaml.FlowStyle != 0 {
		// Num mapa {…} as chaves dividem linhas e não dá para trocar ou
		// acrescentar um bloco sem quebrar o arquivo.
		return "", fmt.Errorf("o arquivo precisa ser um mapa YAML em blocos para gravar o perfil")
	}

	p.Text = strings.ReplaceAll(p.Text, "\r\n", "\n")
	block, err := profileBlock(p)
	if err != nil {
		return "", err
	}
	nl := "\n"
	if strings.Contains(content, "\r\n") {
		nl = "\r\n"
		block = strings.ReplaceAll(block, "\n", nl)
	}

	var out string
	lines := strings.Split(content, "\n")
	start, end, found := profileRange(root, lines)
	if !found {
		out = content
		if out != "" && !strings.HasSuffix(out, "\n") {
			out += nl
		}
		if out != "" {
			out += nl
		}
		out += block
	} else {
		var b strings.Builder
		if start > 0 {
			b.WriteString(strings.Join(lines[:start], "\n"))
			b.WriteString("\n")
		}
		b.WriteString(block)
		b.WriteString(strings.Join(lines[end:], "\n"))
		out = b.String()
	}

	// Garantia final: o arquivo gerado precisa ler de volta exatamente o
	// perfil gravado; se não ler, nada é escrito.
	var check struct {
		Profile Profile `yaml:"profile"`
	}
	if err := yaml.Unmarshal([]byte(out), &check); err != nil || check.Profile != p {
		return "", fmt.Errorf("não foi possível gravar o perfil sem alterar o restante do arquivo")
	}
	return out, nil
}

// profileRange devolve o intervalo [start, end) de linhas (0-based) ocupado
// pelo bloco profile. Linhas em branco e comentários na coluna 0 logo antes
// da próxima chave pertencem a ela e ficam fora do intervalo.
func profileRange(root *yaml.Node, lines []string) (start, end int, found bool) {
	if root == nil {
		return 0, 0, false
	}
	for i := 0; i+1 < len(root.Content); i += 2 {
		if root.Content[i].Value != "profile" {
			continue
		}
		start = root.Content[i].Line - 1
		end = len(lines)
		if i+2 < len(root.Content) {
			end = root.Content[i+2].Line - 1
		}
		for end > start+1 && isBlankOrTopLevelComment(lines[end-1]) {
			end--
		}
		return start, end, true
	}
	return 0, 0, false
}

func isBlankOrTopLevelComment(line string) bool {
	line = strings.TrimSuffix(line, "\r")
	return strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#")
}

// profileBlock gera "profile:\n  enabled: ...\n  text: ...\n". Texto com
// várias linhas pede o estilo literal (|); quando ele não consegue
// representar o texto (espaço no fim de linha, tabs etc.), o próprio
// encoder cai para aspas duplas.
func profileBlock(p Profile) (string, error) {
	textNode := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: p.Text}
	if strings.Contains(p.Text, "\n") {
		textNode.Style = yaml.LiteralStyle
	}
	node := &yaml.Node{Kind: yaml.MappingNode, Content: []*yaml.Node{
		{Kind: yaml.ScalarNode, Value: "profile"},
		{Kind: yaml.MappingNode, Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "enabled"},
			{Kind: yaml.ScalarNode, Tag: "!!bool", Value: strconv.FormatBool(p.Enabled)},
			{Kind: yaml.ScalarNode, Value: "text"},
			textNode,
		}},
	}}

	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(node); err != nil {
		return "", fmt.Errorf("não foi possível gerar o bloco profile: %w", err)
	}
	if err := enc.Close(); err != nil {
		return "", fmt.Errorf("não foi possível gerar o bloco profile: %w", err)
	}
	return buf.String(), nil
}
