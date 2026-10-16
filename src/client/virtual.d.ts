/* Types for the virtual module built from the deck on disk (src/node/vite.ts). */
declare module 'virtual:rosling/deck' {
  import type { ComponentType } from 'react';
  import type { FooterProps, TemplateProps } from './app/parts';

  export interface SlideData {
    id: string; template: string; title: string; time: number; notes: string;
    values: Record<string, unknown>; errors: string[];
  }
  export interface PropData {
    type: string; description?: string; required?: boolean; default?: unknown; max?: number; min?: number;
    values?: string[]; of?: PropData; props?: Record<string, PropData>;
  }
  export interface TemplateData {
    id: string; description: string; schema: Record<string, PropData>; sample: Record<string, unknown>;
    errors: string[]; used: number[];
  }
  export const deck: {
    title: string; time: number; config: Record<string, string>; errors: string[];
    slides: SlideData[]; templates: TemplateData[]; packs: { name: string; source: string }[];
  };
  export const components: Record<string, ComponentType<TemplateProps<any>>>;
  export const Footer: ComponentType<FooterProps> | null;
}

declare module '*.module.css' { const classes: Record<string, string>; export default classes; }
declare module '*.css';
