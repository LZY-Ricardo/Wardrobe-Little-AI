import { Dialog } from 'react-vant'

export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  return Dialog.confirm({
    message,
    className: 'rv-dialog__confirm',
    overlayClassName: 'rv-dialog__overlay',
    onConfirm,
    onCancel,
  })
}
