import { describe, it, expect } from "vitest";
import { contrastRatio, personDisc, personInitial } from "./personColor";
import { PERSON_COLORS } from "../types";

describe("personDisc", () => {
  it("uses the designer's own disc for every pastel they specified", () => {
    expect(personDisc("#FFD9A0")).toBe("#7E5410");
    expect(personDisc("#FFC4B8")).toBe("#A8452F");
    expect(personDisc("#C9E8C9")).toBe("#3F7A44");
    expect(personDisc("#BFD9FF")).toBe("#3C6BB5");
    expect(personDisc("#E8C9F0")).toBe("#8A4CA0");
  });

  it("keeps a derived disc in the same contrast band as the specified ones", () => {
    // the five specified sit between 5.1 and 6.7 against white; a derived one that lands at
    // 8.5 is technically readable and visibly not part of the family
    for (const stored of ["#F5E6A0", "#B8E8E0", "#F0C9C9"]) {
      const ratio = contrastRatio(personDisc(stored), "#FFFFFF");
      expect(ratio, `${stored} → ${personDisc(stored)}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio, `${stored} → ${personDisc(stored)}`).toBeLessThan(7);
    }
  });

  it("gives every stored pastel a disc that can carry white text", () => {
    // 4.5:1 is the readable threshold; the initial is the only thing identifying a person
    // on a 22px avatar, so a disc that fails this is a person nobody can tell apart.
    for (const stored of PERSON_COLORS) {
      const disc = personDisc(stored);
      expect(contrastRatio(disc, "#FFFFFF"), `${stored} → ${disc}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps each pastel's hue, so the disc still reads as that person's colour", () => {
    // green stays green, blue stays blue — a derived disc that changed hue would be a
    // different person at a glance
    const hueOf = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const green = hueOf(personDisc("#C9E8C9"));
    expect(green.g).toBeGreaterThan(green.r);
    expect(green.g).toBeGreaterThan(green.b);
    const blue = hueOf(personDisc("#BFD9FF"));
    expect(blue.b).toBeGreaterThan(blue.r);
    expect(blue.b).toBeGreaterThan(blue.g);
  });

  it("gives eight visibly different discs, not eight browns", () => {
    const discs = new Set(PERSON_COLORS.map(personDisc));
    expect(discs.size).toBe(PERSON_COLORS.length);
  });

  it("falls back to ink rather than an invisible disc when the colour is unreadable", () => {
    for (const bad of ["", "not-a-colour", "#12345", "rgb(1,2,3)"]) {
      expect(personDisc(bad)).toBe("#3D2B24");
    }
  });

  it("accepts a hex without the hash, and is case-insensitive", () => {
    expect(personDisc("ffd9a0")).toBe(personDisc("#FFD9A0"));
    expect(personDisc("#ffd9a0")).toBe(personDisc("#FFD9A0"));
  });

  it("is stable — the same person's disc never changes between renders", () => {
    expect(personDisc("#FFD9A0")).toBe(personDisc("#FFD9A0"));
  });
});

describe("personInitial", () => {
  it("takes the first letter, upper-cased", () => {
    expect(personInitial("Sofia")).toBe("S");
    expect(personInitial("ravi")).toBe("R");
  });

  it("keeps accents rather than mangling a name", () => {
    expect(personInitial("Ália")).toBe("Á");
  });

  it("ignores leading spaces", () => {
    expect(personInitial("  Tom")).toBe("T");
  });

  it("marks an unnamed person rather than rendering an empty disc", () => {
    expect(personInitial("")).toBe("?");
    expect(personInitial("   ")).toBe("?");
  });
});

describe("contrastRatio", () => {
  it("matches the known extremes", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});
