/**
 * The production AiEngine: Firebase AI Logic, and nothing else.
 *
 * This is the ONLY file in Tripwire that performs AI inference. All three
 * model calls go through `firebase/ai`:
 *   [1] triage    → InferenceMode.ONLY_ON_DEVICE (Gemini Nano via Chrome's Prompt API)
 *   [2] redaction → InferenceMode.ONLY_ON_DEVICE
 *   [3] analysis  → InferenceMode.ONLY_IN_CLOUD  (Gemini via the Gemini Developer API)
 *
 * The modes are pinned per step rather than left to PREFER_ON_DEVICE, because
 * in Tripwire the split is a privacy boundary, not a convenience: steps 1 and 2
 * see raw page text and must never leave the device. After each on-device call
 * the SDK-reported `inferenceSource` is checked, and a call that did not run
 * on-device is treated as a hard error.
 *
 * Docs used (read 2026-11-13) and checked against the installed SDK typings
 * (firebase 13.3.0 / @firebase/ai):
 *   https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
 *   https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
 *   https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output
 *   https://developer.chrome.com/docs/ai/prompt-api
 *
 * Notes from those docs that shaped this file:
 *   - On-device inference needs Chrome desktop 139+ and firebase JS SDK 12.5.0+.
 *   - The Prompt API is not available in Web Workers, so not in the MV3 service
 *     worker. This engine therefore runs in a document: the offscreen document
 *     for background checks, or an extension page.
 *   - initializeDeviceModel() must follow a user gesture when the model still
 *     needs downloading. Onboarding does that on a button click.
 *   - With ONLY_ON_DEVICE the SDK does not fall back; if availability is
 *     "downloadable" and no download was started it would try to create a
 *     session anyway. So the router checks onDeviceStatus() first and only
 *     uses the on-device path when the model is fully "available".
 *   - Structured output: `responseConstraint` on-device, `responseMimeType` +
 *     `responseSchema` in the cloud.
 *   - On-device input is capped at 9216 tokens; the router caps text length.
 */
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type AI,
  type GenerativeModel,
  type HybridParams,
  type ModelParams,
} from 'firebase/ai';
import { getFirebaseApp } from '../firebase/app';
import { PrivacyInvariantError, type AiEngine, type OnDeviceStatus } from './engine';
import { CLOUD_JSON_SCHEMA, REDACTION_JSON_SCHEMA, TRANSLATION_JSON_SCHEMA, TRIAGE_JSON_SCHEMA } from './schemas';

const TEXT_EN = [{ type: 'text' as const, languages: ['en'] }];

/**
 * What the pages are written in. The browser's language is the best guess: a
 * Spanish or French browser mostly shows Spanish or French pages, so those are
 * declared alongside English. English browsers declare English only, so the
 * model's availability is not narrowed for them.
 */
function inputLanguages(lang = globalThis.navigator?.language ?? 'en'): string[] {
  const base = lang.slice(0, 2).toLowerCase();
  return base === 'es' || base === 'fr' ? ['en', base] : ['en'];
}
const TEXT_IN = [{ type: 'text' as const, languages: inputLanguages() }];

/** The slice of Chrome's Prompt API used for the availability check. */
interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

let ai: AI | null = null;
function getAi(): AI {
  // The Gemini Developer API backend: no billing account needed.
  ai ??= getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  return ai;
}

const modelCache = new Map<string, GenerativeModel>();

function onDeviceModel(system: string, schema: object, outputLanguage = 'en'): GenerativeModel {
  const key = `device|${outputLanguage}|${system}|${JSON.stringify(schema)}`;
  let model = modelCache.get(key);
  if (!model) {
    const params: HybridParams = {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: TEXT_IN,
          // The Prompt API rejects output languages the on-device model cannot write.
          expectedOutputs: [{ type: 'text' as const, languages: [outputLanguage] }],
          initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
        },
        promptOptions: { responseConstraint: schema },
      },
    };
    model = getGenerativeModel(getAi(), params);
    modelCache.set(key, model);
  }
  return model;
}

function cloudModel(system: string, modelName: string, schema: object): GenerativeModel {
  const key = `cloud|${modelName}|${system}`;
  let model = modelCache.get(key);
  if (!model) {
    const inCloudParams: ModelParams = {
      model: modelName,
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema as NonNullable<ModelParams['generationConfig']>['responseSchema'],
        temperature: 0,
      },
    };
    model = getGenerativeModel(getAi(), { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
    modelCache.set(key, model);
  }
  return model;
}

async function runOnDevice(model: GenerativeModel, prompt: string, label: string): Promise<string> {
  const result = await model.generateContent(prompt);
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
    throw new PrivacyInvariantError(`${label} was expected to run on-device but the SDK reported "${result.response.inferenceSource}".`);
  }
  return result.response.text();
}

/**
 * Whether Gemini Nano can run here right now. This asks Chrome's Prompt API
 * for its availability state; it is a capability check, not inference.
 */
export async function onDeviceStatus(): Promise<OnDeviceStatus> {
  const LanguageModel = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!LanguageModel) return 'unavailable';
  try {
    const state = await LanguageModel.availability({ expectedInputs: TEXT_IN, expectedOutputs: TEXT_EN });
    if (state === 'available' || state === 'downloadable' || state === 'downloading') return state;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export const firebaseEngine: AiEngine = {
  onDeviceStatus,

  triageOnDevice(system, user) {
    return runOnDevice(onDeviceModel(system, TRIAGE_JSON_SCHEMA), user, 'Triage');
  },

  redactOnDevice(system, user) {
    return runOnDevice(onDeviceModel(system, REDACTION_JSON_SCHEMA), user, 'Redaction');
  },

  async analyzeInCloud(system, user, modelName) {
    const result = await cloudModel(system, modelName, CLOUD_JSON_SCHEMA).generateContent(user);
    return result.response.text();
  },

  translateOnDevice(system, user, language) {
    return runOnDevice(onDeviceModel(system, TRANSLATION_JSON_SCHEMA, language), user, 'Translation');
  },
};

/**
 * Start (or resume) the one-time Gemini Nano download. Must be called from a
 * user gesture in a page, per Chrome's user-activation rule.
 */
export async function prepareOnDeviceModel(onProgress?: (fraction: number) => void): Promise<void> {
  const model = getGenerativeModel(getAi(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: TEXT_IN, expectedOutputs: TEXT_EN } },
  });
  await model.initializeDeviceModel(onProgress);
}

/**
 * A single PREFER_ON_DEVICE call that reports which side answered. Used by the
 * Developer checks page to demonstrate the SDK's own hybrid fallback.
 */
export async function hybridProbe(prompt: string): Promise<{ text: string; source: string }> {
  const model = getGenerativeModel(getAi(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: TEXT_IN, expectedOutputs: TEXT_EN } },
  });
  const result = await model.generateContent(prompt);
  return { text: result.response.text(), source: result.response.inferenceSource ?? 'unknown' };
}
