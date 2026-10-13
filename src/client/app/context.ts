/* What a slide knows about where it is being shown. Templates read it through useSlide() (see api.ts). */
import { createContext, useContext } from 'react';

/** thumb: sidebar thumbnail · preview: the viewer's big preview · present: on the projector
    gallery: a template's example · remote: the preview on the phone remote · page: a slide opened on its own */
export type Mode = 'thumb' | 'preview' | 'present' | 'gallery' | 'remote' | 'page';

export interface TimerInfo { talkStart: number; slideStart: number; talkLimit: number; slideLimit: number; offset: number }

export interface SlideContext {
  mode: Mode;
  number: number;               // 1-based position in the deck (0 in the gallery)
  total: number;
  config: Record<string, string>;
  timer: TimerInfo | null;      // only while presenting
}

export const SlideCtx = createContext<SlideContext>({ mode: 'page', number: 0, total: 0, config: {}, timer: null });
export const useSlideContext = () => useContext(SlideCtx);

/** Still modes: animations jump to their end and videos don't play (thumbnails, previews on the phone). */
export const isStill = (mode: Mode) => mode === 'thumb' || mode === 'remote';
