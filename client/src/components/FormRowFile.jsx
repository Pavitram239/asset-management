import { useState } from 'react';
import DesignIcon from './DesignIcon';

const FormRowFile = ({ name, label, accept, help }) => {
  const [fileName, setFileName] = useState('');
  const invoice = name === 'invoice';
  return <div className="form-row">
    <label htmlFor={name} className="form-label">{label || name}</label>
    <label className="upload-control" htmlFor={name}>
      <DesignIcon name="upload" /><span><strong>{fileName || 'Choose file'}</strong><small>{help || (invoice ? 'PDF or image · optional' : 'JPEG, PNG or WebP · optional')}</small></span>
      <input type="file" name={name} id={name} accept={accept || (invoice ? 'application/pdf,image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp')}
        onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} />
    </label>
  </div>;
};
export default FormRowFile;
