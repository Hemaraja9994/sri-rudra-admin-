import React, { useCallback, useEffect, useState } from 'react';

import { DIVISIONS } from '../../shared/clinical.js';
import { api } from './api.js';
import DivisionPage from './DivisionPage.jsx';
import MasterControl from './MasterControl.jsx';
import PatientPage from './PatientPage.jsx';
import PlanEditor from './PlanEditor.jsx';
import ReportEditor from './ReportEditor.jsx';
import Shell from './Shell.jsx';

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export default function App() {
  const path = usePath();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/me')
      .then(setSession)
      .catch((err) => {
        if (err.status === 401) window.location.replace('/login');
        else setError(err.message);
      });
  }, []);
  useEffect(load, [load]);

  if (!session) {
    return <div className="loading">{error || 'Loading…'}</div>;
  }

  let page;
  let m;
  if ((m = path.match(/^\/clinical\/(audiology|slp)\/patients\/(\d+)\/reports\/(\d+)\/?$/))) {
    page = <ReportEditor key={path} divisionId={m[1]} id={m[3]} session={session} />;
  } else if ((m = path.match(/^\/clinical\/(audiology|slp)\/patients\/(\d+)\/plans\/(\d+)\/?$/))) {
    page = <PlanEditor key={path} divisionId={m[1]} id={m[3]} session={session} />;
  } else if ((m = path.match(/^\/clinical\/(audiology|slp)\/patients\/(\d+)\/?$/))) {
    page = <PatientPage key={path} divisionId={m[1]} id={m[2]} session={session} />;
  } else if (path.match(/^\/clinical\/master\/?$/)) {
    page = <MasterControl key="master" session={session} />;
  } else if ((m = path.match(/^\/clinical\/(audiology|slp)\/?$/))) {
    page = <DivisionPage key={m[1]} divisionId={m[1]} session={session} />;
  } else {
    window.history.replaceState({}, '', '/clinical/audiology');
    page = <DivisionPage key="audiology" divisionId="audiology" session={session} />;
  }
  const divisionId = (path.match(/^\/clinical\/(audiology|slp)/) || [])[1] || 'audiology';
  document.title = path.includes('/master') ? 'Master control · Sri Rudra Admin Portal' : `${DIVISIONS[divisionId].label} · Sri Rudra Admin Portal`;

  return <Shell session={session} divisionId={divisionId}>{page}</Shell>;
}
