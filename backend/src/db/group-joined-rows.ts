export function groupJoinedRows<Parent extends { id: string }, Item>(
  rows: { parent: Parent; item: Item | null }[],
): (Parent & { items: Item[] })[] {
  const grouped = new Map<string, Parent & { items: Item[] }>();
  for (const { parent, item } of rows) {
    let entry = grouped.get(parent.id);
    if (!entry) {
      entry = { ...parent, items: [] };
      grouped.set(parent.id, entry);
    }
    if (item !== null) entry.items.push(item);
  }
  return [...grouped.values()];
}
