export type DialogueRole = 'crewmate' | 'impostor';

export interface PublicDialoguePlayer {
  slot: number;
  username: string;
  alive: boolean;
  isBot: boolean;
}

export interface InternalDialogueContext {
  username: string;
  role: DialogueRole;
  meetingType: 'body report' | 'emergency call';
  livingRoster: readonly string[];
  latestSpeaker?: string;
  latestMessage?: string;
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

/**
 * Deterministic, transcript-grounded fallback dialogue. It deliberately makes
 * no claims about private positions or unobserved actions and varies replies
 * without relying on an external provider.
 */
export function buildInternalBotDialogue(context: InternalDialogueContext): string {
  const text = (context.latestMessage ?? '').trim();
  const lower = text.toLocaleLowerCase();
  const seed = context.username + '|' + text + '|' + context.meetingType;
  const withSpeaker = (reply: string) => context.latestSpeaker ? `${context.latestSpeaker}, ${reply}` : reply;
  const otherPlayer = context.livingRoster.find(name =>
    name.toLocaleLowerCase() !== context.username.toLocaleLowerCase() &&
    name.toLocaleLowerCase() !== context.latestSpeaker?.toLocaleLowerCase() &&
    lower.includes(name.toLocaleLowerCase()),
  );
  const playerNumberMatch = lower.match(/\bplayer\s*#?0*(\d{1,2})\b|\bslot\s*#?0*(\d{1,2})\b|#0*(\d{1,2})\b/);
  const mentionedPlayerNumber = playerNumberMatch
    ? `Player${Number(playerNumberMatch[1] ?? playerNumberMatch[2] ?? playerNumberMatch[3])}`
    : undefined;
  const mentionedSubject = otherPlayer ?? mentionedPlayerNumber;
  const mentionsSelf = lower.includes(context.username.toLocaleLowerCase());
  const asksLocation = /where|location|route|hall|room|last saw|last seen|near|saw/.test(lower);
  const asksForEvidence = /evidence|proof|why|because|suspect|vote|accus|impostor|suspicious/.test(lower);
  const isQuestion = /\?|\bwho\b|\bwhere\b|\bwhat\b|\bwhen\b/.test(lower);

  if (!text) {
    const opening = context.meetingType === 'body report'
      ? [
          'Before we vote, who can give a confirmed last sighting of the victim?',
          'Let us build a timeline first. Who saw the victim most recently?',
          'Please separate direct observations from guesses before we accuse anyone.',
        ]
      : [
          'Let us compare what we actually observed before choosing a vote.',
          'Can everyone give a short account of their last confirmed task or sighting?',
          'I would rather establish a timeline than rush into an unsupported vote.',
        ];
    return opening[stableIndex(seed, opening.length)];
  }

  if (mentionedSubject) {
    const replies = [
      `What did \${mentionedSubject} do that you personally observed?`,
      `Is there a specific sighting connecting \${mentionedSubject} to this, or is that only a suspicion?`,
      `Can someone independently confirm the detail about \${mentionedSubject}?`,
    ];
    return withSpeaker(replies[stableIndex(seed, replies.length)]);
  }

  if (mentionsSelf) {
    const replies = [
      `${context.latestSpeaker ?? 'Player'}, I can answer that, but please tell me the time and place you mean.`,
      `What exact action are you asking me about? I do not want us to mix assumptions with sightings.`,
      `I hear my name, but I need the specific observation before I can respond fairly.`,
    ];
    return replies[stableIndex(seed, replies.length)];
  }

  if (asksLocation) {
    const replies = [
      'Which room or corridor, and roughly when? A precise timeline will help.',
      'Was that a direct sighting or something inferred from the route?',
      'Who else was close enough to independently confirm that location?',
    ];
    return withSpeaker(replies[stableIndex(seed, replies.length)]);
  }

  if (asksForEvidence || isQuestion) {
    const replies = [
      'What is the strongest direct observation behind that claim?',
      'Can we name the witness and the exact event rather than guess?',
      'I would compare that claim with the public timeline before voting.',
    ];
    return withSpeaker(replies[stableIndex(seed, replies.length)]);
  }

  const neutral = context.role === 'impostor'
    ? [
        'I do not think we have enough confirmed information to lock in a vote yet.',
        'Let us test that timeline before we decide who is responsible.',
        'I would be careful about treating an unconfirmed suspicion as proof.',
      ]
    : [
        'That is one possibility. Does anyone have a separate observation to support it?',
        'Let us keep track of who witnessed that directly and who is repeating it.',
        'Can we compare that with the last confirmed sighting before voting?',
      ];
  return withSpeaker(neutral[stableIndex(seed, neutral.length)]);
}

/** One bot answers a bot's turn, creating a conversation without a reply storm. */
export function isNextBotResponder(
  players: readonly PublicDialoguePlayer[],
  speakerSlot: number,
  responderSlot: number,
): boolean {
  const bots = players
    .filter(player => player.alive && player.isBot && player.slot !== speakerSlot)
    .map(player => player.slot)
    .sort((a, b) => a - b);
  if (bots.length === 0) return false;
  const next = bots.find(slot => slot > speakerSlot) ?? bots[0];
  return next === responderSlot;
}
