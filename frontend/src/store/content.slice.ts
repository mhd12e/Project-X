import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';

export interface ContentIdeaImage {
  id: string;
  provider: string;
  imageUrl: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface ContentIdea {
  id: string;
  conversationId: string;
  title: string;
  description: string;
  category: string | null;
  createdAt: string;
  imageCount?: number;
}

export interface ImageProvider {
  name: string;
  displayName: string;
}

interface ContentState {
  ideas: ContentIdea[];
  providers: ImageProvider[];
  generatingImage: boolean;
  error: string | null;
}

const initialState: ContentState = {
  ideas: [],
  providers: [],
  generatingImage: false,
  error: null,
};

export const fetchIdeas = createAsyncThunk(
  'content/fetchIdeas',
  async () => {
    const { data } = await api.get<ContentIdea[]>('/content/ideas');
    return data;
  },
);

export const generateImage = createAsyncThunk(
  'content/generateImage',
  async (params: { ideaId: string; provider?: string; customPrompt?: string }) => {
    const { data } = await api.post<{ artifactId: string }>('/content/images/generate', params);
    return data;
  },
);

export const fetchProviders = createAsyncThunk(
  'content/fetchProviders',
  async () => {
    const { data } = await api.get<ImageProvider[]>('/content/images/providers');
    return data;
  },
);

const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIdeas.fulfilled, (state, action) => {
        state.ideas = action.payload;
      })
      .addCase(generateImage.pending, (state) => {
        state.generatingImage = true;
      })
      .addCase(generateImage.fulfilled, (state) => {
        state.generatingImage = false;
      })
      .addCase(generateImage.rejected, (state, action) => {
        state.generatingImage = false;
        state.error = action.error.message ?? 'Failed to generate image';
      })
      .addCase(fetchProviders.fulfilled, (state, action) => {
        state.providers = action.payload;
      });
  },
});

export const { clearError } = contentSlice.actions;
export default contentSlice.reducer;
