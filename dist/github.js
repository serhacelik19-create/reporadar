import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
const execAsync = promisify(exec);
/**
 * Parses a GitHub repository URL and extracts owner, repo name, and normalizes the clone URL.
 */
export function parseGitHubUrl(url) {
    const cleanUrl = url.trim();
    // Test HTTPS pattern: https://github.com/owner/repo or github.com/owner/repo
    const httpsRegex = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?(?:[?#].*)?$/;
    // Test SSH pattern: git@github.com:owner/repo.git
    const sshRegex = /^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;
    let owner = '';
    let repo = '';
    const httpsMatch = cleanUrl.match(httpsRegex);
    if (httpsMatch) {
        owner = httpsMatch[1];
        repo = httpsMatch[2];
    }
    else {
        const sshMatch = cleanUrl.match(sshRegex);
        if (sshMatch) {
            owner = sshMatch[1];
            repo = sshMatch[2];
        }
        else {
            throw new Error(`Invalid GitHub URL format: "${url}". Please provide a valid GitHub repo URL (e.g., https://github.com/owner/repo).`);
        }
    }
    return {
        owner,
        repo,
        cloneUrl: `https://github.com/${owner}/${repo}.git`
    };
}
/**
 * Clones a GitHub repository using shallow clone (--depth 1) to a temporary directory.
 * @returns The absolute path of the cloned repository.
 */
export async function cloneRepository(cloneUrl) {
    const tempDir = path.join(os.tmpdir(), `reporadar-${Math.random().toString(36).substring(2, 10)}`);
    try {
        // Perform shallow clone
        await execAsync(`git clone --depth 1 "${cloneUrl}" "${tempDir}"`, {
            timeout: 300000 // 5 minutes timeout
        });
        return tempDir;
    }
    catch (error) {
        // Attempt cleanup in case directory was partially created
        cleanupTempDir(tempDir);
        throw new Error(`Failed to clone repository: ${error.message}`);
    }
}
/**
 * Recursively deletes a temporary directory.
 */
export function cleanupTempDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
        catch (error) {
            // Ignore cleanup errors or log them if critical
        }
    }
}
