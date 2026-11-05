/**
 * Per-agent memory of public meeting claims.
 *
 * This ledger is intentionally built only from public meeting chat and public
 * player labels. It never accepts roles, coordinates, kills, task state, or
 * other server-private observations. A stored statement remains a claim, not
 * an authenticated fact.
 */

export interface PublicMeetingRosterEntry {
  readonly slot: number;
  readonly username: string;
}

export interface PublicMeetingMessageInput {
  readonly slot: number;
  readonly text: string;
  readonly sentAtMs: number;
}

export type PublicClaimKind = 'question' | 'testimony' | 'accusation' | 'statement';
export type PublicClaimStance = 'affirms' | 'denies' | 'unknown';

export interface PublicMeetingEvidenceEntry {
  readonly id: string;
  readonly roundId: number;
  readonly sourceSlot: number;
  readonly sourceName: string;
  readonly sentAtMs: number;
  readonly text: string;
  readonly kind: PublicClaimKind;
  readonly subjectSlot: number | null;
  readonly eventKey: string | null;
  readonly stance: PublicClaimStance;
  /** Lexical quality heuristic only; never a probability that the statement is true. */
  readonly confidence: number;
  /** IDs of public claims that disagree about the same subject/event. */
  readonly contradicts: readonly string[];
}

export interface PublicMeetingVoteMessage {
  readonly slot: number;
  readonly text: string;
}

const MAX_ENTRIES = 48;
const MAX_TEXT_LENGTH = 220;
const MAX_PRIOR_PROMPT_ENTRIES = 18;

function sanitize(value: string, maxLength = MAX_TEXT_LENGTH): string {
  return Array.from(String(value ?? ''))
    .map(character => /[\p{Cc}\p{Zl}\p{Zp}]/u.test(character)
      ? ' '
      : /[\p{Cf}\p{Cs}]/u.test(character) ? '' : character)
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function findSubjectSlot(text: string, roster: readonly PublicMeetingRosterEntry[]): number | null {
  const lower = text.toLocaleLowerCase();
  const matches = new Set<number>();
  for (const player of roster) {
    const name = sanitize(player.username, 32);
    if (name.length < 2) continue;
    const escaped = name.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
    if (new RegExp('(^|[^\\p{L}\\p{N}_])' + escaped + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(lower)) {
      matches.add(player.slot);
    }
  }
  const numberMatches = Array.from(text.matchAll(/(?:#|\b(?:player|slot)\s*#?)0*(\d{1,2})\b/gi));
  for (const match of numberMatches) {
    const slot = Number(match[1]) - 1;
    if (roster.some(player => player.slot === slot)) matches.add(slot);
  }
  // Ambiguous statements naming multiple players are not attributed to one.
  return matches.size === 1 ? Array.from(matches)[0] : null;
}

function findEventKey(text: string): string | null {
  const checks: readonly [RegExp, string][] = [
    [/\b(?:kill|killed|kills|murder|murdered)\b/i, 'kill'],
    [/\b(?:vent|vented|venting)\b/i, 'vent'],
    [/\b(?:sabotage|sabotaged|sabotaging)\b/i, 'sabotage'],
    [/\b(?:report|reported|body|corpse)\b/i, 'report'],
    [/\b(?:task|tasks|console)\b/i, 'task'],
    [/\b(?:enter|entered|leave|left)\b/i, 'movement'],
  ];
  return checks.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function classifyKind(text: string): { kind: PublicClaimKind; confidence: number } {
  if (text.includes('?')) return { kind: 'question', confidence: 0.1 };
  if (/\b(?:i|we)\s+(?:personally\s+)?(?:saw|witnessed|caught|heard|found)\b/i.test(text)) {
    return { kind: 'testimony', confidence: 0.65 };
  }
  if (/\b(?:suspect|suspicious|impostor|guilty|accus(?:e|ing)|vote)\b/i.test(text)) {
    return { kind: 'accusation', confidence: 0.35 };
  }
  return { kind: 'statement', confidence: 0.2 };
}

function classifyStance(text: string): PublicClaimStance {
  // "I didn't see X" concerns the speaker's knowledge, not whether X did it.
  const negativeEvent =
    /\b(?:didn't|did not|never)\s+(?:kill|vent|sabotage|report|enter|leave)\b/i.test(text) ||
    /\b(?:isn't|is not|wasn't|was not)\s+(?:at|near|in|inside|suspicious|guilty|the impostor)\b/i.test(text);
  if (negativeEvent) return 'denies';
  if (/\b(?:saw|witnessed|caught|killed|vented|sabotaged|reported|entered|left)\b/i.test(text)) {
    return 'affirms';
  }
  return 'unknown';
}

export class PublicMeetingEvidenceLedger {
  private entries: PublicMeetingEvidenceEntry[] = [];
  private readonly seen = new Set<string>();

  ingest(
    roundId: number,
    messages: readonly PublicMeetingMessageInput[],
    roster: readonly PublicMeetingRosterEntry[],
  ): void {
    if (!Number.isFinite(roundId)) return;
    const publicRoster = roster
      .filter(player => Number.isInteger(player.slot) && player.slot >= 0)
      .map(player => ({ slot: player.slot, username: sanitize(player.username, 32) }));

    for (const message of messages) {
      if (!Number.isInteger(message.slot) || !Number.isFinite(message.sentAtMs)) continue;
      const text = sanitize(message.text);
      if (!text) continue;
      const id = String(roundId) + ':' + message.slot + ':' + message.sentAtMs;
      if (this.seen.has(id)) continue;
      const source = publicRoster.find(player => player.slot === message.slot);
      if (!source) continue;

      const subjectSlot = findSubjectSlot(text, publicRoster);
      const eventKey = findEventKey(text);
      const classified = classifyKind(text);
      const stance = subjectSlot !== null && eventKey !== null
        ? classifyStance(text)
        : 'unknown';

      const contradicts = new Set<string>();
      if (subjectSlot !== null && eventKey !== null && stance !== 'unknown') {
        for (let index = 0; index < this.entries.length; index++) {
          const previous = this.entries[index];
          if (previous.subjectSlot !== subjectSlot || previous.eventKey !== eventKey ||
              previous.stance === 'unknown' || previous.stance === stance) continue;
          contradicts.add(previous.id);
          this.entries[index] = {
            ...previous,
            contradicts: Array.from(new Set([...previous.contradicts, id])),
          };
        }
      }

      this.entries.push({
        id,
        roundId,
        sourceSlot: message.slot,
        sourceName: source.username,
        sentAtMs: message.sentAtMs,
        text,
        kind: classified.kind,
        subjectSlot,
        eventKey,
        stance,
        confidence: classified.confidence,
        contradicts: Array.from(contradicts),
      });
      this.seen.add(id);
    }

    while (this.entries.length > MAX_ENTRIES) {
      const removed = this.entries.shift();
      if (!removed) break;
      this.seen.delete(removed.id);
      for (let index = 0; index < this.entries.length; index++) {
        const entry = this.entries[index];
        if (entry.contradicts.includes(removed.id)) {
          this.entries[index] = {
            ...entry,
            contradicts: entry.contradicts.filter(id => id !== removed.id),
          };
        }
      }
    }
  }

  reset(): void {
    this.entries = [];
    this.seen.clear();
  }

  snapshot(): readonly PublicMeetingEvidenceEntry[] {
    return this.entries.map(entry => ({ ...entry, contradicts: [...entry.contradicts] }));
  }

  priorEntries(roundId: number, limit = MAX_PRIOR_PROMPT_ENTRIES): readonly PublicMeetingEvidenceEntry[] {
    const boundedLimit = Math.max(0, Math.min(MAX_PRIOR_PROMPT_ENTRIES, Math.trunc(limit)));
    if (boundedLimit === 0) return [];
    return this.snapshot().filter(entry => entry.roundId !== roundId).slice(-boundedLimit);
  }

  voteMessages(): readonly PublicMeetingVoteMessage[] {
    return this.entries.map(entry => ({ slot: entry.sourceSlot, text: entry.text }));
  }

  priorTranscript(roundId: number, maxCharacters = 1_800): string {
    const lines = this.priorEntries(roundId).map(entry => {
      const subject = entry.subjectSlot === null ? 'no resolved subject' : 'subject slot ' + entry.subjectSlot;
      const event = entry.eventKey ?? 'no resolved event';
      const conflicts = entry.contradicts.length > 0 ? '; conflicts with ' + entry.contradicts.length + ' claim(s)' : '';
      return 'round ' + entry.roundId + '; ' + entry.sourceName +
        ' (slot ' + entry.sourceSlot + '; ' + entry.kind +
        '; confidence heuristic ' + entry.confidence.toFixed(2) + '): ' +
        subject + '; ' + event + '; ' + entry.stance + conflicts + '. "' + entry.text + '"';
    });
    let result = '';
    for (const line of lines.reverse()) {
      if (result.length + line.length + 1 > maxCharacters) break;
      result = result ? line + '\n' + result : line;
    }
    return result;
  }

  get size(): number {
    return this.entries.length;
  }
}
