/**
 * End-to-end demo flow against the exported web build:
 *   npm run export:web && node e2e/serve.mjs dist 8089 & node e2e/demo-flow.mjs
 * Walks: demo sign-in → onboarding → group chat → Gather AI → vote → close poll →
 * plan → availability → confirm → Plans tab → private assistant → save → share.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally or as a devDependency

const BASE = process.env.BASE_URL ?? 'http://localhost:8089';
const OUT = process.env.SHOTS ?? 'e2e/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DSF ?? 1), colorScheme: process.env.SCHEME ?? 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

let n = 0;
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('✓', name); };
const btn = (name) => page.getByRole('button', { name, exact: false }).first();
const step = async (label, fn) => {
  try { await fn(); } catch (e) { await page.screenshot({ path: `${OUT}/FAILED-${label}.png` }); console.log(errors.join('\n')); throw new Error(`Step "${label}" failed: ${e.message}`); }
};

await step('welcome', async () => {
  await page.goto(BASE);
  await page.getByText('Less planning.').waitFor({ timeout: 30000 });
  await shot('welcome');
  await page.getByTestId('start-demo').click();
});

await step('onboarding', async () => {
  await page.getByText('Make it yours').waitFor();
  await page.getByPlaceholder('What friends call you').fill('Alex');
  await page.getByPlaceholder('yourname').fill('alex.demo');
  await shot('onboarding-profile');
  await page.getByTestId('onboarding-next').click();
  await page.getByText('What do you like doing?').waitFor();
  for (const a of ['Bowling', 'Restaurants', 'Arcades']) await page.getByRole('checkbox', { name: a }).click();
  await shot('onboarding-activities');
  await page.getByTestId('onboarding-next').click();
  await page.getByRole('checkbox', { name: 'Mexican' }).click();
  await page.getByTestId('onboarding-next').click();
  await page.getByRole('radio', { name: '$15–30' }).click();
  await shot('onboarding-budget');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByText('You’re in control').waitFor();
  await shot('onboarding-privacy');
  await page.getByTestId('onboarding-next').click();
});

await step('home', async () => {
  await page.getByText('What are we doing?').waitFor({ timeout: 15000 });
  await page.getByText('Alex 👋').waitFor();
  await shot('home');
});

await step('group-chat', async () => {
  await page.getByRole('tab', { name: /Chats/ }).click();
  await page.getByRole('button', { name: /^Weekend Plans, \d+ unread/ }).click();
  await page.getByText("I'm free after 4").waitFor();
  await shot('chat');
});

await step('ai-plan', async () => {
  await btn('Help us plan with Gather AI').click();
  await page.getByTestId('get-suggestions').click();
  await page.getByText('GATHER AI').first().waitFor({ timeout: 15000 });
  await page.getByLabel('Gather AI message').getByText(/affordable and close by/).last().waitFor();
  await shot('ai-recommendations');
});

await step('vote', async () => {
  await page.getByRole('button', { name: 'Vote', exact: true }).first().click();
  await page.getByText('Which one should we do?').last().waitFor({ timeout: 10000 });
  await page.waitForTimeout(9000); // sample friends vote in realtime
  await page.getByText('Which one should we do?').last().scrollIntoViewIfNeeded();
  await shot('poll-live-votes');
});

await step('close-poll', async () => {
  await btn('Close poll & pick winner').click().catch(async () => {
    // tie → pick first tied option
    await page.getByText('It’s a tie').waitFor();
    await page.locator('text=It’s a tie — pick the winner to close:').locator('xpath=..').getByRole('button').first().click();
  });
  const tie = await page.getByText('It’s a tie — pick the winner').isVisible().catch(() => false);
  if (tie) await page.locator('text=It’s a tie — pick the winner to close:').locator('xpath=..').getByRole('button').first().click();
  await btn('Make it a plan').waitFor({ timeout: 10000 });
  await shot('poll-closed');
  await btn('Make it a plan').click();
});

await step('plan', async () => {
  await page.getByText('Find a time', { exact: true }).waitFor({ timeout: 10000 });
  await shot('plan-detail');
  await btn('Add availability').click();
  await page.getByText('When are you free?').waitFor();
  await page.getByTestId('save-availability').click();
  await page.waitForTimeout(8000); // sample friends add their availability
  await page.getByText('Best times for the group').first().scrollIntoViewIfNeeded();
  await shot('availability-overlap');
  await btn('Use this time').click();
  await btn('Confirm plan').waitFor({ timeout: 10000 });
  await btn('Confirm plan').click();
  await page.locator('text=Confirmed >> visible=true').first().waitFor({ timeout: 10000 });
  await shot('plan-confirmed');
});

await step('plans-tab', async () => {
  await page.goto(`${BASE}/plans`);
  await page.getByRole('tab', { name: /Upcoming/ }).waitFor({ timeout: 15000 });
  await shot('plans-tab');
});

await step('friends', async () => {
  await page.goto(`${BASE}/friends/add`);
  await page.getByPlaceholder('Search by username').fill('ava');
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await page.getByRole('button', { name: 'Requested', exact: true }).first().waitFor({ timeout: 10000 });
  await shot('friend-request-sent');
  await page.waitForTimeout(3500); // sample user accepts
  await page.goto(`${BASE}/friends`);
  await page.getByRole('button', { name: 'Ava', exact: true }).waitFor({ timeout: 15000 });
  await shot('friends');
});

await step('edit-preferences', async () => {
  await page.goto(`${BASE}/settings/preferences`);
  await page.getByRole('checkbox', { name: 'Climbing' }).click();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByText('Preferences saved').waitFor({ timeout: 10000 });
});

await step('assistant', async () => {
  await page.goto(`${BASE}/assistant`);
  await page.getByText('What are you in the mood for?').waitFor({ timeout: 15000 });
  await page.getByRole('checkbox', { name: 'Find activities for five friends under $25 each' }).click();
  await page.getByLabel('Gather AI message').first().waitFor({ timeout: 15000 });
  await shot('assistant');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await page.getByRole('button', { name: 'Saved', exact: true }).first().waitFor();
});

await step('saved-and-explore', async () => {
  await page.goto(`${BASE}/saved`);
  await page.getByText('Places & ideas you want to try').waitFor({ timeout: 15000 });
  await page.getByText('📁 Saved · move').first().waitFor({ timeout: 10000 }); // survived a full reload
  await shot('saved');
  await page.goto(`${BASE}/explore`);
  await page.getByText('Demo mode: these are fictional sample places').waitFor({ timeout: 15000 });
  await shot('explore');
  await page.goto(`${BASE}/profile`);
  await page.getByText('My preferences').waitFor({ timeout: 15000 });
  await shot('profile');
  await page.goto(`${BASE}/settings/privacy`);
  await page.getByText('Who can use what').waitFor({ timeout: 15000 });
  await shot('privacy');
});

await browser.close();
const relevant = errors.filter((e) => !/favicon|Download the React DevTools|useNativeDriver/.test(e));
if (relevant.length) {
  console.log('\nBrowser errors:\n' + relevant.join('\n'));
  process.exitCode = 1;
} else console.log('\nE2E demo flow passed with no browser errors.');
