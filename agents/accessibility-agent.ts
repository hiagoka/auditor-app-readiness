import type { AgentResult } from "../lib/types";

export interface AccessibilityAgentInput {
  repoPath: string;
}

/**
 * Agente de Acessibilidade (stretch, versão simplificada).
 *
 * Passos (TODO iteração 4, só se sobrar tempo):
 *  1. Varrer JSX/TSX com @babel/parser + @babel/traverse.
 *  2. Achar componentes interativos (`Pressable`, `TouchableOpacity`, `Button`, `onPress={...}`)
 *     sem `accessibilityLabel` / `accessibilityRole`.
 *  3. askJson para classificar severidade e redigir a sugestão.
 */
export async function runAccessibilityAgent(
  input: AccessibilityAgentInput,
): Promise<AgentResult> {
  const start = Date.now();

  // TODO: parse de JSX + heurística + chamada de modelo.
  void input;

  return {
    agent: "accessibility",
    findings: [],
    tokensUsed: 0,
    durationMs: Date.now() - start,
    inspected: [],
  };
}
