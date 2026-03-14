import * as vscode from 'vscode';
import { AgentInfo, SkillInfo } from '../models/types';
import { FileScanner } from '../services/FileScanner';

type AgentTreeItem = AgentCategoryItem | AgentItem | SkillItem;

class AgentCategoryItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly items: (AgentInfo | SkillInfo)[],
    public readonly type: 'agent' | 'skill',
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(type === 'agent' ? 'symbol-class' : 'extensions');
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(public readonly agent: AgentInfo) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    this.description = agent.skills.length ? `skills: ${agent.skills.join(', ')}` : '';
    this.tooltip = new vscode.MarkdownString(
      `### ${agent.name}\n\n${agent.description}\n\n**Skills:** ${agent.skills.join(', ') || 'none'}`
    );
    this.iconPath = new vscode.ThemeIcon('robot');
    this.command = {
      command: 'vscode.open',
      title: 'Open Agent',
      arguments: [vscode.Uri.file(agent.filePath)],
    };
  }
}

class SkillItem extends vscode.TreeItem {
  constructor(public readonly skill: SkillInfo) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);
    this.description = skill.hasScripts ? '📜 has scripts' : '';
    this.tooltip = new vscode.MarkdownString(`### ${skill.name}\n\n${skill.description}`);
    this.iconPath = new vscode.ThemeIcon(skill.hasScripts ? 'tools' : 'puzzle-piece');
    this.command = {
      command: 'vscode.open',
      title: 'Open Skill',
      arguments: [vscode.Uri.file(require('path').join(skill.folderPath, 'SKILL.md'))],
    };
  }
}

export class AgentSkillProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scanner: FileScanner;
  private agents: AgentInfo[] = [];
  private skills: SkillInfo[] = [];
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.scanner = new FileScanner();
    this.refresh();
  }

  refresh(): void {
    this.agents = this.scanner.scanAgents(this.projectPath);
    this.skills = this.scanner.scanSkills(this.projectPath);
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentTreeItem): AgentTreeItem[] {
    if (!element) {
      return [
        new AgentCategoryItem(`🤖 Agents (${this.agents.length})`, this.agents, 'agent'),
        new AgentCategoryItem(`📦 Skills (${this.skills.length})`, this.skills, 'skill'),
      ];
    }

    if (element instanceof AgentCategoryItem) {
      if (element.type === 'agent') {
        return (element.items as AgentInfo[]).map(a => new AgentItem(a));
      }
      return (element.items as SkillInfo[]).map(s => new SkillItem(s));
    }

    return [];
  }
}
