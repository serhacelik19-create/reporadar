# RepoRadar

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=flat-square)](https://www.typescriptlang.org/)
[![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini-orange?style=flat-square)](https://aistudio.google.com/)

A CLI tool that audits the health, security posture, and dependency risks of any public GitHub repository. It shallow-clones the target repo, runs local static analysis, passes structured metadata to Google Gemini, and prints a terminal dashboard — typically in under 5 seconds.

Built with **TypeScript (ESM)**, **Commander.js**, and the **Google Gemini SDK**.

---

## Terminal Output

```bash
reporadar https://github.com/expressjs/express
```

```text
🔍 RepoRadar Analysis for expressjs/express

📊 Report
├── Code Quality:     85/100
├── Security:         ⚠️  2 issues found
├── Dependencies:     12 outdated, 0 deprecated
├── Test Coverage:    Detected (mocha)
├── Documentation:    README, LICENSE, API docs
└── Overall Grade:    A

⚠️  Security Issues:
  1. [MEDIUM] Outdated dependency 'qs' with known prototype pollution vulnerability
  2. [LOW] No formal security disclosure policy (SECURITY.md)

╭──────────────── AI Analysis ────────────────╮
│                                              │
│  Strengths:                                  │
│  • Modular routing with mature middleware     │
│  • Comprehensive test suite (Mocha)          │
│  • Multi-language docs & full API reference  │
│                                              │
│  Recommendations:                            │
│  • Run npm update for outdated devDeps       │
│  • Add ESLint security rules                 │
│  • Consider TypeScript migration for core    │
│                                              │
╰──────────────────────────────────────────────╯
```

---

## Features

- **Shallow Clone Analysis:** Clones with `--depth 1` into temp directories, analyzes, and cleans up via `finally` blocks. No leftover files.
- **Local Security Scanner:** Regex-based line-by-line scan for hardcoded secrets, API keys, and unsafe functions (`eval()`, `exec()`) across multiple languages.
- **Multi-Ecosystem Dependency Parsing:**
  - Node.js (`package.json`) — parallel npm registry checks with 2s `AbortController` timeout
  - Python (`requirements.txt`, `pyproject.toml`)
  - Rust (`Cargo.toml`)
  - Go (`go.mod`)
  - Docker (`Dockerfile`) — base image auditing, root user detection
- **Offline Mode:** Full local-only analysis without Gemini API. Useful for CI environments without API keys.
- **Repo Comparison:** Side-by-side comparison of two repositories with aligned terminal table output.
- **CI/CD Integration:** `--fail-on-score` and `--fail-on-security` flags return exit code 1 for pipeline quality gates.
- **Interactive Mode:** Menu-driven interface for single scans, comparisons, and settings configuration.

---

## Architecture

```
src/
├── index.ts       # CLI setup (Commander), interactive mode, orchestration
├── github.ts      # URL parsing, shallow clone, temp directory management
├── analyzer.ts    # Local static analysis, multi-language dependency parsing
├── gemini.ts      # Gemini API integration, structured JSON schema, offline fallback
└── reporter.ts    # Terminal table, JSON, and Markdown report formatters
```

**Key technical decisions:**
- **Structured Gemini output:** Uses `responseMimeType: 'application/json'` with a full `responseSchema` to guarantee parseable AI responses.
- **ANSI-aware padding:** Strips invisible escape codes before calculating column widths to keep comparison tables aligned.
- **Token efficiency:** Sends directory trees and dependency manifests rather than raw source code, keeping requests small and fast.

---

## Installation

### Prerequisites
A [Gemini API key](https://aistudio.google.com/) for AI-powered analysis (optional — offline mode works without it).

### Run with npx
```bash
export GEMINI_API_KEY="your_key"
npx reporadar https://github.com/owner/repo
```

### Install globally
```bash
npm install -g reporadar
reporadar https://github.com/owner/repo
```

### Local development
```bash
git clone https://github.com/serhacelik19-create/reporadar.git
cd reporadar
npm install
cp .env.example .env
# Add your GEMINI_API_KEY to .env
npm run dev -- https://github.com/owner/repo
```

---

## Usage

### Interactive Mode
```bash
reporadar
```
Opens a menu for scanning, comparing repos, and configuring settings.

### CLI Mode
```bash
reporadar [options] [repoUrl]

Options:
  -k, --key <apiKey>           Gemini API Key
  -f, --format <format>        Output: json, markdown, table (default: table)
  -o, --output <file>          Save report to file
  --offline                    Local analysis only, skip Gemini
  --fail-on-score <score>      Exit 1 if quality score below threshold
  --fail-on-security <level>   Exit 1 if issues at or above level (low/medium/high)
```

### CI/CD Example
```bash
reporadar https://github.com/owner/repo --fail-on-score 80 --fail-on-security high --format json -o report.json
```

---

## License

[MIT](LICENSE)
