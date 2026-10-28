import {useEffect,useRef,useState} from 'react';
import customFetch from '../utils/customFetch';
import {hasPermission} from '../utils/permissions';
import {onboardingCommand} from '../utils/onboardingCommand';
import {uploadAttachment} from '../utils/attachmentCommand';
import FormRow from './FormRow';

export default function PrivateAttachments({user,organizationId,item,lots,balances}){
 const [target,setTarget]=useState('item:'+item.id),[files,setFiles]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[removing,setRemoving]=useState(null);
 const generation=useRef(0),locked=useRef(false),inputRef=useRef(null);
 const can=permission=>hasPermission(user,permission),[targetType,targetId]=target.split(':');
 const load=async()=>{const turn=++generation.current;setLoading(true);try{const rows=[];let cursor;do{const response=(await customFetch.get('/attachments',{params:{targetType,targetId,pageSize:100,...(cursor?{cursor}:{})}})).data;rows.push(...response.data);cursor=response.meta.nextCursor;}while(cursor);if(turn===generation.current){setFiles(rows);setError('');}}catch(failure){if(turn===generation.current){setFiles([]);setError(failure.response?.data?.msg||'Unable to load private files.');}}finally{if(turn===generation.current)setLoading(false);}};
 useEffect(()=>{setRemoving(null);setNotice('');setError('');if(can('attachment.read'))load();else setFiles([]);return()=>{generation.current++;};},[target,organizationId,item.id,user]);
 const submit=async event=>{
  event.preventDefault();if(locked.current)return;const form=event.currentTarget,input=new FormData(form),turn=generation.current;locked.current=true;setBusy(true);setError('');setNotice('');
  try{await uploadAttachment(input.get('file'),{targetType,targetId,category:input.get('category'),containsCost:input.get('containsCost')==='on'},user._id);if(turn!==generation.current)return;if(can('attachment.read'))await load();setNotice('Private file linked.');if(inputRef.current)inputRef.current.value='';}
  catch(failure){if(turn===generation.current)setError(failure.response?.data?.msg||failure.message||'Upload outcome is unknown. Retry the same file and target.');}finally{locked.current=false;setBusy(false);}
 };
 const remove=async event=>{
  event.preventDefault();if(locked.current)return;const reason=new FormData(event.currentTarget).get('attachmentReason'),turn=generation.current;locked.current=true;setBusy(true);setError('');
  try{await onboardingCommand('removeAttachment',`/attachments/${removing.id}/removals`,{expectedVersion:removing.version,reason},user._id);if(turn!==generation.current)return;setRemoving(null);await load();setNotice('File removed; its history is retained.');}catch(failure){if(turn===generation.current)setError(failure.response?.data?.msg||'Unable to confirm removal. Retry the same details.');}finally{locked.current=false;setBusy(false);}
 };
 if(!can('attachment.read')&&!can('attachment.write'))return null;
 const options=[{value:'item:'+item.id,label:'Catalog item'},...lots.map((lot,index)=>({value:'lot:'+lot.id,label:`Acquisition lot ${index+1}`})),...balances.filter(row=>row.itemId===item.id&&row.unitId).map(row=>({value:'unit:'+row.unitId,label:`Individual unit ${row.assetTag||''}`}))];
 return <section className="invitation-list"><h4>Private files</h4><label className="form-row">File target<select className="form-select" aria-label="File target" value={target} disabled={busy} onChange={event=>setTarget(event.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading private files…</p>}
  {can('attachment.read')&&!loading&&!files.length&&<p>No private files visible for this target.</p>}
  {files.map(file=><article className="invitation-row" key={file.id}><strong>{file.fileName}</strong><p>{file.category} · {Math.ceil(file.sizeBytes/1024)} KB{file.containsCost?' · Financial information':''}</p><a href={`/api/v1/attachments/${file.id}/content?organizationId=${encodeURIComponent(organizationId)}`}>Download private file</a>{can('attachment.write')&&<button className="btn" type="button" disabled={busy} onClick={()=>setRemoving(file)}>Remove {file.fileName}</button>}</article>)}
  {removing&&<form onSubmit={remove}><p>Remove {removing.fileName} from this target. The file will be scheduled for deletion; the audit record remains.</p><FormRow name="attachmentReason" labelText="Reason for file removal" maxLength={2000}/><button className="btn" disabled={busy}>Confirm file removal</button><button className="btn" type="button" onClick={()=>setRemoving(null)}>Keep file</button></form>}
  {can('attachment.write')&&<form onSubmit={submit}><label className="form-row">Choose private file<input className="form-input" aria-label="Choose private file" ref={inputRef} name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required disabled={busy}/></label><p>JPEG, PNG, WebP or PDF, up to 5 MB. Price-bearing files must be marked as financial; financial files require cost access.</p>
   <label className="form-row">File category<select className="form-select" name="category" aria-label="File category" disabled={busy}>{['document','image','evidence',...(can('cost.read')?['invoice','quotation','contract']:[])].map(category=><option key={category}>{category}</option>)}</select></label>
   {can('cost.read')&&<label><input name="containsCost" type="checkbox" disabled={busy}/> Contains acquisition or pricing information</label>}
   <button className="btn" disabled={busy}>{busy?'Uploading private file…':'Upload & link file'}</button>
  </form>}
 </section>;
}
