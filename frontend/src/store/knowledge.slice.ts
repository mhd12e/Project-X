import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';

export interface KnowledgeDocument {
  id: string;
  title: string | null;
  mimeType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  summary: string | null;
  topics: string[] | null;
  error: string | null;
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  section: string;
  contentType: string;
  topic: string;
  content: string;
  orderIndex: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  chunks: KnowledgeChunk[];
}

interface KnowledgeState {
  documents: KnowledgeDocument[];
  selectedDocument: KnowledgeDocumentDetail | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
}

const initialState: KnowledgeState = {
  documents: [],
  selectedDocument: null,
  loading: false,
  uploading: false,
  error: null,
};

export const fetchDocuments = createAsyncThunk(
  'knowledge/fetchDocuments',
  async () => {
    const { data } = await api.get<KnowledgeDocument[]>('/knowledge/documents');
    return data;
  },
);

export const fetchDocument = createAsyncThunk(
  'knowledge/fetchDocument',
  async (id: string) => {
    const { data } = await api.get<KnowledgeDocumentDetail>(
      `/knowledge/documents/${id}`,
    );
    return data;
  },
);

export const uploadDocument = createAsyncThunk(
  'knowledge/uploadDocument',
  async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<KnowledgeDocument>(
      '/knowledge/upload',
      formData,
    );
    return data;
  },
);

export const deleteDocument = createAsyncThunk(
  'knowledge/deleteDocument',
  async (id: string) => {
    await api.delete(`/knowledge/documents/${id}`);
    return id;
  },
);

const knowledgeSlice = createSlice({
  name: 'knowledge',
  initialState,
  reducers: {
    clearSelectedDocument(state) {
      state.selectedDocument = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all documents
      .addCase(fetchDocuments.pending, (state) => {
        // Only show loading spinner on initial load, not background polls
        if (state.documents.length === 0) {
          state.loading = true;
        }
        state.error = null;
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.loading = false;
        state.documents = action.payload;
        // Keep selectedDocument status in sync with list polls
        if (state.selectedDocument) {
          const updated = action.payload.find(
            (d) => d.id === state.selectedDocument!.id,
          );
          if (updated) {
            state.selectedDocument.status = updated.status;
            state.selectedDocument.summary = updated.summary;
            state.selectedDocument.topics = updated.topics;
            state.selectedDocument.error = updated.error;
            state.selectedDocument.title = updated.title;
          }
        }
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load documents';
      })
      // Fetch single document
      .addCase(fetchDocument.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDocument.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedDocument = action.payload;
      })
      .addCase(fetchDocument.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load document';
      })
      // Upload
      .addCase(uploadDocument.pending, (state) => {
        state.uploading = true;
        state.error = null;
      })
      .addCase(uploadDocument.fulfilled, (state, action) => {
        state.uploading = false;
        state.documents.unshift(action.payload);
      })
      .addCase(uploadDocument.rejected, (state, action) => {
        state.uploading = false;
        state.error = action.error.message ?? 'Failed to upload document';
      })
      // Delete
      .addCase(deleteDocument.fulfilled, (state, action) => {
        state.documents = state.documents.filter(
          (d) => d.id !== action.payload,
        );
        if (state.selectedDocument?.id === action.payload) {
          state.selectedDocument = null;
        }
      });
  },
});

export const { clearSelectedDocument, clearError } = knowledgeSlice.actions;
export default knowledgeSlice.reducer;
