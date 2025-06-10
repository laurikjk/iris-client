import {test, expect} from "@playwright/test"
import {signUp} from "./auth.setup"

test("private chat works across two browsers", async ({browser}) => {
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  await signUp(page1, "User1")

  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await signUp(page2, "User2")

  // User1 creates a private invite link
  await page1.getByRole("link", {name: "Chats"}).click()
  await expect(page1.getByRole("banner").getByText("New Chat")).toBeVisible()

  const createInviteButton = page1.getByRole("button", {name: "Create Invite Link"})
  await createInviteButton.click()
  await page1.waitForTimeout(2000)

  const qrButton = page1.getByRole("button", {name: "Show QR Code"}).first()
  await qrButton.click()

  const inviteLink = await page1.getByText(/^https:\/\/iris\.to/).textContent()
  expect(inviteLink).toBeTruthy()
  await page1.keyboard.press("Escape")

  const inviteInput1 = page1.getByPlaceholder("Paste invite link")
  await inviteInput1.click()
  await page1.keyboard.type(inviteLink!)
  await expect(page1).toHaveURL(/\/chats\/chat/, {timeout: 10000})

  // User2 joins the chat using the same link
  await page2.getByRole("link", {name: "Chats"}).click()
  await expect(page2.getByRole("banner").getByText("New Chat")).toBeVisible()

  const inviteInput2 = page2.getByPlaceholder("Paste invite link")
  await inviteInput2.click()
  await page2.keyboard.type(inviteLink!)
  await expect(page2).toHaveURL(/\/chats\/chat/, {timeout: 10000})

  // User1 sends a message
  const user1Message = "Hello from User1"
  const msgInput1 = page1.getByPlaceholder("Message")
  await msgInput1.fill(user1Message)
  await msgInput1.press("Enter")

  await expect(
    page2.getByRole("paragraph").filter({hasText: user1Message})
  ).toBeVisible()

  // User2 replies
  const user2Message = "Hi there, User1"
  const msgInput2 = page2.getByPlaceholder("Message")
  await msgInput2.fill(user2Message)
  await msgInput2.press("Enter")

  await expect(
    page1.getByRole("paragraph").filter({hasText: user2Message})
  ).toBeVisible()
})
