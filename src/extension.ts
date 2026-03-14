import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeItemProvider } from './providers/KnowledgeItemProvider';
import { AgentSkillProvider } from './providers/AgentSkillProvider';
import { ConversationProvider } from './providers/ConversationProvider';
import { CleanupWebviewProvider } from './providers/CleanupWebviewProvider';
import { ExperienceProvider } from './providers/ExperienceProvider';
import { CleanupService } from './services/CleanupService';
import { PatternDetector, PatternSuggestion } from './services/PatternDetector';

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

  // --- Experience Monitor ---
  const storagePath = context.globalStorageUri.fsPath;
  const detector = new PatternDetector(storagePath);
  const expProvider = new ExperienceProvider(detector, projectPath);
  vscode.window.registerTreeDataProvider('experience-monitor', expProvider);

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

    // --- Experience Monitor Commands ---
    vscode.commands.registerCommand('contextManager.scanExperience', () => {
      expProvider.refresh();
    }),

    vscode.commands.registerCommand('contextManager.previewSuggestion', async (suggestion: PatternSuggestion) => {
      if (!suggestion.generatedContent) { return; }
      const doc = await vscode.workspace.openTextDocument({
        content: suggestion.generatedContent,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),

    vscode.commands.registerCommand('contextManager.acceptSuggestion', async (item: any) => {
      const suggestion: PatternSuggestion = item?.suggestion;
      if (!suggestion || !suggestion.generatedContent) { return; }

      const agentDir = path.join(projectPath, '.agent');

      let targetPath: string;
      let fileName: string;

      if (suggestion.type === 'skill') {
        const skillName = suggestion.sourceDetail.replace(/\s/g, '-').toLowerCase()
          || suggestion.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const skillDir = path.join(agentDir, 'skills', skillName);
        if (!fs.existsSync(skillDir)) { fs.mkdirSync(skillDir, { recursive: true }); }
        targetPath = path.join(skillDir, 'SKILL.md');
        fileName = `skills/${skillName}/SKILL.md`;
      } else if (suggestion.type === 'agent') {
        const agentName = suggestion.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        targetPath = path.join(agentDir, 'agents', `${agentName}.md`);
        fileName = `agents/${agentName}.md`;
      } else {
        const wfName = suggestion.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        targetPath = path.join(agentDir, 'workflows', `${wfName}.md`);
        fileName = `workflows/${wfName}.md`;
      }

      if (fs.existsSync(targetPath)) {
        const overwrite = await vscode.window.showWarningMessage(
          `File ${fileName} already exists. Overwrite?`, { modal: true }, 'Overwrite'
        );
        if (overwrite !== 'Overwrite') { return; }
      }

      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(targetPath, suggestion.generatedContent);

      detector.dismissSuggestion(suggestion.id);
      expProvider.refresh();
      agentProvider.refresh();

      const doc = await vscode.workspace.openTextDocument(targetPath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(`✅ Generated ${suggestion.type}: ${fileName}`);
    }),

    vscode.commands.registerCommand('contextManager.dismissSuggestion', (item: any) => {
      if (item?.suggestion?.id) {
        detector.dismissSuggestion(item.suggestion.id);
        expProvider.refresh();
        vscode.window.showInformationMessage('🗑️ Suggestion dismissed');
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

  // --- Auto-scan experience patterns ---
  const config = vscode.workspace.getConfiguration('contextManager');
  const scanInterval = config.get<number>('autoScanInterval', 30);
  if (scanInterval > 0) {
    const expTimer = setInterval(() => expProvider.refresh(), scanInterval * 60000);
    context.subscriptions.push({ dispose: () => clearInterval(expTimer) });
    // Initial scan after 10 seconds
    setTimeout(() => expProvider.refresh(), 10000);
  }

  vscode.window.showInformationMessage('🧠 Context Manager v1.1 activated');
}

function updateStatusBar(item: vscode.StatusBarItem) {
  try {
    const { FileScanner } = require('./services/FileScanner');
    const scanner = new FileScanner();
    const usage = scanner.scanDiskUsage();

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
