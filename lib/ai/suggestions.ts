/**
 * Suggested questions shown when a conversation is empty, per role.
 *
 * Questions that need school records are marked `needsData`. They are hidden
 * until the data tools exist (AI-4), so nobody is offered a question the
 * assistant can't answer yet.
 */

import type { ViewerRole } from "./prompt";

/** Flip to true when the role-aware data tools ship (AI-4). */
export const AI_DATA_TOOLS_AVAILABLE = false;

interface Suggestion {
  text: string;
  needsData?: boolean;
}

const SUGGESTIONS: Record<ViewerRole, Suggestion[]> = {
  student: [
    { text: "What is my average?", needsData: true },
    { text: "How is my attendance?", needsData: true },
    { text: "Explain my grades.", needsData: true },
    { text: "How is my semester average calculated?" },
    { text: "How do I read my report card?" },
    { text: "Give me a plan to prepare for my exams." },
    { text: "Explain photosynthesis in simple words." },
  ],
  parent: [
    { text: "How is my child performing?", needsData: true },
    { text: "What is my child's attendance?", needsData: true },
    { text: "Where can I see my child's report card?" },
    { text: "What does \"excused\" mean on the attendance record?" },
    { text: "How can I help my child study at home?" },
  ],
  teacher: [
    { text: "Show my classes.", needsData: true },
    { text: "Which students need academic support?", needsData: true },
    { text: "Who was absent today?", needsData: true },
    { text: "How do I enter and submit grades for my class?" },
    { text: "Write five quiz questions on Newton's laws of motion." },
    { text: "Suggest a respectful report-card remark for a student who has improved." },
    { text: "How do I take the attendance register?" },
  ],
  school_admin: [
    { text: "Give me today's school overview.", needsData: true },
    { text: "Which classes need attention?", needsData: true },
    { text: "How do I issue report cards for a class?" },
    { text: "How do I set up a new academic year?" },
    { text: "Draft an announcement inviting parents to a PTA meeting." },
    { text: "What does the Reports page show?" },
  ],
  super_admin: [
    { text: "How many schools are currently active?", needsData: true },
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
