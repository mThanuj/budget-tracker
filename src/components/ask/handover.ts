// The home page's ask box opens /ask?q=…, and the Ask page sends that question
// straight away. Only if it really came from the ask box, though: a /ask?q=
// link from anywhere else (an email, a chat, another site) would otherwise send
// someone else's text to the AI as this person, using one of their questions
// for the day. So the ask box also hands the question over in memory, which
// survives the in-app navigation but not a link; a question that arrives only
// in the URL is filled in for the person to send themselves.

let handedOver: string | null = null;

export function handOver(question: string) {
  handedOver = question;
}

export const isHandedOver = (question: string) => handedOver === question;

/** True once if `question` is the one the ask box just handed over. */
export function takeHandedOver(question: string) {
  const matches = handedOver === question;
  handedOver = null;
  return matches;
}
