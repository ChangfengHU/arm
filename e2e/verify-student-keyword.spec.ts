import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const ARTIFACTS = 'e2e/artifacts';

test.describe('Verify improved keyword detection for student audience', () => {
  test('AI enhance detects "初学" keyword and sets audience to "学生"', async ({ page }) => {
    // Collect console logs for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Step 1: Navigate to AI creation page
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    const aiCreationButton = page.locator('button[title="AI创作"]');
    await expect(aiCreationButton).toBeVisible({ timeout: 10000 });
    await aiCreationButton.click();

    // Verify we are on the AI creation page
    await expect(page.locator('h1')).toContainText('AI 创作');

    // Step 2: Input the topic containing "初学" keyword
    const topicTextarea = page.locator('textarea');
    await topicTextarea.fill('快速入门：初学者如何在30分钟内学会制作短视频');

    // Step 3: Click the Sparkles button (AI enhance)
    const aiEnhanceButton = page.locator('textarea + button');
    await expect(aiEnhanceButton).toBeEnabled();
    await aiEnhanceButton.click();

    // Wait for the AI enhancement to complete
    await expect(
      page.locator('text=AI 已为你生成参数，请查看下方表单')
    ).toBeVisible({ timeout: 15000 });

    // Step 4: Verify that 目标受众 now correctly shows "学生"
    const audienceSelect = page.locator('select');
    const audienceValue = await audienceSelect.inputValue();
    console.log(`Audience value detected: "${audienceValue}"`);

    // Print relevant console logs for debugging
    const analysisLogs = consoleLogs.filter(
      (log) => log.includes('智能分析') || log.includes('分析结果')
    );
    console.log('=== Analysis Console Logs ===');
    analysisLogs.forEach((log) => console.log(log));
    console.log('=== End ===');

    // The keyword "初学" in the topic should trigger audience = "学生"
    expect(audienceValue).toBe('学生');

    // Also verify tone is "轻松" (no professional/formal keywords in topic)
    const toneButtons = page.locator('text=语气风格').locator('..').locator('button');
    const casualButton = toneButtons.filter({ hasText: '轻松' });
    await expect(casualButton).toHaveClass(/bg-\[#0066cc\]/);

    // Step 5: Take a screenshot showing the updated form with "学生" selected
    await page.screenshot({
      path: `${ARTIFACTS}/verify-student-keyword-detection.png`,
      fullPage: true,
    });
  });
});
