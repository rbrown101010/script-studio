// The starting list for Agent updates (see agentUpdates.seed). GrokBot, Muse and Dot come from the agentnative.inc
// Agent Updates page; ChatGPT desktop and Claude Code from their official changelogs.

import type { NewAgentUpdate } from "./agentUpdates";

export const SEED: NewAgentUpdate[] = [
  {
    "tool": "grokbot",
    "date": "2026-10-07",
    "title": "Search, read & monitor X",
    "tweets": [
      "https://x.com/bot/status/2107949161878606089"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-10-07",
    "title": "Muse on iPad",
    "tweets": [
      "https://x.com/Muse/status/2107875553080746185"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-10-07",
    "title": "Slide decks (PowerPoint / Google Slides)",
    "summary": "Bots can build slide decks.",
    "link": "https://x.ai/changelog/bot#v0.68.1"
  },
  {
    "tool": "grokbot",
    "date": "2026-10-07",
    "title": "Formatted emails & Gmail Spam search",
    "link": "https://x.ai/changelog/bot#v0.68.1"
  },
  {
    "tool": "grokbot",
    "date": "2026-10-07",
    "title": "Bigger, faster Bot computer",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "chatgpt",
    "date": "2026-10-07",
    "title": "GPT-6 and Intelligent UI in the Chat tab",
    "summary": "GPT-6 arrives in the Chat tab with interactive, multi-format answers, for paid plans first and then Free and Go. The release note names no specific platform.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "claudeCode",
    "date": "2026-10-07",
    "title": "Claude Haiku 5.5 becomes the default Haiku model",
    "summary": "Adds claude-haiku-5-5 (1M context, $0.10/$0.50 per Mtok) as the default Haiku model on the Anthropic API.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21293"
  },
  {
    "tool": "claudeCode",
    "date": "2026-10-06",
    "title": "Per-subagent effort and one-step plugin install",
    "summary": "The Agent tool takes an effort parameter for sub-agents, and claude plugin install --marketplace adds the marketplace and installs in one step.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21292"
  },
  {
    "tool": "grokbot",
    "date": "2026-10-05",
    "title": "Gmail send-as addresses + 5 languages",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "claudeCode",
    "date": "2026-10-05",
    "title": "claude attach/logs by name; WebSearch budget refills",
    "summary": "claude attach and claude logs accept part of a session name, and the WebSearch budget now refills at 100 calls per hour instead of stopping after 200.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21290"
  },
  {
    "tool": "dot",
    "date": "2026-10-02",
    "title": "Codex coordination (dev explainer)",
    "tweets": [
      "https://x.com/OpenAIDevs/status/2106152299026661641"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-10-02",
    "title": "Connector developer portal",
    "tweets": [
      "https://x.com/Muse/status/2106146260835045569"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-10-02",
    "title": "Muse Gadgets (open-source hardware SDK)",
    "summary": "Meta released open-source firmware and a Linux SDK so developers can build their own Muse-powered devices. It also launched the Muse Home Link, a USB-C device that connects Muse to home networks, with 5,000 units going to subscribers.",
    "link": "https://www.engadget.com/2276312/meta-muse-gadgets-open-source-smart-home-link/",
    "tweets": [
      "https://x.com/Muse/status/2106119592229884289"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-10-02",
    "title": "Marketplace renamed Connect Apps",
    "link": "https://x.ai/changelog/bot#v0.66.0"
  },
  {
    "tool": "claudeCode",
    "date": "2026-10-02",
    "title": "Recover a cleared prompt; /code-review --max-findings",
    "summary": "Pressing Up on an empty prompt brings back a draft cleared with Ctrl+C; /code-review takes --max-findings; background commands no longer time out in interactive sessions.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21288"
  },
  {
    "tool": "dot",
    "date": "2026-10-01",
    "title": "Custom pet avatar",
    "tweets": [
      "https://x.com/thsottiaux/status/2105862010521219406"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-10-01",
    "title": "Proactive suggestions",
    "summary": "Your starred primary Bot can spot tasks on its own and offer to take them on.",
    "link": "https://x.ai/changelog/bot#v0.66.0",
    "tweets": [
      "https://x.com/bot/status/2105713240701538538"
    ]
  },
  {
    "tool": "claudeCode",
    "date": "2026-10-01",
    "title": "Claude Mods and the You should know mod",
    "summary": "Plugins can now modify deeper behavior as Claude Mods; the built-in You should know mod runs a side agent that flags things you or Claude might miss.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21287"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-30",
    "title": "Coding: Cursor handoff, GitHub & Origin plugins",
    "tweets": [
      "https://x.com/bot/status/2105373767568621895"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-30",
    "title": "Engineering Bot templates",
    "tweets": [
      "https://x.com/bot/status/2105373769531523200"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-30",
    "title": "Voice chat with Team Bots + auto-updates",
    "summary": "Teammates can start voice chats with a Team Bot in their own conversation. Automatic updates are now on by default, and Team Bot creators can add managers.",
    "link": "https://x.ai/changelog/bot#v0.65.0"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-30",
    "title": "Disable drafts per Bot; Team Bot managers",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-30",
    "title": "Simpler /hooks and stacked permission prompts",
    "summary": "/hooks opens on a single list of hooks grouped by event, and the permission prompt shows a count like \"2 of 5\" when requests stack up.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21286"
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Dots for developers",
    "tweets": [
      "https://x.com/OpenAIDevs/status/2104989680987238814"
    ]
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Availability: Pro, Business Premium, Enterprise beta",
    "tweets": [
      "https://x.com/OpenAI/status/2104984508454121795"
    ]
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Custom Rules & safety controls",
    "summary": "OpenAI detailed dots' safeguards: sandboxed cloud workspaces, sign-in flows that keep passwords from the model, Custom Rules, and Auto-review of planned actions before they run.",
    "link": "https://openai.com/index/how-we-build-safety-security-and-privacy-into-dots/",
    "tweets": [
      "https://x.com/OpenAI/status/2104984507107717331"
    ]
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Own cloud computer + 4,000+ apps",
    "tweets": [
      "https://x.com/OpenAI/status/2104984505677430978"
    ]
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Dots launch (GPT-6 Astra)",
    "summary": "Dots are always-on agents powered by GPT-6 Astra, each with its own cloud computer and browser. They connect to more than 4,000 apps and can be reached in ChatGPT, Slack, Teams or by voice. They are rolling out to Pro and Business Premium users, with an Enterprise beta.",
    "link": "https://openai.com/index/introducing-dots/",
    "tweets": [
      "https://x.com/OpenAI/status/2104984504133918973"
    ]
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Message dots in Slack & Teams; voice calls",
    "link": "https://openai.com/index/introducing-dots/"
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "Specialist dots preview + Microsoft Agent 365",
    "summary": "Specialist dots, in preview, take on defined organizational roles such as procurement, invoicing and support, with their own identity and credentials. OpenAI is working with Microsoft to manage them through Microsoft Agent 365.",
    "link": "https://openai.com/index/introducing-dots/"
  },
  {
    "tool": "muse",
    "date": "2026-09-29",
    "title": "Dozens of new connectors",
    "tweets": [
      "https://x.com/Muse/status/2104878277420781690"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-29",
    "title": "Team Bot approvals in Slack",
    "summary": "In Slack threads, Bots can post approval cards for the user to answer. Team Bots can message a user's personal Bots, and browsing is faster.",
    "link": "https://x.ai/changelog/bot#v0.63.0"
  },
  {
    "tool": "muse",
    "date": "2026-09-29",
    "title": "Muse for Small Business",
    "summary": "Muse can now pursue business goals in the background, connecting to Shopify, QuickBooks, Stripe, Canva, Slack, Notion and Facebook and Instagram business accounts. Nothing is published, sent or spent without the owner's approval.",
    "link": "https://about.fb.com/news/2026/09/introducing-muse-small-business/"
  },
  {
    "tool": "dot",
    "date": "2026-09-29",
    "title": "ChatGPT Spaces shared with dots",
    "summary": "At DevDay, OpenAI also launched ChatGPT Spaces, shared project workspaces that people, ChatGPT and dots can all access, for Pro, Business and Enterprise.",
    "link": "https://pulse2.com/openai-unveils-dots-gpt-6-1-sol-500-pro-tier-and-new-enterprise-ai-tools/"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "Meet your dot: always-on agents",
    "summary": "Eligible Pro and Business Premium users can create always-on agents with their own cloud computer, set up from the ChatGPT desktop app or desktop web.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "Meetings plugin beta on macOS",
    "summary": "A Meetings plugin that takes notes and saves summaries is in beta in the ChatGPT desktop app on macOS for Pro and Business users; Enterprise comes later.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "ChatGPT Space replaces Library",
    "summary": "Space, a new place to organize your work, replaces Library for accounts with access, in the desktop app and on the web.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "Codex Cloud tasks from the desktop",
    "summary": "Start coding tasks from desktop, web or mobile that run in isolated cloud workspaces and keep going while your computer sleeps.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "Review pull requests with Codex",
    "summary": "Pull request review via the Code Review plugin is available in supported desktop and web experiences.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "GPT-6.1 Sol in Work and Codex",
    "summary": "An improved GPT-6.1 Sol model, close to Astra-level performance at lower cost, rolls out in Work and Codex starting with Pro users.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-29",
    "title": "Shareable profiles and Sites showcase",
    "summary": "You can share a profile that showcases your Sites on web and desktop; shared profiles don't show conversation titles or content.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-29",
    "title": "claude --desktop and claude plugin configure",
    "summary": "claude --desktop opens the Claude desktop app on the current directory or session; claude plugin configure shows and sets plugin options; admins get allowedProviders.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21285"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-28",
    "title": "Team Bots (public beta)",
    "summary": "SpaceXAI announced Team Bots: shared Grok Bots with team context, plugins, credentials and memory, available as a public beta on Teams and Enterprise plans. Examples include an engineering teammate that runs Cursor cloud agents.",
    "link": "https://x.ai/news/team-bots",
    "tweets": [
      "https://x.com/bot/status/2104661562715967548"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-28",
    "title": "Add your Muse to your Instagram profile",
    "tweets": [
      "https://x.com/Muse/status/2104633288270962909"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-28",
    "title": "Library tab, quote-to-prompt, spell check",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-28",
    "title": "Claude Sonnet 5.5 and auto mode by default",
    "summary": "Adds claude-sonnet-5-5 as the default Sonnet model; interactive terminal and VS Code sessions now start in auto mode when no permission mode is set, and Ultracode becomes its own /effort toggle.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21284"
  },
  {
    "tool": "muse",
    "date": "2026-09-27",
    "title": "Organize Instagram saved folder",
    "tweets": [
      "https://x.com/Muse/status/2104287366240506076"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-26",
    "title": "Finance integration (Plaid)",
    "tweets": [
      "https://x.com/bot/status/2103936247995752705"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-26",
    "title": "Outlook email drafts",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-25",
    "title": "Team Secrets (Enterprise)",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-25",
    "title": "macOS security update 26.924",
    "summary": "Security-only desktop app update for macOS (26.924.20706) fixing CVE-2026-100754.",
    "link": "https://learn.chatgpt.com/docs/changelog#month-2026-09"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-25",
    "title": "/doctor prompt-audit and model deny lists",
    "summary": "/doctor prompt-audit checks CLAUDE.md, skills, agents and commands for prompting patterns written for older models; admins get deniedModels and availableModelsMatch.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21283"
  },
  {
    "tool": "muse",
    "date": "2026-09-24",
    "title": "Muse Charm (tamagotchi device) teased",
    "summary": "Meta teased Muse Charm, a small pocket device you talk to Muse through.",
    "link": "https://techcrunch.com/2026/09/23/everything-new-coming-to-metas-ai-agent-muse/",
    "tweets": [
      "https://x.com/Muse/status/2103189535165423888"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-24",
    "title": "More app connectors",
    "tweets": [
      "https://x.com/Muse/status/2103174131101647062"
    ]
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-24",
    "title": "maxProseWidth for wide terminals",
    "summary": "A new maxProseWidth setting caps the width of Claude's prose while tables and code blocks keep the full width.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21282"
  },
  {
    "tool": "muse",
    "date": "2026-09-23",
    "title": "Muse coming to Meta glasses",
    "summary": "At Connect 2026, Meta said Muse is coming to its AI glasses in the coming months, with a wake word.",
    "link": "https://techcrunch.com/2026/09/23/everything-new-coming-to-metas-ai-agent-muse/",
    "tweets": [
      "https://x.com/Muse/status/2102905681997381720"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-23",
    "title": "Real-time voice with custom voices",
    "link": "https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/",
    "tweets": [
      "https://x.com/Muse/status/2102901319937982968"
    ]
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-23",
    "title": "Hide commit attribution; send-now keeps tools running",
    "summary": "\"attribution\": false in settings hides all commit and PR attribution, and send-now moves running tools to the background instead of cancelling the turn.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21281"
  },
  {
    "tool": "muse",
    "date": "2026-09-22",
    "title": "Shopify, PayPal, Expedia & Instacart connectors announced",
    "tweets": [
      "https://x.com/Muse/status/2102603447791170034"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-22",
    "title": "Cleaner interface (QoL update)",
    "tweets": [
      "https://x.com/bot/status/2102532697960956074"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-22",
    "title": "Native Google Slides, Sheets & Docs",
    "tweets": [
      "https://x.com/bot/status/2102532699735175254"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-22",
    "title": "Route traffic through your own network",
    "summary": "A setting sends a Bot's web traffic through your own computer instead of the cloud.",
    "link": "https://x.ai/changelog/bot#v0.50.0",
    "tweets": [
      "https://x.com/bot/status/2102532701886861429"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-22",
    "title": "Faster replies & desktop performance",
    "tweets": [
      "https://x.com/bot/status/2102532703254163738"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-22",
    "title": "Grok Bot runs SpaceXAI and Cursor support",
    "summary": "SpaceXAI described how Grok Bot handled a 175% jump in support tickets after Cursor joined SpaceXAI, with no new hires. It drafts and sends replies, files bugs, issues refunds and prioritizes the queue.",
    "link": "https://x.ai/news/grok-bot-customer-support"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-22",
    "title": "GPT-6 Sol and Luna in Work and Codex",
    "summary": "New GPT-6 Sol (complex coding) and Luna (high-volume tasks) models roll out to Work and Codex at lower prices than GPT-5.6; the Codex desktop app keeps a manually selected model.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-22",
    "title": "Claude Opus 5.5 becomes the default model",
    "summary": "Adds claude-opus-5-5 (1M context, $4/$20 per Mtok) as the default Opus model, and Pro and Team Standard plans now default to Opus instead of Sonnet.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21280"
  },
  {
    "tool": "muse",
    "date": "2026-09-18",
    "title": "Developer connector platform",
    "summary": "Third-party developers can now build connectors that plug their services' APIs into Muse. Users grant each connector read or write permission.",
    "link": "https://runtimewire.com/article/meta-opens-muse-connectors-developers",
    "tweets": [
      "https://x.com/Muse/status/2101096428466749774"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-18",
    "title": "Granola & Notion connectors",
    "tweets": [
      "https://x.com/Muse/status/2101079336485007550"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-18",
    "title": "Canada expansion",
    "summary": "Muse became available in Canada, its first market outside the US, less than two weeks after launch.",
    "link": "https://www.iphoneincanada.ca/2026/09/18/metas-muse-ai-agent-is-now-available-in-canada/",
    "tweets": [
      "https://x.com/Muse/status/2101071767838372272"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-18",
    "title": "Voice notes",
    "tweets": [
      "https://x.com/bot/status/2101014478255247544"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-18",
    "title": "Projects (Cloud Agent orchestration)",
    "summary": "A Bot can start a Project, a Cloud Agent that plans the work and runs its own sub-agents.",
    "link": "https://x.ai/changelog/bot#v0.57.0"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-18",
    "title": "AGENTS.md support",
    "summary": "In a project with no CLAUDE.md, Claude Code now reads AGENTS.md instead; the deprecated TaskOutput tool was removed.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21277"
  },
  {
    "tool": "muse",
    "date": "2026-09-17",
    "title": "Muse for Mac",
    "summary": "A macOS app lets Muse work with local files, notes, calendars and email, and complete multi-step tasks across desktop apps. Access is opt-in, and it asks for approval before sensitive actions.",
    "link": "https://www.iphoneincanada.ca/2026/09/18/meta-launches-muse-on-macos-to-take-on-apple-intelligence/",
    "tweets": [
      "https://x.com/Muse/status/2100714397337264444"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-17",
    "title": "Voice chat (Grok Bot can talk)",
    "tweets": [
      "https://x.com/bot/status/2100659463569170779"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-17",
    "title": "Expanded GitHub abilities",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-17",
    "title": "Connect multiple accounts to one plugin",
    "summary": "Plugins can now be connected to more than one account on web, mobile and desktop, on all plans.",
    "link": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-17",
    "title": "Send-now key and claude.ai skills sync",
    "summary": "Ctrl+Enter interrupts the turn and sends all queued messages at once; skills and plugins enabled on your claude.ai account now sync to terminal sessions.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21275"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-16",
    "title": "1Password integration",
    "summary": "Mac users can connect 1Password so Bots can sign in to sites.",
    "link": "https://x.ai/changelog/bot#v0.53.0",
    "tweets": [
      "https://x.com/bot/status/2100335532597502311"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-16",
    "title": "Referrals: 1B tokens each",
    "tweets": [
      "https://x.com/Muse/status/2100268557229531376"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-15",
    "title": "Upload to Google Drive / OneDrive; pause routines",
    "summary": "Bots can upload files to Google Drive or OneDrive, and routines can be paused and resumed.",
    "link": "https://x.ai/changelog/bot#v0.53.0"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-15",
    "title": "Fork Remote Control sessions from the Claude app",
    "summary": "A session started with --remote-control can be forked from the Claude app; the fork runs as a background session on your computer.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21273"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-14",
    "title": "Auto-created first Bot; Bot edits its own avatar",
    "link": "https://x.ai/changelog/bot"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-14",
    "title": "GPT-5.3-Codex-Spark removed from the desktop app",
    "summary": "GPT-5.3-Codex-Spark is deprecated and no longer available in the desktop app, CLI or IDE extension.",
    "link": "https://learn.chatgpt.com/docs/changelog#month-2026-09"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-14",
    "title": "GPT-5.5 retiring on October 14",
    "summary": "GPT-5.5 will retire from ChatGPT, ChatGPT Work and Codex on October 14, 2026; the API is not affected.",
    "link": "https://learn.chatgpt.com/docs/changelog#month-2026-09"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-14",
    "title": "Fast mode in Remote sessions, mouse in /config",
    "summary": "Fast mode now works in cloud and self-hosted Remote sessions, the /config panel supports the mouse in fullscreen, and subagents can skip CLAUDE.md with omitClaudeMd.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21271"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-11",
    "title": "Microsoft Teams",
    "tweets": [
      "https://x.com/bot/status/2098481256417866145"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-11",
    "title": "Repo access cards (GitHub/GitLab/Bitbucket/Azure DevOps)",
    "summary": "Bots ask you to connect GitHub, GitLab, Bitbucket or Azure DevOps when they need repo access.",
    "link": "https://x.ai/changelog/bot#v0.50.0"
  },
  {
    "tool": "chatgpt",
    "date": "2026-09-11",
    "title": "Quick chats from Pets, and Appshots on Windows",
    "summary": "Desktop app 26.908 lets you type a quick chat from the floating Pets controls on macOS and Windows (Option+Space / Win+Alt+P), with @ for context and $ for skills. Appshots now work on Windows by pressing both Alt keys to share the frontmost window.",
    "link": "https://learn.chatgpt.com/docs/changelog#month-2026-09"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-11",
    "title": "claude plugin eval and /output-style",
    "summary": "claude plugin eval runs a plugin's eval suite with scored JSON and HTML reports; /output-style lists and switches output styles, including over Remote Control.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21269"
  },
  {
    "tool": "grokbot",
    "date": "2026-09-10",
    "title": "Sales/GTM connectors + sales templates",
    "tweets": [
      "https://x.com/bot/status/2098183353665261979"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "Inline message drafts",
    "summary": "Bots can write email or Slack drafts for you to review before sending. Enterprise admins can require Auto-review and set team-wide rules.",
    "link": "https://x.ai/changelog/bot#v0.45.0",
    "tweets": [
      "https://x.com/bot/status/2097759948189106686"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "One-click account switching",
    "summary": "Switch between multiple accounts, each with its own data.",
    "link": "https://x.ai/changelog/bot#v0.48.0",
    "tweets": [
      "https://x.com/bot/status/2097759952375029917"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "~10% more included usage",
    "tweets": [
      "https://x.com/bot/status/2097759955214590272"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "Native iPad app",
    "tweets": [
      "https://x.com/bot/status/2097759959220211726"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "20+ languages",
    "tweets": [
      "https://x.com/bot/status/2097759963007598798"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-09",
    "title": "Share files from mobile",
    "tweets": [
      "https://x.com/bot/status/2097759967214444724"
    ]
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-09",
    "title": "maxEffortLevel setting caps effort",
    "summary": "A new maxEffortLevel setting (global or per model) caps effort on every provider, including Bedrock, Vertex and Foundry.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21267"
  },
  {
    "tool": "muse",
    "date": "2026-09-08",
    "title": "Stripe Link payments",
    "tweets": [
      "https://x.com/alexandr_wang/status/2097410373221773355"
    ]
  },
  {
    "tool": "muse",
    "date": "2026-09-08",
    "title": "Muse launch",
    "summary": "Meta's Muse, powered by Muse Spark, completes tasks like sending email, booking travel, filling forms and buying things from its own cloud VM, with a Sentinel monitor and approval before sensitive actions. It is rolling out in the US on iOS, Android and the web, with a free tier and paid plans.",
    "link": "https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/",
    "tweets": [
      "https://x.com/Muse/status/2097399178376671666"
    ]
  },
  {
    "tool": "grokbot",
    "date": "2026-09-08",
    "title": "In-chat forms & logins",
    "tweets": [
      "https://x.com/bot/status/2097383980748382239"
    ]
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-04",
    "title": "/skill-doctor finds unused skills",
    "summary": "New /skill-doctor shows which loaded skills go unused and what they cost in context; new settings raise how much command output Claude sees inline.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21261"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-03",
    "title": "Live diff panel in fullscreen mode",
    "summary": "A panel beside the conversation shows your uncommitted changes as Claude edits; toggle it with /diff.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21260"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-02",
    "title": "Org-provided MCP servers and no-prompt headless mode",
    "summary": "New managedMcpServers setting pushes HTTP/SSE MCP servers to every user; --permission-prompts none auto-denies prompts on unattended hosts.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21259"
  },
  {
    "tool": "claudeCode",
    "date": "2026-09-01",
    "title": "Claude Fable 5.1 becomes the default Fable model",
    "summary": "Adds claude-fable-5-1 (1M context) as the default Fable model, plus new timeFormat and timeZone settings for timestamps.",
    "link": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21257"
  }
];
