/** Units of each real item consumed by one order line (combos expanded). */
export function expandLine(
  line: { itemId: number | null; comboId: number | null; qty: number; choiceItemIds: number[] },
  comboParts: { comboId: number; itemId: number; qty: number }[],
): Map<number, number> {
  const used = new Map<number, number>();
  const add = (itemId: number, qty: number) => used.set(itemId, (used.get(itemId) ?? 0) + qty);
  if (line.itemId) add(line.itemId, line.qty);
  if (line.comboId) {
    comboParts.filter((p) => p.comboId === line.comboId).forEach((p) => add(p.itemId, p.qty * line.qty));
    line.choiceItemIds.forEach((id) => add(id, line.qty));
  }
  return used;
}
