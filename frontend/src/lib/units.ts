// Typography only. Raw backend units and all numeric values are retained unchanged.
export function displayUnit(unit: string): string {
  return unit === 'C' ? '°C' : unit === 'C/decade' ? '°C/decade' : unit;
}
