import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgeItemMeta, getAntigravityPath } from '../models/types';
import { FileScanner } from '../services/FileScanner';

type KITreeItem = KIRootItem | KIArtifactItem | KIRefItem;

class KIRootItem extends vscode.TreeItem {
  constructor(public readonly ki: KnowledgeItemMeta) {
    super(ki.title, vscode.TreeItemCollapsibleState.Collapsed);

    const days = ki.lastAccessed
      ? Math.floor((Date.now() - ki.lastAccessed.getTime()) / 86400000)
      : -1;
    const staleIcon = days > 7 ? '⚠️' : days >= 0 ? '✅' : '❓';
    const staleLabel = days >= 0 ? `${days}d ago` : 'unknown';

    this.description = `${ki.artifactPaths.length} artifacts · ${staleIcon} ${staleLabel}`;
    this.tooltip = new vscode.MarkdownString(
      `### ${ki.title}\n\n${ki.summary}\n\n---\n📄 ${ki.artifactPaths.length} artifacts · ${ki.references.length} references`
    );
    this.iconPath = new vscode.ThemeIcon('book');
    this.contextValue = 'ki-root';
  }
}

class KIArtifactItem extends vscode.TreeItem {
  constructor(filePath: string) {
    const name = path.basename(filePath);
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = path.dirname(filePath).split(path.sep).slice(-1)[0];
    this.iconPath = new vscode.ThemeIcon('file-text');
    this.command = {
      command: 'vscode.open',
      title: 'Open Artifact',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

class KIRefItem extends vscode.TreeItem {
  constructor(ref: { type: string; value: string }) {
    super(`${ref.type}: ${ref.value}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('link');
    this.description = ref.type;
  }
}

export class KnowledgeItemProvider implements vscode.TreeDataProvider<KITreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KITreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scanner: FileScanner;
  private items: KnowledgeItemMeta[] = [];

  constructor() {
    this.scanner = new FileScanner();
    this.refresh();
  }

  refresh(): void {
    this.items = this.scanner.scanKnowledgeItems();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: KITreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: KITreeItem): KITreeItem[] {
    if (!element) {
      return this.items.map(ki => new KIRootItem(ki));
    }

    if (element instanceof KIRootItem) {
      const ki = element.ki;
      const artifacts = ki.artifactPaths.map(p => new KIArtifactItem(p));
      const refs = ki.references.map(r => new KIRefItem(r));
      return [...artifacts, ...refs];
    }

    return [];
  }

  getKnowledgeItem(element: KIRootItem): KnowledgeItemMeta {
    return element.ki;
  }
}
