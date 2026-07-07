export function normalizeGuestMessage(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type GuestFaq = {
  question: string;
  keywords: string | null;
  answer: string;
  active: boolean;
};

export function findGuestFaqAnswer(message: string, rows: GuestFaq[]) {
  const text = normalizeGuestMessage(message);
  const exact = rows.find((row) => row.active && normalizeGuestMessage(row.question) === text);
  if (exact) return exact.answer;

  const keyword = rows.find((row) => {
    if (!row.active) return false;
    return (row.keywords ?? '')
      .split(',')
      .map(normalizeGuestMessage)
      .filter(Boolean)
      .some((term) => text.includes(term));
  });

  return keyword?.answer ?? null;
}

export const guestFallbackReply = "I'm sorry, I don't have a confirmed answer for that yet. Please contact reception for assistance.";
