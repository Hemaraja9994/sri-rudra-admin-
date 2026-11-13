// Therapy plans (e.g. a 12-session voice therapy lesson plan), modelled on the clinic's own plan:
// framework and long-term goals, session structure, each session's goals / baseline / activities /
// home practice, discharge criteria, a progress data sheet and a home-practice card.
// Plain JavaScript, also run under `node --test`.

import { addDays, isIsoDate } from './clinical.js';

export const PER_WEEK = [[1, 'Once a week'], [2, 'Twice a week'], [3, 'Three times a week'], [5, 'Daily (5 days a week)']];
export const PLAN_STATUSES = [['draft', 'Draft'], ['active', 'In progress'], ['completed', 'Completed']];

export function weeksFor(sessions, perWeek) {
  return Math.ceil(Number(sessions) / Math.max(1, Number(perWeek) || 1));
}

export function frequencyText(perWeek) {
  return { 1: 'once weekly', 2: 'twice weekly', 3: 'three times weekly', 5: 'five days a week' }[perWeek] || `${perWeek} times a week`;
}

// "45 minutes per session • Twice weekly for 6 weeks"
export function scheduleLine(plan) {
  const parts = [];
  if (plan.minutes) parts.push(`${plan.minutes} minutes per session`);
  if (plan.per_week) {
    const f = frequencyText(plan.per_week);
    parts.push(`${f[0].toUpperCase()}${f.slice(1)} for ${weeksFor(plan.sessions_count, plan.per_week)} weeks`);
  }
  return parts.join(' • ');
}

// Session 1, the middle session and the last session: when progress is measured.
export function checkpoints(sessions) {
  const n = Math.max(1, Number(sessions) || 1);
  if (n <= 2) return [...new Set([1, n])];
  return [1, Math.round(n / 2), n];
}

// Planned date of each session from the start date, keeping the weekly rhythm (Mon/Thu for twice weekly).
export function sessionDates(startDate, sessions, perWeek) {
  if (!isIsoDate(startDate)) return [];
  const gaps = { 1: [7], 2: [3, 4], 3: [2, 2, 3], 5: [1, 1, 1, 1, 3] }[perWeek] || [7];
  const dates = [startDate];
  for (let i = 1; i < sessions; i += 1) dates.push(addDays(dates[i - 1], gaps[(i - 1) % gaps.length]));
  return dates;
}

const text = (v, max) => String(v ?? '').replace(/\r/g, '').slice(0, max).trim();
const lines = (v, maxItems = 40, max = 600) => (Array.isArray(v) ? v : String(v ?? '').split('\n'))
  .map((i) => text(typeof i === 'string' ? i : JSON.stringify(i), max))
  .filter(Boolean)
  .slice(0, maxItems);

export function blankSession(n) {
  return { n, title: '', goals: [], baseline: [], activities: [], home: [] };
}

export function blankPlan(sessions) {
  return {
    framework: { intro: '', points: [] },
    goals: [],
    structure: { items: [], home_note: '' },
    sessions: Array.from({ length: sessions }, (_, i) => blankSession(i + 1)),
    discharge: { criteria: [], otherwise: '' },
    measures: [],
    home_card: [],
  };
}

// Keeps a plan in shape whatever the AI or the browser sends: right number of sessions, text only.
export function cleanPlan(input, sessions) {
  const p = input && typeof input === 'object' ? input : {};
  const byN = new Map((Array.isArray(p.sessions) ? p.sessions : []).map((s, i) => [Number(s?.n) || i + 1, s]));
  return {
    framework: { intro: text(p.framework?.intro, 600), points: lines(p.framework?.points, 12) },
    goals: lines(p.goals, 12),
    structure: { items: lines(p.structure?.items, 10), home_note: text(p.structure?.home_note, 600) },
    sessions: Array.from({ length: sessions }, (_, i) => {
      const s = byN.get(i + 1) || {};
      return {
        n: i + 1,
        title: text(s.title, 120),
        goals: lines(s.goals, 8),
        baseline: lines(s.baseline, 6),
        activities: lines(s.activities, 14),
        home: lines(s.home, 6),
      };
    }),
    discharge: { criteria: lines(p.discharge?.criteria, 10), otherwise: text(p.discharge?.otherwise, 600) },
    measures: lines(p.measures, 12, 120),
    home_card: lines(p.home_card, 10),
  };
}

// Progress: which sessions are done (date + note) and the data-sheet values at each checkpoint.
export function cleanProgress(input, sessions) {
  const p = input && typeof input === 'object' ? input : {};
  const done = {};
  for (const [k, v] of Object.entries(p.done || {})) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > sessions || !v) continue;
    done[n] = { date: isIsoDate(v.date) ? v.date : '', note: text(v.note, 1000) };
  }
  const values = {};
  for (const [k, row] of Object.entries(p.values || {})) {
    if (!row || typeof row !== 'object') continue;
    values[text(k, 120)] = Object.fromEntries(Object.entries(row).slice(0, 6).map(([c, v]) => [text(c, 10), text(v, 60)]));
  }
  return { done, values };
}

export function normalizePlanInput(input = {}) {
  const sessions = Number(input.sessions_count);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 40) throw new Error('Choose between 1 and 40 sessions.');
  const minutes = input.minutes === '' || input.minutes === null || input.minutes === undefined ? null : Number(input.minutes);
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 10 || minutes > 180)) throw new Error('Session length should be 10–180 minutes.');
  const perWeek = input.per_week === '' || input.per_week === null || input.per_week === undefined ? null : Number(input.per_week);
  if (perWeek !== null && !PER_WEEK.some(([v]) => v === perWeek)) throw new Error('Choose how often sessions happen.');
  const start = input.start_date ? String(input.start_date) : null;
  if (start && !isIsoDate(start)) throw new Error('Pick a valid start date.');
  const title = text(input.title, 160);
  if (!title) throw new Error('Give the plan a title.');
  return { title, sessions_count: sessions, minutes, per_week: perWeek, start_date: start, focus: text(input.focus, 2000) || null };
}

export function doneCount(progress) {
  return Object.keys(progress?.done || {}).length;
}

// Suggested title, e.g. "12-session voice therapy plan".
export function defaultPlanTitle(sessions, diagnosisLabel) {
  const what = diagnosisLabel ? diagnosisLabel.replace(/\s*\(.*\)$/, '').toLowerCase() : 'therapy';
  return `${sessions}-session ${what} therapy plan`.replace('therapy therapy', 'therapy');
}
