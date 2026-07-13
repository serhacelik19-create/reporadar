# RepoRadar 🔍

[![NPM Version](https://img.shields.io/npm/v/reporadar?color=cyan&style=flat-square)](https://www.npmjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=flat-square)](https://www.typescriptlang.org/)
[![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini-orange?style=flat-square)](https://aistudio.google.com/)

**RepoRadar** is a production-ready, interactive command-line tool (CLI) designed to audit the health, security posture, dependency risks, and quality of any public GitHub repository in under 5 seconds. 

Built with **Node.js, TypeScript (ESM)**, and powered by a hybrid engine of **local regex static scans** and **Google Gemini AI**, RepoRadar clones repositories shallowly, runs local structural heuristics, passes structured metadata to Gemini, and prints a beautiful terminal dashboard.

---

## 📊 Live Terminal Preview

```bash
reporadar https://github.com/expressjs/express
```

```text
🔍 RepoRadar Analysis for expressjs/express

📊 RepoRadar Report
├── Code Quality:     85/100 (Clean architecture, modular layout, high reliability)
├── Security:         ⚠️  2 issues found
├── Dependencies:     12 outdated, 0 deprecated (checked 12 packages)
├── Test Coverage:    Detected (mocha)
├── Documentation:    README, LICENSE, API docs
└── Overall Grade:    A

⚠️  Detailed Security Issues:
  1. [MEDIUM] package.json: Outdated dependency 'qs' (v6.11.0) has known vulnerability CVE-2024-XXXX (Prototype Pollution).
  2. [LOW] SECURITY.md: Missing a formal security disclosure policy.

╭────────────────────────── 📋 Detailed AI Analysis ───────────────────────────╮
│                                                                              │
│   ⭐ Key Strengths:                                                          │
│   • Industrial-grade routing framework with robust middleware ecosystem      │
│   • Extensive test coverage using Mocha with high reliability                │
│   • Exemplary documentation including multi-language guides & full API reference│
│                                                                              │
│   ⚠️  Areas for Improvement:                                                 │
│   • Several outdated devDependencies that could pose minor security risks   │
│   • Legacy JS patterns in routing modules that could benefit from TS migration│
│                                                                              │
│   💡 Actionable Recommendations:                                             │
│   • Run `npm update` to resolve minor outdated devDependencies              │
│   • Adopt standard ESLint security rules for prototype pollution prevention   │
│   • Consider introducing type definitions or converting core to TypeScript   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## 🚀 Key Features

* **⚡ Zero-Waste Shallow Cloning:** Rather than downloading gigabytes of git histories, RepoRadar clones repositories with `--depth 1` into OS-managed temporary folders, runs the analysis, and cleans them up immediately (guaranteed via `finally` blocks).
* **🛡️ Local Multi-Language Scanner:** Evaluates files line-by-line using optimized regular expressions to spot hardcoded secrets, keys, credentials, and unsafe functions (like `eval()`), minimizing token usage before AI submission.
* **📦 Multi-Ecosystem Dependency Parser:** Supports checking dependencies and configurations for:
  - **Node.js** (`package.json`) - fetches live npm registry updates in parallel with timeout abort signals.
  - **Python** (`requirements.txt`, `pyproject.toml`).
  - **Rust** (`Cargo.toml`).
  - **Go** (`go.mod`).
  - **Docker** (`Dockerfile`) - audits base images and flags container runs as root.
* **🕹️ Master Control Panel (Interactive Loop):** Running `reporadar` with no arguments opens a rich select menu utilizing `prompts` to let users run single scans, repository comparisons, and save configurations back to `.env` without leaving the process.
* **🎯 CI/CD Quality Gates:** Exits with `status 1` when flags like `--fail-on-score 80` or `--fail-on-security medium` are violated, allowing seamless integration in GitHub Actions or GitLab pipelines.
* **🆚 Repo Comparison Mode:** Run `reporadar compare <url1> <url2>` to render a side-by-side comparison table evaluating overall grade, file density, dependencies, testing, and docs.

---

## 🛠️ Engineering Highlights & Architecture

RepoRadar was engineered from day one to exhibit production-grade software patterns. Key architectural decisions include:

### 1. Robust Token Management (Hybrid Mode)
Instead of feeding full source codes to the Gemini model (which is slow, expensive, and subject to token limits), RepoRadar maps directory trees, dependency manifests, documentation, and the results of a local regex parser to construct a structured prompt. This keeps latency under 4 seconds while providing expert architectural advice.

### 2. API Key Security & Dynamic Model Selection
API keys are never hardcoded. They are loaded dynamically from environment variables, CLI flags, or a local gitignored `.env` file. The Gemini model  is fully configurable via the environment.

### 3. Asynchronous Resilience & Abort Controllers
Registry API calls are executed concurrently with a strict 2-second timeout using native `AbortController` signals to prevent network hang-ups from freezing the CLI.

### 4. ANSI-Aware Layout Padding
Colorized terminal strings contain invisible escape codes (like `\u001b[32m`) which throw off standard string padding calculations. RepoRadar strips ANSI sequences dynamically when calculating layouts to ensure columns remain perfectly aligned.

### 5. Signal Isolation & Clean Exits
Interactive loops handle `Ctrl+C` cleanly at any stage of the prompts via customized cancellation handlers, ensuring no orphaned temporary directories are left behind on sudden terminates.

---

## 📦 Installation & Setup

### Prerequisites
You need a Gemini API Key to run AI audits. Get a free key from [Google AI Studio](https://aistudio.google.com/).

### Option 1: Run instantly with npx (Recommended for Users)
```bash
export GEMINI_API_KEY="your_api_key_here"
npx reporadar https://github.com/owner/repo
```

### Option 2: Install globally
```bash
npm install -g reporadar
```
Once installed, run it anywhere:
```bash
reporadar https://github.com/owner/repo
```

### Option 3: Local Development (For Recruiters & Developers)
If you want to clone this repository and run it locally from the source code:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/reporadar.git
   cd reporadar
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure local environment variables:**
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```
4. **Run in development mode:**
   ```bash
   npm run dev -- https://github.com/owner/repo
   ```
5. **Build and link globally (optional):**
   Compile TypeScript and link the binary to test it globally:
   ```bash
   npm run build
   npm link
   ```

---

## 📖 How to Use

RepoRadar operates in two modes: a **human-friendly Interactive Control Panel** and an **automation-friendly Command Line Interface**.

### 🎮 Mode 1: Interactive Control Panel (Recommended for Humans)

Simply run the tool with no arguments to launch the interactive terminal menu:

```bash
reporadar
```

This starts a master control panel loop where you can:
1. **Analyze a Single Repository (AI-Powered):** Prompts for URL, output format, output file path, and optional quality gate score/security thresholds.
2. **Analyze a Single Repository (Offline Mode):** Runs local static checks without hitting Gemini.
3. **Compare Repositories (AI-Powered / Offline):** Asks for two repository URLs and renders a side-by-side comparison table.
4. **Configure Settings:** Update and persist your Gemini API Key and Model choice to a local `.env` file without leaving the CLI loop.
5. **Exit:** Cleanly terminates the process.

---

### ⚙️ Mode 2: Advanced CLI & CI/CD Mode (Recommended for Scripts & Automation)

For automated runs, cron jobs, and CI/CD pipelines, pass arguments and option flags directly to bypass the menu:

```bash
Usage: reporadar [options] [repoUrl]

Options:
  -v, --version                output the version number
  -k, --key <apiKey>           Gemini API Key
  -f, --format <format>        Output format: json, markdown, table (default: "table")
  -o, --output <file>          Save report output to a file path
  --offline                    Perform local static analysis only, skipping Gemini AI
  --fail-on-score <score>      Exit with code 1 if quality score falls below value
  --fail-on-security <level>   Exit with code 1 if security issues found at or above level (low, medium, high)
  -h, --help                   display help for command

Commands:
  compare <repoUrl1> <repoUrl2>  Compares two GitHub repositories side-by-side
```

#### Automation Examples:

* **CI/CD Quality Gate (Fails pipeline on low score or high vulnerability):**
  ```bash
  reporadar https://github.com/owner/repo --fail-on-score 85 --fail-on-security high
  ```
* **Generate a Markdown Audit Report for Pull Request Comments:**
  ```bash
  reporadar https://github.com/owner/repo --format markdown -o audit-report.md
  ```
* **Offline Repository Comparison:**
  ```bash
  reporadar compare https://github.com/owner/repo1 https://github.com/owner/repo2 --offline
  ```

---

## 🤝 Contributing

Contributions are welcome! If you'd like to support additional language dependency parsers or suggest improvements:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/cool-new-scanner`.
3. Commit your changes and push them.
4. Open a Pull Request.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
