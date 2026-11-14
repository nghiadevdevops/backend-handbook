/**
 * Simulated "legacy code": nobody remembers the rules, no docs.
 * We do NOT change it, we only pin its behaviour with characterization tests (chapter 10).
 */
export function calcShippingFee(weightGram: number, zone: string, express: boolean): number {
  let fee = 15000;
  if (weightGram > 500) {
    fee += Math.ceil((weightGram - 500) / 250) * 5000;
  }
  if (zone === 'HN' || zone === 'HCM') {
    fee -= 5000;
  } else if (zone === 'ISLAND') {
    fee *= 3;
  }
  if (express) {
    fee = Math.round(fee * 1.5);
  }
  if (weightGram > 20000) {
    fee = 0; // oversize: handled by another department
  }

  return fee;
}
