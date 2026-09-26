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
  # temperature: quanto menor, mais fiel ao texto original (menos
  # invenção). Remova a linha para usar o padrão do servidor; modelos de
  # raciocínio (ex.: o-series/gpt-5 da OpenAI) só aceitam o padrão.
  temperature: 0.2

# max_input_chars: tamanho máximo (em caracteres) do texto selecionado
# aceito para melhoria.
max_input_chars: 20000

# profile: descreve quem usa o app (cargo, stack, preferências). Com
# enabled: true, o texto é enviado ao LLM nas ações com use_profile: true
# e na instrução livre, para calibrar contexto e nível técnico. Também pode
# ser editado em "Perfil do usuário…" na bandeja.
profile:
  enabled: false
  text: >-
    Sou profissional de tecnologia e uso IA no dia a dia de trabalho.
    Prefiro textos objetivos, com termos técnicos quando fizerem sentido.

# actions: ações pré-configuradas exibidas no modal, agrupadas por
# categoria. Cada ação precisa de um id único. use_profile: true envia o
# perfil (se ativo) junto com a ação.
actions:
  - id: improve-prompt
    category: Prompt
    label: Melhorar prompt
    use_profile: true
    instruction: >-
      Reescreva o prompt em <texto> para que um LLM o execute bem,
      preservando a intenção e todos os requisitos do autor. Organize o
      que o autor escreveu deixando claros o objetivo, o contexto, as
      restrições e o formato de saída; quando o autor der o motivo de uma
      restrição, mantenha-o junto dela. Ajuste a estrutura à
      complexidade: um pedido simples continua curto e em prosa, e um
      pedido com várias partes ganha seções curtas (Objetivo, Contexto,
      Restrições, Formato de saída). Escreva instruções afirmativas e
      coerentes entre si. Use somente informações presentes no prompt
      original ou no perfil; quando faltar uma informação essencial,
      insira um placeholder entre colchetes, como [público-alvo], em vez
      de supor. Mantenha fora técnicas que o autor não pediu, como
      personas ou "pense passo a passo". Responda apenas com o prompt
      reescrito.
  - id: add-context
    category: Prompt
    label: Adicionar contexto
    use_profile: true
    instruction: >-
      Reescreva o prompt em <texto> explicitando o contexto que ajude um
      LLM a entender a tarefa: para que serve o resultado, quem vai usá-lo
      e quais informações de fundo importam. Tire esse contexto somente do
      próprio prompt e do perfil; para cada item que não estiver lá,
      insira um placeholder entre colchetes, como [público-alvo], em vez
      de supor. Preserve a intenção e todos os requisitos do autor.
      Responda apenas com o prompt reescrito.
  - id: more-specific
    category: Prompt
    label: Mais específico
    use_profile: true
    instruction: >-
      Reescreva o prompt em <texto> tornando-o mais específico: troque
      termos vagos por critérios concretos e explicite o escopo, o tamanho
      e o formato de saída esperados. Quando o próprio prompt ou o perfil
      não definirem um desses critérios, insira um placeholder entre
      colchetes, como [tamanho], em vez de supor um valor. Preserve a
      intenção e todos os requisitos do autor. Responda apenas com o
      prompt reescrito.
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
