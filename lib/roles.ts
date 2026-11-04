import type { Localized } from "./types";

export type Role = Localized & {
  id: string;
  /** Job search query, without the location. Simple words work far better than long phrases. */
  query: string;
  moreQueries?: string[];
  /** Text search for local businesses that might need this person. Null when a walk-in makes no sense. */
  placesQuery: string | null;
};

export const ROLES: Role[] = [
  { id: "electrician", en: "Electrician", hi: "इलेक्ट्रीशियन", kn: "ಎಲೆಕ್ಟ್ರಿಷಿಯನ್", query: "electrician", placesQuery: "electrical contractor" },
  { id: "fitter", en: "ITI fitter", hi: "आईटीआई फिटर", kn: "ಐಟಿಐ ಫಿಟ್ಟರ್", query: "ITI fitter", placesQuery: "engineering workshop" },
  { id: "mobile_repair", en: "Mobile repair technician", hi: "मोबाइल रिपेयर टेक्नीशियन", kn: "ಮೊಬೈಲ್ ರಿಪೇರಿ ತಂತ್ರಜ್ಞ", query: "mobile repair technician", moreQueries: ["mobile technician", "mobile service engineer", "laptop repair technician"], placesQuery: "mobile phone repair shop" },
  { id: "welder", en: "Welder", hi: "वेल्डर", kn: "ವೆಲ್ಡರ್", query: "welder", placesQuery: "welding and fabrication workshop" },
  { id: "cnc", en: "CNC operator", hi: "सीएनसी ऑपरेटर", kn: "ಸಿಎನ್‌ಸಿ ಆಪರೇಟರ್", query: "CNC operator", placesQuery: "CNC machining workshop" },
  { id: "ac_tech", en: "AC technician", hi: "एसी टेक्नीशियन", kn: "ಎಸಿ ತಂತ್ರಜ್ಞ", query: "AC technician", placesQuery: "air conditioner repair service" },
  { id: "diploma_mech", en: "Diploma mechanical", hi: "डिप्लोमा मैकेनिकल", kn: "ಡಿಪ್ಲೊಮಾ ಮೆಕ್ಯಾನಿಕಲ್", query: "diploma mechanical engineer", placesQuery: "mechanical engineering company" },
  { id: "diploma_elec", en: "Diploma electrical", hi: "डिप्लोमा इलेक्ट्रिकल", kn: "ಡಿಪ್ಲೊಮಾ ಎಲೆಕ್ಟ್ರಿಕಲ್", query: "electrical engineer diploma", placesQuery: "electrical panel manufacturer" },
  { id: "diploma_civil", en: "Diploma civil", hi: "डिप्लोमा सिविल", kn: "ಡಿಪ್ಲೊಮಾ ಸಿವಿಲ್", query: "site supervisor", placesQuery: "construction company" },
  { id: "auto_mech", en: "Vehicle mechanic", hi: "गाड़ी मैकेनिक", kn: "ವಾಹನ ಮೆಕ್ಯಾನಿಕ್", query: "bike mechanic", placesQuery: "two wheeler service center" },
  { id: "plumber", en: "Plumber", hi: "प्लंबर", kn: "ಪ್ಲಂಬರ್", query: "plumber", placesQuery: "plumbing contractor" },
  { id: "cctv", en: "CCTV and field technician", hi: "सीसीटीवी और फील्ड टेक्नीशियन", kn: "ಸಿಸಿಟಿವಿ ಮತ್ತು ಫೀಲ್ಡ್ ತಂತ್ರಜ್ಞ", query: "CCTV technician", placesQuery: "CCTV installation company" },
  { id: "solar", en: "Solar technician", hi: "सोलर टेक्नीशियन", kn: "ಸೌರ ತಂತ್ರಜ್ಞ", query: "solar technician", placesQuery: "solar panel installation company" },
  { id: "tailor", en: "Tailor and garment worker", hi: "दर्जी और गारमेंट कर्मचारी", kn: "ದರ್ಜಿ ಮತ್ತು ಗಾರ್ಮೆಂಟ್ ಕೆಲಸಗಾರ", query: "tailor", placesQuery: "tailoring shop" },
  { id: "driver", en: "Driver and delivery", hi: "ड्राइवर और डिलीवरी", kn: "ಚಾಲಕ ಮತ್ತು ಡೆಲಿವರಿ", query: "driver delivery", placesQuery: "courier and logistics office" },
  { id: "accounts", en: "Accounts assistant", hi: "अकाउंट्स असिस्टेंट", kn: "ಅಕೌಂಟ್ಸ್ ಸಹಾಯಕ", query: "accounts assistant", placesQuery: "chartered accountant office" },
  { id: "bank_ops", en: "Bank and finance support", hi: "बैंक और फाइनेंस सहायक", kn: "ಬ್ಯಾಂಕ್ ಮತ್ತು ಹಣಕಾಸು ಸಹಾಯಕ", query: "bank back office", moreQueries: ["BCom fresher"], placesQuery: "financial services office" },
  { id: "office_admin", en: "Office and data entry", hi: "ऑफिस और डेटा एंट्री", kn: "ಕಚೇರಿ ಮತ್ತು ಡೇಟಾ ಎಂಟ್ರಿ", query: "data entry operator", placesQuery: "business office" },
  { id: "telecaller", en: "Telecaller and customer support", hi: "टेलीकॉलर और कस्टमर सपोर्ट", kn: "ಟೆಲಿಕಾಲರ್ ಮತ್ತು ಗ್ರಾಹಕ ಸೇವೆ", query: "telecaller", placesQuery: "call center" },
  { id: "sales", en: "Retail and sales", hi: "रिटेल और सेल्स", kn: "ರಿಟೇಲ್ ಮತ್ತು ಮಾರಾಟ", query: "sales associate", placesQuery: "retail store" },
  { id: "lab_tech", en: "Lab and pharmacy assistant", hi: "लैब और फार्मेसी सहायक", kn: "ಲ್ಯಾಬ್ ಮತ್ತು ಫಾರ್ಮಸಿ ಸಹಾಯಕ", query: "lab technician", placesQuery: "diagnostic laboratory" },
  { id: "nursing", en: "Nursing and care assistant", hi: "नर्सिंग और केयर सहायक", kn: "ನರ್ಸಿಂಗ್ ಮತ್ತು ಆರೈಕೆ ಸಹಾಯಕ", query: "nursing assistant", placesQuery: "nursing home" },
  { id: "teaching", en: "Teaching assistant", hi: "शिक्षण सहायक", kn: "ಬೋಧನಾ ಸಹಾಯಕ", query: "school teacher", placesQuery: "private school" },
  { id: "hospitality", en: "Hotel and kitchen staff", hi: "होटल और किचन स्टाफ", kn: "ಹೋಟೆಲ್ ಮತ್ತು ಅಡುಗೆ ಸಿಬ್ಬಂದಿ", query: "hotel helper", moreQueries: ["kitchen helper"], placesQuery: "restaurant" },
  { id: "apprentice", en: "Apprentice and trainee", hi: "अप्रेंटिस और ट्रेनी", kn: "ಅಪ್ರೆಂಟಿಸ್ ಮತ್ತು ತರಬೇತಿ", query: "apprentice trainee", moreQueries: ["ITI apprentice", "diploma trainee"], placesQuery: null },
];

export const roleById = (id: string) => ROLES.find((role) => role.id === id);
