import {addInvite, getInvites, storeInvites} from "@/utils/chat/InviteTracker"
import {persist} from "zustand/middleware"
import {useUserStore} from "./user"
import {create} from "zustand"
interface InviteStoreState {
  // store just the names
  invites: Set<string>
}

interface InviteStoreActions {
  createInvite: (label: string) => void
}

type InviteStore = InviteStoreState & InviteStoreActions

const store = create<InviteStore>()(
  persist(
    (set) => ({
      invites: new Set(),
      createInvite: (label: string) => {
        const myPubKey = useUserStore.getState().publicKey
        const myPrivKey = useUserStore.getState().privateKey

        if (!myPubKey || !myPrivKey) {
          console.warn("No public key or private key")
          return
        }

        addInvite(label, myPubKey, myPrivKey)
        storeInvites()
        const invites = new Set(getInvites().keys())
        set({invites})
      },
    }),
    {
      name: "invites",
    }
  )
)

export const useInvitesStore = store
