/**
 * @param {string} answer
 * @param {string} guess
 * @returns {Array<"absent" | "present" | "correct">}
 */
export function scoreGuess(answer, guess) {
  const result = Array(answer.length).fill("absent");
  const remaining = new Map();

  for (let index = 0; index < answer.length; index += 1) {
    if (guess[index] === answer[index]) result[index] = "correct";
    else remaining.set(answer[index], (remaining.get(answer[index]) || 0) + 1);
  }

  for (let index = 0; index < guess.length; index += 1) {
    if (result[index] === "correct") continue;
    const count = remaining.get(guess[index]) || 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(guess[index], count - 1);
    }
  }

  return result;
}
