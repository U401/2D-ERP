export type UnitCategory = 'volume' | 'weight' | 'count'

export type StandardUnit = {
  id: string
  label: string
  category: UnitCategory
  // Base unit for conversion (ml for volume, g for weight)
  multiplierToBase: number 
}

export const STANDARD_UNITS: StandardUnit[] = [
  // Volume (Base: ml)
  { id: 'ml', label: 'Milliliters (ml)', category: 'volume', multiplierToBase: 1 },
  { id: 'L', label: 'Liters (L)', category: 'volume', multiplierToBase: 1000 },
  { id: 'fl_oz', label: 'Fluid Ounces (fl oz)', category: 'volume', multiplierToBase: 29.5735 },
  { id: 'gal', label: 'Gallons (gal)', category: 'volume', multiplierToBase: 3785.41 },
  
  // Weight (Base: g)
  { id: 'g', label: 'Grams (g)', category: 'weight', multiplierToBase: 1 },
  { id: 'kg', label: 'Kilograms (kg)', category: 'weight', multiplierToBase: 1000 },
  { id: 'oz', label: 'Ounces (oz)', category: 'weight', multiplierToBase: 28.3495 },
  { id: 'lb', label: 'Pounds (lb)', category: 'weight', multiplierToBase: 453.592 },
]

export function getUnitsByCategory(category: UnitCategory) {
  return STANDARD_UNITS.filter(u => u.category === category)
}

export function getUnitById(id: string) {
  return STANDARD_UNITS.find(u => u.id === id)
}

export function calculateBaseYield(purchaseQuantity: number, purchaseUnitId: string, baseUnitId: string): number {
  const pUnit = getUnitById(purchaseUnitId)
  const bUnit = getUnitById(baseUnitId)
  
  if (!pUnit || !bUnit || pUnit.category !== bUnit.category) {
    return purchaseQuantity // Invalid or mismatched category fallback
  }
  
  // First convert purchase quantity to the category's absolute base (ml or g)
  const amountInAbsoluteBase = purchaseQuantity * pUnit.multiplierToBase
  // Then convert that absolute base into the target base unit
  return amountInAbsoluteBase / bUnit.multiplierToBase
}
