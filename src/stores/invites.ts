import {
  addInvite,
  getInvites,
  loadInvites,
  storeInvites,
} from "@/utils/chat/InviteTracker"
import {createJSONStorage, persist} from "zustand/middleware"
import {useUserStore} from "./user"
import {create} from "zustand"
interface InviteStoreState {
  // store just the names
  invites: string[]
}

interface InviteStoreActions {
  createInvite: (label: string) => void
}

type InviteStore = InviteStoreState & InviteStoreActions

const store = create<InviteStore>()(
  persist(
    (set) => ({
      invites: [],
      createInvite: (label: string) => {
        const myPubKey = useUserStore.getState().publicKey
        const myPrivKey = useUserStore.getState().privateKey

        if (!myPubKey || !myPrivKey) {
          console.warn("No public key or private key")
          return
        }

        addInvite(label, myPubKey, myPrivKey)
        storeInvites()
        const invites = Array.from(getInvites().keys())
        set({invites})
      },
    }),
    {
      name: "invites",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: (state) => {
        console.log("invites onRehydrateStorage", state)
        return (state) => {
          const privateKey = useUserStore.getState().privateKey
          if (privateKey) {
            loadInvites(privateKey)
          }
        }
      },
    }
  )
)

export const useInvitesStore = store
