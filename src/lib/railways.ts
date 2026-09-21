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
