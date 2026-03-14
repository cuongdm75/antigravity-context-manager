import * as vscode from 'vscode';
import { KnowledgeItemProvider } from './providers/KnowledgeItemProvider';
import { AgentSkillProvider } from './providers/AgentSkillProvider';
import { ConversationProvider } from './providers/ConversationProvider';
import { CleanupWebviewProvider } from './providers/CleanupWebviewProvider';
import { CleanupService } from './services/CleanupService';

export function activate(context: vscode.ExtensionContext) {
  const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  // --- KI Browser ---
  const kiProvider = new KnowledgeItemProvider();
  vscode.window.registerTreeDataProvider('ki-browser', kiProvider);

  // --- Agent & Skill Tracker ---
  const agentProvider = new AgentSkillProvider(projectPath);
  vscode.window.registerTreeDataProvider('agent-tracker', agentProvider);

  // --- Conversation Explorer ---
  const convoProvider = new ConversationProvider();
  vscode.window.registerTreeDataProvider('conversation-explorer', convoProvider);

  // --- Cleanup Dashboard ---
  const cleanupProvider = new CleanupWebviewProvider(context.extensionUri);
  vscode.window.registerWebviewViewProvider(CleanupWebviewProvider.viewType, cleanupProvider);

  // --- Commands ---
  const cleanupService = new CleanupService();

  context.subscriptions.push(
    vscode.commands.registerCommand('contextManager.refreshKI', () => kiProvider.refresh()),
    vscode.commands.registerCommand('contextManager.refreshAgents', () => agentProvider.refresh()),
    vscode.commands.registerCommand('contextManager.refreshConversations', () => convoProvider.refresh()),

    vscode.commands.registerCommand('contextManager.openCleanup', () => {
      vscode.commands.executeCommand('contextManager.cleanup.focus');
    }),

    vscode.commands.registerCommand('contextManager.cleanBrowserRecordings', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Delete all browser recordings?', { modal: true }, 'Delete'
      );
      if (confirm !== 'Delete') { return; }
      const result = cleanupService.cleanBrowserRecordings();
      vscode.window.showInformationMessage(
        `🧹 Deleted ${result.deletedFiles} recordings, freed ${formatSize(result.freedBytes)}`
      );
      cleanupProvider.updateView();
    }),

    vscode.commands.registerCommand('contextManager.cleanOldMedia', async () => {
      const config = vscode.workspace.getConfiguration('contextManager');
      const keep = config.get<number>('keepRecentSessions', 10);
      const confirm = await vscode.window.showWarningMessage(
        `Delete media from conversations older than the ${keep} most recent?`, { modal: true }, 'Delete'
      );
      if (confirm !== 'Delete') { return; }
      const result = cleanupService.cleanOldBrainMedia(keep);
      vscode.window.showInformationMessage(
        `🧹 Deleted ${result.deletedFiles} files, freed ${formatSize(result.freedBytes)}`
      );
      cleanupProvider.updateView();
    }),

    vscode.commands.registerCommand('contextManager.copyKISummary', (item: any) => {
      if (item?.ki?.summary) {
        vscode.env.clipboard.writeText(item.ki.summary);
        vscode.window.showInformationMessage('📋 KI summary copied to clipboard');
      }
    }),
  );

  // --- Status Bar: Session Health ---
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusItem.command = 'contextManager.openCleanup';
  updateStatusBar(statusItem);
  context.subscriptions.push(statusItem);

  // Refresh status bar periodically
  const timer = setInterval(() => updateStatusBar(statusItem), 60000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  vscode.window.showInformationMessage('🧠 Context Manager activated');
}

function updateStatusBar(item: vscode.StatusBarItem) {
  try {
    const { FileScanner } = require('./services/FileScanner');
    const scanner = new FileScanner();
    const usage = scanner.scanDiskUsage();
    const totalMB = (usage.total / 1048576).toFixed(0);

    const icon = usage.total > 1073741824 ? '🔴' : usage.total > 104857600 ? '🟡' : '🟢';
    item.text = `${icon} Context: ${formatSize(usage.total)}`;
    item.tooltip = `Browser recordings: ${formatSize(usage.browserRecordings.size)}\nBrain media: ${formatSize(usage.brainMedia.size)}\nConversations: ${formatSize(usage.conversations.size)}\nKnowledge: ${formatSize(usage.knowledge.size)}\n\nClick to open Cleanup Dashboard`;
    item.show();
  } catch {
    item.hide();
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1048576) { return `${(bytes / 1024).toFixed(1)} KB`; }
  if (bytes < 1073741824) { return `${(bytes / 1048576).toFixed(1)} MB`; }
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function deactivate() {}
