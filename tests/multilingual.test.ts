import { describe, expect, it } from 'vitest';
import { detectShape, worthALocalLook } from '../src/inference/shape';

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
