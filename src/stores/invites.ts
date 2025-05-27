import {createJSONStorage, persist} from "zustand/middleware"
import {Invite} from "nostr-double-ratchet/src"
import {useUserStore} from "./user"
import {create} from "zustand"
interface InviteStore {
  invites: Map<string, Invite>
  createInvite: (label: string) => void
}

const store = create<InviteStore>()(
  persist(
    (set, get) => ({
      invites: new Map(),
      createInvite: (label: string) => {
        const myPubKey = useUserStore.getState().publicKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        const invite = Invite.createNew(myPubKey, label)
        const id = crypto.randomUUID()
        const currentInvites = get().invites

        const newInvites = new Map(currentInvites)
        newInvites.set(id, invite)
        set({invites: newInvites})
      },
    }),
    {
      name: "invites",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        invites: Array.from(state.invites.entries()).map(([id, invite]) => [
          id,
          invite.serialize(),
        ]),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const entries: [string, Invite][] = Array.from(state.invites).map(
            ([id, serializedInvite]: [string, any]) => [
              id,
              Invite.deserialize(serializedInvite),
            ]
          )
          state.invites = new Map(entries)
        }
      },
    }
  )
)

export const useInvitesStore = store
