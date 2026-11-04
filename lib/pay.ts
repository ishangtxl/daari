export type Pay = { amount: string; period: "month" | "year" | "day" };

const rupees = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

/** Turns listing text like "Rs. 15000 - Rs. 20000" or "3 to 5 LPA" into one consistent form. */
export function parsePay(text: string | null): Pay | null {
  if (!text) return null;
  const inLakhs = /\blpa\b|lakh|lac\b/i.test(text);
  const numbers = (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((part) => Number(part.replace(/,/g, "")) * (inLakhs ? 100000 : 1))
    .filter((value) => value >= 100); // Skips figures that are not pay, such as "8 hours".
  if (!numbers.length) return null;
  const period = inLakhs || /year|annum|yearly|\bpa\b/i.test(text) ? "year" : /\bday\b|daily/i.test(text) ? "day" : "month";
  const low = numbers[0];
  const high = numbers[1];
  return { amount: high && high > low ? `${rupees(low)} – ${rupees(high)}` : rupees(low), period };
}
