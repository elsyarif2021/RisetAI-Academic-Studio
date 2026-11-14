export type QuantMethod = 'descriptive' | 'pearson' | 'paired' | 'alpha';
export const methods: Record<QuantMethod, { label: string; formula: string; note: string }>;
export function parseScores(text: string): { headers: string[]; rows: number[][] };
export function analyzeScores(text: string, method: QuantMethod, first: number, second: number, threshold: number): string;
