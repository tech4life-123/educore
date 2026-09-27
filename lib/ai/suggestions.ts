/**
 * Suggested questions shown when a conversation is empty, per role.
 *
 * Questions that need school records are marked `needsData`; they are shown
 * only when the data tools are available (AI-4). Each maps to a tool the role
 * actually has (see lib/ai/tools/registry.ts).
 */

import type { ViewerRole } from "./prompt";

/** The role-aware, read-only data tools (AI-4) are available. */
export const AI_DATA_TOOLS_AVAILABLE = true;

interface Suggestion {
  text: string;
  needsData?: boolean;
}

const SUGGESTIONS: Record<ViewerRole, Suggestion[]> = {
  student: [
    { text: "Explain my grades.", needsData: true },
    { text: "How is my attendance this semester?", needsData: true },
    { text: "What were my results on my last report card?", needsData: true },
    { text: "How is my semester average calculated?" },
    { text: "How do I read my report card?" },
    { text: "Give me a plan to prepare for my exams." },
    { text: "Explain photosynthesis in simple words." },
  ],
  parent: [
    { text: "How is my child performing?", needsData: true },
    { text: "What is my child's attendance this semester?", needsData: true },
    { text: "Are there any new announcements?", needsData: true },
    { text: "Where can I see my child's report card?" },
    { text: "What does \"excused\" mean on the attendance record?" },
    { text: "How can I help my child study at home?" },
  ],
  teacher: [
    { text: "Show my classes.", needsData: true },
    { text: "Who was absent from my homeroom today?", needsData: true },
    { text: "Which students in my subject may benefit from additional support?", needsData: true },
    { text: "How do I enter and submit grades for my class?" },
    { text: "Write five quiz questions on Newton's laws of motion." },
    { text: "Suggest a respectful report-card remark for a student who has improved." },
    { text: "How do I take the attendance register?" },
  ],
  school_admin: [
    { text: "Give me today's school overview.", needsData: true },
    { text: "Which students may benefit from additional support?", needsData: true },
    { text: "How is the school performing this semester?", needsData: true },
    { text: "How do I issue report cards for a class?" },
    { text: "How do I set up a new academic year?" },
    { text: "Draft an announcement inviting parents to a PTA meeting." },
    { text: "What does the Reports page show?" },
  ],
  super_admin: [
    { text: "How many schools are currently active?", needsData: true },
    { text: "Summarise student numbers by county.", needsData: true },
    { text: "How do I add an administrator to a school?" },
    { text: "What happens when I suspend a school?" },
    { text: "What do the Ministry statistics include?" },
  ],
};

export function suggestionsFor(role: ViewerRole, limit = 4): string[] {
  return SUGGESTIONS[role]
    .filter((s) => AI_DATA_TOOLS_AVAILABLE || !s.needsData)
    .slice(0, limit)
    .map((s) => s.text);
}
