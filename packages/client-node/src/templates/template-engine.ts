import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task, AgentConfig, ClientConfig } from '@agentdispatch/shared';

export interface TemplateVars {
  [key: string]: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildTemplateVars(
  task: Task,
  agent: AgentConfig,
  nodeConfig: ClientConfig,
): TemplateVars {
  const outputDir = path.join(agent.workDir, 'output');
  const cliPath =
    process.execPath +
    ' ' +
    path.resolve(process.cwd(), 'node_modules/.bin/dispatch');

  return {
    'task.id': task.id,
    'task.title': task.title,
    'task.description': task.description ?? '',
    'task.tags': task.tags.join(', '),
    'task.priority': task.priority,
    'task.metadata': JSON.stringify(task.metadata ?? {}),
    'agent.id': agent.id,
    'agent.workDir': agent.workDir,
    'agent.capabilities': (agent.capabilities ?? []).join(', '),
    'node.name': nodeConfig.name,
    'node.cliPath': cliPath,
    'artifacts.outputDir': outputDir,
    'artifacts.instructions': generateArtifactInstructions(),
    'cli.progressCmd': `dispatch worker progress ${task.id} --percent <0-100> --message "<msg>"`,
    'cli.completeCmd': `dispatch worker complete ${task.id} --zip ${outputDir}/artifact.zip --result ${outputDir}/result.json`,
    'cli.failCmd': `dispatch worker fail ${task.id} --reason "<reason>"`,
    'cli.statusCmd': `dispatch worker status ${task.id}`,
    'cli.logCmd': `dispatch worker log ${task.id} --message "<msg>"`,
    'cli.heartbeatCmd': `dispatch worker heartbeat ${task.id}`,
    'cli.reference': generateCliReference(task.id, outputDir),
  };
}

function generateArtifactInstructions(): string {
  return `When your task is complete, you MUST produce exactly two files:

1. **artifact.zip** — A zip archive containing ALL work output
2. **result.json** — A structured JSON file with the following schema:

\`\`\`json
{
  "taskId": "<task-id>",
  "success": true,
  "summary": "Brief description of what was accomplished",
  "outputs": [
    { "name": "output name", "type": "file|directory|report|code|other", "path": "relative/path/in/zip", "description": "what this is" }
  ],
  "errors": [],
  "metrics": { "durationSeconds": 0 }
}
\`\`\`

**Required fields**: taskId, success, summary, outputs (at least 1 entry).
**Missing zip or result.json → task is marked as FAILED.**
**Invalid result.json → task is marked as FAILED.**`;
}

function generateCliReference(taskId: string, outputDir: string): string {
  return `## dispatch worker CLI Reference

| Command | Description |
|---------|-------------|
| \`dispatch worker progress ${taskId} --percent <0-100> --message "<msg>"\` | Report progress |
| \`dispatch worker complete ${taskId} --zip ${outputDir}/artifact.zip --result ${outputDir}/result.json\` | Submit artifacts |
| \`dispatch worker fail ${taskId} --reason "<reason>"\` | Report failure |
| \`dispatch worker status ${taskId}\` | Check task status |
| \`dispatch worker log ${taskId} --message "<msg>"\` | Append log |
| \`dispatch worker heartbeat ${taskId}\` | Send heartbeat |`;
}

export async function renderTemplate(
  templatePath: string,
  vars: TemplateVars,
): Promise<string> {
  const template = await fs.promises.readFile(templatePath, 'utf-8');
  let result = template;

  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  const missing = result.match(/\{\{[\w.]+\}\}/g);
  if (missing) {
    console.warn('Template has unresolved variables:', missing);
  }

  return result;
}

function getDefaultTemplatePath(): string {
  const base = path.join(__dirname, 'worker-prompt.md');
  if (fs.existsSync(base)) return base;
  const alt = path.join(__dirname, 'templates', 'worker-prompt.md');
  return fs.existsSync(alt) ? alt : base;
}

export async function buildWorkerPrompt(
  task: Task,
  agent: AgentConfig,
  nodeConfig: ClientConfig,
): Promise<string> {
  const vars = buildTemplateVars(task, agent, nodeConfig);

  const templatePath = agent.promptTemplate ?? getDefaultTemplatePath();

  return renderTemplate(templatePath, vars);
}
