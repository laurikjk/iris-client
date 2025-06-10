import Modal from "@/shared/components/ui/Modal"

interface DeleteChatModalProps {
  onClose: () => void
  onDelete: () => void
}

const DeleteChatModal = ({onClose, onDelete}: DeleteChatModalProps) => {
  return (
    <Modal onClose={onClose} hasBackground={true}>
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-lg font-bold">Delete Chat</h1>
        <p>Are you sure you want to delete this chat?</p>
        <div className="flex justify-end gap-2 mt-2">
          <button className="btn btn-neutral" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-error"
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default DeleteChatModal
