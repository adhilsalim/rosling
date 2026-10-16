/* The framework's API for templates: import { Slide, Text, Media, QrCode, useSlide, isStill } from 'rosling'.
   Templates only draw what they are given; the frame (size, theme, footer, timer) comes from <Slide>. */
export { Slide, Text, Media, QrCode, useSlide } from './app/parts';
export type { TemplateProps, FooterProps } from './app/parts';
// still modes (thumbnails, the phone's previews) show a slide's final state: animations and count-ups skip to the end
export { isStill } from './app/context';
export type { Mode } from './app/context';
