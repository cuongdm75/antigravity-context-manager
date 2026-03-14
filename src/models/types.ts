import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface KnowledgeItemMeta {
  title: string;
  summary: string;
  references: { type: string; value: string }[];
  folderName: string;
  artifactPaths: string[];
  lastAccessed?: Date;
}

export interface AgentInfo {
  name: string;
  description: string;
  skills: string[];
  filePath: string;
  fileSize: number;
}

export interface SkillInfo {
  name: string;
  description: string;
  folderPath: string;
  hasScripts: boolean;
}

export interface ConversationInfo {
  id: string;
  folderPath: string;
  hasTask: boolean;
  hasPlan: boolean;
  hasWalkthrough: boolean;
  taskCompletion?: { total: number; done: number };
  sizeBytes: number;
  lastModified: Date;
}

export interface DiskUsage {
  browserRecordings: { size: number; count: number };
  brainMedia: { size: number; count: number };
  brainArtifacts: { size: number; count: number };
  conversations: { size: number; count: number };
  knowledge: { size: number; count: number };
  total: number;
}

export function getAntigravityPath(): string {
  const configPath = '';
  if (configPath) { return configPath; }

  const home = os.homedir();
  const geminiPath = path.join(home, '.gemini', 'antigravity');
  if (fs.existsSync(geminiPath)) { return geminiPath; }

  return geminiPath;
}
