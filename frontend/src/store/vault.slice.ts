import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';

export interface VaultCredential {
  id: string;
  type: string;
  displayName: string;
  label: string | null;
  verified: boolean;
  maskedData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialFieldSchema {
  key: string;
  label: string;
  type: 'string' | 'secret';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface CredentialTypeSchema {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  fields: CredentialFieldSchema[];
}

interface VaultState {
  credentials: VaultCredential[];
  schemas: Record<string, CredentialTypeSchema>;
  loading: boolean;
  testing: string | null;
  error: string | null;
}

const initialState: VaultState = {
  credentials: [],
  schemas: {},
  loading: false,
  testing: null,
  error: null,
};

export const fetchCredentials = createAsyncThunk(
  'vault/fetchCredentials',
  async () => {
    const { data } = await api.get<VaultCredential[]>('/vault/credentials');
    return data;
  },
);

export const fetchSchemas = createAsyncThunk(
  'vault/fetchSchemas',
  async () => {
    const { data } = await api.get<Record<string, CredentialTypeSchema>>('/vault/schemas');
    return data;
  },
);

export const upsertCredential = createAsyncThunk(
  'vault/upsert',
  async (params: { type: string; data: Record<string, string>; label?: string }) => {
    const { data } = await api.put<VaultCredential>(
      `/vault/credentials/${params.type}`,
      { data: params.data, label: params.label },
    );
    return data;
  },
);

export const deleteCredential = createAsyncThunk(
  'vault/delete',
  async (type: string) => {
    await api.delete(`/vault/credentials/${type}`);
    return type;
  },
);

export const testCredential = createAsyncThunk(
  'vault/test',
  async (type: string) => {
    const { data } = await api.post<{ success: boolean; message: string }>(
      `/vault/credentials/${type}/test`,
    );
    return { type, ...data };
  },
);

const vaultSlice = createSlice({
  name: 'vault',
  initialState,
  reducers: {
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCredentials.pending, (state) => { state.loading = true; })
      .addCase(fetchCredentials.fulfilled, (state, action) => {
        state.loading = false;
        state.credentials = action.payload;
      })
      .addCase(fetchCredentials.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load credentials';
      })
      .addCase(fetchSchemas.fulfilled, (state, action) => {
        state.schemas = action.payload;
      })
      .addCase(upsertCredential.fulfilled, (state, action) => {
        const idx = state.credentials.findIndex((c) => c.type === action.payload.type);
        if (idx >= 0) {
          state.credentials[idx] = action.payload;
        } else {
          state.credentials.push(action.payload);
        }
      })
      .addCase(deleteCredential.fulfilled, (state, action) => {
        state.credentials = state.credentials.filter((c) => c.type !== action.payload);
      })
      .addCase(testCredential.pending, (state, action) => {
        state.testing = action.meta.arg;
      })
      .addCase(testCredential.fulfilled, (state, action) => {
        state.testing = null;
        if (action.payload.success) {
          const cred = state.credentials.find((c) => c.type === action.payload.type);
          if (cred) cred.verified = true;
        }
      })
      .addCase(testCredential.rejected, (state) => {
        state.testing = null;
      });
  },
});

export const { clearError } = vaultSlice.actions;
export default vaultSlice.reducer;
