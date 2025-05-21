import QRCodeButton from "@/shared/components/user/QRCodeButton"
import {useState, useRef, ChangeEvent, FormEvent} from "react"
import {useSessionsStore} from "@/stores/sessions"
import {useInvitesStore} from "@/stores/invites"
import {useUserStore} from "@/stores/user"
import {useNavigate} from "react-router"
import {nip19} from "nostr-tools"

const PrivateChatCreation = () => {
  const navigate = useNavigate()
  const [inviteInput, setInviteInput] = useState("")
  const labelInputRef = useRef<HTMLInputElement>(null)
  const {acceptInvite: acceptInviteFromUrl} = useSessionsStore()

  const {privateInvites, publicInvite, createInvite, deleteInvite} = useInvitesStore()

  const myPubKey = useUserStore((state) => state.publicKey)
  const myPrivKey = useUserStore((state) => state.privateKey)

  const handleInviteInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setInviteInput(input)

    if (!input || !input.trim() || !myPubKey) {
      return
    }

    try {
      const {sessionId} = await acceptInviteFromUrl(input, myPrivKey, myPubKey)
      navigate("/chats/chat", {state: {id: sessionId}})
    } catch (error) {
      console.error("Invalid invite link:", error)
    }
  }

  const handleCreateInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (labelInputRef.current) {
      const label = labelInputRef.current.value.trim() || "New Invite Link"
      createInvite(label)
      labelInputRef.current.value = "" // Clear the input after creating
    }
  }

  const handleDeleteInvite = (id: string) => {
    deleteInvite(id)
  }

  const onScanSuccess = async (data: string) => {
    const {sessionId} = await acceptInviteFromUrl(data, myPrivKey, myPubKey)
    navigate("/chats/chat", {state: {id: sessionId}})
  }

  if (!myPubKey) {
    return (
      <div className="m-4 p-4 md:p-8 rounded-lg bg-base-100">
        <p className="text-center text-base-content/70">
          Please sign in to use private chats
        </p>
      </div>
    )
  }

  const inviteList = publicInvite
    ? [{id: "public", invite: publicInvite}]
    : Object.entries(privateInvites).map(([id, invite]) => ({id, invite}))

  return (
    <>
      <div className="m-4 p-4 md:p-8 rounded-lg bg-base-100 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Have someone&apos;s invite link?</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="input input-bordered w-full md:w-96"
              placeholder="Paste invite link"
              value={inviteInput}
              onChange={handleInviteInput}
            />
            <QRCodeButton
              data=""
              showQRCode={false}
              onScanSuccess={(data) =>
                handleInviteInput({
                  target: {value: data},
                } as ChangeEvent<HTMLInputElement>)
              }
              icon="qr"
            />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">Share your invite link</h2>
          <form
            onSubmit={handleCreateInvite}
            className="flex flex-wrap items-center gap-2 mb-4"
          >
            <input
              ref={labelInputRef}
              type="text"
              placeholder="Label (optional)"
              className="input input-bordered w-full md:w-64"
            />
            <button type="submit" className="btn btn-primary whitespace-nowrap">
              Create Invite Link
            </button>
          </form>
          <div className="space-y-3">
            {inviteList.map(({id, invite}) => (
              <div
                key={id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-2"
              >
                <span>{invite.label || "Untitled Invite"}</span>
                <div className="flex gap-4 items-center">
                  <QRCodeButton
                    npub={myPubKey && nip19.npubEncode(myPubKey)}
                    data={invite.getUrl()}
                    onScanSuccess={onScanSuccess}
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(invite.getUrl())}
                    className="btn btn-sm btn-outline"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleDeleteInvite(id)}
                    className="btn btn-sm btn-error"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <hr className="mx-4 my-6 border-base-300" />
      <div className="px-2">
        <p className="text-center text-sm text-base-content/70">
          Iris uses Signal-style{" "}
          <a
            href="https://github.com/mmalmi/nostr-double-ratchet"
            target="_blank"
            className="link"
            rel="noreferrer"
          >
            double ratchet encryption
          </a>{" "}
          to keep your private messages safe.
        </p>
        <p className="text-center text-sm text-base-content/70">
          Private chat history is stored locally on this device and cleared when you log
          out.
        </p>
      </div>
    </>
  )
}

export default PrivateChatCreation
