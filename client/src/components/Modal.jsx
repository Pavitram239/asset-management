import { Modal as ResModal } from 'react-responsive-modal';
import 'react-responsive-modal/styles.css';
import DesignIcon from './DesignIcon';

const Modal = ({ children, open, onClose, variant = 'detail' }) => (
  <ResModal open={open} onClose={onClose} center classNames={{ modal: `design-dialog dialog-${variant}`, overlay: 'design-overlay', closeButton: 'dialog-close' }}
    closeIcon={<DesignIcon name="close" />} closeButtonProps={{ 'aria-label': 'Close dialog' }} ariaLabelledby={`dialog-title-${variant}`}>
    {children}
  </ResModal>
);
export default Modal;
