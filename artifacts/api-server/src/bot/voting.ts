import { NO_TARGET } from '@workspace/shared/coords';

export interface PublicVotePlayer {
  readonly slot: number;
  readonly username: string;
  readonly alive: boolean;
}

export interface PublicMeetingMessage {
  readonly slot: number;
  readonly text: string;
}

interface CandidateScore {
  readonly slot: number;
  readonly score: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsPlayer(text: string, player: PublicVotePlayer): boolean {
  const name = player.username.trim();
  if (name.length >= 2) {
    const namePattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_])`,
      'iu',
    );
    if (namePattern.test(text)) return true;
  }
  const displayNumber = player.slot + 1;
  return new RegExp(
    `(?:#|\\b(?:player|slot)\\s*#?)0*${displayNumber}\\b`,
    'i',
  ).test(text);
}

/**
 * Choose a crewmate vote using only public meeting chat and the living roster.
 * Hidden roles, private positions, and server-only events are deliberately not
 * accepted by this API. Weak/contradictory evidence produces an explicit skip.
 */
export function chooseEvidenceWeightedVote(
  selfSlot: number,
  players: readonly PublicVotePlayer[],
  messages: readonly PublicMeetingMessage[],
): number {
  const candidates = players.filter(player => player.alive && player.slot !== selfSlot);
  if (candidates.length === 0) return NO_TARGET;

  const perCandidate = new Map<number, Map<number, number>>();
  for (const candidate of candidates) perCandidate.set(candidate.slot, new Map());

  let skipEndorsements = 0;
  const skipSpeakers = new Set<number>();

  for (const message of messages) {
    const text = String(message.text ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    if (!text) continue;

    if (/\b(?:skip|no evidence|not enough evidence|no proof|nothing to go on)\\b/i.test(text)) {
      skipSpeakers.add(message.slot);
    }

    for (const candidate of candidates) {
      if (message.slot === candidate.slot || !mentionsPlayer(text, candidate)) continue;

      const speakerScores = perCandidate.get(candidate.slot)!;
      const mentionIndex = candidate.username.trim().length >= 2
        ? text.toLocaleLowerCase().indexOf(candidate.username.trim().toLocaleLowerCase())
        : -1;
      const context = mentionIndex >= 0
        ? text.slice(Math.max(0, mentionIndex - 64), Math.min(text.length, mentionIndex + candidate.username.length + 64))
        : text;
      const accusation = /\b(?:sus(?:picious)?|impostor|guilty|accus(?:e|ing)|suspect|vote)\\b/i.test(context);
      const directObservation = /\b(?:i|we)\s+(?:personally\s+)?(?:saw|watched|witnessed|caught|found|heard)\\b/i.test(text);
      const suspiciousAction = /\b(?:kill(?:ed)?|vent(?:ed|ing)?|sabotag(?:e|ed|ing)|report(?:ed|ing)?|lied|lying|ran from|came out of (?:the )?vent)\\b/i.test(text);
      const cleared = /\b(?:not|never|don't|do not|isn't|is not)\\b.{0,48}\\b(?:sus(?:picious)?|impostor|guilty)\\b|\\b(?:clear|cleared|innocent|has an alibi)\\b/i.test(context);

      let contribution = 0;
      if (cleared) contribution = -1.5;
      else if (directObservation && suspiciousAction) contribution = 3.5;
      else if (suspiciousAction && accusation) contribution = 2.5;
      else if (accusation) contribution = 1.25;

      if (contribution !== 0) {
        speakerScores.set(message.slot, Math.max(speakerScores.get(message.slot) ?? 0, contribution));
      }
    }
  }

  skipEndorsements = skipSpeakers.size;
  const scores: CandidateScore[] = candidates.map(candidate => ({
    slot: candidate.slot,
    score: Array.from(perCandidate.get(candidate.slot)!.values()).reduce((sum, value) => sum + value, 0),
  })).sort((a, b) => b.score - a.score || a.slot - b.slot);

  const best = scores[0];
  const second = scores[1]?.score ?? 0;
  if (skipEndorsements >= 2 && best.score < 4) return NO_TARGET;
  if (best.score < 2.5 || best.score - second < 1) return NO_TARGET;
  return best.slot;
}
