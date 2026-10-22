import rows from "./onet-interest-codes.json";

export const ONET_INTEREST_SOURCE =
  "O*NET 31.0 Career Interest Types; Creative Commons licensed.";
export const ONET_INTEREST_SOURCE_URL =
  "https://www.onetcenter.org/database.html";

export type OnetOccupation = {
  code: string;
  title: string;
  interestCode: string;
};

const occupations = rows as OnetOccupation[];

export function occupationsForHollandCode(code: string): OnetOccupation[] {
  return occupations.filter((occupation) => occupation.interestCode === code);
}

export function occupationsForHollandPrefix(code: string): OnetOccupation[] {
  return occupations.filter((occupation) => occupation.interestCode.startsWith(code));
}
