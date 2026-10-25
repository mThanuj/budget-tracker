import { describe, expect, it } from "vitest";
import { legalDetails, missingLegalDetails } from "@/config/legal";
import { csvCell } from "@/server/services/account";

describe("CSV cells", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Chai, samosa")).toBe('"Chai, samosa"');
    expect(csvCell('The "good" one')).toBe('"The ""good"" one"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
  });

  it("stops spreadsheets running text as formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 phone")).toBe("'+91 phone");
    expect(csvCell("@sum")).toBe("'@sum");
    // Numbers and dates are left alone.
    expect(csvCell("-12.50", { text: false })).toBe("-12.50");
  });
});

describe("legal details", () => {
  it("lists what's still missing before launch", () => {
    expect(missingLegalDetails(legalDetails({}))).toEqual([
      "LEGAL_NAME",
      "SUPPORT_EMAIL",
      "BUSINESS_ADDRESS",
      "LEGAL_CITY",
    ]);
    const d = legalDetails({
      LEGAL_NAME: "A",
      SUPPORT_EMAIL: "a@b.in",
      BUSINESS_ADDRESS: " Hyderabad ",
      LEGAL_CITY: "Hyderabad",
    });
    expect(missingLegalDetails(d)).toEqual([]);
    expect(d.address).toBe("Hyderabad");
  });
});
