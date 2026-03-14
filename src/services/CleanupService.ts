import * as fs from 'fs';
import * as path from 'path';
import { getAntigravityPath } from '../models/types';
import { FileScanner } from './FileScanner';

export interface CleanupResult {
  deletedFiles: number;
  freedBytes: number;
  errors: string[];
}

export class CleanupService {
  private basePath: string;
  private scanner: FileScanner;

  constructor(basePath?: string) {
    this.basePath = basePath || getAntigravityPath();
    this.scanner = new FileScanner(this.basePath);
  }

  cleanBrowserRecordings(): CleanupResult {
    const dir = path.join(this.basePath, 'browser_recordings');
    return this.deleteContents(dir);
  }

  cleanOldBrainMedia(keepRecentSessions: number = 10, currentSessionId?: string): CleanupResult {
    const brainDir = path.join(this.basePath, 'brain');
    if (!fs.existsSync(brainDir)) { return { deletedFiles: 0, freedBytes: 0, errors: [] }; }

    const conversations = this.scanner.scanConversations();
    const recentIds = new Set(
      conversations.slice(0, keepRecentSessions).map(c => c.id)
    );
    if (currentSessionId) { recentIds.add(currentSessionId); }

    let deletedFiles = 0, freedBytes = 0;
    const errors: string[] = [];
    const mediaExts = ['.webp', '.png', '.jpg', '.jpeg'];

    for (const conv of conversations) {
      if (recentIds.has(conv.id)) { continue; }

      try {
        for (const file of fs.readdirSync(conv.folderPath)) {
          if (mediaExts.some(ext => file.endsWith(ext))) {
            const filePath = path.join(conv.folderPath, file);
            const stat = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            deletedFiles++;
            freedBytes += stat.size;
          }
        }
      } catch (e: any) {
        errors.push(`${conv.id}: ${e.message}`);
      }
    }

    return { deletedFiles, freedBytes, errors };
  }

  cleanOldConversationLogs(keepRecent: number = 10): CleanupResult {
    const convDir = path.join(this.basePath, 'conversations');
    if (!fs.existsSync(convDir)) { return { deletedFiles: 0, freedBytes: 0, errors: [] }; }

    const files = fs.readdirSync(convDir)
      .filter(f => f.endsWith('.pb'))
      .map(f => ({
        name: f,
        path: path.join(convDir, f),
        stat: fs.statSync(path.join(convDir, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    let deletedFiles = 0, freedBytes = 0;
    const errors: string[] = [];

    for (const file of files.slice(keepRecent)) {
      try {
        fs.unlinkSync(file.path);
        deletedFiles++;
        freedBytes += file.stat.size;
      } catch (e: any) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }

    // Also clean corresponding .tmp files
    try {
      for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.tmp'))) {
        const tmpPath = path.join(convDir, f);
        const stat = fs.statSync(tmpPath);
        fs.unlinkSync(tmpPath);
        deletedFiles++;
        freedBytes += stat.size;
      }
    } catch { /* skip */ }

    return { deletedFiles, freedBytes, errors };
  }

  cleanEmptyBrainFolders(): CleanupResult {
    const brainDir = path.join(this.basePath, 'brain');
    if (!fs.existsSync(brainDir)) { return { deletedFiles: 0, freedBytes: 0, errors: [] }; }

    let deletedFiles = 0;
    const errors: string[] = [];

    for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'tempmediaStorage') { continue; }
      const folderPath = path.join(brainDir, entry.name);
      const contents = fs.readdirSync(folderPath);

      // A folder with only .resolved files and metadata is effectively empty
      const meaningful = contents.filter(f =>
        (f === 'task.md' || f === 'implementation_plan.md' || f === 'walkthrough.md')
      );

      if (meaningful.length === 0) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
          deletedFiles++;
        } catch (e: any) {
          errors.push(`${entry.name}: ${e.message}`);
        }
      }
    }

    return { deletedFiles, freedBytes: 0, errors };
  }

  private deleteContents(dir: string): CleanupResult {
    if (!fs.existsSync(dir)) { return { deletedFiles: 0, freedBytes: 0, errors: [] }; }

    let deletedFiles = 0, freedBytes = 0;
    const errors: string[] = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          const size = this.getDirSize(fullPath);
          fs.rmSync(fullPath, { recursive: true, force: true });
          freedBytes += size;
          deletedFiles++;
        } else {
          const stat = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          freedBytes += stat.size;
          deletedFiles++;
        }
      } catch (e: any) {
        errors.push(`${entry.name}: ${e.message}`);
      }
    }

    return { deletedFiles, freedBytes, errors };
  }

  private getDirSize(dir: string): number {
    let size = 0;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { size += this.getDirSize(full); }
        else { size += fs.statSync(full).size; }
      }
    } catch { /* skip */ }
    return size;
  }
}
