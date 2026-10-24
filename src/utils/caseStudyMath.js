import { SECTION_KEYS } from '../constants/taxonomies.js';

export const WORDS_PER_MINUTE = 220;

export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function countWords(markdown) {
  if (!markdown) return 0;
  const text = String(markdown)
    .replace(/```[\s\S]*?```/g, ' ') // code fences
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1') // links -> link text
    .replace(/[#>*_`~|-]/g, ' ');
  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}

export function computeReadingTime(sections = {}) {
  const words = SECTION_KEYS.reduce((sum, key) => sum + countWords(sections?.[key]), 0);
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function computeLifespan(foundedYear, shutDownYear) {
  if (!Number.isInteger(foundedYear) || !Number.isInteger(shutDownYear)) return null;
  const years = shutDownYear - foundedYear;
  return years >= 0 ? years : null;
}

/** Returns the list of missing fields (dot paths) that block publishing; empty when publishable. */
export function getPublishMissingFields(doc) {
  const missing = [];
  const blank = (v) => typeof v !== 'string' || v.trim() === '';
  if (blank(doc.tagline)) missing.push('tagline');
  if (blank(doc.sections?.executiveSummary)) missing.push('sections.executiveSummary');
  if (blank(doc.sections?.whatWentWrong)) missing.push('sections.whatWentWrong');
  if (!doc.failureReasons?.length) missing.push('failureReasons');
  if (!doc.lessons?.length) missing.push('lessons');
  if (!doc.sources?.length) missing.push('sources');
  return missing;
}
