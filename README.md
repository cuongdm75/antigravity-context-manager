# 🧠 Antigravity Context Manager

> VS Code extension for **Antigravity IDE** — Manage Knowledge Items, clean up brain storage, track agents & skills.

## 📋 Features

| Module | Description |
|--------|-------------|
| **📚 KI Browser** | Browse Knowledge Items, stale indicators, click-to-open artifacts |
| **🧹 Smart Cleanup** | Disk usage dashboard, one-click cleanup, protection rules |
| **🤖 Agent & Skill Tracker** | List all agents and skills with metadata |
| **💬 Conversation Explorer** | Browse past sessions with progress bars |
| **💓 Session Health** | Status bar indicator showing disk usage |

---

## 🚀 Installation

### Option A: Quick Install (Recommended)

```powershell
# 1. Clone this repo
git clone https://github.com/cuongdm75/antigravity-context-manager.git
cd antigravity-context-manager

# 2. Install dependencies & build
npm install
npm run compile

# 3. Package VSIX
npx @vscode/vsce package --no-dependencies --allow-missing-repository

# 4. Install to Antigravity IDE
$vsix = Get-ChildItem *.vsix | Select-Object -First 1
$target = "$env:USERPROFILE\.antigravity\extensions\sms-online.antigravity-context-manager-1.0.0"
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item $target -ItemType Directory -Force | Out-Null
Copy-Item $vsix.FullName "$target\ext.zip"
Expand-Archive "$target\ext.zip" -DestinationPath $target -Force
Remove-Item "$target\ext.zip"

# 5. Restart Antigravity IDE
```

### Option B: Direct Copy (No Build Required)

```powershell
# If you already have the compiled `out/` folder:
$target = "$env:USERPROFILE\.antigravity\extensions\sms-online.antigravity-context-manager-1.0.0"
New-Item $target -ItemType Directory -Force | Out-Null

# Copy required files
Copy-Item package.json $target
Copy-Item -Recurse out $target
Copy-Item -Recurse media $target

# Restart Antigravity IDE
```

### Option C: From VSIX file

```powershell
# If you have the .vsix file from a previous build:
$target = "$env:USERPROFILE\.antigravity\extensions\sms-online.antigravity-context-manager-1.0.0"
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item $target -ItemType Directory -Force | Out-Null
Copy-Item antigravity-context-manager-1.0.0.vsix "$target\ext.zip"
Expand-Archive "$target\ext.zip" -DestinationPath $target -Force
Remove-Item "$target\ext.zip"
```

---

## ⚙️ Configuration

Open Settings (`Ctrl+,`) and search for "Context Manager":

| Setting | Default | Description |
|---------|---------|-------------|
| `contextManager.keepRecentSessions` | `10` | Number of recent sessions to keep during cleanup |
| `contextManager.staleKIDays` | `7` | Days after which a KI is considered stale (⚠️) |
| `contextManager.geminiPath` | auto | Custom path to `.gemini/antigravity` directory |

---

## 📂 How It Works

The extension reads data from `~/.gemini/antigravity/`:

```
~/.gemini/antigravity/
├── knowledge/              ← KI Browser reads this (📚)
│   ├── sms_platform_*/
│   │   ├── metadata.json   ← Title, summary, references
│   │   ├── timestamps.json ← Last accessed date
│   │   └── artifacts/      ← .md files you can browse
│   └── ...
├── brain/                  ← Conversation Explorer reads this (💬)
│   ├── <session-id>/
│   │   ├── task.md
│   │   ├── implementation_plan.md
│   │   ├── walkthrough.md
│   │   └── *.webp, *.png   ← Smart Cleanup targets these (🧹)
│   └── ...
├── browser_recordings/     ← Smart Cleanup targets this (🧹)
└── conversations/          ← .pb protobuf logs (🧹)
```

The extension also reads `.agent/agents/*.md` and `.agent/skills/*/SKILL.md` from your project workspace for the Agent & Skill Tracker.

---

## 🛠️ Development

```powershell
# Watch mode (auto-recompile on save)
npm run watch

# Compile once
npm run compile

# Package
npm run package
```

### Project Structure

```
src/
├── extension.ts                    # Entry point (registers all providers)
├── models/types.ts                 # Data interfaces
├── services/
│   ├── FileScanner.ts              # Scans KI, agents, skills, conversations, disk
│   └── CleanupService.ts           # Safe deletion with retention policies
└── providers/
    ├── KnowledgeItemProvider.ts     # 📚 KI TreeView
    ├── AgentSkillProvider.ts        # 🤖 Agent/Skill TreeView
    ├── ConversationProvider.ts      # 💬 Conversation TreeView
    └── CleanupWebviewProvider.ts    # 🧹 Cleanup Webview dashboard
```

---

## 🧹 Cleanup Rules

| Category | Action | Safe? |
|----------|--------|-------|
| `browser_recordings/` | Delete all | ✅ Always |
| Brain `.webp`/`.png` | Delete old sessions | ✅ Keeps recent N |
| Conversations `.pb` | Delete old | ✅ Keeps recent N |
| Brain `.md`/`.json` | **Never delete** | 🔒 Protected |
| `knowledge/` | **Never delete** | 🔒 Protected |

---

## 📄 License

MIT — See [LICENSE.md](LICENSE.md)
