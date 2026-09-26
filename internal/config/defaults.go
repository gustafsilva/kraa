package config

// defaultConfigYAML is the human-friendly, commented template written to
// disk the first time Load runs and no config file exists yet. Default()
// parses this same template, so the two are always in sync (see
// TestDefault_MatchesTemplateYAML).
const defaultConfigYAML = `# Configuração do Prompt Improve.
#
# hotkey: atalho global que abre o modal (sintaxe "CmdOrCtrl+Shift+Y":
# CmdOrCtrl vira Cmd no macOS e Ctrl no Windows/Linux).
hotkey: "CmdOrCtrl+Shift+Y"

# provider: endpoint compatível com a API OpenAI (Chat Completions).
# Padrão: Ollama local, sem necessidade de api_key.
provider:
  base_url: "http://localhost:11434/v1"
  api_key: "" # a env PROMPT_IMPROVE_API_KEY tem precedência se definida
  model: "llama3.2" # também pode ser trocado pelo seletor no topo do modal
  timeout_seconds: 60

# max_input_chars: tamanho máximo (em caracteres) do texto selecionado
# aceito para melhoria.
max_input_chars: 20000

# actions: ações pré-configuradas exibidas no modal, agrupadas por
# categoria. Cada ação precisa de um id único.
actions:
  - id: improve-prompt
    category: Prompt
    label: Melhorar prompt
    instruction: >-
      Reescreva o prompt a seguir para um LLM: deixe claro objetivo,
      contexto, restrições e formato de saída. Responda apenas com o
      prompt reescrito.
  - id: add-context
    category: Prompt
    label: Adicionar contexto
    instruction: >-
      Reescreva o prompt a seguir adicionando contexto relevante que
      ajude o LLM a entender melhor a tarefa, mantendo a intenção
      original. Responda apenas com o prompt reescrito.
  - id: more-specific
    category: Prompt
    label: Mais específico
    instruction: >-
      Reescreva o prompt a seguir tornando-o mais específico e
      detalhado, removendo ambiguidades e explicitando expectativas de
      formato e escopo de saída. Responda apenas com o prompt
      reescrito.
  - id: formal
    category: Mensagem
    label: Mais formal
    instruction: >-
      Reescreva o texto a seguir em um tom mais formal e profissional,
      mantendo o significado original. Responda apenas com o texto
      reescrito.
  - id: casual
    category: Mensagem
    label: Mais casual
    instruction: >-
      Reescreva o texto a seguir em um tom mais casual e descontraído,
      mantendo o significado original. Responda apenas com o texto
      reescrito.
  - id: shorter
    category: Mensagem
    label: Mais curto
    instruction: >-
      Reescreva o texto a seguir de forma mais curta e direta,
      preservando as informações essenciais. Responda apenas com o
      texto reescrito.
  - id: fix-grammar
    category: Mensagem
    label: Corrigir gramática
    instruction: >-
      Corrija a gramática, a ortografia e a pontuação do texto a
      seguir, sem alterar o significado ou o tom original. Responda
      apenas com o texto reescrito.
  - id: to-english
    category: Mensagem
    label: Traduzir para inglês
    instruction: >-
      Traduza o texto a seguir para o inglês, mantendo o tom e a
      intenção originais. Responda apenas com o texto reescrito.
`
