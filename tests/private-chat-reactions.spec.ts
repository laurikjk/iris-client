import {test, expect} from "@playwright/test"
import {signUp} from "./auth.setup"

async function setupChat(page) {
  const createInviteButton = page.getByRole("button", {name: "Create Invite Link"})
  await createInviteButton.click()
  await page.waitForTimeout(2000)

  const qrButton = page.getByRole("button", {name: "Show QR Code"}).first()
  await qrButton.click()
  const inviteLink = await page.getByText(/^https:\/\/iris\.to/).textContent()
  expect(inviteLink).toBeTruthy()
  await page.keyboard.press("Escape")

  const inviteInput = page.getByPlaceholder("Paste invite link")
  await inviteInput.click()
  await page.keyboard.type(inviteLink!)
  await expect(page).toHaveURL(/\/chats\/chat/, {timeout: 10000})
}

test.describe("Private Chat Reactions", () => {
  test.beforeEach(async ({page}) => {
    await signUp(page)
    await page.getByRole("link", {name: "Chats"}).click()
    await expect(page.getByRole("banner").getByText("New Chat")).toBeVisible()
  })

  test("user can react to their own message", async ({page}) => {
    await setupChat(page)

    const messageInput = page.getByPlaceholder("Message")
    await messageInput.fill("Hello")
    await messageInput.press("Enter")

    const message = page.getByRole("paragraph").filter({hasText: "Hello"})
    await message.hover()

    // Click reaction button
    await page.getByLabel(/heart add line/i).click()

    // Select heart emoji from picker
    const pickerSearch = page.getByPlaceholder(/search/i)
    await pickerSearch.fill("heart")
    await page.getByText("❤️").first().click()

    await expect(message.locator("..").getByText("❤️")).toBeVisible()
  })
})
