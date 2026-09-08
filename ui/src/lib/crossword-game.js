export function cellKey(row, column) {
  return `${row}:${column}`;
}

export function slotCells(slot) {
  const vertical = slot.direction === "down";
  return Array.from({ length: slot.answer.length }, (_, index) =>
    cellKey(slot.row + (vertical ? index : 0), slot.col + (vertical ? 0 : index)),
  );
}

export function buildCrosswordGrid(rows, columns, slots) {
  const grid = Array.from({ length: rows }, () => Array(columns).fill(""));

  for (const slot of slots) {
    for (const [index, letter] of [...slot.answer].entries()) {
      const row = slot.row + (slot.direction === "down" ? index : 0);
      const column = slot.col + (slot.direction === "across" ? index : 0);
      if (row < 0 || row >= rows || column < 0 || column >= columns)
        throw new Error(`Crossword slot is outside the grid: ${slot.answer}`);
      if (grid[row][column] && grid[row][column] !== letter)
        throw new Error(`Crossword slots conflict at ${row}:${column}`);
      grid[row][column] = letter;
    }
  }

  return grid;
}

export function isCrosswordComplete(slots, letters) {
  return slots.every((slot) =>
    slotCells(slot).every((key, index) => letters.get(key) === slot.answer[index]),
  );
}
