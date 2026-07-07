// src/lib/socialGenerator.ts

export interface ToolData {
  name: string;
  description?: string | null;
  cost_mo?: number | null;
  revenue?: number | null;
}

// ===== THIS FUNCTION SWAPS LATER FOR AI =====
export async function generateSocialPost(tool: ToolData): Promise<string> {
  // 🔄 CURRENTLY: Uses templates (works NOW)
  // 🔄 LATER: We'll call Ollama here (when download finishes)
  
  const templates = getTemplatesForTool(tool.name);
  return templates[Math.floor(Math.random() * templates.length)];
}
// ============================================

function getTemplatesForTool(name: string): string[] {
  const key = name.toLowerCase().replace(/\s+/g, '');
  
  const templates: Record<string, string[]> = {
    caveman: [
      "🛠️ Token compression for LLM workflows = lower costs + faster responses.",
      "💰 Cutting LLM costs without losing quality? Caveman does it automatically.",
      "⚡ Long-context coding just got cheaper with Caveman."
    ],
    claudecounter: [
      "📊 Track your Claude API token usage in real-time.",
      "🔍 No more surprise API bills! Claude Counter tracks every token.",
      "💡 Usage analytics for Claude API. Monitor and control spending."
    ],
    codeburn: [
      "🔥 Multi-tool token burn tracker in one dashboard.",
      "📈 Cost reporting for all your AI tools combined.",
      "💸 Track token usage across multiple AI tools."
    ],
    awesomesubagents: [
      "🤖 80+ specialized AI subagents for any task.",
      "⚡ Scale your AI workflows with specialized subagents.",
      "🎯 From code review to specialist tasks - we have an AI for that."
    ],
    postizapp: [
      "📱 AI social media scheduling + analytics.",
      "🚀 Team collaboration meets AI scheduling.",
      "🔄 Automate your social media workflow with Postiz."
    ],
    graphify: [
      "🕸️ Knowledge graph generator for better documentation.",
      "📚 Turn complex info into visual knowledge graphs.",
      "🔗 Connect your documentation with knowledge graphs."
    ]
  };

  return templates[key] || [
    `🚀 Check out ${name} - boosting productivity with AI!`,
    `💡 ${name} is now available. Streamline your workflow!`,
    `⚡ New tool: ${name}. Built for modern teams.`
  ];
}

export async function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
