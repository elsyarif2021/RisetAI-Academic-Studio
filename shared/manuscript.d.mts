import type { Project } from './project.mjs';

export type ManuscriptSection = { id: string; title: string; en: string; ar: string };
export const frontSections: ManuscriptSection[];
export const appendices: ManuscriptSection[];
export const editableSections: ManuscriptSection[];
export function sectionTitle(section: ManuscriptSection, language: string): string;
export function manuscriptTemplate(id: string, title: string): string;
export function manuscriptSectionText(project: Project, id: string): string;
export function manuscriptImport(project: Project, id: string): string;
