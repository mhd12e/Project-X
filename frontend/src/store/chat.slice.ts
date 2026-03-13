import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import api from '@/lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[];
}

interface ChatState {
  conversations: ChatConversation[];
  activeConversation: ChatConversationDetail | null;
  pinnedIds: string[];
  loading: boolean;
  sending: boolean;
  error: string | null;
}

const PINNED_STORAGE_KEY = 'chat_pinned_ids';

function loadPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function savePinnedIds(ids: string[]) {
  localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
}

const initialState: ChatState = {
  conversations: [],
  activeConversation: null,
  pinnedIds: loadPinnedIds(),
  loading: false,
  sending: false,
  error: null,
};

export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async () => {
    const { data } = await api.get<ChatConversation[]>('/chat/conversations');
    return data;
  },
);

export const createConversation = createAsyncThunk(
  'chat/createConversation',
  async () => {
    const { data } = await api.post<ChatConversation>('/chat/conversations');
    return data;
  },
);

export const fetchConversation = createAsyncThunk(
  'chat/fetchConversation',
  async (id: string) => {
    const { data } = await api.get<ChatConversationDetail>(
      `/chat/conversations/${id}`,
    );
    return data;
  },
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ conversationId, message }: { conversationId: string; message: string }) => {
    const { data } = await api.post<ChatMessage>(
      `/chat/conversations/${conversationId}/messages`,
      { message },
    );
    return { ...data, conversationId };
  },
);

/** Create a new conversation and send the first message in one action */
export const createConversationAndSend = createAsyncThunk(
  'chat/createConversationAndSend',
  async ({ message }: { message: string }) => {
    const { data: conv } = await api.post<ChatConversation>('/chat/conversations');
    const { data: msg } = await api.post<ChatMessage>(
      `/chat/conversations/${conv.id}/messages`,
      { message },
    );
    return { conversation: conv, message: msg };
  },
);

export const deleteConversation = createAsyncThunk(
  'chat/deleteConversation',
  async (id: string) => {
    await api.delete(`/chat/conversations/${id}`);
    return id;
  },
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearActiveConversation(state) {
      state.activeConversation = null;
    },
    startDraftConversation(state) {
      state.activeConversation = {
        id: '__draft__',
        title: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    },
    finalizeStreamedMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        content: string;
        metadata?: Record<string, unknown> | null;
      }>,
    ) {
      if (state.activeConversation?.id === action.payload.conversationId) {
        state.activeConversation.messages.push({
          id: action.payload.messageId,
          role: 'assistant',
          content: action.payload.content,
          metadata: action.payload.metadata ?? null,
          createdAt: new Date().toISOString(),
        });
        state.sending = false;
      }
    },
    updateConversationTitle(state, action: PayloadAction<{ id: string; title: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.id);
      if (conv) conv.title = action.payload.title;
      if (state.activeConversation?.id === action.payload.id) {
        state.activeConversation.title = action.payload.title;
      }
    },
    clearError(state) {
      state.error = null;
    },
    togglePin(state, action: PayloadAction<string>) {
      const id = action.payload;
      const idx = state.pinnedIds.indexOf(id);
      if (idx >= 0) {
        state.pinnedIds.splice(idx, 1);
      } else {
        state.pinnedIds.push(id);
      }
      savePinnedIds(state.pinnedIds);
    },
    reorderPinned(state, action: PayloadAction<string[]>) {
      state.pinnedIds = action.payload;
      savePinnedIds(state.pinnedIds);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversations = action.payload.slice().sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        state.conversations.unshift({
          ...action.payload,
          updatedAt: action.payload.createdAt,
        });
        state.activeConversation = {
          ...action.payload,
          updatedAt: action.payload.createdAt,
          messages: [],
        };
      })
      .addCase(fetchConversation.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchConversation.fulfilled, (state, action) => {
        state.loading = false;
        state.activeConversation = action.payload;
      })
      .addCase(fetchConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load conversation';
      })
      .addCase(sendMessage.pending, (state) => {
        state.sending = true;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        // User message added to active conversation
        if (state.activeConversation) {
          state.activeConversation.messages.push(action.payload);
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sending = false;
        state.error = action.error.message ?? 'Failed to send message';
      })
      .addCase(createConversationAndSend.pending, (state) => {
        state.sending = true;
      })
      .addCase(createConversationAndSend.fulfilled, (state, action) => {
        const { conversation, message: msg } = action.payload;
        // Add to sidebar
        state.conversations.unshift({
          ...conversation,
          updatedAt: conversation.createdAt,
        });
        // Set as active with the first user message
        state.activeConversation = {
          ...conversation,
          updatedAt: conversation.createdAt,
          messages: [msg],
        };
      })
      .addCase(createConversationAndSend.rejected, (state, action) => {
        state.sending = false;
        state.error = action.error.message ?? 'Failed to create conversation';
      })
      .addCase(deleteConversation.fulfilled, (state, action) => {
        state.conversations = state.conversations.filter((c) => c.id !== action.payload);
        if (state.activeConversation?.id === action.payload) {
          state.activeConversation = null;
        }
      });
  },
});

export const {
  clearActiveConversation,
  startDraftConversation,
  finalizeStreamedMessage,
  updateConversationTitle,
  clearError,
  togglePin,
  reorderPinned,
} = chatSlice.actions;
export default chatSlice.reducer;
