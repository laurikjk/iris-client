import {Filter, VerifiedEvent} from "nostr-tools"
import {Invite} from "nostr-double-ratchet/src"
import {hexToBytes} from "@noble/hashes/utils"
import {addSession} from "./SessionTracker"
import {ndk} from "@/utils/ndk"

const invites = new Map<string, Invite>()
const subscriptions = new Map<string, () => void>()

const nostrSubscribe = (filter: Filter, onEvent: (e: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (event) => {
    onEvent(event as unknown as VerifiedEvent)
  })
  return () => sub.stop()
}

const listen = (myPrivKey: string) => {
  for (const id of invites.keys()) {
    const invite = invites.get(id)
    if (!invite) continue
    const decrypt = myPrivKey
      ? hexToBytes(myPrivKey)
      : async (cipherText: string, pubkey: string) => {
          if (window.nostr?.nip44) {
            try {
              const result = await window.nostr.nip44.decrypt(pubkey, cipherText)
              if (!result || typeof result !== "string") {
                throw new Error("Failed to decrypt")
              }
              return result
            } catch (error) {
              console.error("NIP-44 decryption failed:", error)
              throw new Error("Failed to decrypt message")
            }
          }
          throw new Error("No nostr extension or private key")
        }
    const unsubscribe = invite.listen(decrypt, nostrSubscribe, addSession)
    subscriptions.set(id, unsubscribe)
  }
}

export const addInvite = (label: string, myPubKey: string, myPrivKey: string) => {
  const uuid = crypto.randomUUID()
  const invite = Invite.createNew(myPubKey, label)
  invites.set(uuid, invite)
  listen(myPrivKey)
  storeInvites()
}

export const getInvites = () => invites

const serializeInvites = () => {
  const serializedInvites = Array.from(invites.entries()).map(([id, invite]) => [
    id,
    invite.serialize(),
  ])
  return serializedInvites
}

const deserializeInvites = (serializedInvites: [string, any][]) => {
  const invites = new Map<string, Invite>()
  for (const [id, serializedInvite] of serializedInvites) {
    invites.set(id, Invite.deserialize(serializedInvite))
  }
  return invites
}

export const storeInvites = () => {
  localStorage.setItem("InviteTracker", JSON.stringify(serializeInvites()))
}

export const loadInvites = (myPrivKey: string) => {
  const serializedInvites = localStorage.getItem("InviteTracker")
  if (!serializedInvites) return
  const parsedInvites = JSON.parse(serializedInvites)
  const newInvites = deserializeInvites(parsedInvites)
  newInvites.forEach((invite, id) => {
    invites.set(id, invite)
  })
  listen(myPrivKey)
}
