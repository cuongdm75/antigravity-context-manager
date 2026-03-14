import * as fs from 'fs';
import * as path from 'path';
import { getAntigravityPath } from '../models/types';
import { FileScanner } from './FileScanner';

export interface PatternSuggestion {
  id: string;
  type: 'skill' | 'agent' | 'workflow';
  title: string;
  description: string;
  source: 'ki' | 'conversation' | 'file-change';
  sourceDetail: string;
  confidence: 'high' | 'medium' | 'low';
  generatedContent?: string;
  timestamp: Date;
}

export interface MonitorState {
  lastScanTime: Date;
  knownKIs: string[];
  knownSkills: string[];
  knownAgents: string[];
  suggestions: PatternSuggestion[];
}

export class PatternDetector {
  private basePath: string;
  private scanner: FileScanner;
  private stateFile: string;
  private state: MonitorState;

  constructor(extensionStoragePath: string) {
    this.basePath = getAntigravityPath();
    this.scanner = new FileScanner(this.basePath);
    this.stateFile = path.join(extensionStoragePath, 'monitor-state.json');
    this.state = this.loadState();
  }

  scan(projectPath: string): PatternSuggestion[] {
    const newSuggestions: PatternSuggestion[] = [];

    newSuggestions.push(...this.detectNewKIs());
    newSuggestions.push(...this.detectUnpackagedPatterns(projectPath));
    newSuggestions.push(...this.detectFrequentTopics());
    newSuggestions.push(...this.detectOrphanedWorkflows(projectPath));

    // Deduplicate against existing suggestions
    const existingIds = new Set(this.state.suggestions.map(s => s.id));
    const genuinelyNew = newSuggestions.filter(s => !existingIds.has(s.id));

    this.state.suggestions.push(...genuinelyNew);
    this.state.lastScanTime = new Date();
    this.saveState();

    return genuinelyNew;
  }

  getSuggestions(): PatternSuggestion[] {
    return this.state.suggestions;
  }

  dismissSuggestion(id: string): void {
    this.state.suggestions = this.state.suggestions.filter(s => s.id !== id);
    this.saveState();
  }

  /** Detect newly appeared KIs that don't yet have a corresponding skill */
  private detectNewKIs(): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const kiItems = this.scanner.scanKnowledgeItems();
    const currentKINames = kiItems.map(ki => ki.folderName);

    for (const ki of kiItems) {
      if (this.state.knownKIs.includes(ki.folderName)) { continue; }

      const skillName = ki.folderName.replace(/_/g, '-');
      suggestions.push({
        id: `ki-new-${ki.folderName}`,
        type: 'skill',
        title: `📚 New KI: "${ki.title}"`,
        description: `A new Knowledge Item appeared. Consider creating a skill from it to preserve this knowledge permanently.`,
        source: 'ki',
        sourceDetail: ki.folderName,
        confidence: 'high',
        generatedContent: this.generateSkillFromKI(ki.title, ki.summary, skillName),
        timestamp: new Date(),
      });
    }

    this.state.knownKIs = currentKINames;
    return suggestions;
  }

  /** Analyze conversation walkthroughs for recurring patterns not yet in skills */
  private detectUnpackagedPatterns(projectPath: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const conversations = this.scanner.scanConversations();

    // Count common topics across walkthrough files
    const topicCounts: Record<string, { count: number; examples: string[] }> = {};
    const keywords = [
      { pattern: /i18n|translation|vietnamese|bilingual|useLanguage/gi, topic: 'i18n-patterns' },
      { pattern: /approval|workflow|pending_review|state.machine/gi, topic: 'approval-workflows' },
      { pattern: /offline|sync|queue|mobile/gi, topic: 'offline-patterns' },
      { pattern: /security|jwt|cors|auth|ldap/gi, topic: 'security-patterns' },
      { pattern: /performance|optimize|cache|lazy|bundle/gi, topic: 'performance-patterns' },
      { pattern: /debug|fix|bug|error|issue/gi, topic: 'debugging-patterns' },
      { pattern: /test|spec|assert|mock|jest|playwright/gi, topic: 'testing-patterns' },
      { pattern: /deploy|ci|cd|pipeline|docker/gi, topic: 'deployment-patterns' },
      { pattern: /notification|notify|bell|alert/gi, topic: 'notification-patterns' },
      { pattern: /chart|graph|dashboard|analytics|trend/gi, topic: 'analytics-patterns' },
    ];

    for (const conv of conversations.slice(0, 30)) {
      const walkthroughPath = path.join(conv.folderPath, 'walkthrough.md');
      if (!fs.existsSync(walkthroughPath)) { continue; }

      try {
        const content = fs.readFileSync(walkthroughPath, 'utf-8');
        for (const { pattern, topic } of keywords) {
          const matches = content.match(pattern);
          if (matches && matches.length >= 2) {
            if (!topicCounts[topic]) { topicCounts[topic] = { count: 0, examples: [] }; }
            topicCounts[topic].count++;
            topicCounts[topic].examples.push(conv.id.slice(0, 8));
          }
        }
      } catch { /* skip unreadable */ }
    }

    // Check existing skills
    const existingSkills = this.scanner.scanSkills(projectPath).map(s => s.name);

    for (const [topic, data] of Object.entries(topicCounts)) {
      if (data.count < 3) { continue; } // need at least 3 sessions to suggest
      if (existingSkills.includes(topic)) { continue; } // already a skill

      suggestions.push({
        id: `pattern-${topic}`,
        type: 'skill',
        title: `🔄 Recurring pattern: "${topic}"`,
        description: `Found in ${data.count} sessions (${data.examples.join(', ')}). Consider creating a dedicated skill to codify this knowledge.`,
        source: 'conversation',
        sourceDetail: `${data.count} sessions`,
        confidence: data.count >= 5 ? 'high' : 'medium',
        generatedContent: this.generateSkillTemplate(topic, data.count),
        timestamp: new Date(),
      });
    }

    return suggestions;
  }

  /** Detect KIs that have many artifacts suggesting they could be a specialist agent */
  private detectFrequentTopics(): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const kiItems = this.scanner.scanKnowledgeItems();

    for (const ki of kiItems) {
      if (ki.artifactPaths.length >= 5) {
        const agentName = ki.folderName.replace(/_/g, '-').replace('sms-', '');
        suggestions.push({
          id: `agent-${ki.folderName}`,
          type: 'agent',
          title: `🤖 Complex KI → Agent: "${ki.title}"`,
          description: `This KI has ${ki.artifactPaths.length} artifacts. It may warrant its own specialist agent with deep domain knowledge.`,
          source: 'ki',
          sourceDetail: `${ki.artifactPaths.length} artifacts`,
          confidence: ki.artifactPaths.length >= 8 ? 'high' : 'medium',
          generatedContent: this.generateAgentFromKI(ki.title, ki.summary, agentName),
          timestamp: new Date(),
        });
      }
    }

    return suggestions;
  }

  /** Detect task.md patterns that could become reusable workflows */
  private detectOrphanedWorkflows(projectPath: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const conversations = this.scanner.scanConversations();
    const existingWorkflows = this.getExistingWorkflows(projectPath);

    const taskPatterns: Record<string, number> = {};
    for (const conv of conversations.slice(0, 20)) {
      const taskPath = path.join(conv.folderPath, 'task.md');
      if (!fs.existsSync(taskPath)) { continue; }

      try {
        const content = fs.readFileSync(taskPath, 'utf-8');
        const firstLine = content.split('\n').find(l => l.startsWith('# '));
        if (firstLine) {
          const title = firstLine.replace('# ', '').trim().toLowerCase();
          if (title.includes('fix') || title.includes('bug')) { taskPatterns['bug-fix-workflow'] = (taskPatterns['bug-fix-workflow'] || 0) + 1; }
          if (title.includes('implement') || title.includes('build')) { taskPatterns['feature-build-workflow'] = (taskPatterns['feature-build-workflow'] || 0) + 1; }
          if (title.includes('refactor') || title.includes('cleanup')) { taskPatterns['refactor-workflow'] = (taskPatterns['refactor-workflow'] || 0) + 1; }
          if (title.includes('test') || title.includes('verify')) { taskPatterns['test-workflow'] = (taskPatterns['test-workflow'] || 0) + 1; }
        }
      } catch { /* skip */ }
    }

    for (const [workflow, count] of Object.entries(taskPatterns)) {
      if (count < 3 || existingWorkflows.includes(workflow)) { continue; }
      suggestions.push({
        id: `workflow-${workflow}`,
        type: 'workflow',
        title: `⚡ Common task → Workflow: "${workflow}"`,
        description: `Found ${count} sessions with this pattern. Create a slash command to standardize the process.`,
        source: 'conversation',
        sourceDetail: `${count} sessions`,
        confidence: count >= 5 ? 'high' : 'medium',
        generatedContent: this.generateWorkflowTemplate(workflow),
        timestamp: new Date(),
      });
    }

    return suggestions;
  }

  private getExistingWorkflows(projectPath: string): string[] {
    const wfDir = path.join(projectPath, '.agent', 'workflows');
    if (!fs.existsSync(wfDir)) { return []; }
    return fs.readdirSync(wfDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }

  private generateSkillFromKI(title: string, summary: string, name: string): string {
    return `---
name: ${name}
description: ${title} — auto-generated from Knowledge Item
---

# ${title}

> Auto-generated from KI. Review and customize before use.

## Summary

${summary}

## Key Patterns

<!-- TODO: Add specific patterns, rules, and examples from the KI artifacts -->

## Rules

1. <!-- Add rule 1 -->
2. <!-- Add rule 2 -->

## Examples

\`\`\`
<!-- Add code examples -->
\`\`\`
`;
  }

  private generateSkillTemplate(topic: string, sessionCount: number): string {
    const prettyName = topic.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `---
name: ${topic}
description: ${prettyName} — distilled from ${sessionCount} development sessions
---

# ${prettyName}

> Auto-generated from ${sessionCount} sessions. Review and add specific rules.

## Patterns Detected

<!-- TODO: Extract specific patterns from walkthrough files -->

## Rules

1. <!-- Add rule 1 -->
2. <!-- Add rule 2 -->

## Common Pitfalls

| Issue | Fix |
|-------|-----|
| <!-- Describe issue --> | <!-- Describe fix --> |
`;
  }

  private generateAgentFromKI(title: string, summary: string, name: string): string {
    return `---
name: ${name}
description: Specialist agent for ${title}
skills: clean-code, project-patterns
---

# ${name}

## Core Philosophy
Expert in: ${title}

## Summary
${summary}

## Responsibilities
1. <!-- Define primary responsibilities -->
2. <!-- Define secondary responsibilities -->

## Rules
1. Always follow established patterns for this domain
2. Consult related KIs before making changes
3. <!-- Add domain-specific rules -->

## Output Format
- Code changes with inline comments
- Update related documentation
`;
  }

  private generateWorkflowTemplate(name: string): string {
    const prettyName = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `---
description: ${prettyName} — standardized process
---

# ${prettyName}

## Steps

1. Analyze the request and identify scope
2. Check related files and dependencies
// turbo
3. Run build to verify current state
4. Implement changes
// turbo
5. Run tests
6. Verify and commit
`;
  }

  private loadState(): MonitorState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        data.lastScanTime = new Date(data.lastScanTime);
        data.suggestions = (data.suggestions || []).map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp),
        }));
        return data;
      }
    } catch { /* fresh state */ }

    return {
      lastScanTime: new Date(0),
      knownKIs: [],
      knownSkills: [],
      knownAgents: [],
      suggestions: [],
    };
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch { /* skip */ }
  }
}
