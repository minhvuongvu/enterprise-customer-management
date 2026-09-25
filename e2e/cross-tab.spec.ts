import { anyCustomer, expect, test } from './fixtures';

/**
 * Phase 5: tabs of one browser profile, coordinating (docs/cross-tab.md).
 *
 * Two pages in one browser context are two tabs of the same profile: they
 * share cookies, `localStorage` and `BroadcastChannel`, exactly as two tabs
 * of a real browser do. These are browser-integration tests - the behaviour
 * under test is the browser's (message delivery, the `storage` event), so
 * no fake stands in for it.
 */

test.describe('the application across tabs', () => {
  test('a change made in one tab is announced in the other (debt row 25)', async ({
    context,
    baseURL,
  }) => {
    const customer = await anyCustomer(context.request, baseURL ?? '', 40);
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto(`/customers/${customer.id}`);
    await tabB.goto(`/customers/${customer.id}`);
    await expect(tabB.getByTestId('status-badge')).toBeVisible();

    await tabA.getByTestId('toggle-status').click();
    await expect(tabA.getByTestId('toggle-status')).toBeEnabled();

    // Same user, so the realtime stream stays silent; the tab channel speaks.
    await expect(tabB.getByTestId('toasts')).toContainText(
      `Customer ${customer.customerCode} was updated in another tab.`,
    );
    await expect(tabB.getByTestId('stale-record')).toBeVisible();
    // The tab that made the change is not told about it.
    await expect(tabA.getByTestId('toasts')).not.toContainText('in another tab');
  });

  test('signing out in one tab signs out the others (debt row 18)', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/customers');
    await tabB.goto('/technical-labs');
    await expect(tabB.getByTestId('current-user')).toBeVisible();

    await tabA.getByTestId('sign-out').click();
    await expect(tabA).toHaveURL(/\/login/);

    await expect(tabB).toHaveURL(/\/login\?.*reason=signed-out-elsewhere/);
    await expect(tabB.getByTestId('signed-out-elsewhere')).toBeVisible();
    // The page it was on is where signing in again returns it.
    await expect(tabB).toHaveURL(/returnUrl=%2Ftechnical-labs/);
  });

  test('a theme chosen in one tab applies in the other, through the storage event', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/customers');
    await tabB.goto('/customers');
    // Both applications running - and listening - before the change.
    await expect(tabB.getByRole('button', { name: 'Colour theme' })).toBeVisible();

    await tabA.getByRole('button', { name: 'Colour theme' }).click();
    await tabA.getByRole('menuitem', { name: 'Dark' }).click();

    await expect(tabB.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('cross-tab lab', () => {
  test('a BroadcastChannel message reaches the other tab and not the sender', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/technical-labs/cross-tab');
    await tabB.goto('/technical-labs/cross-tab');
    await expect(tabB.getByTestId('tab-received')).toBeVisible();

    await tabA.getByTestId('tab-message').getByRole('textbox').fill('hello from A');
    await tabA.getByTestId('tab-send').click();

    await expect(tabB.getByTestId('tab-received')).toContainText('hello from A');
    await expect(tabA.getByTestId('tab-received')).not.toContainText('hello from A');
  });

  test('a localStorage write updates the other tab through the storage event', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/technical-labs/cross-tab');
    await tabB.goto('/technical-labs/cross-tab');
    const before = Number(
      (await tabB.getByTestId('shared-counter').textContent())?.match(/\d+/)?.[0] ?? 0,
    );

    await tabA.getByTestId('counter-increment').click();

    await expect(tabB.getByTestId('shared-counter')).toContainText(String(before + 1));
  });
});

test.describe('leader election lab', () => {
  test('exactly one of three tabs leads, and the others receive its result', async ({
    context,
  }) => {
    const tabs = [await context.newPage(), await context.newPage(), await context.newPage()];
    for (const tab of tabs) {
      await tab.goto('/technical-labs/leader-election');
    }

    const leaders = async (): Promise<number> => {
      let count = 0;
      for (const tab of tabs) {
        if ((await tab.getByTestId('leader-role').getAttribute('data-role')) === 'leader') {
          count++;
        }
      }
      return count;
    };
    await expect.poll(leaders, { timeout: 10_000 }).toBe(1);

    // Every tab shows the same producer: the leader ran the job, nobody else.
    const producers = new Set<string | null>();
    for (const tab of tabs) {
      const result = tab.getByTestId('job-result');
      await expect(result).toBeVisible({ timeout: 10_000 });
      producers.add(await result.getAttribute('data-producer'));
    }
    expect(producers.size).toBe(1);
  });

  test('when the leader closes, another tab takes over', async ({ context }) => {
    const tabs = [await context.newPage(), await context.newPage()];
    for (const tab of tabs) {
      await tab.goto('/technical-labs/leader-election');
    }
    const roleOf = (index: number) =>
      tabs[index].getByTestId('leader-role').getAttribute('data-role');
    await expect
      .poll(async () => [await roleOf(0), await roleOf(1)].filter((r) => r === 'leader').length, {
        timeout: 10_000,
      })
      .toBe(1);

    const leaderIndex = (await roleOf(0)) === 'leader' ? 0 : 1;
    const survivor = tabs[1 - leaderIndex];
    await tabs[leaderIndex].close();

    await expect(survivor.getByTestId('leader-role')).toHaveAttribute('data-role', 'leader', {
      timeout: 10_000,
    });
  });

  test('a frozen leader loses the lease, and steps down when it wakes', async ({ context }) => {
    const tabs = [await context.newPage(), await context.newPage()];
    for (const tab of tabs) {
      await tab.goto('/technical-labs/leader-election');
    }
    const role = (index: number) => tabs[index].getByTestId('leader-role');
    await expect
      .poll(
        async () => [
          await role(0).getAttribute('data-role'),
          await role(1).getAttribute('data-role'),
        ],
        { timeout: 10_000 },
      )
      .toContain('leader');
    const leaderIndex = (await role(0).getAttribute('data-role')) === 'leader' ? 0 : 1;
    const leader = tabs[leaderIndex];
    const other = tabs[1 - leaderIndex];

    await leader.getByTestId('leader-freeze').click();
    // The lease expires unrenewed; the other tab claims it.
    await expect(role(1 - leaderIndex)).toHaveAttribute('data-role', 'leader', {
      timeout: 10_000,
    });

    await leader.getByTestId('leader-resume').click();
    await expect(role(leaderIndex)).toHaveAttribute('data-role', 'follower');
    await expect(other.getByTestId('leader-role')).toHaveAttribute('data-role', 'leader');
  });
});
