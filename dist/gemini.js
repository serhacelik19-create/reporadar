import { GoogleGenAI } from '@google/genai';
/**
 * Invokes Gemini AI to perform a comprehensive code audit of the repository.
 * If offline is true, falls back to a local static analysis evaluator.
 */
export async function analyzeWithGemini(owner, repo, localData, apiKey, offline = false) {
    if (offline) {
        return runOfflineEvaluation(localData);
    }
    const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set. Please set it, pass it as an option, or run with --offline.');
    }
    // Initialize the SDK client
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const dependencyList = localData.dependencies
        .map(d => `${d.name} (${d.declaredVersion}) - Latest: ${d.latestVersion}${d.isDeprecated ? ' [DEPRECATED]' : ''}${d.isOutdated ? ' [OUTDATED]' : ''}`)
        .join('\n');
    const pythonDeps = localData.pythonDependencies.length > 0
        ? `Python dependencies:\n${localData.pythonDependencies.map(d => ` - ${d}`).join('\n')}`
        : '';
    const rustDeps = localData.rustDependencies.length > 0
        ? `Rust Cargo dependencies:\n${localData.rustDependencies.map(d => ` - ${d}`).join('\n')}`
        : '';
    const goDeps = localData.goDependencies.length > 0
        ? `Go Module dependencies:\n${localData.goDependencies.map(d => ` - ${d}`).join('\n')}`
        : '';
    const dockerAlertsText = localData.dockerAlerts.length > 0
        ? `Docker alerts:\n${localData.dockerAlerts.map(d => ` - ${d}`).join('\n')}`
        : '';
    const detectedTests = localData.testFrameworks.length > 0
        ? `Test frameworks in package.json: ${localData.testFrameworks.join(', ')}`
        : 'No test frameworks detected in package.json.';
    const testDirMessage = localData.testDirsDetected
        ? 'Test directory structure detected.'
        : 'No test directory detected.';
    const languageStats = Object.entries(localData.languages)
        .map(([ext, count]) => `${ext}: ${count} files`)
        .join(', ');
    const localSecurityMessage = localData.securityIssues.length > 0
        ? localData.securityIssues.map(issue => `- [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line} - ${issue.type}: ${issue.description}`).join('\n')
        : 'No obvious hardcoded secrets or eval calls detected by the simple local regex scanner.';
    const prompt = `
You are an expert Senior Code Auditor and Security Engineer. Analyze the metadata of the GitHub repository "${owner}/${repo}" and provide a detailed quality, security, and structure report.

Here is the data collected from the repository:

### Repository Statistics
- Total files: ${localData.fileCount}
- Estimated lines of code in key files: ${localData.totalLines}
- Programming languages (by file extension): ${languageStats || 'Unknown'}

### Project Structure (Partial Directory Tree)
\`\`\`
${localData.tree}
\`\`\`

### Documentation Detection
- README present: ${localData.hasReadme ? 'Yes' : 'No'}
- LICENSE present: ${localData.hasLicense ? 'Yes' : 'No'}
- API docs or docs directory present: ${localData.hasApiDocs ? 'Yes' : 'No'}
${localData.hasReadme ? `\n--- README.md Content (Truncated) ---\n${localData.readmeContent}\n--------------------------------------\n` : ''}

### Test Suite Detection
- ${detectedTests}
- ${testDirMessage}

### Dependency Lists & Ecosystem Status
${dependencyList ? `NPM Dependencies:\n${dependencyList}\n` : ''}
${pythonDeps}
${rustDeps}
${goDeps}

### Dockerfile Audit
${dockerAlertsText || 'No Dockerfile or no Docker alerts found.'}

### Local Regex Scanner Security Alerts (Verify these and list true positives)
\`\`\`
${localSecurityMessage}
\`\`\`
- TODO/FIXME comments count: ${localData.todoCount}

Instructions:
1. Review the files list, README, package dependencies, Docker configurations, and local security scanner alerts.
2. Estimate the overall code quality score (0 to 100) based on project structure, dependency cleanliness, use of testing frameworks, and documentation quality. Provide a detailed rationale.
3. Review the security alerts and Docker warnings. Confirm true positives, identify potential architectural vulnerabilities (such as outdated critical packages, absence of a license, or missing security files), and score the security (0 to 100).
4. Assign grades (A, B, C, D, or F) to:
   - Dependency risks (Are there deprecated packages? Are dependencies clean?)
   - Test coverage (Are test files or frameworks configured?)
   - Documentation quality (Is there a license? Is README descriptive?)
5. Provide a final overall grade (e.g. A+, A, B+, B, C-, D, F).
6. List up to 3 key strengths, 3 key weaknesses, and 4 practical actionable recommendations.

Ensure your response conforms strictly to the requested JSON schema.
`;
    try {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
        const response = await ai.models.generateContent({
            model: geminiModel,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        codeQualityScore: { type: 'integer' },
                        codeQualityRationale: { type: 'string' },
                        securityScore: { type: 'integer' },
                        securityIssues: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                                    file: { type: 'string' },
                                    description: { type: 'string' }
                                },
                                required: ['severity', 'file', 'description']
                            }
                        },
                        dependencyGrade: { type: 'string' },
                        testCoverageGrade: { type: 'string' },
                        documentationGrade: { type: 'string' },
                        overallGrade: { type: 'string' },
                        keyStrengths: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        keyWeaknesses: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        recommendations: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    required: [
                        'codeQualityScore',
                        'codeQualityRationale',
                        'securityScore',
                        'securityIssues',
                        'dependencyGrade',
                        'testCoverageGrade',
                        'documentationGrade',
                        'overallGrade',
                        'keyStrengths',
                        'keyWeaknesses',
                        'recommendations'
                    ]
                }
            }
        });
        const text = response.text;
        if (!text) {
            throw new Error('Empty response received from Gemini API.');
        }
        return JSON.parse(text);
    }
    catch (error) {
        throw new Error(`Gemini Analysis failed: ${error.message}`);
    }
}
/**
 * Computes a static rating report based on local code parameters without querying Gemini.
 */
function runOfflineEvaluation(localData) {
    // 1. Calculate Code Quality Score
    let codeQualityScore = 100;
    if (localData.testFrameworks.length === 0 && !localData.testDirsDetected)
        codeQualityScore -= 20;
    if (!localData.hasApiDocs)
        codeQualityScore -= 10;
    if (!localData.hasReadme)
        codeQualityScore -= 10;
    codeQualityScore -= Math.min(localData.todoCount * 2, 10);
    codeQualityScore = Math.max(codeQualityScore, 20);
    let codeQualityRationale = 'Static offline evaluation based on structure, documentation, and testing frameworks.';
    if (codeQualityScore >= 80)
        codeQualityRationale = 'Good documentation and modular structure detected.';
    else if (codeQualityScore >= 50)
        codeQualityRationale = 'Basic project structure found, but lacks adequate testing or documentation.';
    else
        codeQualityRationale = 'Minimal project architecture with significant documentation or testing gaps.';
    // 2. Calculate Security Score & Map Issues
    let securityScore = 100;
    const securityIssues = [];
    localData.securityIssues.forEach(issue => {
        securityIssues.push({
            severity: issue.severity,
            file: issue.file,
            description: `${issue.type}: ${issue.description} (Found on line ${issue.line})`
        });
        if (issue.severity === 'high')
            securityScore -= 25;
        else if (issue.severity === 'medium')
            securityScore -= 15;
        else
            securityScore -= 5;
    });
    localData.dockerAlerts.forEach(alert => {
        securityIssues.push({
            severity: alert.toLowerCase().includes('security') ? 'high' : 'medium',
            file: 'Dockerfile',
            description: alert
        });
        securityScore -= 15;
    });
    if (!localData.hasLicense) {
        securityIssues.push({
            severity: 'low',
            file: 'LICENSE',
            description: 'Missing open-source LICENSE file.'
        });
        securityScore -= 10;
    }
    securityScore = Math.max(securityScore, 10);
    // 3. Compute grades
    const testCoverageGrade = (localData.testFrameworks.length > 0 || localData.testDirsDetected) ? 'A' : 'F';
    let documentationGrade = 'F';
    if (localData.hasReadme && localData.hasLicense && localData.hasApiDocs)
        documentationGrade = 'A';
    else if (localData.hasReadme && localData.hasLicense)
        documentationGrade = 'B';
    else if (localData.hasReadme)
        documentationGrade = 'C';
    // Dependency grade
    let dependencyGrade = 'A';
    const npmDeprecated = localData.dependencies.filter(d => d.isDeprecated).length;
    const npmOutdated = localData.dependencies.filter(d => d.isOutdated).length;
    if (npmDeprecated > 0)
        dependencyGrade = 'D';
    else if (npmOutdated > 5)
        dependencyGrade = 'C';
    else if (npmOutdated > 0)
        dependencyGrade = 'B';
    // Compute Overall Grade
    let overallNum = 0;
    const gradeMap = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
    const revGradeMap = ['F', 'D', 'C', 'B', 'A'];
    const scores = [
        codeQualityScore / 25, // 0-4 scale
        securityScore / 25,
        gradeMap[dependencyGrade],
        gradeMap[testCoverageGrade],
        gradeMap[documentationGrade]
    ];
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const index = Math.round(average);
    const overallGrade = revGradeMap[index] || 'C';
    // Strengths, Weaknesses, Recommendations
    const keyStrengths = [];
    const keyWeaknesses = [];
    const recommendations = [];
    if (localData.hasReadme)
        keyStrengths.push('README file is present at the root directory.');
    if (localData.hasLicense)
        keyStrengths.push('Open-source LICENSE file is configured.');
    if (localData.testFrameworks.length > 0 || localData.testDirsDetected)
        keyStrengths.push('Testing framework or test directory detected.');
    if (keyStrengths.length === 0)
        keyStrengths.push('Basic repository file structure is established.');
    if (!localData.hasLicense)
        keyWeaknesses.push('No open-source LICENSE file detected.');
    if (localData.testFrameworks.length === 0 && !localData.testDirsDetected)
        keyWeaknesses.push('No tests or testing configurations found.');
    if (localData.securityIssues.length > 0)
        keyWeaknesses.push('Local secrets scanning detected potential hardcoded API keys or credentials.');
    if (keyWeaknesses.length === 0)
        keyWeaknesses.push('Minimal documentation or missing API references.');
    if (!localData.hasLicense)
        recommendations.push('Add an MIT or Apache 2.0 LICENSE file to clarify reuse guidelines.');
    if (localData.testFrameworks.length === 0)
        recommendations.push('Install Vitest or Jest and configure automated unit tests.');
    if (localData.securityIssues.length > 0)
        recommendations.push('Review the hardcoded credentials in the repository and move them to environment variables.');
    recommendations.push('Create a docs/ folder to host detailed documentation and keep dependencies updated.');
    return {
        codeQualityScore,
        codeQualityRationale,
        securityScore,
        securityIssues,
        dependencyGrade,
        testCoverageGrade,
        documentationGrade,
        overallGrade,
        keyStrengths: keyStrengths.slice(0, 3),
        keyWeaknesses: keyWeaknesses.slice(0, 3),
        recommendations: recommendations.slice(0, 4)
    };
}
