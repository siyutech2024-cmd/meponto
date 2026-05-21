const baseUrl = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";

const pageChecks = [
  { path: "/login", nav: false },
  { path: "/reset-password", nav: false },
  { path: "/dashboard", nav: true },
];

function stripScriptsAndStyles(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?`, "i"));
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function getElements(html, tagName) {
  const elements = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let match;

  while ((match = pattern.exec(html))) {
    elements.push({ tag: match[0], index: match.index });
  }

  return elements;
}

function getLabelRanges(html) {
  const ranges = [];
  const pattern = /<label\b[^>]*>[\s\S]*?<\/label>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      html: match[0],
      forId: getAttribute(match[0], "for"),
    });
  }

  return ranges;
}

function hasExplicitLabel(control, labels) {
  const id = getAttribute(control.tag, "id");
  return Boolean(id && labels.some((label) => label.forId === id && stripTags(label.html)));
}

function hasWrappingLabel(control, labels) {
  return labels.some((label) => control.index > label.start && control.index < label.end && stripTags(label.html));
}

function hasProgrammaticName(tag) {
  return Boolean(getAttribute(tag, "aria-label") || getAttribute(tag, "aria-labelledby") || getAttribute(tag, "title"));
}

function describeControl(control) {
  const name = getAttribute(control.tag, "name");
  const id = getAttribute(control.tag, "id");
  const placeholder = getAttribute(control.tag, "placeholder");
  return [name ? `name=${name}` : "", id ? `id=${id}` : "", placeholder ? `placeholder=${placeholder}` : ""].filter(Boolean).join(" ") || control.tag;
}

function checkFormControls(path, html) {
  const failures = [];
  const labels = getLabelRanges(html);

  for (const type of ["input", "select", "textarea"]) {
    for (const control of getElements(html, type)) {
      if (type === "input" && getAttribute(control.tag, "type")?.toLowerCase() === "hidden") continue;
      if (hasProgrammaticName(control.tag) || hasExplicitLabel(control, labels) || hasWrappingLabel(control, labels)) continue;
      failures.push(`${path} ${type} lacks an accessible label (${describeControl(control)})`);
    }
  }

  const buttonPattern = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
  let match;
  while ((match = buttonPattern.exec(html))) {
    const tag = match[0].match(/<button\b[^>]*>/i)?.[0] ?? "";
    if (hasProgrammaticName(tag) || stripTags(match[0])) continue;
    failures.push(`${path} button lacks accessible text or aria-label (${tag})`);
  }

  return failures;
}

function checkPage({ path, nav }, html) {
  const cleanHtml = stripScriptsAndStyles(html);
  const failures = [];
  const title = cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const htmlTag = cleanHtml.match(/<html\b[^>]*>/i)?.[0] ?? "";

  if (!getAttribute(htmlTag, "lang")) failures.push(`${path} is missing html lang`);
  if (!title) failures.push(`${path} is missing a document title`);
  if (!/<main\b/i.test(cleanHtml)) failures.push(`${path} is missing a main landmark`);
  if (!/<h1\b/i.test(cleanHtml)) failures.push(`${path} is missing an h1`);
  if (nav && !/<nav\b/i.test(cleanHtml)) failures.push(`${path} is missing a nav landmark`);

  failures.push(...checkFormControls(path, cleanHtml));
  return failures;
}

async function fetchPage(path) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}; expected 2xx`);
  }

  return body;
}

const results = [];
const failures = [];

for (const page of pageChecks) {
  const html = await fetchPage(page.path);
  const pageFailures = checkPage(page, html);
  failures.push(...pageFailures);
  results.push({ path: page.path, failures: pageFailures.length });
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`not ok ${failure}`);
  }
  throw new Error(`Accessibility smoke checks failed: ${failures.length}`);
}

for (const result of results) {
  console.log(`ok a11y page ${result.path}`);
}

console.log(`Accessibility smoke checks passed: ${results.length}`);
