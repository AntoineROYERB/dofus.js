import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fr } from "./fr";
import { setCurrentLang, t, tLoose, tn, translate } from "./lang";
import { localizeLogText, localizeReason } from "./server";

afterEach(() => setCurrentLang("en"));

describe("translate", () => {
  it("is the key itself in English", () => {
    expect(translate("en", "Find a game")).toBe("Find a game");
  });

  it("is the dictionary's text in French, placeholders filled", () => {
    expect(translate("fr", "Challenge {name}", { name: "Ashka" })).toBe("Défier Ashka");
  });

  it("leaves a placeholder it was not given in place", () => {
    expect(translate("fr", "Challenge {name}")).toBe("Défier {name}");
  });
});

describe("tn", () => {
  it("counts 0 as singular in French and plural in English", () => {
    setCurrentLang("fr");
    expect(tn("{n} turn left", "{n} turns left", 0)).toBe("0 tour restant");
    setCurrentLang("en");
    expect(tn("{n} turn left", "{n} turns left", 0)).toBe("0 turns left");
  });
});

describe("what the server says", () => {
  it("translates a refusal it knows, and shows one it does not as it came", () => {
    setCurrentLang("fr");
    expect(localizeReason("it is not your turn")).toBe("ce n'est pas ton tour");
    expect(localizeReason("a brand new refusal")).toBe("a brand new refusal");
    expect(tLoose("a brand new refusal")).toBe("a brand new refusal");
  });

  it("keeps a spell's name as it is in a cast line", () => {
    setCurrentLang("fr");
    expect(localizeLogText("cast Kindle, hitting nothing")).toBe("lance Kindle, sans rien toucher");
    expect(localizeLogText("cast Kindle — critical!")).toBe("lance Kindle — critique !");
    expect(localizeLogText("cast Kindle")).toBe("lance Kindle");
    expect(localizeLogText("recovers 5 health")).toBe("récupère 5 PV");
    expect(localizeLogText("starts their turn")).toBe("commence son tour");
  });
});

describe("the French dictionary", () => {
  const entries = Object.entries(fr) as [string, string][];

  it("keeps every placeholder of the English", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [english, french] of entries) {
      expect([english, names(french)]).toEqual([english, names(english)]);
    }
  });

  it("keeps a sentence's bold words bold", () => {
    for (const [english, french] of entries) {
      expect([english, french.split("<b>").length]).toEqual([english, english.split("<b>").length]);
    }
  });

  // A key nothing asks for any more is a translation that drifted away from
  // its English: the English was reworded, and the French was not.
  it("has no entry the code no longer asks for", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && name !== "fr.ts") files.push(path);
      }
    };
    walk(join(__dirname, ".."));
    const source = files.map((f) => readFileSync(f, "utf8")).join("\n");
    const unused = entries.map(([english]) => english).filter((english) => !source.includes(JSON.stringify(english)));
    expect(unused).toEqual([]);
  });

  it("is what t returns in French", () => {
    setCurrentLang("fr");
    expect(t("End turn")).toBe("Fin de tour");
  });
});
