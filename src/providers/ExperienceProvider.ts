import * as vscode from 'vscode';
import { PatternSuggestion, PatternDetector } from '../services/PatternDetector';

type ExperienceTreeItem = SuggestionItem;

class SuggestionItem extends vscode.TreeItem {
  constructor(public readonly suggestion: PatternSuggestion) {
    super(suggestion.title, vscode.TreeItemCollapsibleState.None);

    const badge = suggestion.confidence === 'high' ? '🟢' : suggestion.confidence === 'medium' ? '🟡' : '⚪';
    const typeIcon = suggestion.type === 'skill' ? 'symbol-method'
      : suggestion.type === 'agent' ? 'robot'
      : 'play-circle';

    this.description = `${badge} ${suggestion.type} · ${suggestion.sourceDetail}`;
    this.tooltip = new vscode.MarkdownString(
      `### ${suggestion.title}\n\n${suggestion.description}\n\n` +
      `**Type:** ${suggestion.type} · **Confidence:** ${suggestion.confidence}\n\n` +
      `**Source:** ${suggestion.source} (${suggestion.sourceDetail})\n\n` +
      `---\n*Click to preview generated content. Right-click for actions.*`
    );
    this.iconPath = new vscode.ThemeIcon(typeIcon);
    this.contextValue = 'suggestion';

    this.command = {
      command: 'contextManager.previewSuggestion',
      title: 'Preview Suggestion',
      arguments: [suggestion],
    };
  }
}

export class ExperienceProvider implements vscode.TreeDataProvider<ExperienceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExperienceTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private detector: PatternDetector;
  private projectPath: string;

  constructor(detector: PatternDetector, projectPath: string) {
    this.detector = detector;
    this.projectPath = projectPath;
  }

  refresh(): void {
    const newSuggestions = this.detector.scan(this.projectPath);
    this._onDidChangeTreeData.fire(undefined);

    if (newSuggestions.length > 0) {
      vscode.window.showInformationMessage(
        `💡 ${newSuggestions.length} new experience pattern(s) detected!`,
        'View'
      ).then(action => {
        if (action === 'View') {
          vscode.commands.executeCommand('experience-monitor.focus');
        }
      });
    }
  }

  getTreeItem(element: ExperienceTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ExperienceTreeItem[] {
    const suggestions = this.detector.getSuggestions();
    if (suggestions.length === 0) {
      return [];
    }

    // Sort: high confidence first, then by type
    return suggestions
      .sort((a, b) => {
        const confOrder = { high: 0, medium: 1, low: 2 };
        const diff = confOrder[a.confidence] - confOrder[b.confidence];
        if (diff !== 0) { return diff; }
        return a.type.localeCompare(b.type);
      })
      .map(s => new SuggestionItem(s));
  }
}
