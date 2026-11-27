import { followTextSize } from '../../src/ui/textSize';
import '../../src/ui/fonts.css';
import '../../src/ui/tripwire.css';
import { createRoot } from 'react-dom/client';
import { applyLocale } from '../../src/ui/locale';
import { App } from './App';

// Follow the reader's browser language (English, Spanish or French) before anything renders.
document.documentElement.lang = applyLocale(navigator.language);
followTextSize(document.documentElement);
createRoot(document.getElementById('root')!).render(<App />);
