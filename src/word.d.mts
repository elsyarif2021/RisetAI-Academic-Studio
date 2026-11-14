import type { Project } from '../shared/project.mjs';
export type WordKind = 'chapters' | 'instrument' | 'bibliography' | 'appendices'
  | `chapter-${number}` | `section-${string}` | `appendix-${string}`;
export function downloadWord(project: Project, kind: WordKind): Promise<void>;
