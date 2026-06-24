import { callGeminiJSON, fileToBase64, GeminiPart } from '../lib/geminiClient';
import { buildProjectContext } from './aiProjectContext';
import { buildWorkspaceContext } from './aiWorkspaceContext';
import {
  AIAgentResponse,
  AI_SYSTEM_PROMPT,
  sanitizeProposedActions,
  isInformationalQuery,
} from './aiActions';
import { sanitizeUIActions, userWantsNavigation } from './aiNavigation';
import { Project } from '../types';

export interface AISessionHints {
  lastTaskId?: string | null;
  lastExpenseId?: string | null;
}

export interface AIChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const MAX_HISTORY_TURNS = 14;

export async function askProjectAssistant(
  projects: Project[],
  activeProject: Project | null,
  userEmail: string,
  userMessage: string,
  imageFile?: File | null,
  sessionHints?: AISessionHints,
  conversationHistory?: AIChatTurn[]
): Promise<AIAgentResponse> {
  const inProject = !!activeProject;
  const context = inProject
    ? buildProjectContext(activeProject!, userEmail)
    : buildWorkspaceContext(projects, userEmail);

  let userBlock = inProject
    ? `PROJECT_MODE: user is inside workspace "${activeProject!.name}" (id: ${activeProject!.id}).\nPROJECT_CONTEXT:\n${context}`
    : `WORKSPACE_MODE: user is on the dashboard with ${projects.length} workspace(s).\nWORKSPACE_CONTEXT:\n${context}`;

  if (sessionHints?.lastTaskId || sessionHints?.lastExpenseId) {
    userBlock += `\n\nSESSION_HINTS:\n${JSON.stringify({
      lastTaskId: sessionHints.lastTaskId || undefined,
      lastExpenseId: sessionHints.lastExpenseId || undefined,
    })}`;
  }

  const history = (conversationHistory || []).slice(-MAX_HISTORY_TURNS);
  if (history.length > 0) {
    userBlock += `\n\nCONVERSATION_HISTORY (this chat session — remember and stay consistent):\n`;
    for (const turn of history) {
      const label = turn.role === 'user' ? 'USER' : 'ASSISTANT';
      userBlock += `${label}: ${turn.text}\n`;
    }
  }

  userBlock += `\n\nUSER_REQUEST:\n${userMessage}`;

  const parts: GeminiPart[] = [{ text: userBlock }];

  if (imageFile) {
    const img = await fileToBase64(imageFile);
    parts.push({ inlineData: img });
    if (!userMessage.trim()) {
      const target = activeProject ?? projects[0];
      const ctx = target ? buildProjectContext(target, userEmail) : context;
      parts[0].text = `${inProject ? 'PROJECT' : 'WORKSPACE'}_CONTEXT:\n${ctx}\n\nUSER_REQUEST:\nAnalyze this receipt/invoice image and propose adding an expense with extracted fields. Include projectId or projectName in params if WORKSPACE_MODE.`;
    }
  }

  const result = await callGeminiJSON<AIAgentResponse>(AI_SYSTEM_PROMPT, parts);

  if (!result.message) result.message = 'Done.';
  result.proposedActions = sanitizeProposedActions(result.proposedActions);
  result.uiActions = sanitizeUIActions(result.uiActions ?? []);

  const wantsNav = userWantsNavigation(userMessage);

  if (!imageFile && isInformationalQuery(userMessage) && !wantsNav) {
    result.proposedActions = [];
    result.uiActions = [];
  }

  if (!imageFile && wantsNav) {
    result.proposedActions = [];
  }

  return result;
}
