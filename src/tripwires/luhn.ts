/** Luhn checksum, used to tell real card numbers from other long digit strings. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Strip spaces and dashes, then check length and Luhn. */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  // Reject trivial repeats such as 0000000000000000, which pass Luhn.
  if (/^(\d)\1+$/.test(digits)) return false;
  return luhnValid(digits);
}
