import {test, expect} from "@playwright/test"
import {signUp} from "./auth.setup"

// Increase timeout since two users and encryption may take some time
test.setTimeout(180000)

// This test creates two separate browser contexts for two users
// and verifies that they can chat with each other using an invite link.

test("two accounts can exchange messages in chat", async ({browser}) => {
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()

  // Sign up both users with different names
  await signUp(pageA, "User A")
  await signUp(pageB, "User B")

  // User A creates an invite link
  await pageA.getByRole("link", {name: "Chats"}).click()
  await expect(pageA.getByRole("banner").getByText("New Chat")).toBeVisible()
  const createInviteButton = pageA.getByRole("button", {name: "Create Invite Link"})
  await createInviteButton.click()
  await pageA.waitForTimeout(2000)
  const qrButton = pageA.getByRole("button", {name: "Show QR Code"}).first()
  await qrButton.click()
  const inviteLink = await pageA.getByText(/^https:\/\/iris\.to/).textContent()
  expect(inviteLink).toBeTruthy()
  await pageA.keyboard.press("Escape")

  // User B accepts the invite link
  await pageB.getByRole("link", {name: "Chats"}).click()
  await expect(pageB.getByRole("banner").getByText("New Chat")).toBeVisible()
  const inviteInputB = pageB.getByPlaceholder("Paste invite link")
  await inviteInputB.click()
  await pageB.keyboard.type(inviteLink!)
  await expect(pageB).toHaveURL(/\/chats\/chat/, {timeout: 10000})

  // User A opens the chat using the same link
  const inviteInputA = pageA.getByPlaceholder("Paste invite link")
  await inviteInputA.click()
  await pageA.keyboard.type(inviteLink!)
  await expect(pageA).toHaveURL(/\/chats\/chat/, {timeout: 10000})

  // Exchange messages
  const messageFromA = "Hello from A"
  await pageA.getByPlaceholder("Message").fill(messageFromA)
  await pageA.keyboard.press("Enter")
  await expect(
    pageA.getByRole("paragraph").filter({hasText: messageFromA})
  ).toBeVisible({timeout: 60000})
  await expect(
    pageB.getByRole("paragraph").filter({hasText: messageFromA})
  ).toBeVisible({timeout: 60000})

  const messageFromB = "Hello from B"
  await pageB.getByPlaceholder("Message").fill(messageFromB)
  await pageB.keyboard.press("Enter")
  await expect(
    pageB.getByRole("paragraph").filter({hasText: messageFromB})
  ).toBeVisible({timeout: 60000})
  await expect(
    pageA.getByRole("paragraph").filter({hasText: messageFromB})
  ).toBeVisible({timeout: 60000})

  await contextA.close()
  await contextB.close()
})
