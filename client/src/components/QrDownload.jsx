import { saveAs } from 'file-saver';
import DesignIcon from './DesignIcon';

const QrDownload = ({ product, onClose }) => {
  const available = product.qr && /^data:image\/png;base64,/.test(product.qr);
  return <section className="qr-dialog-content">
    <p className="caption mobile-dialog-eyebrow">INVENTORY ACTION</p>
    <div className="page-heading"><h2 id="dialog-title-qr">Download QR code</h2><p>{product.name} · {product.company}</p></div>
    {available ? <div className="qr-code-frame"><img src={product.qr} alt={`QR code for ${product.name}`} /></div> : <div className="empty-state"><p>This asset does not have a saved QR code.</p></div>}
    <div className="qr-metadata"><h3>ENCODED ASSET ID</h3><p>{product._id}</p><small>PNG · 300 px · margin 1 · error correction H</small><small>Filename: {product._id}.png</small></div>
    <p className="muted">The code identifies this asset. Keep the label with the item for easy identification.</p>
    <button type="button" className="btn btn-block" disabled={!available} onClick={() => saveAs(product.qr, `${product._id}.png`)}><DesignIcon name="download" />Download PNG</button>
    <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>Cancel</button>
  </section>;
};
export default QrDownload;
