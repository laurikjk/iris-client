import {test, expect} from "@playwright/test"

test.describe("Notifications", () => {
  test.skip("service worker shows test notification", async ({page, context}) => {
    await context.grantPermissions(["notifications"], {origin: "http://localhost:4173"})

    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", {get: () => "granted"})
      Notification.requestPermission = () => Promise.resolve("granted")
    })

    await page.addInitScript(() => {
      const reg = {
        active: true,
        showNotification: (title: string, options?: NotificationOptions) => {
          (window as any).__notifications = (window as any).__notifications || []
          ;(window as any).__notifications.push({title, options})
          return Promise.resolve()
        },
        pushManager: {
          getSubscription: () => Promise.resolve(null),
        },
      }
      const sw = {
        register: () => Promise.resolve(reg),
        ready: Promise.resolve(reg),
        getRegistration: () => Promise.resolve(reg),
        getRegistrations: () => Promise.resolve([reg]),
      }
      Object.defineProperty(navigator, "serviceWorker", {value: sw})
    })

    await page.goto("/settings/notifications")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(2000)
    await page.locator("text=Test Notification").click({timeout: 15000})
    await page.waitForFunction(() => window.__notifications?.length > 0)

    const notification = await page.evaluate(() => window.__notifications[0])
    expect(notification.title).toBe("Test notification")
    expect(notification.options.body).toContain("Seems like it's working!")
  })
})
