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
  removeMessage: (sessionId: string, messageId: string) => Promise<void>
  clear: () => Promise<void>
}

type EventsStore = EventsStoreState & EventsStoreActions

export const useEventsStore = create<EventsStore>((set, get) => {
  const expirationTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const scheduleExpiration = (sessionId: string, message: MessageType) => {
    if (!message.expires_at) return
    const key = `${sessionId}:${message.id}`
    const delay = message.expires_at * 1000 - Date.now()
    if (delay <= 0) {
      get().removeMessage(sessionId, message.id)
      return
    }
    if (expirationTimers.has(key)) {
      clearTimeout(expirationTimers.get(key))
    }
    const t = setTimeout(() => {
      get().removeMessage(sessionId, message.id)
      expirationTimers.delete(key)
    }, delay)
    expirationTimers.set(key, t)
  }

  const rehydration = messageRepository
    .loadAll()
    .then((data) => {
      set({events: data})
      data.forEach((map, sessionId) => {
        map.forEach((msg) => scheduleExpiration(sessionId, msg))
      })
    })
    .catch(console.error)
  return {
    events: new Map(),

    upsert: async (sessionId, message) => {
      await rehydration
      await messageRepository.save(sessionId, message)
      set((state) => ({
        events: addToMap(new Map(state.events), sessionId, message),
      }))
      scheduleExpiration(sessionId, message)
    },

    removeSession: async (sessionId) => {
      await rehydration
      await messageRepository.deleteBySession(sessionId)
      set((state) => {
        const events = new Map(state.events)
        events.delete(sessionId)
        return {events}
      })
      Array.from(expirationTimers.keys())
        .filter((key) => key.startsWith(`${sessionId}:`))
        .forEach((key) => {
          clearTimeout(expirationTimers.get(key)!)
          expirationTimers.delete(key)
        })
    },

    clear: async () => {
      await rehydration
      await messageRepository.clearAll()
      set({events: new Map()})
    },

    removeMessage: async (sessionId: string, messageId: string) => {
      await rehydration
      await messageRepository.deleteMessage(sessionId, messageId)
      set((state) => {
        const events = new Map(state.events)
        const eventMap = events.get(sessionId)
        if (eventMap) {
          eventMap.delete(messageId)
          if (eventMap.size === 0) {
            events.delete(sessionId)
          } else {
            events.set(sessionId, eventMap)
          }
        }
        return {events}
      })
      const key = `${sessionId}:${messageId}`
      if (expirationTimers.has(key)) {
        clearTimeout(expirationTimers.get(key)!)
        expirationTimers.delete(key)
      }
    },
  }
})
