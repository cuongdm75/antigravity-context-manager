import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationInfo } from '../models/types';
import { FileScanner } from '../services/FileScanner';

type ConvoTreeItem = ConvoRootItem | ConvoArtifactItem;

class ConvoRootItem extends vscode.TreeItem {
  constructor(
    public readonly conv: ConversationInfo,
    public readonly isCurrent: boolean,
  ) {
    const hasArtifacts = conv.hasTask || conv.hasPlan || conv.hasWalkthrough;
    super(
      conv.id.slice(0, 8),
      hasArtifacts ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );

    const sizeMB = (conv.sizeBytes / 1048576).toFixed(1);
    const date = conv.lastModified.toLocaleDateString();

    let progress = '';
    if (conv.taskCompletion) {
      const { done, total } = conv.taskCompletion;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
      progress = ` ${bar} ${pct}%`;
    }

    this.description = `${date} · ${sizeMB} MB${progress}`;
    this.iconPath = new vscode.ThemeIcon(isCurrent ? 'pulse' : conv.hasWalkthrough ? 'check-all' : 'history');

    if (isCurrent) {
      this.label = `📌 ${conv.id.slice(0, 8)} (Current)`;
    }
  }
}

class ConvoArtifactItem extends vscode.TreeItem {
  constructor(name: string, filePath: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('file-text');
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

export class ConversationProvider implements vscode.TreeDataProvider<ConvoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConvoTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scanner: FileScanner;
  private conversations: ConversationInfo[] = [];
  private currentSessionId?: string;

  constructor(currentSessionId?: string) {
    this.scanner = new FileScanner();
    this.currentSessionId = currentSessionId;
    this.refresh();
  }

  refresh(): void {
    this.conversations = this.scanner.scanConversations();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConvoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ConvoTreeItem): ConvoTreeItem[] {
    if (!element) {
      return this.conversations.map(
        c => new ConvoRootItem(c, c.id === this.currentSessionId)
      );
    }

    if (element instanceof ConvoRootItem) {
      const conv = element.conv;
      const items: ConvoArtifactItem[] = [];
      if (conv.hasTask) {
        items.push(new ConvoArtifactItem('📋 task.md', path.join(conv.folderPath, 'task.md')));
      }
      if (conv.hasPlan) {
        items.push(new ConvoArtifactItem('📐 implementation_plan.md', path.join(conv.folderPath, 'implementation_plan.md')));
      }
      if (conv.hasWalkthrough) {
        items.push(new ConvoArtifactItem('📝 walkthrough.md', path.join(conv.folderPath, 'walkthrough.md')));
      }
      return items;
    }

    return [];
  }
}
