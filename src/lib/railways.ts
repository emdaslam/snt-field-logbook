/** Indian Railways zones and divisions as on 1 June 2026 (SCoR operational). */

export const DEFAULT_RAILWAY_ZONE = "South Coast Railway";
export const DEFAULT_RAILWAY_DIVISION = "Guntakal";

export type RailwayZone = { name: string; code: string; divisions: readonly string[] };

export const RAILWAY_ZONES: readonly RailwayZone[] = [
  { name: "Central Railway", code: "CR", divisions: ["Mumbai CSMT", "Bhusawal", "Nagpur", "Pune", "Solapur"] },
  { name: "Eastern Railway", code: "ER", divisions: ["Howrah", "Sealdah", "Asansol", "Malda"] },
  { name: "East Central Railway", code: "ECR", divisions: ["Danapur", "Dhanbad", "Pandit Deen Dayal Upadhyaya", "Samastipur", "Sonpur"] },
  { name: "East Coast Railway", code: "ECoR", divisions: ["Khurda Road", "Sambalpur", "Rayagada"] },
  { name: "Northern Railway", code: "NR", divisions: ["Delhi", "Ambala", "Firozpur", "Jammu", "Lucknow", "Moradabad"] },
  { name: "North Central Railway", code: "NCR", divisions: ["Prayagraj", "Agra", "Jhansi"] },
  { name: "North Eastern Railway", code: "NER", divisions: ["Izzatnagar", "Lucknow", "Varanasi"] },
  { name: "Northeast Frontier Railway", code: "NFR", divisions: ["Katihar", "Alipurduar", "Rangiya", "Lumding", "Tinsukia"] },
  { name: "North Western Railway", code: "NWR", divisions: ["Jaipur", "Ajmer", "Bikaner", "Jodhpur"] },
  { name: "Southern Railway", code: "SR", divisions: ["Chennai", "Madurai", "Palakkad", "Salem", "Tiruchirappalli", "Thiruvananthapuram"] },
  { name: "South Central Railway", code: "SCR", divisions: ["Secunderabad", "Hyderabad", "Nanded"] },
  { name: "South Coast Railway", code: "SCoR", divisions: ["Guntakal", "Guntur", "Vijayawada", "Visakhapatnam"] },
  { name: "South Eastern Railway", code: "SER", divisions: ["Adra", "Chakradharpur", "Kharagpur", "Ranchi"] },
  { name: "South East Central Railway", code: "SECR", divisions: ["Bilaspur", "Nagpur", "Raipur"] },
  { name: "South Western Railway", code: "SWR", divisions: ["Hubballi", "Bengaluru", "Mysuru"] },
  { name: "Western Railway", code: "WR", divisions: ["Mumbai Central", "Vadodara", "Ratlam", "Ahmedabad", "Rajkot", "Bhavnagar"] },
  { name: "West Central Railway", code: "WCR", divisions: ["Jabalpur", "Bhopal", "Kota"] },
  { name: "Metro Railway, Kolkata", code: "MTP", divisions: [] },
];

export function divisionsOf(zone: string | null | undefined): readonly string[] {
  return RAILWAY_ZONES.find((z) => z.name === zone)?.divisions ?? [];
}

/** Division name → its official short code, as printed on office forms
 *  ("Sr. DSTE/M/GTL"). Unknown divisions fall back to the name itself. */
const DIVISION_CODES: Record<string, string> = {
  "Mumbai CSMT": "CSMT",
  Bhusawal: "BSL",
  Nagpur: "NGP",
  Pune: "PUNE",
  Solapur: "SUR",
  Howrah: "HWH",
  Sealdah: "SDAH",
  Asansol: "ASN",
  Malda: "MLDT",
  Danapur: "DNR",
  Dhanbad: "DHN",
  "Pandit Deen Dayal Upadhyaya": "DDU",
  Samastipur: "SPJ",
  Sonpur: "SEE",
  "Khurda Road": "KUR",
  Sambalpur: "SBP",
  Rayagada: "RGDA",
  Delhi: "DLI",
  Ambala: "UMB",
  Firozpur: "FZR",
  Jammu: "JAT",
  Lucknow: "LKO",
  Moradabad: "MB",
  Prayagraj: "PRYJ",
  Agra: "AGC",
  Jhansi: "JHS",
  Izzatnagar: "IZN",
  Varanasi: "BSB",
  Katihar: "KIR",
  Alipurduar: "APDJ",
  Rangiya: "RNY",
  Lumding: "LMG",
  Tinsukia: "TSK",
  Jaipur: "JP",
  Ajmer: "AII",
  Bikaner: "BKN",
  Jodhpur: "JU",
  Chennai: "MAS",
  Madurai: "MDU",
  Palakkad: "PGT",
  Salem: "SA",
  Tiruchirappalli: "TPJ",
  Thiruvananthapuram: "TVC",
  Secunderabad: "SC",
  Hyderabad: "HYB",
  Nanded: "NED",
  Guntakal: "GTL",
  Guntur: "GNT",
  Vijayawada: "BZA",
  Visakhapatnam: "VSKP",
  Adra: "ADRA",
  Chakradharpur: "CKP",
  Kharagpur: "KGP",
  Ranchi: "RNC",
  Bilaspur: "BSP",
  Raipur: "R",
  Hubballi: "UBL",
  Bengaluru: "SBC",
  Mysuru: "MYS",
  "Mumbai Central": "BCT",
  Vadodara: "BRC",
  Ratlam: "RTM",
  Ahmedabad: "ADI",
  Rajkot: "RJT",
  Bhavnagar: "BVC",
  Jabalpur: "JBP",
  Bhopal: "BPL",
  Kota: "KOTA",
};

export function divisionCode(division?: string | null): string {
  const d = division?.trim() || "";
  return DIVISION_CODES[d] ?? d;
}

export function defaultDivisionFor(zone: string): string {
  const divs = divisionsOf(zone);
  if (zone === DEFAULT_RAILWAY_ZONE) return DEFAULT_RAILWAY_DIVISION;
  return divs[0] ?? "";
}

/** Empty zone/division fall back to South Coast Railway / Guntakal. */
export function resolvedRailway(
  zone?: string | null,
  division?: string | null
): { zone: string; division: string } {
  const z = zone?.trim() || DEFAULT_RAILWAY_ZONE;
  const divs = divisionsOf(z);
  if (divs.length === 0) return { zone: z, division: "" };
  const d = division?.trim() || "";
  if (d && divs.includes(d)) return { zone: z, division: d };
  return { zone: z, division: defaultDivisionFor(z) };
}

export function railwayLabel(zone?: string | null, division?: string | null): string {
  const r = resolvedRailway(zone, division);
  return r.division ? `${r.zone} · ${r.division} Division` : r.zone;
}

/** TA Journal (and similar) title line, e.g. "SOUTH COAST RAILWAY. GUNTAKAL DIVISION". */
export function railwayHeading(zone?: string | null, division?: string | null): string {
  const { zone: z, division: d } = resolvedRailway(zone, division);
  const zu = z.toUpperCase();
  const du = d.toUpperCase();
  return du ? `${zu}. ${du} DIVISION` : zu;
}
