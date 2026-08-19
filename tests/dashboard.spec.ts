import { test, expect } from '@playwright/test';
test.describe('Fleet Management E2E Flows', () => {
  
  test('User can login and view the dashboard', async ({ page }) => {
    // 1. Login page par jao
    await page.goto('/login');
    
    // 2. Default credentials verify karo aur login click karo
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    
    // Default credentials login button click
    await page.getByRole('button', { name: /sign in/i }).click();
    // 3. Wait karo jab tak URL dashboard (/) par na chala jaye
    await page.waitForURL('/');
    // 4. Verify karo ki Sidebar load ho gaya hai
    await expect(page.getByText('India HQ', { exact: true })).toBeVisible();
  });
  test('User can navigate between sidebar tabs', async ({ page }) => {
    // Login flow
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/');
    
    // 1. Dashboard par Routes tab par click karo
    await page.getByText('Manage Routes', { exact: true }).click();
    // 2. Verify karo ki ManageRoutes.tsx ka header dikh raha hai
    await expect(page.getByRole('heading', { name: 'Route Management' })).toBeVisible();
    // 3. Verify karo ki "Create New Route" button map view me aa gaya hai
    await expect(page.getByRole('button', { name: /\+ Create New Route/i })).toBeVisible();
    
    // 4. Live Map view test karo
    await page.getByText('Live Fleet Map', { exact: true }).click();
    await expect(page.getByText('Active Fleet')).toBeVisible();
  });
  
});
