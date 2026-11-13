import React, { useRef, useState } from 'react';

import { DIVISIONS } from '../../shared/clinical.js';
import { api, navigate, uploadFile } from './api.js';
import PatientForm from './PatientForm.jsx';
import { readForAi } from './readfile.js';
import { AsyncButton, Icon, Modal, Notice } from './ui.jsx';

const ACCEPT = 'image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.doc,.docx';
const PATIENT_KEYS = ['name', 'phone', 'sex', 'dob', 'age_years', 'file_no', 'referred_by', 'diagnosis', 'diagnosis_detail', 'ear', 'degree'];

// "Add from file": the clinician uploads a record, the AI reads it, and the Add patient form opens
// filled in for them to check. The files are then kept with the patient.
export default function AddFromFile({ divisionId, session, onClose }) {
  const div = DIVISIONS[divisionId];
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [review, setReview] = useState(null); // { initial, highlight, matches }
  const inputRef = useRef(null);

  const addFiles = (list) => {
    const picked = Array.from(list).slice(0, 10);
    setFiles((cur) => [...cur, ...picked].slice(0, 10));
    setError('');
  };

  async function readWithAi() {
    setError('');
    setStatus('Reading the file…');
    try {
      const docs = [];
      for (const file of files) {
        setStatus(`Reading ${file.name}…`);
        docs.push({ file, ...(await readForAi(file)) }); // eslint-disable-line no-await-in-loop
      }
      const readable = docs.filter((d) => d.images?.length || d.text).map(({ file, ...d }) => d);
      if (!readable.length) {
        // Nothing the AI can read (e.g. only Word files): go straight to a blank form, still keep the files.
        setReview({ initial: {}, highlight: new Set(), matches: [], summary: '' });
        return;
      }
      setStatus('Understanding the details…');
      const res = await api('/ai/read', { method: 'POST', body: { division: divisionId, documents: readable } });
      const initial = {};
      const highlight = new Set();
      for (const k of PATIENT_KEYS) {
        if (res.fields?.[k]) { initial[k] = res.fields[k]; highlight.add(k); }
      }
      if (res.complaint && !initial.notes) initial.notes = res.complaint;
      const summary = [res.complaint && `Complaint: ${res.complaint}`, ...(res.findings || []), ...(res.tests || [])].filter(Boolean).join('\n').slice(0, 1400);
      setReview({ initial, highlight, matches: res.matches || [], summary });
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  // After the patient exists (new or chosen), attach the files and go to their page.
  async function attachAndGo(patientId, summary) {
    setStatus('Saving the files…');
    try {
      for (let i = 0; i < files.length; i += 1) {
        await uploadFile(patientId, files[i], { name: files[i].name, summary: i === 0 ? summary : '' }); // eslint-disable-line no-await-in-loop
      }
    } catch (err) {
      setError(`The patient was saved, but a file did not upload: ${err.message}`);
    }
    navigate(`/clinical/${divisionId}/patients/${patientId}`);
  }

  if (review) {
    return (
      <>
        {review.matches.length > 0 && (
          <Modal title="This patient may already have a record" onClose={() => setReview(null)}>
            <p className="sub">The details match {review.matches.length === 1 ? 'an existing patient' : 'existing patients'}. Open that record and add the file there, or add a new patient.</p>
            <ul className="clin-matchlist">
              {review.matches.map((m) => (
                <li key={m.id}>
                  <div>
                    <b>{m.name}</b>
                    <span className="muted">{[m.reg_no, m.phone, DIVISIONS[m.division]?.short].filter(Boolean).join(' · ')}</span>
                  </div>
                  <AsyncButton className="btn btn--secondary" busyLabel="Opening…" onClick={() => attachAndGo(m.id, review.summary)}>Add to this patient</AsyncButton>
                </li>
              ))}
            </ul>
            <div className="modal__foot">
              <span className="spacer" />
              <button type="button" className="btn btn--secondary" onClick={() => onClose(false)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={() => setReview({ ...review, matches: [] })}>Add as a new patient</button>
            </div>
          </Modal>
        )}
        {review.matches.length === 0 && (
          <PatientForm
            divisionId={divisionId}
            session={session}
            initial={review.initial}
            highlight={review.highlight}
            onClose={(id) => { if (id) attachAndGo(id, review.summary); else onClose(false); }}
          />
        )}
      </>
    );
  }

  return (
    <Modal title={`Add a ${div.label.toLowerCase()} patient from a file`} sub="Upload a case sheet, report or photo. The AI reads it and fills in the form for you to check." onClose={() => onClose(false)}>
      <div
        className="clin-drop"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }}
        onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('is-over'); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <Icon name="upload" size={26} />
        <p><b>Choose files</b> or drag them here</p>
        <span className="muted">Photos, PDFs, case sheets — up to 10, 15 MB each</span>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {files.length > 0 && (
        <ul className="clin-filelist">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <Icon name="file" size={16} />
              <span className="clin-filelist__name">{f.name}</span>
              <span className="muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="close" size={15} /></button>
            </li>
          ))}
        </ul>
      )}

      {status && <p className="clin-aistatus"><span className="clin-spin" />{status}</p>}
      <Notice>{error}</Notice>

      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => setReview({ initial: {}, highlight: new Set(), matches: [], summary: '' })} disabled={!files.length}>Skip AI — add manually</button>
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={() => onClose(false)}>Cancel</button>
        <AsyncButton busyLabel="Reading…" onClick={readWithAi} disabled={!files.length}><Icon name="ai" size={16} />Read with AI</AsyncButton>
      </div>
    </Modal>
  );
}
