import {persist, createJSONStorage} from "zustand/middleware"
import {MessageType} from "@/pages/chats/message/Message"
import localforage from "localforage"
import {create} from "zustand"

interface EventsStoreState {
  events: Map<string, Map<string, MessageType>>
}

interface EventsStoreActions {
  upsert: (sessionId: string, messageId: string, message: MessageType) => void
  removeSession: (sessionId: string) => void
  clear: () => Promise<void>
}

type EventsStore = EventsStoreState & EventsStoreActions

const lf = localforage.createInstance({name: "nostr-chat", storeName: "events"})

export const useEventsStore = create<EventsStore>()(
  persist(
    (set, get) => ({
      events: new Map(),
      upsert: (sessionId, messageId, message) => {
        const all = new Map(get().events)
        const msgs = new Map(all.get(sessionId) ?? [])
        msgs.set(messageId, message)
        all.set(sessionId, msgs)
        set({events: all})
      },
      removeSession: (sessionId) => {
        const all = new Map(get().events)
        all.delete(sessionId)
        set({events: all})
      },
      clear: async () => {
        await lf.removeItem("events-v1")
        set({events: new Map()})
      },
    }),
    {
      name: "events-v1",
      storage: createJSONStorage(() => lf),
      partialize: (state) => ({
        // Map → Array → JSON → localforage TODO: separate entries for all messages
        events: Array.from(state.events.entries()).map(([sid, msgs]) => [
          sid,
          Array.from(msgs.entries()),
        ]),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        events: new Map(
          (persisted?.events ?? []).map(
            ([sid, msgs]: [string, [string, MessageType][]]) => [sid, new Map(msgs)]
          )
        ),
      }),
    }
  )
)
