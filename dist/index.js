#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import dotenv from 'dotenv';
import prompts from 'prompts';
import fs from 'fs';
import { parseGitHubUrl, cloneRepository, cleanupTempDir } from './github.js';
import { analyzeDirectory } from './analyzer.js';
import { analyzeWithGemini } from './gemini.js';
import { outputReport, printCompareReport } from './reporter.js';
// Load .env variables (useful for local development)
dotenv.config();
const program = new Command();
// Orchestrator flow for a single repository analysis
async function runAnalysis(repoUrl, options, isInteractiveLoop = false) {
    // Check API key unless running offline
    const apiKey = options.key || process.env.GEMINI_API_KEY;
    const isOffline = !!options.offline;
    if (!isOffline && !apiKey) {
        console.error(chalk.red.bold('\nError: Gemini API Key is missing!') + '\n' +
            chalk.yellow('To use RepoRadar with AI, you must set the ') + chalk.bold.green('GEMINI_API_KEY') + chalk.yellow(' environment variable, or pass it via ') + chalk.bold.cyan('--key') + '.\n' +
            chalk.yellow('Alternatively, run in ') + chalk.bold.magenta('--offline') + chalk.yellow(' mode to perform a local-only static analysis.\n\n') +
            'How to resolve:\n' +
            `  1. Get an API key from Google AI Studio: ${chalk.underline.blue('https://aistudio.google.com/')}\n` +
            `  2. Set the env variable: ${chalk.dim('export GEMINI_API_KEY="your_api_key_here"')}\n` +
            `  3. Or run with option:  ${chalk.dim('npx reporadar <url> --key "your_api_key_here"')}\n` +
            `  4. Or run offline:      ${chalk.dim('npx reporadar <url> --offline')}\n`);
        if (!isInteractiveLoop) {
            process.exit(1);
        }
        return;
    }
    let tempDir = '';
    const spinner = ora();
    try {
        // Step 1: Parse URL
        spinner.start('Parsing GitHub repository URL');
        const gitInfo = parseGitHubUrl(repoUrl);
        spinner.succeed(`GitHub repository detected: ${chalk.cyan(gitInfo.owner + '/' + gitInfo.repo)}`);
        // Step 2: Clone
        spinner.start('Cloning repository (shallow clone)');
        tempDir = await cloneRepository(gitInfo.cloneUrl);
        spinner.succeed('Repository successfully cloned to temporary directory');
        // Step 3: Local Scan
        spinner.start('Analyzing code locally (files, tests, documentation, dependencies)');
        const localData = await analyzeDirectory(tempDir);
        spinner.succeed(`Local scanning completed (${localData.fileCount} files scanned)`);
        // Step 4: AI Scan (or offline analysis)
        const scanMsg = isOffline
            ? 'Performing static local quality & security audit (offline mode)'
            : 'Querying Gemini AI for security and code quality review';
        spinner.start(scanMsg);
        const aiData = await analyzeWithGemini(gitInfo.owner, gitInfo.repo, localData, apiKey, isOffline);
        spinner.succeed(isOffline ? 'Offline analysis completed' : 'Gemini AI audit completed');
        // Step 5: Report Output
        outputReport(gitInfo.owner, gitInfo.repo, localData, aiData, options.format, options.output);
        // Step 6: CI/CD Quality Gates evaluation
        evaluateQualityGates(aiData, options, isInteractiveLoop);
    }
    catch (error) {
        spinner.fail('Analysis failed');
        console.error(chalk.red.bold('\nError during execution:'));
        console.error(chalk.red(error.message));
        if (!isInteractiveLoop) {
            process.exit(1);
        }
    }
    finally {
        // Ensure temp directory is always cleaned up
        if (tempDir) {
            spinner.start('Cleaning up temporary files');
            cleanupTempDir(tempDir);
            spinner.succeed('Temporary files cleaned up');
        }
    }
}
/**
 * Checks score and security thresholds and fails (exit code 1) if violated.
 */
function evaluateQualityGates(aiData, options, isInteractiveLoop = false) {
    // Fail on Score gate
    if (options.failOnScore) {
        const minScore = parseInt(options.failOnScore, 10);
        if (!isNaN(minScore) && aiData.codeQualityScore < minScore) {
            console.error(chalk.red.bold(`\n❌ Quality Gate Failed: Code quality score is ${aiData.codeQualityScore}/100, which is below the threshold of ${minScore}/100.`));
            if (!isInteractiveLoop) {
                process.exit(1);
            }
        }
    }
    // Fail on Security severity gate
    if (options.failOnSecurity) {
        const minSeverity = options.failOnSecurity.toLowerCase();
        // Severity levels mapping
        const severityLevels = ['low', 'medium', 'high'];
        const targetIdx = severityLevels.indexOf(minSeverity);
        if (targetIdx !== -1) {
            const offendingIssues = aiData.securityIssues.filter(issue => {
                const issueIdx = severityLevels.indexOf(issue.severity);
                return issueIdx >= targetIdx;
            });
            if (offendingIssues.length > 0) {
                console.error(chalk.red.bold(`\n❌ Quality Gate Failed: Found ${offendingIssues.length} security issue(s) at or above "${minSeverity}" severity.`));
                if (!isInteractiveLoop) {
                    process.exit(1);
                }
            }
        }
    }
}
/**
 * Logic to run the side-by-side comparison workflow.
 */
async function runCompareFlow(repoUrl1, repoUrl2, apiKey, isOffline = false) {
    const spinner = ora();
    let tempDir1 = '';
    let tempDir2 = '';
    try {
        // 1. Repo 1 Analysis
        spinner.start(`Parsing Repo 1: ${repoUrl1}`);
        const gitInfo1 = parseGitHubUrl(repoUrl1);
        spinner.succeed(`Repo 1 parsed: ${gitInfo1.owner}/${gitInfo1.repo}`);
        spinner.start(`Cloning Repo 1`);
        tempDir1 = await cloneRepository(gitInfo1.cloneUrl);
        spinner.succeed(`Repo 1 cloned`);
        spinner.start(`Scanning Repo 1 locally`);
        const localData1 = await analyzeDirectory(tempDir1);
        spinner.succeed(`Repo 1 scanned`);
        spinner.start(`Auditing Repo 1 (${isOffline ? 'offline' : 'gemini'})`);
        const aiData1 = await analyzeWithGemini(gitInfo1.owner, gitInfo1.repo, localData1, apiKey, isOffline);
        spinner.succeed(`Repo 1 audit completed`);
        // 2. Repo 2 Analysis
        spinner.start(`Parsing Repo 2: ${repoUrl2}`);
        const gitInfo2 = parseGitHubUrl(repoUrl2);
        spinner.succeed(`Repo 2 parsed: ${gitInfo2.owner}/${gitInfo2.repo}`);
        spinner.start(`Cloning Repo 2`);
        tempDir2 = await cloneRepository(gitInfo2.cloneUrl);
        spinner.succeed(`Repo 2 cloned`);
        spinner.start(`Scanning Repo 2 locally`);
        const localData2 = await analyzeDirectory(tempDir2);
        spinner.succeed(`Repo 2 scanned`);
        spinner.start(`Auditing Repo 2 (${isOffline ? 'offline' : 'gemini'})`);
        const aiData2 = await analyzeWithGemini(gitInfo2.owner, gitInfo2.repo, localData2, apiKey, isOffline);
        spinner.succeed(`Repo 2 audit completed`);
        // 3. Print side-by-side comparison report
        printCompareReport({ owner: gitInfo1.owner, repo: gitInfo1.repo, local: localData1, ai: aiData1 }, { owner: gitInfo2.owner, repo: gitInfo2.repo, local: localData2, ai: aiData2 });
    }
    catch (error) {
        spinner.fail('Comparison failed');
        console.error(chalk.red.bold('\nError during comparison execution:'));
        console.error(chalk.red(error.message));
        throw error;
    }
    finally {
        // Ensure both temp folders are cleaned up
        if (tempDir1) {
            spinner.start('Cleaning up Repo 1 temporary files');
            cleanupTempDir(tempDir1);
            spinner.succeed('Repo 1 temporary files cleaned up');
        }
        if (tempDir2) {
            spinner.start('Cleaning up Repo 2 temporary files');
            cleanupTempDir(tempDir2);
            spinner.succeed('Repo 2 temporary files cleaned up');
        }
    }
}
// Interactive Mode Prompt Loop (Master Control Panel)
async function runInteractiveMode() {
    console.log(chalk.bold.cyan('\n🔍 Welcome to RepoRadar Interactive Control Panel!'));
    console.log(chalk.dim('Select an option below to begin. Press Ctrl+C at any prompt to exit.\n'));
    let keepLooping = true;
    let userApiKey = process.env.GEMINI_API_KEY || '';
    // Universal cancel handler for Ctrl+C at any prompt stage
    const onCancel = () => {
        console.log(chalk.cyan('\nThank you for using RepoRadar! Goodbye. 👋\n'));
        process.exit(0);
    };
    while (keepLooping) {
        const mainAction = await prompts({
            type: 'select',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { title: '🔍 Analyze a Single Repository (AI-Powered)', value: 'analyze-ai' },
                { title: '🔌 Analyze a Single Repository (Offline Mode)', value: 'analyze-offline' },
                { title: '🆚 Compare Two Repositories (AI-Powered)', value: 'compare-ai' },
                { title: '🔌 Compare Two Repositories (Offline Mode)', value: 'compare-offline' },
                { title: '⚙️  Configure API Key & Model Settings', value: 'config' },
                { title: '❌ Exit', value: 'exit' }
            ]
        }, { onCancel });
        if (!mainAction.action || mainAction.action === 'exit') {
            console.log(chalk.cyan('\nThank you for using RepoRadar! Goodbye. 👋\n'));
            keepLooping = false;
            break;
        }
        const action = mainAction.action;
        if (action === 'analyze-ai' || action === 'analyze-offline') {
            const isOffline = action === 'analyze-offline';
            const questions = [
                {
                    type: 'text',
                    name: 'repoUrl',
                    message: 'Enter the GitHub repository URL to analyze:',
                    validate: (value) => {
                        if (!value.trim())
                            return 'Repository URL is required.';
                        try {
                            parseGitHubUrl(value);
                            return true;
                        }
                        catch (e) {
                            return e.message;
                        }
                    }
                },
                {
                    type: () => (!isOffline && !userApiKey ? 'password' : null),
                    name: 'apiKey',
                    message: 'Enter your Gemini API Key:',
                },
                {
                    type: 'select',
                    name: 'format',
                    message: 'Select the report output format:',
                    choices: [
                        { title: 'Terminal Table (Styled)', value: 'table' },
                        { title: 'JSON Document', value: 'json' },
                        { title: 'Markdown File', value: 'markdown' }
                    ],
                    initial: 0
                },
                {
                    type: 'confirm',
                    name: 'saveToFile',
                    message: 'Save the report output to a file?',
                    initial: false
                },
                {
                    type: (prev) => (prev ? 'text' : null),
                    name: 'outputFile',
                    message: 'Enter output file path:',
                    initial: (prev, answers) => {
                        const parsed = parseGitHubUrl(answers.repoUrl);
                        const ext = answers.format === 'json' ? 'json' : answers.format === 'markdown' ? 'md' : 'txt';
                        return `reporadar-${parsed.repo}.${ext}`;
                    }
                },
                {
                    type: 'confirm',
                    name: 'setScoreGate',
                    message: 'Set a Code Quality Gate (fail on low score)?',
                    initial: false
                },
                {
                    type: (prev) => (prev ? 'number' : null),
                    name: 'failOnScore',
                    message: 'Fail if quality score is below (0-100):',
                    initial: 80,
                    validate: (val) => (val >= 0 && val <= 100) || 'Score must be between 0 and 100.'
                },
                {
                    type: 'confirm',
                    name: 'setSecurityGate',
                    message: 'Set a Security Gate (fail on vulnerabilities)?',
                    initial: false
                },
                {
                    type: (prev) => (prev ? 'select' : null),
                    name: 'failOnSecurity',
                    message: 'Fail if vulnerabilities are found at or above severity:',
                    choices: [
                        { title: 'Low Severity', value: 'low' },
                        { title: 'Medium Severity', value: 'medium' },
                        { title: 'High Severity', value: 'high' }
                    ],
                    initial: 1
                }
            ];
            const response = await prompts(questions, { onCancel });
            if (!response.repoUrl)
                continue;
            const analyzeOptions = {
                key: response.apiKey || userApiKey || undefined,
                format: response.format,
                output: response.saveToFile ? response.outputFile : undefined,
                offline: isOffline,
                failOnScore: response.setScoreGate ? response.failOnScore?.toString() : undefined,
                failOnSecurity: response.setSecurityGate ? response.failOnSecurity : undefined
            };
            console.log(); // Blank line
            await runAnalysis(response.repoUrl.trim(), analyzeOptions, true);
        }
        else if (action === 'compare-ai' || action === 'compare-offline') {
            const isOffline = action === 'compare-offline';
            const questions = [
                {
                    type: 'text',
                    name: 'repoUrl1',
                    message: 'Enter the First GitHub repository URL:',
                    validate: (value) => {
                        if (!value.trim())
                            return 'Repository URL is required.';
                        try {
                            parseGitHubUrl(value);
                            return true;
                        }
                        catch (e) {
                            return e.message;
                        }
                    }
                },
                {
                    type: 'text',
                    name: 'repoUrl2',
                    message: 'Enter the Second GitHub repository URL:',
                    validate: (value) => {
                        if (!value.trim())
                            return 'Repository URL is required.';
                        try {
                            parseGitHubUrl(value);
                            return true;
                        }
                        catch (e) {
                            return e.message;
                        }
                    }
                },
                {
                    type: () => (!isOffline && !userApiKey ? 'password' : null),
                    name: 'apiKey',
                    message: 'Enter your Gemini API Key:',
                }
            ];
            const response = await prompts(questions, { onCancel });
            if (!response.repoUrl1 || !response.repoUrl2)
                continue;
            const compareApiKey = response.apiKey || userApiKey || undefined;
            console.log(); // Blank line
            try {
                await runCompareFlow(response.repoUrl1.trim(), response.repoUrl2.trim(), compareApiKey, isOffline);
            }
            catch {
                // Handled inside flow, continue loop
            }
        }
        else if (action === 'config') {
            const configQuestions = [
                {
                    type: 'password',
                    name: 'apiKey',
                    message: `Enter Gemini API Key (current: ${userApiKey ? 'Set (hidden)' : 'Not set'}):`,
                    initial: userApiKey
                },
                {
                    type: 'text',
                    name: 'model',
                    message: 'Enter default Gemini Model Name:',
                    initial: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
                }
            ];
            const response = await prompts(configQuestions, { onCancel });
            if (response.apiKey === undefined || response.model === undefined)
                continue;
            // Update env variables locally
            userApiKey = response.apiKey;
            process.env.GEMINI_API_KEY = response.apiKey;
            process.env.GEMINI_MODEL = response.model;
            // Write to .env file
            try {
                fs.writeFileSync('.env', `GEMINI_API_KEY=${response.apiKey}\nGEMINI_MODEL=${response.model}\n`, 'utf8');
                console.log(chalk.green('\n💾 Configuration successfully written to local .env file!'));
            }
            catch (err) {
                console.error(chalk.red(`\n❌ Failed to write .env file: ${err.message}`));
            }
        }
        console.log('\n' + '─'.repeat(60) + '\n');
    }
}
// Single CLI Setup
program
    .name('reporadar')
    .description('A command-line tool to analyze a GitHub repository for quality, security, and dependencies.')
    .version('1.1.0');
// Default analysis command
program
    .argument('[repoUrl]', 'GitHub repository URL (e.g. https://github.com/owner/repo)')
    .option('-k, --key <apiKey>', 'Gemini API Key (can also be set via GEMINI_API_KEY environment variable)')
    .option('-f, --format <format>', 'Output format: json, markdown, table', 'table')
    .option('-o, --output <file>', 'Save report output to a file path')
    .option('--offline', 'Perform local static analysis only, without using Gemini AI')
    .option('--fail-on-score <score>', 'Exit with code 1 if quality score falls below specified value')
    .option('--fail-on-security <level>', 'Exit with code 1 if security issues found at or above level (low, medium, high)')
    .action(async (repoUrl, options) => {
    // If no argument, trigger interactive mode
    if (!repoUrl) {
        await runInteractiveMode();
    }
    else {
        await runAnalysis(repoUrl, options);
    }
});
// Compare command
program
    .command('compare')
    .description('Compares two GitHub repositories side-by-side.')
    .argument('<repoUrl1>', 'First GitHub repository URL')
    .argument('<repoUrl2>', 'Second GitHub repository URL')
    .option('-k, --key <apiKey>', 'Gemini API Key')
    .option('--offline', 'Perform offline comparison')
    .action(async (repoUrl1, repoUrl2, options) => {
    const apiKey = options.key || process.env.GEMINI_API_KEY;
    const isOffline = !!options.offline;
    if (!isOffline && !apiKey) {
        console.error(chalk.red.bold('\nError: Gemini API Key is missing for compare command! Set GEMINI_API_KEY or run with --offline.'));
        process.exit(1);
    }
    try {
        await runCompareFlow(repoUrl1, repoUrl2, apiKey, isOffline);
    }
    catch {
        process.exit(1);
    }
});
program.parse(process.argv);
