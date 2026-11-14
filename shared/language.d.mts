export const defaultLanguage: string;
export const languageOptions: [string, string][];
export function normalizeLanguage(value: unknown): string;
export function languageInfo(value: unknown): {
  name: string;
  instruction: string;
  code: string | undefined;
  base: string | undefined;
  rtl: boolean;
  cjk: boolean;
};
export function countResearchWords(text: string, language: string): number;
export function wordLabels(language: string): string[] | null;
