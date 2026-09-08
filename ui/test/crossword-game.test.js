import { expect, test } from "bun:test";
import { buildCrosswordGrid, isCrosswordComplete, slotCells } from "../src/lib/crossword-game.js";

const slots = [
  { answer: "nama", row: 0, col: 1, direction: "across" },
  { answer: "air", row: 0, col: 2, direction: "down" },
];

test("builds crossing cells and checks a solved crossword", () => {
  expect(buildCrosswordGrid(3, 5, slots)).toEqual([
    ["", "n", "a", "m", "a"],
    ["", "", "i", "", ""],
    ["", "", "r", "", ""],
  ]);
  expect(slotCells(slots[0])).toEqual(["0:1", "0:2", "0:3", "0:4"]);
  expect(
    isCrosswordComplete(
      slots,
      new Map([
        ["0:1", "n"],
        ["0:2", "a"],
        ["0:3", "m"],
        ["0:4", "a"],
        ["1:2", "i"],
        ["2:2", "r"],
      ]),
    ),
  ).toBe(true);
});
