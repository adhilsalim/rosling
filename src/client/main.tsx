/* The app: one page, four views chosen by the address.
   #/ or #/3      the viewer (and presenter mode), on slide 3
   #/remote       the phone remote
   #/gallery      the template gallery (#/gallery/<pack>/<name> for one template)
   #/slide/3      slide 3 on its own, full window (for screenshots and checks) */
import './base.css';   // before the theme (imported with the deck), so the theme can override it
import './app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { deck, Footer } from 'virtual:rosling/deck';
import { FooterCtx } from './app/parts';
import { Viewer } from './app/Viewer';
import { Remote } from './app/Remote';
import { Gallery } from './app/Gallery';
import { Stage, SlideView } from './app/Stage';

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const h = () => setHash(location.hash); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  return hash.replace(/^#\/?/, '');
}

function App() {
  const route = useRoute();
  useEffect(() => { document.title = route === 'remote' ? `Remote · ${deck.title}` : deck.title; }, [route]);
  document.body.dataset.view = route.split('/')[0] || 'viewer';
  if (route === 'remote') return <Remote />;
  if (route === 'gallery' || route.startsWith('gallery/')) return <Gallery focus={route.slice(8) || undefined} />;
  if (route.startsWith('slide/')) return <Stage className="page-stage"><SlideView index={(parseInt(route.slice(6), 10) || 1) - 1} mode="page" /></Stage>;
  // the viewer keeps its own address in step with the slide (#/3), so only read it once
  return <Viewer start={(parseInt(route, 10) || 1) - 1} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FooterCtx.Provider value={Footer}><App /></FooterCtx.Provider>
  </StrictMode>,
);
