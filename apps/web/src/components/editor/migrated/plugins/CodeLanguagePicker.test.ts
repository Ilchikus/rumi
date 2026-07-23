import { describe, expect, it } from "vitest";
import { filterCodeLanguages } from "./CodeLanguagePicker";

describe("code language picker", () => {
  it("searches canonical labels and common aliases", () => {
    expect(filterCodeLanguages("script").map((option) => option.value)).toEqual([
      "javascript",
      "typescript"
    ]);
    expect(filterCodeLanguages("shell").map((option) => option.value)).toEqual(["bash"]);
    expect(filterCodeLanguages("c++").map((option) => option.value)).toEqual(["cpp"]);
  });

  it("keeps plain text available in the unfiltered menu", () => {
    expect(filterCodeLanguages("")[0]).toMatchObject({ value: "", label: "Plain text" });
  });
});
