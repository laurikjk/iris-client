import {persist} from "zustand/middleware"
import {create} from "zustand"

interface ChatSettingsState {
  expiry: Record<string, number | null>
  setExpiry: (sessionId: string, seconds: number | null) => void
}

export const useChatSettingsStore = create<ChatSettingsState>()(
  persist(
    (set) => ({
      expiry: {},
      setExpiry: (sessionId, seconds) =>
        set((state) => ({
          expiry: {...state.expiry, [sessionId]: seconds},
        })),
    }),
    {name: "chat-settings"}
  )
)

export const useChatExpiry = (sessionId: string) =>
  useChatSettingsStore((state) => state.expiry[sessionId])
