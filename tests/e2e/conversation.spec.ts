import { askQuestion, examples, expect, isAskRequest, serveStream, stream, test, type Page } from "./fixtures";

// F01-T07 AC2, AC3 and AC5: the follow-up without context, the answer in another language, the "new
// conversation" button and the idle reset (zorzo-api LLD "Front against the API").

const SESSION_TTL = "30:00";   // zorzo-api LLD "Values and configuration"

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
}

/** The session id of every question the page sends, in order. */
function sessionsSent(page: Page): string[] {
  const sessions: string[] = [];
  page.on("request", (r) => { if (isAskRequest(r)) sessions.push(r.postDataJSON().session); });
  return sessions;
}

async function askAndWait(page: Page, sessions: string[], question = "Which cloud services does he use?") {
  const before = sessions.length;
  await askQuestion(page, question);
  await expect.poll(() => sessions.length).toBe(before + 1);
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
}

test("a follow-up without context shows its message", async ({ page }) => {
  await serveStream(page, stream("no-context"));
  await open(page);
  await askQuestion(page, "And what was the result?");
  const text = page.locator("#ansText");
  await expect(text).toHaveText(/^(I don't have earlier context in this conversation — what are you asking about\?|Não tenho contexto anterior nesta conversa — sobre o que você está perguntando\?)$/);
  await expect(page.locator("#answer")).not.toContainText(/Not in my sources|Não está nas minhas fontes/);
  await expect(page.locator("#answer .ans-examples button")).toHaveText(examples.filter((e) => e.lang === "en").map((e) => e.text));
});

test("an answer in another language shows the language line", async ({ page }) => {
  await serveStream(page, stream("other-language"));
  await open(page);
  await askQuestion(page, "¿Qué servicios de AWS ha usado?");
  const line = page.locator("#answer .ans-language");
  await expect(line).toHaveText(/This site answers in English and Portuguese\.|Este site responde em português e inglês\./);
  await expect(page.locator("#answer .ans-language + .ans-text .claim")).toHaveCount(4);   // above the checked claims
  await serveStream(page, stream("answer"));
  await askQuestion(page, "Which AWS services has he used?");
  await expect(page.locator("#ansText .claim")).toHaveCount(4);
  await expect(line).toHaveCount(0);   // only the answer that needed it
});

test("the new conversation button starts a new session", async ({ page }) => {
  const sessions = sessionsSent(page);
  await open(page);
  await askAndWait(page, sessions);
  await page.locator("#ansNew").click();
  await expect(page.locator("#answer")).toBeHidden();
  await expect(page.locator("#ansText")).toBeEmpty();
  await askAndWait(page, sessions, "Has he led a migration?");
  expect(sessions[1]).not.toBe(sessions[0]);
  await expect(page.locator("#answer .ans-new")).toHaveCount(0);   // the visitor asked for it: no notice
});

test("an idle conversation starts over with a notice", async ({ page }) => {
  await page.clock.install();
  const sessions = sessionsSent(page);
  await open(page);
  await askAndWait(page, sessions);
  await page.reload();
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askAndWait(page, sessions);
  await page.clock.fastForward("29:00");   // within SESSION_TTL of the last question
  await askAndWait(page, sessions);
  expect(sessions.slice(1)).toEqual([sessions[0], sessions[0]]);
  await expect(page.locator("#answer .ans-new")).toHaveCount(0);
  await page.clock.fastForward(SESSION_TTL);
  await page.clock.fastForward("00:01");   // past it
  await askAndWait(page, sessions);
  expect(sessions[3]).not.toBe(sessions[0]);
  await expect(page.locator("#answer .ans-new")).toHaveText(/new conversation|nova conversa/i);
});
