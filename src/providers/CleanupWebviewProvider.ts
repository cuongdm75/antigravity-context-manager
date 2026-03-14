import * as vscode from 'vscode';
import { DiskUsage, getAntigravityPath } from '../models/types';
import { FileScanner } from '../services/FileScanner';
import { CleanupService } from '../services/CleanupService';

export class CleanupWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'contextManager.cleanup';

  private _view?: vscode.WebviewView;
  private scanner: FileScanner;
  private cleanup: CleanupService;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.scanner = new FileScanner();
    this.cleanup = new CleanupService();
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    this.updateView();
  }

  updateView() {
    if (!this._view) { return; }
    const usage = this.scanner.scanDiskUsage();
    this._view.webview.html = this.getHtml(usage);
  }

  private async handleMessage(msg: { command: string }) {
    let result;
    const config = vscode.workspace.getConfiguration('contextManager');
    const keepRecent = config.get<number>('keepRecentSessions', 10);

    switch (msg.command) {
      case 'cleanRecordings':
        result = this.cleanup.cleanBrowserRecordings();
        vscode.window.showInformationMessage(
          `🧹 Deleted ${result.deletedFiles} items, freed ${this.formatSize(result.freedBytes)}`
        );
        break;
      case 'cleanMedia':
        result = this.cleanup.cleanOldBrainMedia(keepRecent);
        vscode.window.showInformationMessage(
          `🧹 Deleted ${result.deletedFiles} media files, freed ${this.formatSize(result.freedBytes)}`
        );
        break;
      case 'cleanConversations':
        result = this.cleanup.cleanOldConversationLogs(keepRecent);
        vscode.window.showInformationMessage(
          `🧹 Deleted ${result.deletedFiles} conversation logs, freed ${this.formatSize(result.freedBytes)}`
        );
        break;
      case 'cleanAll':
        const r1 = this.cleanup.cleanBrowserRecordings();
        const r2 = this.cleanup.cleanOldBrainMedia(keepRecent);
        const r3 = this.cleanup.cleanOldConversationLogs(keepRecent);
        const totalFreed = r1.freedBytes + r2.freedBytes + r3.freedBytes;
        const totalFiles = r1.deletedFiles + r2.deletedFiles + r3.deletedFiles;
        vscode.window.showInformationMessage(
          `🧹 Total cleanup: ${totalFiles} items deleted, ${this.formatSize(totalFreed)} freed`
        );
        break;
      case 'refresh':
        break;
    }
    this.updateView();
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1048576) { return `${(bytes / 1024).toFixed(1)} KB`; }
    if (bytes < 1073741824) { return `${(bytes / 1048576).toFixed(1)} MB`; }
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  private getBarColor(size: number): string {
    if (size > 1073741824) { return '#ef4444'; }
    if (size > 104857600) { return '#f59e0b'; }
    return '#22c55e';
  }

  private getHtml(usage: DiskUsage): string {
    const rows = [
      { label: '🎬 Browser Recordings', size: usage.browserRecordings.size, count: usage.browserRecordings.count, action: 'cleanRecordings', safe: true },
      { label: '🖼️ Brain Media', size: usage.brainMedia.size, count: usage.brainMedia.count, action: 'cleanMedia', safe: true },
      { label: '💬 Conversations (.pb)', size: usage.conversations.size, count: usage.conversations.count, action: 'cleanConversations', safe: true },
      { label: '📄 Brain Artifacts', size: usage.brainArtifacts.size, count: usage.brainArtifacts.count, action: '', safe: false },
      { label: '📚 Knowledge Items', size: usage.knowledge.size, count: usage.knowledge.count, action: '', safe: false },
    ];

    const maxSize = Math.max(...rows.map(r => r.size), 1);

    const rowsHtml = rows.map(r => {
      const pct = Math.max((r.size / maxSize) * 100, 2);
      const color = this.getBarColor(r.size);
      const btn = r.safe && r.size > 0
        ? `<button onclick="send('${r.action}')">Clean</button>`
        : r.safe ? '<span class="badge ok">✅ Clean</span>' : '<span class="badge protected">🔒 Protected</span>';

      return `
        <div class="row">
          <div class="label">${r.label}</div>
          <div class="bar-container">
            <div class="bar" style="width:${pct}%; background:${color}"></div>
          </div>
          <div class="size">${this.formatSize(r.size)} <small>(${r.count})</small></div>
          <div class="action">${btn}</div>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
  h2 { margin: 0 0 4px; font-size: 14px; display: flex; align-items: center; gap: 6px; }
  .total { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .row { display: grid; grid-template-columns: 160px 1fr 90px 70px; align-items: center; gap: 8px; margin-bottom: 8px; }
  .label { font-size: 12px; white-space: nowrap; }
  .bar-container { height: 10px; background: var(--vscode-editor-background); border-radius: 5px; overflow: hidden; border: 1px solid var(--vscode-widget-border); }
  .bar { height: 100%; border-radius: 5px; transition: width 0.3s; }
  .size { font-size: 11px; text-align: right; font-family: monospace; }
  .action { text-align: center; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .badge { font-size: 10px; }
  .badge.ok { color: #22c55e; }
  .badge.protected { color: var(--vscode-descriptionForeground); }
  .footer { margin-top: 16px; display: flex; gap: 8px; }
  .footer button { padding: 6px 12px; font-size: 12px; }
  .btn-danger { background: #ef4444; }
  .btn-danger:hover { background: #dc2626; }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 12px 0; }
</style>
</head>
<body>
  <h2>🧹 Smart Cleanup</h2>
  <div class="total">Total: ${this.formatSize(usage.total)}</div>
  ${rowsHtml}
  <hr/>
  <div class="footer">
    <button onclick="send('cleanAll')" class="btn-danger">🗑️ Clean All Recommended</button>
    <button onclick="send('refresh')">🔄 Refresh</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
  }
}
