/**
 * Runs the posting screen over 100 job postings: 50 honest ones and the same 50 with a demand for
 * money added. Prints how many of each would be blocked, the score ranges, and how long each check took.
 * The postings are written by us, so this is a regression check, not a real-world accuracy figure.
 */
import { performance } from "node:perf_hooks";
import { BLOCK_AT, BLOCKING_SIGNALS } from "../lib/postings";
import { screenPosting } from "../lib/server/hiring";

const BASES = [
  "Need a tailor for ladies blouses and alterations at my shop in Malleshwaram. ₹14,000 to ₹16,000 a month, 10 am to 8 pm, Tuesday off.",
  "Mobile repair technician wanted at Sri Ganesh Mobiles, Jayanagar 4th Block. Must know screen and battery change. ₹16,000 to ₹19,000 a month.",
  "Electrician needed for house wiring work around Whitefield. Daily wage ₹900. ITI electrical preferred.",
  "AC service technician for a small service centre in BTM Layout. Split and window AC servicing. ₹18,000 a month plus incentives.",
  "Delivery rider with own two-wheeler and licence, Koramangala area. ₹20,000 a month plus petrol allowance.",
  "Cook for a small South Indian hotel in Basavanagudi. Morning 6 am to 3 pm. ₹15,000 a month, food provided.",
  "Helper for our kirana store in Vijayanagar. Packing, billing support, stock arranging. ₹11,000 a month.",
  "Beautician for a ladies salon in Rajajinagar. Threading, facial, waxing. ₹14,000 a month plus commission.",
  "Plumber needed for apartment maintenance in HSR Layout. ₹17,000 a month, Sunday off.",
  "Carpenter for modular kitchen fitting jobs across Bengaluru. ₹1,000 a day, work 6 days a week.",
  "Two-wheeler mechanic for a garage in Yeshwanthpur. Must know servicing and engine work. ₹15,000 to ₹18,000 a month.",
  "Security guard for a warehouse in Peenya, night shift 8 pm to 8 am. ₹14,500 a month, PF and ESI.",
  "Data entry operator for a transport office in Yelahanka. Basic computer and Kannada typing. ₹13,000 a month.",
  "Sales assistant for a mobile accessories shop in SP Road. Speak Kannada and Hindi. ₹12,000 a month plus incentive.",
  "Welder for a fabrication unit in Bommasandra. Arc welding experience needed. ₹650 a day.",
  "Painter for house painting contracts in Electronic City. ₹850 a day, materials provided by us.",
  "Driver for a family car in Indiranagar, 9 am to 7 pm. ₹18,000 a month. Valid licence needed.",
  "Housekeeping staff for a small hotel near Majestic. Room cleaning and laundry. ₹12,000 a month with stay.",
  "Bakery helper in Frazer Town, early morning shift from 5 am. ₹11,500 a month and food.",
  "Printing press operator for offset machine in Chamarajpet. ₹16,000 a month, experience 2 years.",
  "CCTV installation technician for our security shop in Marathahalli. ₹17,000 a month plus travel.",
  "Laptop repair technician, chip level, for a service centre in Shivajinagar. ₹20,000 to ₹25,000 a month.",
  "Supervisor for a garment unit in Bommanahalli, managing 20 tailors. ₹22,000 a month.",
  "Receptionist for a dental clinic in JP Nagar. Kannada and English. ₹13,000 a month, 10 am to 7 pm.",
  "Cashier for a supermarket in Banashankari. Billing experience preferred. ₹14,000 a month.",
  "Pharmacy assistant for a medical store in Kengeri. D.Pharm preferred. ₹15,000 a month.",
  "Tiles mason for flooring work in Sarjapur Road projects. ₹1,100 a day.",
  "Car washer for a car wash centre in Hebbal. ₹10,500 a month, Monday off.",
  "Field sales executive for water purifiers in north Bengaluru. Own bike. ₹15,000 plus incentives.",
  "Tea master for a tea stall near Silk Board. ₹13,000 a month and food.",
  "Gardener for a villa community in Bannerghatta Road. ₹12,000 a month, 7 am to 3 pm.",
  "Packing staff for an e-commerce warehouse in Hoskote. ₹14,000 a month, shift work, transport provided.",
  "Bike showroom helper in RT Nagar. Cleaning bikes, assisting customers. ₹11,000 a month.",
  "Embroidery machine operator for a boutique in Commercial Street. ₹15,000 a month.",
  "Cook helper for a catering company in Hennur. Cutting, washing, serving at events. ₹12,000 a month.",
  "Office boy for a CA office in Gandhinagar. Bank work, filing, tea. ₹11,000 a month.",
  "Refrigerator and washing machine repair technician in Banaswadi. ₹16,000 a month plus incentive per call.",
  "Hair stylist for a men's salon in Kammanahalli. ₹16,000 a month plus tips.",
  "Lab assistant for a diagnostic centre in Vidyaranyapura. DMLT required. ₹14,000 a month.",
  "Stitching operator for a garment factory in Mysore Road. Experience on single needle machine. ₹13,500 a month with PF.",
  "Auto mechanic for a three-wheeler garage in KR Puram. ₹15,000 a month.",
  "Computer teacher for a small coaching centre in Nagarbhavi. Basic MS Office. ₹12,000 a month, evenings.",
  "Store keeper for a hardware shop in Avenue Road. Stock register, billing. ₹14,000 a month.",
  "Solar panel installation helper, travel within Bengaluru. ₹700 a day.",
  "Florist helper for a flower shop in KR Market, early morning 4 am to 12 pm. ₹10,000 a month.",
  "Cobbler and bag repair worker for a shoe shop in Jayanagar. ₹12,000 a month.",
  "Gym trainer for a neighbourhood gym in Malleswaram. ₹15,000 a month, morning and evening shifts.",
  "Photocopy and DTP operator for a xerox shop near Vidhana Soudha. Kannada DTP. ₹12,500 a month.",
  "Waiter for a family restaurant in Sadashivanagar. ₹11,000 a month plus tips and food.",
  "Aluminium window fabricator for a shop in Mahadevapura. ₹750 a day.",
];

const MONEY_ASKS = [
  "Pay a registration fee of ₹500 to book your interview slot.",
  "A refundable deposit of ₹2,000 must be paid before joining.",
  "Uniform and kit charge of ₹1,200 to be paid in advance.",
  "Training fee of ₹3,000 must be paid on the first day.",
  "Send ₹199 on GPay to confirm your seat for the interview.",
  "Security deposit of ₹5,000 for tools, payable before you start.",
  "ID card and documentation charge of ₹300 at the time of interview.",
  "Medical test fee of ₹850 to be paid to our agent before selection.",
  "Pay ₹250 courier charge to receive your offer letter.",
  "Processing fee of ₹999 is compulsory to get the job.",
];

const postings = [
  ...BASES.map((text) => ({ text, asksMoney: false })),
  ...BASES.map((text, i) => ({ text: `${text} ${MONEY_ASKS[i % MONEY_ASKS.length]}`, asksMoney: true })),
];

async function main() {
  const results: { asksMoney: boolean; payment: number; blocked: boolean; ms: number; text: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < postings.length) {
      const item = postings[next++];
      const start = performance.now();
      const scores = await screenPosting(item.text);
      const ms = performance.now() - start;
      const blocked = BLOCKING_SIGNALS.some((key) => scores[key] >= BLOCK_AT);
      results.push({ asksMoney: item.asksMoney, payment: scores.asks_payment, blocked, ms, text: item.text });
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const honest = results.filter((r) => !r.asksMoney);
  const money = results.filter((r) => r.asksMoney);
  const range = (xs: number[]) => `${Math.min(...xs).toFixed(2)} to ${Math.max(...xs).toFixed(2)}`;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  for (const r of results) {
    if (r.asksMoney && !r.blocked) console.log("MISSED:", r.payment.toFixed(2), r.text);
    if (!r.asksMoney && r.blocked) console.log("FALSE BLOCK:", r.payment.toFixed(2), r.text);
  }
  console.log(`postings: ${results.length} (${honest.length} honest, ${money.length} asking for money), block at ${BLOCK_AT}`);
  console.log(`blocked: ${money.filter((r) => r.blocked).length}/${money.length} asking for money, ${honest.filter((r) => r.blocked).length}/${honest.length} honest`);
  console.log(`asks_payment score: honest ${range(honest.map((r) => r.payment))}, asking for money ${range(money.map((r) => r.payment))}`);
  console.log(`time per check: median ${Math.round(ms[Math.floor(ms.length / 2)])} ms, 90th percentile ${Math.round(ms[Math.floor(ms.length * 0.9)])} ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
