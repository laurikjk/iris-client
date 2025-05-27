import {persist, PersistStorage, StorageValue} from "zustand/middleware"
import {Invite} from "nostr-double-ratchet/src"
import {useUserStore} from "./user"
import {create} from "zustand"

interface InviteStoreState {
  invites: Map<string, Invite>
}

interface InviteStoreActions {
  createInvite: (label: string) => void
}

type InviteStore = InviteStoreState & InviteStoreActions

const storage: PersistStorage<InviteStoreState> = {
  getItem: (name: string): StorageValue<InviteStoreState> | null => {
    const value = localStorage.getItem(name)
    if (!value) return null
    const parsed = JSON.parse(value)
    const invites = new Map<string, Invite>(
      parsed.invites.map(([id, serializedInvite]: [string, any]) => [
        id,
        Invite.deserialize(serializedInvite),
      ])
    )
    return {
      state: {
        invites,
      },
    }
  },
  setItem: (name: string, value: StorageValue<InviteStoreState>): void => {
    const serializedInvites = Array.from(value.state.invites.entries()).map(
      ([id, invite]) => [id, invite.serialize()]
    )
    localStorage.setItem(
      name,
      JSON.stringify({
        invites: serializedInvites,
      })
    )
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
  },
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
      storage,
    }
  )
)

export const useInvitesStore = store
