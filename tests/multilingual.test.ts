import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AiEngine } from '../src/inference/engine';
import { assess } from '../src/inference/router';
import { detectShape, worthALocalLook } from '../src/inference/shape';

const noModel: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: async () => { throw new Error('none'); },
  redactOnDevice: async () => { throw new Error('none'); },
  analyzeInCloud: async () => { throw new Error('offline'); },
};

// Spanish and French scams must reach a model, the way English ones do.
const SCAMS = [
  'Banco Nacional: su cuenta ha sido bloqueada. Para evitar el cierre debe pagar una tarifa de verificación hoy. Llame al 1-855-555-0101 y no se lo diga a nadie en su sucursal.',
  'Agencia Tributaria: tiene una deuda pendiente. Pague hoy con tarjetas de regalo o habrá una orden de arresto. Este asunto es confidencial.',
  'Soporte técnico: su computadora está infectada. Llame ahora al 1-844-555-0177 y permita el acceso remoto. No cuelgue.',
  'Votre compte bancaire est bloqué. Pour le débloquer, payez des frais aujourd’hui et donnez-nous le code de vérification reçu par SMS. Ne le dites à personne.',
  'Service des impôts : une amende est due. Réglez immédiatement par cartes cadeaux, sinon une arrestation sera ordonnée. Gardez cela secret.',
  'Assistance Microsoft : votre ordinateur est piraté. Appelez tout de suite le 01 23 45 67 89 et autorisez l’accès à distance. Restez en ligne.',
];
const ORDINARY = [
  'Hola abuela, te mando las fotos del cumpleaños de Lucía. ¡Nos vemos el domingo!',
  'Su receta está lista para recoger en la farmacia. Horario de 9 a 21 h.',
  'Bonjour mamie, voici les photos du spectacle de Léa. On t’appelle dimanche !',
  'Votre colis a été expédié et arrivera jeudi. Merci pour votre commande.',
];

describe('Spanish and French warning signs', () => {
  it.each(SCAMS)('a scam reaches the on-device model: %s', (text) => {
    expect(worthALocalLook(detectShape(text))).toBe(true);
  });
  it.each(ORDINARY)('an ordinary message does not: %s', (text) => {
    expect(worthALocalLook(detectShape(text))).toBe(false);
  });
});

describe('Spanish and French with no model at all (the built-in rules)', () => {
  it.each(SCAMS)('a scam gets at least a caution: %s', async (text) => {
    const v = await assess({ text, hostname: 'mail.example.test', trigger: 'passive' }, { engine: noModel, config: DEFAULT_CONFIG });
    expect(v.state).not.toBe('safe');
  });
  it.each(ORDINARY)('an ordinary message stays silent: %s', async (text) => {
    const v = await assess({ text, hostname: 'mail.example.test', trigger: 'passive' }, { engine: noModel, config: DEFAULT_CONFIG });
    expect(v.state).toBe('safe');
  });
});

describe('found by the round-four held-out run, fixed after seeing it (26 Nov)', () => {
  const h = JSON.parse(readFileSync('corpus/holdout.json', 'utf8')) as { scamsRound4: { id: string; text: string }[]; benignMessagesRound4: { id: string; text: string }[] };
  it.each(['round4-06-printer-virus', 'round4-09-medicare-card-fr'])('%s now reaches the on-device model', (id) => {
    expect(worthALocalLook(detectShape(h.scamsRound4.find((s) => s.id === id)!.text))).toBe(true);
  });
  it('the round-four ordinary messages still come out safe on the built-in rules', async () => {
    for (const m of h.benignMessagesRound4) {
      const v = await assess({ text: m.text, hostname: 'mail.example.test', trigger: 'passive' }, { engine: noModel, config: DEFAULT_CONFIG });
      expect(v.state, m.id).toBe('safe');
    }
  });
});
