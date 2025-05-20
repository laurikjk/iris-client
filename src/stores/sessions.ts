// import {irisStorage} from "@/utils/irisdbZustandStorage"
import {
  Invite,
  Session,
  deserializeSessionState,
  serializeSessionState,
} from "nostr-double-ratchet/src"
import {persist, PersistStorage} from "zustand/middleware"
import {MessageType} from "@/pages/chats/message/Message"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

const subscribe = (filter: Filter, onEvent: (event: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (event) => {
    onEvent(event as unknown as VerifiedEvent)
  })
  return () => sub.stop()
}
interface SessionsState {
  sessions: Record<string, Session>
  messages: Record<string, MessageType[]>
}

interface SessionsActions {
  acceptInvite: (
    url: string,
    pubKey: string,
    privKey?: string
  ) => Promise<{sessionId: string; session: Session}>
}

type SessionsStore = SessionsState & SessionsActions

const makeSessionId = (inviter: string, name: string) => {
  return `${inviter}:${name}`
}

const inviteToSession = async (
  url: string,
  pubKey: string,
  privKey?: string
): Promise<{sessionId: string; session: Session}> => {
  const invite = Invite.fromUrl(url)
  const encrypt = privKey
    ? hexToBytes(privKey)
    : async (plaintext: string, pubkey: string) => {
        if (window.nostr?.nip44) {
          return window.nostr.nip44.encrypt(plaintext, pubkey)
        }
        throw new Error("No nostr extension or private key")
      }
  const {session, event} = await invite.accept(
    (filter, onEvent) => {
      const sub = ndk().subscribe(filter)
      sub.on("event", (e) => onEvent(e as unknown as VerifiedEvent))
      return () => sub.stop()
    },
    pubKey,
    encrypt
  )
  const e = NDKEventFromRawEvent(event)
  await e
    .publish()
    .then((res) => console.log("published", res))
    .catch((e) => console.warn("Error publishing event:", e))

  const sessionId = makeSessionId(invite.inviter, session.name)

  return {
    sessionId,
    session,
  }
}

type SessionStateStorage = {
  sessions: {
    id: string
    state: string
  }[]
  messages: {
    id: string
    messages: MessageType[]
  }[]
}

const storage: PersistStorage<SessionsState> = {
  getItem: (name) => {
    const value = localStorage.getItem(name)
    if (!value) {
      return {
        state: {
          sessions: {},
          messages: {},
        },
      }
    }
    const jsonObject: SessionStateStorage = JSON.parse(value)

    const sessions = jsonObject.sessions.map((session) => {
      const state = deserializeSessionState(session.state)
      return [session.id, new Session(subscribe, state)]
    })

    const messages = jsonObject.messages.map((message) => {
      return [message.id, message.messages]
    })

    return {
      state: {
        sessions: Object.fromEntries(sessions),
        messages: Object.fromEntries(messages),
      },
    }
  },
  setItem: (name, value) => {
    const sessionStates = Object.entries(value.state.sessions).map(
      ([sessionId, session]) => {
        return {
          id: sessionId,
          state: serializeSessionState(session.state),
        }
      }
    )
    const messages = Object.entries(value.state.messages).map(([sessionId, messages]) => {
      return {
        id: sessionId,
        messages,
      }
    })
    const storageObject: SessionStateStorage = {
      sessions: sessionStates,
      messages: messages,
    }
    localStorage.setItem(name, JSON.stringify(storageObject))
  },
  removeItem: (name) => {
    localStorage.removeItem(name)
  },
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => ({
      sessions: {},
      messages: {},
      acceptInvite: async (url: string, pubKey: string, privKey?: string) => {
        const {sessionId, session} = await inviteToSession(url, pubKey, privKey)
        // TODO: subscribe to nostr
        set((state) => ({
          sessions: {...state.sessions, [sessionId]: session},
        }))
        return {sessionId, session}
      },
    }),
    {
      name: "sessions",
      storage,
      onRehydrateStorage: () => {
        return (state) => {
          // TODO: subscribe to nostr
        }
      },
    }
  )
)
