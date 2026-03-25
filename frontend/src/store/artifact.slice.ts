import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';

export interface Artifact {
  id: string;
  name: string;
  description: string | null;
  type: 'image' | 'document' | 'video' | 'file';
  source: 'content' | 'knowledge' | 'chat' | 'agent' | 'upload';
  mimeType: string | null;
  fileSize: number | null;
  sourceContext: string | null;
  createdAt: string;
  url: string;
}

interface ArtifactState {
  items: Artifact[];
  counts: Record<string, number>;
  loading: boolean;
  error: string | null;
}

const initialState: ArtifactState = {
  items: [],
  counts: {},
  loading: false,
  error: null,
};

export const fetchArtifacts = createAsyncThunk(
  'artifact/fetchAll',
  async (filters?: { type?: string; source?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.search) params.set('search', filters.search);
    const { data } = await api.get<Artifact[]>(`/artifacts?${params.toString()}`);
    return data;
  },
);

export const fetchArtifactCounts = createAsyncThunk(
  'artifact/fetchCounts',
  async () => {
    const { data } = await api.get<Record<string, number>>('/artifacts/counts');
    return data;
  },
);

export const deleteArtifact = createAsyncThunk(
  'artifact/delete',
  async (id: string) => {
    await api.delete(`/artifacts/${id}`);
    return id;
  },
);

const artifactSlice = createSlice({
  name: 'artifact',
  initialState,
  reducers: {
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchArtifacts.pending, (state) => { state.loading = true; })
      .addCase(fetchArtifacts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchArtifacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load artifacts';
      })
      .addCase(fetchArtifactCounts.fulfilled, (state, action) => {
        state.counts = action.payload;
      })
      .addCase(deleteArtifact.fulfilled, (state, action) => {
        state.items = state.items.filter((a) => a.id !== action.payload);
      });
  },
});

export const { clearError } = artifactSlice.actions;
export default artifactSlice.reducer;
