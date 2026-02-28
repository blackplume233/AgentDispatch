import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const cliCommandsDir = path.join(repoRoot, 'packages', 'client-cli', 'src', 'commands');
const nodeFile = path.join(repoRoot, 'packages', 'client-node', 'src', 'node.ts');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function extractCliCommands(commandsDir) {
  const files = fs
    .readdirSync(commandsDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(commandsDir, name));

  const result = new Set();
  const sendPattern = /client\.send\(\s*['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    const content = read(file);
    let match;
    while ((match = sendPattern.exec(content)) !== null) {
      result.add(match[1]);
    }
  }

  return result;
}

function extractNodeHandlers(filePath) {
  const content = read(filePath);
  const result = new Set();
  const casePattern = /case\s+['"`]([^'"`]+)['"`]\s*:/g;

  let match;
  while ((match = casePattern.exec(content)) !== null) {
    result.add(match[1]);
  }

  return result;
}

const cliCommands = extractCliCommands(cliCommandsDir);
const nodeHandlers = extractNodeHandlers(nodeFile);

const missingInNode = [...cliCommands].filter((cmd) => !nodeHandlers.has(cmd)).sort();
const orphanInNode = [...nodeHandlers].filter((cmd) => !cliCommands.has(cmd)).sort();

if (missingInNode.length === 0 && orphanInNode.length === 0) {
  console.log('IPC command parity check passed.');
  process.exit(0);
}

console.error('IPC command parity check failed.');

if (missingInNode.length > 0) {
  console.error('\nCommands used by client-cli but not handled in client-node:');
  for (const cmd of missingInNode) {
    console.error(`- ${cmd}`);
  }
}

if (orphanInNode.length > 0) {
  console.error('\nCommands handled in client-node but not used by client-cli:');
  for (const cmd of orphanInNode) {
    console.error(`- ${cmd}`);
  }
}

process.exit(1);
