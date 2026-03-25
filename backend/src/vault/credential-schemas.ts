import { CredentialType } from './vault-credential.entity';

export interface CredentialFieldSchema {
  key: string;
  label: string;
  type: 'string' | 'secret';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface CredentialTypeSchema {
  type: CredentialType;
  displayName: string;
  description: string;
  icon: string;
  fields: CredentialFieldSchema[];
}

/**
 * Central registry of credential types and their schemas.
 *
 * To add a new provider:
 * 1. Add a value to the CredentialType enum
 * 2. Add an entry here with the field definitions
 * 3. Add a test case in CredentialTesterService
 * 4. Create the provider class
 */
export const CREDENTIAL_SCHEMAS: Record<CredentialType, CredentialTypeSchema> = {
  [CredentialType.GEMINI]: {
    type: CredentialType.GEMINI,
    displayName: 'Google Gemini',
    description: 'API key for Nano Banana image generation powered by Google Gemini.',
    icon: 'image',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'secret',
        required: true,
        placeholder: 'AIzaSy...',
        helpText: 'Get your API key from Google AI Studio (aistudio.google.com)',
      },
    ],
  },
};
