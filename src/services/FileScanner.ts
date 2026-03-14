import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeItemMeta, AgentInfo, SkillInfo, ConversationInfo, DiskUsage, getAntigravityPath } from '../models/types';

export class FileScanner {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || getAntigravityPath();
  }

  scanKnowledgeItems(): KnowledgeItemMeta[] {
    const kiPath = path.join(this.basePath, 'knowledge');
    if (!fs.existsSync(kiPath)) { return []; }

    const items: KnowledgeItemMeta[] = [];
    for (const entry of fs.readdirSync(kiPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) { continue; }

      const metaPath = path.join(kiPath, entry.name, 'metadata.json');
      if (!fs.existsSync(metaPath)) { continue; }

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const artifactsDir = path.join(kiPath, entry.name, 'artifacts');
        const artifactPaths = this.walkDir(artifactsDir);

        const tsPath = path.join(kiPath, entry.name, 'timestamps.json');
        let lastAccessed: Date | undefined;
        if (fs.existsSync(tsPath)) {
          const ts = JSON.parse(fs.readFileSync(tsPath, 'utf-8'));
          lastAccessed = ts.last_accessed ? new Date(ts.last_accessed) : undefined;
        }

        items.push({
          title: meta.title || entry.name,
          summary: meta.summary || '',
          references: meta.references || [],
          folderName: entry.name,
          artifactPaths,
          lastAccessed,
        });
      } catch {
        // skip malformed metadata
      }
    }
    return items;
  }

  scanAgents(projectPath: string): AgentInfo[] {
    const agentDir = path.join(projectPath, '.agent', 'agents');
    if (!fs.existsSync(agentDir)) { return []; }

    const agents: AgentInfo[] = [];
    for (const file of fs.readdirSync(agentDir).filter(f => f.endsWith('.md'))) {
      const filePath = path.join(agentDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);

      const frontmatter = this.parseFrontmatter(content);
      agents.push({
        name: frontmatter.name || file.replace('.md', ''),
        description: frontmatter.description || '',
        skills: (frontmatter.skills || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        filePath,
        fileSize: stat.size,
      });
    }
    return agents.sort((a, b) => a.name.localeCompare(b.name));
  }

  scanSkills(projectPath: string): SkillInfo[] {
    const skillDir = path.join(projectPath, '.agent', 'skills');
    if (!fs.existsSync(skillDir)) { return []; }

    const skills: SkillInfo[] = [];
    for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) { continue; }

      const skillMd = path.join(skillDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) { continue; }

      const content = fs.readFileSync(skillMd, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);
      const scriptsDir = path.join(skillDir, entry.name, 'scripts');

      skills.push({
        name: entry.name,
        description: frontmatter.description || '',
        folderPath: path.join(skillDir, entry.name),
        hasScripts: fs.existsSync(scriptsDir),
      });
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  scanConversations(): ConversationInfo[] {
    const brainDir = path.join(this.basePath, 'brain');
    if (!fs.existsSync(brainDir)) { return []; }

    const convos: ConversationInfo[] = [];
    for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'tempmediaStorage') { continue; }

      const folderPath = path.join(brainDir, entry.name);
      const taskPath = path.join(folderPath, 'task.md');
      const planPath = path.join(folderPath, 'implementation_plan.md');
      const walkPath = path.join(folderPath, 'walkthrough.md');

      let taskCompletion: { total: number; done: number } | undefined;
      if (fs.existsSync(taskPath)) {
        const content = fs.readFileSync(taskPath, 'utf-8');
        const total = (content.match(/- \[[ x/]\]/g) || []).length;
        const done = (content.match(/- \[x\]/g) || []).length;
        taskCompletion = { total, done };
      }

      let sizeBytes = 0;
      let lastModified = new Date(0);
      try {
        for (const f of fs.readdirSync(folderPath)) {
          const stat = fs.statSync(path.join(folderPath, f));
          sizeBytes += stat.size;
          if (stat.mtime > lastModified) { lastModified = stat.mtime; }
        }
      } catch { /* skip */ }

      convos.push({
        id: entry.name,
        folderPath,
        hasTask: fs.existsSync(taskPath),
        hasPlan: fs.existsSync(planPath),
        hasWalkthrough: fs.existsSync(walkPath),
        taskCompletion,
        sizeBytes,
        lastModified,
      });
    }
    return convos.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  scanDiskUsage(): DiskUsage {
    const scan = (dir: string, extensions?: string[]): { size: number; count: number } => {
      if (!fs.existsSync(dir)) { return { size: 0, count: 0 }; }
      let size = 0, count = 0;
      const walk = (d: string) => {
        try {
          for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) { walk(full); }
            else {
              if (!extensions || extensions.some(e => entry.name.endsWith(e))) {
                const stat = fs.statSync(full);
                size += stat.size;
                count++;
              }
            }
          }
        } catch { /* permission errors */ }
      };
      walk(dir);
      return { size, count };
    };

    const brainDir = path.join(this.basePath, 'brain');

    const browserRecordings = scan(path.join(this.basePath, 'browser_recordings'));
    const brainMedia = scan(brainDir, ['.webp', '.png', '.jpg', '.jpeg']);
    const brainArtifacts = scan(brainDir, ['.md', '.json']);
    const conversations = scan(path.join(this.basePath, 'conversations'));
    const knowledge = scan(path.join(this.basePath, 'knowledge'));

    return {
      browserRecordings,
      brainMedia,
      brainArtifacts,
      conversations,
      knowledge,
      total: browserRecordings.size + brainMedia.size + brainArtifacts.size + conversations.size + knowledge.size,
    };
  }

  private walkDir(dir: string): string[] {
    if (!fs.existsSync(dir)) { return []; }
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { results.push(...this.walkDir(full)); }
      else { results.push(full); }
    }
    return results;
  }

  private parseFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) { return {}; }
    const result: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return result;
  }
}
