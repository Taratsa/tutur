import { expect, test } from "bun:test";
import { scoreGuess } from "../src/lib/word-game.js";

test("word game scores exact, misplaced, and repeated letters", () => {
  expect(scoreGuess("sisir", "sirih")).toEqual([
    "correct",
    "correct",
    "present",
    "correct",
    "absent",
  ]);
  expect(scoreGuess("bakar", "babat")).toEqual([
    "correct",
    "correct",
    "absent",
    "correct",
    "absent",
  ]);
});
