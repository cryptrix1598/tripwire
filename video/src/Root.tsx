import React from 'react';
import {Composition, continueRender, delayRender, staticFile} from 'remotion';
import {Tripwire} from './Tripwire';

// Tripwire's own typeface (Atkinson Hyperlegible, made for low-vision readers), loaded before any frame renders.
const fonts = delayRender('Loading Atkinson Hyperlegible');
Promise.all(
  ([['400', 'atkinson-400.woff2'], ['700', 'atkinson-700.woff2']] as const).map(async ([weight, file]) => {
    const face = new FontFace('Atkinson', `url(${staticFile(`fonts/${file}`)})`, {weight});
    await face.load();
    document.fonts.add(face);
  }),
).then(() => continueRender(fonts));

export const Root: React.FC = () => (
  <Composition id="Tripwire" component={Tripwire} durationInFrames={420} fps={30} width={1920} height={1080} />
);
