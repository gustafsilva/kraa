# Instalador do Prompt Improve para Windows (sem Node).
#
#   irm https://raw.githubusercontent.com/gustavofreitas/prompt-improve/main/scripts/install.ps1 | iex
#
# Variáveis de ambiente:
#   PROMPT_IMPROVE_VERSION  versão a instalar (ex.: 0.1.0); padrão: o último release
#   PROMPT_IMPROVE_REPO     repositório "dono/repo" no GitHub; padrão: gustavofreitas/prompt-improve
#
# Mesmas regras do instalador npm (npm/src/install.ts): nome do asset,
# conferência do SHA-256 contra o checksums.txt e diretório de instalação.
# Compatível com Windows PowerShell 5.1 e PowerShell 7+. As mensagens ficam
# sem acento de propósito: o 5.1 lê .ps1 sem BOM como ANSI. Usa `throw` em vez
# de `exit` para não fechar a janela de quem roda via `irm | iex`.

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue' # o progresso deixa o Invoke-WebRequest muito lento no 5.1
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = if ($env:PROMPT_IMPROVE_REPO) { $env:PROMPT_IMPROVE_REPO } else { 'gustavofreitas/prompt-improve' }
    $version = if ($env:PROMPT_IMPROVE_VERSION) { $env:PROMPT_IMPROVE_VERSION.TrimStart('v') } else { '' }

    # PROCESSOR_ARCHITEW6432 aparece quando o PowerShell é 32 bits num Windows 64 bits.
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($arch -ne 'AMD64') {
        throw "A arquitetura $arch nao e suportada pelo Prompt Improve no Windows (suportada: x64)."
    }
    $asset = 'prompt-improve-windows-amd64.exe'

    if ($version) {
        $base = "https://github.com/$repo/releases/download/v$version"
        $label = "v$version"
    } else {
        $base = "https://github.com/$repo/releases/latest/download"
        $label = 'ultimo release'
    }

    $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }
    $dir = Join-Path $localAppData 'prompt-improve'
    $target = Join-Path $dir 'prompt-improve.exe'

    if (Get-Process -Name 'prompt-improve' -ErrorAction SilentlyContinue) {
        throw 'O Prompt Improve esta em execucao. Feche-o pela bandeja (ou rode: taskkill /IM prompt-improve.exe /F) e tente de novo.'
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("prompt-improve-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        Write-Host "Baixando Prompt Improve ($label, $asset)..."
        $sumsFile = Join-Path $tmp 'checksums.txt'
        $file = Join-Path $tmp $asset
        Invoke-WebRequest -UseBasicParsing -Uri "$base/checksums.txt" -OutFile $sumsFile
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $file

        $expected = $null
        foreach ($line in Get-Content -LiteralPath $sumsFile) {
            if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$' -and $Matches[2] -eq $asset) {
                $expected = $Matches[1].ToLower()
                break
            }
        }
        if (-not $expected) { throw "$asset nao aparece no checksums.txt." }

        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
        if ($actual -ne $expected) {
            Remove-Item -LiteralPath $file -Force
            throw "SHA-256 nao confere para $asset (esperado $expected, obtido $actual); instalacao abortada."
        }

        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Move-Item -LiteralPath $file -Destination $target -Force
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Prompt Improve instalado em $target"
    Write-Host ''
    Write-Host "Para iniciar:  Start-Process '$target'"
}
