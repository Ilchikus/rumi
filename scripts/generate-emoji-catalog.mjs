import fs from "node:fs/promises";

const UNICODE_VERSION = "17.0.0";
const CLDR_VERSION = "48.0.0";
const EMOJI_TEST_URL =
  `https://www.unicode.org/Public/${UNICODE_VERSION}/emoji/emoji-test.txt`;
const CLDR_BASE_URL =
  `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json`;
const ANNOTATIONS_URL =
  `${CLDR_BASE_URL}/cldr-annotations-full/annotations/en/annotations.json`;
const DERIVED_ANNOTATIONS_URL =
  `${CLDR_BASE_URL}/cldr-annotations-derived-full/annotationsDerived/en/annotations.json`;
const OUTPUT_URL = new URL(
  "../apps/web/src/components/emoji/emoji-catalog.generated.json",
  import.meta.url
);

const [emojiTest, annotationsSource, derivedAnnotationsSource] = await Promise.all([
  fetchText(EMOJI_TEST_URL),
  fetchText(ANNOTATIONS_URL),
  fetchText(DERIVED_ANNOTATIONS_URL)
]);

const annotationsJson = JSON.parse(annotationsSource);
const derivedAnnotationsJson = JSON.parse(derivedAnnotationsSource);
const annotations = annotationsJson.annotations.annotations;
const derivedAnnotations = derivedAnnotationsJson.annotationsDerived.annotations;
const emojis = [];
let group = "";
let subgroup = "";

for (const line of emojiTest.split(/\r?\n/u)) {
  if (line.startsWith("# group: ")) {
    group = line.slice("# group: ".length);
    continue;
  }
  if (line.startsWith("# subgroup: ")) {
    subgroup = line.slice("# subgroup: ".length);
    continue;
  }
  if (group === "Component" || !line.includes("; fully-qualified")) continue;

  const match = line.match(
    /^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/u
  );
  if (!match) continue;

  const [, codePoints = "", emoji = "", fallbackName = ""] = match;
  if (containsSkinToneModifier(codePoints)) continue;

  const annotation = {
    ...(annotations[emoji] ?? {}),
    ...(derivedAnnotations[emoji] ?? {})
  };
  const name = annotation.tts?.[0] ?? fallbackName;
  const keywords = uniqueStrings([
    ...(annotation.default ?? []),
    name
  ]);

  emojis.push({
    emoji,
    name,
    keywords,
    group,
    subgroup,
    order: emojis.length
  });
}

const catalog = {
  metadata: {
    unicodeVersion: UNICODE_VERSION,
    cldrVersion: CLDR_VERSION,
    sources: [EMOJI_TEST_URL, ANNOTATIONS_URL, DERIVED_ANNOTATIONS_URL],
    license: "Unicode-3.0"
  },
  emojis
};

await fs.mkdir(new URL(".", OUTPUT_URL), { recursive: true });
await fs.writeFile(OUTPUT_URL, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

process.stdout.write(`Generated ${emojis.length} emoji entries at ${OUTPUT_URL.pathname}\n`);

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Unable to fetch ${url}: ${response.status} ${response.statusText}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

function containsSkinToneModifier(codePoints) {
  return codePoints
    .trim()
    .split(/\s+/u)
    .some((value) => {
      const codePoint = Number.parseInt(value, 16);
      return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
    });
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
