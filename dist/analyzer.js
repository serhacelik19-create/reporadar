import fs from 'fs';
import path from 'path';
// Directories to ignore during scan
const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'out',
    'coverage',
    '.serverless',
    '.cache',
    'bower_components'
]);
// Source file extensions to scan for security issues and LOC
const SRC_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.rb', '.php', '.cs'
]);
/**
 * Traverses a directory and performs local static analysis.
 */
export async function analyzeDirectory(dirPath) {
    const result = {
        fileCount: 0,
        totalLines: 0,
        languages: {},
        tree: '',
        hasReadme: false,
        readmeContent: '',
        hasLicense: false,
        hasApiDocs: false,
        testFrameworks: [],
        testDirsDetected: false,
        dependencies: [],
        pythonDependencies: [],
        rustDependencies: [],
        goDependencies: [],
        dockerAlerts: [],
        securityIssues: [],
        todoCount: 0
    };
    const allFiles = [];
    const treeLines = [];
    // Helper to recursively scan directory
    function scan(currentDir, depth = 0, maxDepth = 4) {
        if (depth > maxDepth)
            return;
        let files;
        try {
            files = fs.readdirSync(currentDir);
        }
        catch {
            return;
        }
        // Sort: directories first, then files
        const sortedFiles = files.sort((a, b) => {
            const aPath = path.join(currentDir, a);
            const bPath = path.join(currentDir, b);
            const aIsDir = fs.statSync(aPath).isDirectory();
            const bIsDir = fs.statSync(bPath).isDirectory();
            if (aIsDir && !bIsDir)
                return -1;
            if (!aIsDir && bIsDir)
                return 1;
            return a.localeCompare(b);
        });
        for (const file of sortedFiles) {
            if (IGNORE_DIRS.has(file))
                continue;
            const fullPath = path.join(currentDir, file);
            const relativePath = path.relative(dirPath, fullPath);
            let isDirectory = false;
            try {
                isDirectory = fs.statSync(fullPath).isDirectory();
            }
            catch {
                continue;
            }
            const indent = '  '.repeat(depth);
            if (isDirectory) {
                if (depth < 3) {
                    treeLines.push(`${indent}📁 ${file}/`);
                }
                // Detect tests or docs directories
                if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(file.toLowerCase())) {
                    result.testDirsDetected = true;
                }
                if (['doc', 'docs', 'documentation', 'apidocs'].includes(file.toLowerCase())) {
                    result.hasApiDocs = true;
                }
                scan(fullPath, depth + 1, maxDepth);
            }
            else {
                result.fileCount++;
                if (depth < 3 && treeLines.length < 50) {
                    treeLines.push(`${indent}📄 ${file}`);
                }
                const ext = path.extname(file).toLowerCase();
                if (ext) {
                    result.languages[ext] = (result.languages[ext] || 0) + 1;
                }
                // Multi-language parser hooks
                if (file === 'requirements.txt') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split(/\r?\n/);
                        for (const line of lines) {
                            const clean = line.trim();
                            if (clean && !clean.startsWith('#')) {
                                const match = clean.match(/^([a-zA-Z0-9_-]+)/);
                                if (match)
                                    result.pythonDependencies.push(clean);
                            }
                        }
                    }
                    catch { }
                }
                if (file === 'pyproject.toml') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const depsSectionRegex = /\[(?:project|tool\.poetry)\.dependencies\]([\s\S]*?)(?=\n\[|$)/;
                        const match = content.match(depsSectionRegex);
                        if (match) {
                            const lines = match[1].split(/\r?\n/);
                            for (const line of lines) {
                                const clean = line.trim();
                                if (clean && !clean.startsWith('#') && clean.includes('=')) {
                                    result.pythonDependencies.push(clean);
                                }
                            }
                        }
                    }
                    catch { }
                }
                if (file === 'Cargo.toml') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const depsSectionRegex = /\[dependencies\]([\s\S]*?)(?=\n\[|$)/;
                        const match = content.match(depsSectionRegex);
                        if (match) {
                            const lines = match[1].split(/\r?\n/);
                            for (const line of lines) {
                                const clean = line.trim();
                                if (clean && !clean.startsWith('#') && clean.includes('=')) {
                                    result.rustDependencies.push(clean);
                                }
                            }
                        }
                    }
                    catch { }
                }
                if (file === 'go.mod') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const requireSectionRegex = /require\s*\(([\s\S]*?)\)/;
                        const match = content.match(requireSectionRegex);
                        if (match) {
                            const lines = match[1].split(/\r?\n/);
                            for (const line of lines) {
                                const clean = line.trim();
                                if (clean && !clean.startsWith('//')) {
                                    result.goDependencies.push(clean);
                                }
                            }
                        }
                        else {
                            // Try single line requires
                            const singleRequireRegex = /require\s+([^\s\(\)]+\s+[^\s\(\)]+)/g;
                            let sm;
                            while ((sm = singleRequireRegex.exec(content)) !== null) {
                                result.goDependencies.push(sm[1].trim());
                            }
                        }
                    }
                    catch { }
                }
                if (file.toLowerCase() === 'dockerfile') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split(/\r?\n/);
                        let hasUser = false;
                        let isRoot = false;
                        for (const line of lines) {
                            const clean = line.trim();
                            if (clean.startsWith('FROM')) {
                                const baseImage = clean.substring(4).trim();
                                if (baseImage.includes(':latest') || !baseImage.includes(':')) {
                                    result.dockerAlerts.push(`Unpinned base image: "${baseImage}" is using "latest" or no tag.`);
                                }
                            }
                            if (clean.startsWith('USER')) {
                                hasUser = true;
                                const user = clean.substring(4).trim();
                                if (user.toLowerCase() === 'root' || user === '0') {
                                    isRoot = true;
                                }
                            }
                        }
                        if (!hasUser || isRoot) {
                            result.dockerAlerts.push('Security Alert: Container runs as root (USER instruction is missing or explicitly set to root).');
                        }
                    }
                    catch { }
                }
                // Check for specific files at root
                if (depth === 0) {
                    const lowerFile = file.toLowerCase();
                    if (lowerFile.startsWith('readme')) {
                        result.hasReadme = true;
                        try {
                            // Read README up to 2500 characters
                            const content = fs.readFileSync(fullPath, 'utf8');
                            result.readmeContent = content.length > 2500 ? content.substring(0, 2500) + '\n... (truncated)' : content;
                        }
                        catch { }
                    }
                    if (lowerFile.startsWith('license') || lowerFile.startsWith('licence')) {
                        result.hasLicense = true;
                    }
                }
                allFiles.push(fullPath);
            }
        }
    }
    scan(dirPath);
    result.tree = treeLines.join('\n');
    // Analyze individual files (up to 60 source files to keep it fast)
    const sourceFiles = allFiles.filter(f => SRC_EXTENSIONS.has(path.extname(f).toLowerCase()));
    const filesToScan = sourceFiles.slice(0, 60);
    for (const file of filesToScan) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const relPath = path.relative(dirPath, file);
            const lines = content.split(/\r?\n/);
            result.totalLines += lines.length;
            // Scan each line for secrets/todos/unsafe functions
            lines.forEach((line, idx) => {
                const lineNum = idx + 1;
                // Scan for TODOs
                if (/\b(TODO|FIXME)\b/i.test(line)) {
                    result.todoCount++;
                }
                // Unsafe eval
                if (/\beval\s*\([^\)]+\)/.test(line) && !line.includes('//') && !line.includes('/*')) {
                    result.securityIssues.push({
                        file: relPath,
                        line: lineNum,
                        type: 'Unsafe Function Call',
                        description: 'Use of eval() detected, which can lead to remote code execution.',
                        severity: 'high'
                    });
                }
                // Basic Secret/API Key regex (looks for patterns like API_KEY = "xyz" where length is 20-60)
                const secretRegex = /\b(?:secret|api_?key|token|password|passwd|private_?key|aws_?access|client_?secret)\b\s*[:=]\s*["']([A-Za-z0-9_\-\.\+\/]{16,60})["']/i;
                const match = line.match(secretRegex);
                if (match && !line.includes('//') && !line.includes('/*')) {
                    const secretVal = match[1];
                    const lowercaseVal = secretVal.toLowerCase();
                    if (!['test', 'mock', 'dummy', 'sample', 'placeholder', 'true', 'false', 'undefined', 'null'].some(keyword => lowercaseVal.includes(keyword))) {
                        result.securityIssues.push({
                            file: relPath,
                            line: lineNum,
                            type: 'Hardcoded Secret',
                            description: `Potential hardcoded credential or API key found: "${match[0].trim().substring(0, 40)}..."`,
                            severity: 'high'
                        });
                    }
                }
            });
        }
        catch { }
    }
    // Parse package.json if it exists
    const packageJsonPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            // Detect Test Frameworks
            const testKeywords = ['jest', 'vitest', 'mocha', 'cypress', 'playwright', 'ava', 'jasmine', 'tap'];
            for (const depName of Object.keys(deps)) {
                const lowerDep = depName.toLowerCase();
                for (const kw of testKeywords) {
                    if (lowerDep.includes(kw) && !result.testFrameworks.includes(depName)) {
                        result.testFrameworks.push(depName);
                    }
                }
            }
            // Check npm dependencies for deprecation and latest versions (limit to first 12 for speed)
            const depList = Object.entries(deps).slice(0, 12);
            if (depList.length > 0) {
                result.dependencies = await fetchDependenciesStatus(depList);
            }
        }
        catch { }
    }
    return result;
}
/**
 * Checks NPM registry in parallel for package deprecation and latest versions.
 */
async function fetchDependenciesStatus(deps) {
    const promises = deps.map(async ([name, declaredVersion]) => {
        const cleanDeclared = declaredVersion.replace(/[\^~>=<]/g, '').trim();
        const status = {
            name,
            declaredVersion,
            latestVersion: cleanDeclared,
            isOutdated: false,
            isDeprecated: false
        };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(`https://registry.npmjs.org/${name}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                const latest = data['dist-tags']?.latest;
                if (latest) {
                    status.latestVersion = latest;
                    if (cleanDeclared && latest !== cleanDeclared && !latest.startsWith(cleanDeclared)) {
                        status.isOutdated = true;
                    }
                }
                if (data.deprecated) {
                    status.isDeprecated = true;
                    status.deprecationMessage = data.deprecated;
                }
                else if (latest && data.versions?.[latest]?.deprecated) {
                    status.isDeprecated = true;
                    status.deprecationMessage = data.versions[latest].deprecated;
                }
            }
        }
        catch (err) {
            // Network failure or timeout: fall back gracefully
        }
        return status;
    });
    return Promise.all(promises);
}
