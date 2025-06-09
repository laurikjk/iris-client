import {comparator} from "@/pages/chats/utils/messageGrouping"
import type {MessageType} from "@/pages/chats/message/Message"
import * as messageRepository from "@/utils/messageRepository"
import {SortedMap} from "@/utils/SortedMap/SortedMap"
import {create} from "zustand"

const addToMap = (
  sessionEventMap: Map<string, SortedMap<string, MessageType>>,
  sessionId: string,
  message: MessageType
) => {
  const eventMap =
    sessionEventMap.get(sessionId) || new SortedMap<string, MessageType>([], comparator)
  eventMap.set(message.id, message)
  sessionEventMap.set(sessionId, eventMap)
  return sessionEventMap
}

interface EventsStoreState {
  events: Map<string, SortedMap<string, MessageType>>
}

interface EventsStoreActions {
  upsert: (sessionId: string, message: MessageType) => Promise<void>
  removeSession: (sessionId: string) => Promise<void>
  clear: () => Promise<void>
}

type EventsStore = EventsStoreState & EventsStoreActions

const makeMessage = async (message: MessageType) => {
  const isReaction = message.kind === 6
  const eTag = message.tags.find(([key]) => key === "e")
  if (isReaction && eTag) {
    const [, messageId] = eTag
    const oldMsg = await messageRepository.getById(messageId)
    if (oldMsg) {
      return {
        ...oldMsg,
        reactions: {
          ...oldMsg.reactions,
          [message.pubkey]: message.content,
        },
      }
    }
  }
  return message
}

export const useEventsStore = create<EventsStore>((set) => {
  const rehydration = messageRepository
    .loadAll()
    .then((data) => set({events: data}))
    .catch(console.error)
  return {
    events: new Map(),

    upsert: async (sessionId, event) => {
      await rehydration
      const message = await makeMessage(event)
      console.log("made a message", message)
      await messageRepository.save(sessionId, message)
      set((state) => ({
        events: addToMap(new Map(state.events), sessionId, message),
      }))
    },

    removeSession: async (sessionId) => {
      await rehydration
      await messageRepository.deleteBySession(sessionId)
      set((state) => {
        const events = new Map(state.events)
        events.delete(sessionId)
        return {events}
      })
    },

    clear: async () => {
      await rehydration
      await messageRepository.clearAll()
      set({events: new Map()})
    },
  }
})
