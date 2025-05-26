import {
  Invite,
  Session,
  serializeSessionState,
  deserializeSessionState,
} from "nostr-double-ratchet/src"
import {createJSONStorage, persist} from "zustand/middleware"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {useInvitesStore} from "./invites"
import {useUserStore} from "./user"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionStore {
  sessions: Map<string, Session>
  acceptInvite: (url: string) => Promise<void>
}

const store = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: new Map(),
      acceptInvite: async (url: string) => {
        const invite = Invite.fromUrl(url)
        const myPubKey = useUserStore.getState().publicKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        const myPrivKey = useUserStore.getState().privateKey
        const encrypt = myPrivKey
          ? hexToBytes(myPrivKey)
          : async (plaintext: string, pubkey: string) => {
              if (window.nostr?.nip44) {
                return window.nostr.nip44.encrypt(plaintext, pubkey)
              }
              throw new Error("No nostr extension or private key")
            }
        const {session, event} = await invite.accept(
          (filter, onEvent) => subscribe(filter, onEvent),
          myPubKey,
          encrypt
        )
        const e = NDKEventFromRawEvent(event)
        await e
          .publish()
          .then((res) => console.log("published", res))
          .catch((e) => console.warn("Error publishing event:", e))
        const sessionId = `${invite.inviter}:${session.name}`
        const newSessions = new Map(get().sessions)
        newSessions.set(sessionId, session)
        set({sessions: newSessions})
      },
    }),
    {
      name: "sessions",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: Array.from(state.sessions.entries()).map(([id, session]) => [
          id,
          serializeSessionState(session.state),
        ]),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const entries: [string, Session][] = Array.from(state.sessions).map(
            ([id, serializedState]: [string, any]) => [
              id,
              new Session(subscribe, deserializeSessionState(serializedState)),
            ]
          )
          state.sessions = new Map(entries)
        }
      },
    }
  )
)

const subscribe = (filter: Filter, onEvent: (event: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (e) => onEvent(e as unknown as VerifiedEvent))
  return () => sub.stop()
}

useInvitesStore.subscribe((state) => {
  const privateKey = useUserStore.getState().privateKey
  if (!privateKey) {
    console.warn("No private key, skipping invite listening")
    return
  }
  state.invites.forEach((invite) => {
    const decrypt = privateKey
      ? hexToBytes(privateKey)
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
    invite.listen(decrypt, subscribe, (session, identity) => {
      const sessionId = `${identity}:${session.name}`
      const newSessions = new Map(store.getState().sessions)
      newSessions.set(sessionId, session)
      store.setState({sessions: newSessions})
    })
  })
})

export const useSessionsStore = store
