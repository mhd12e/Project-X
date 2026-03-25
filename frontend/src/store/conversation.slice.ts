import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import api from '@/lib/api';
import type { ContentBlock } from '@/types/content-block';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  contentBlocks: ContentBlock[];
  plainText: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'chat' | 'content';
  title: string | null;
  isPinned: boolean;
  pinnedOrder: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

interface ConversationState {
  conversations: Conversation[];
  activeConversation: ConversationDetail | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
}

const initialState: ConversationState = {
  conversations: [],
  activeConversation: null,
  loading: false,
  sending: false,
  error: null,
};

export const fetchConversations = createAsyncThunk(
  'conversation/fetchAll',
  async (type?: 'chat' | 'content') => {
    const params = type ? `?type=${type}` : '';
    const { data } = await api.get<Conversation[]>(`/conversations${params}`);
    return data;
  },
);

export const createConversation = createAsyncThunk(
  'conversation/create',
  async (params: { type: 'chat' | 'content'; title?: string; message?: string }) => {
    const { data } = await api.post<ConversationDetail | Conversation>('/conversations', params);
    return data;
  },
);

export const fetchConversation = createAsyncThunk(
  'conversation/fetchOne',
  async (id: string) => {
    const { data } = await api.get<ConversationDetail>(`/conversations/${id}`);
    return data;
  },
);

export const sendMessage = createAsyncThunk(
  'conversation/sendMessage',
  async ({ conversationId, message }: { conversationId: string; message: string }) => {
    const { data } = await api.post<ConversationMessage>(`/conversations/${conversationId}/messages`, { message });
    return { ...data, conversationId };
  },
);

export const createConversationAndSend = createAsyncThunk(
  'conversation/createAndSend',
  async ({ type, message }: { type: 'chat' | 'content'; message: string }) => {
    const { data: conv } = await api.post<Conversation>('/conversations', { type });
    const { data: msg } = await api.post<ConversationMessage>(`/conversations/${conv.id}/messages`, { message });
    return { conversation: conv, message: msg };
  },
);

export const updateConversation = createAsyncThunk(
  'conversation/update',
  async ({ id, ...updates }: { id: string; title?: string; isPinned?: boolean; pinnedOrder?: number }) => {
    await api.patch(`/conversations/${id}`, updates);
    return { id, ...updates };
  },
);

export const deleteConversation = createAsyncThunk(
  'conversation/delete',
  async (id: string) => {
    await api.delete(`/conversations/${id}`);
    return id;
  },
);

const conversationSlice = createSlice({
  name: 'conversation',
  initialState,
  reducers: {
    clearActiveConversation(state) {
      state.activeConversation = null;
    },
    startDraftConversation(state, action: PayloadAction<'chat' | 'content'>) {
      state.activeConversation = {
        id: '__draft__',
        type: action.payload,
        title: null,
        isPinned: false,
        pinnedOrder: null,
        status: 'active',
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
        contentBlocks: ContentBlock[];
        plainText: string;
      }>,
    ) {
      if (state.activeConversation?.id === action.payload.conversationId) {
        state.activeConversation.messages.push({
          id: action.payload.messageId,
          role: 'assistant',
          contentBlocks: action.payload.contentBlocks,
          plainText: action.payload.plainText,
          createdAt: new Date().toISOString(),
        });
        state.sending = false;
      }
    },
    updateTitle(state, action: PayloadAction<{ id: string; title: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.id);
      if (conv) conv.title = action.payload.title;
      if (state.activeConversation?.id === action.payload.id) {
        state.activeConversation.title = action.payload.title;
      }
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversations = action.payload.slice().sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      })
      .addCase(createConversation.pending, (state) => {
        state.sending = true;
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        const conv = action.payload;
        state.conversations.unshift({
          id: conv.id,
          type: conv.type,
          title: conv.title,
          isPinned: conv.isPinned,
          pinnedOrder: conv.pinnedOrder ?? null,
          status: conv.status,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt ?? conv.createdAt,
        });
        state.activeConversation = {
          ...conv,
          updatedAt: conv.updatedAt ?? conv.createdAt,
          messages: 'messages' in conv ? (conv as ConversationDetail).messages : [],
        };
      })
      .addCase(createConversation.rejected, (state, action) => {
        state.sending = false;
        state.error = action.error.message ?? 'Failed to create conversation';
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
        state.conversations.unshift({
          ...conversation,
          updatedAt: conversation.updatedAt ?? conversation.createdAt,
        });
        state.activeConversation = {
          ...conversation,
          updatedAt: conversation.updatedAt ?? conversation.createdAt,
          messages: [msg],
        };
      })
      .addCase(createConversationAndSend.rejected, (state, action) => {
        state.sending = false;
        state.error = action.error.message ?? 'Failed to create conversation';
      })
      .addCase(updateConversation.fulfilled, (state, action) => {
        const conv = state.conversations.find((c) => c.id === action.payload.id);
        if (conv) {
          if (action.payload.title !== undefined) conv.title = action.payload.title;
          if (action.payload.isPinned !== undefined) conv.isPinned = action.payload.isPinned;
          if (action.payload.pinnedOrder !== undefined) conv.pinnedOrder = action.payload.pinnedOrder;
        }
        if (state.activeConversation?.id === action.payload.id) {
          if (action.payload.title !== undefined) state.activeConversation.title = action.payload.title;
          if (action.payload.isPinned !== undefined) state.activeConversation.isPinned = action.payload.isPinned;
        }
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
  updateTitle,
  clearError,
} = conversationSlice.actions;
export default conversationSlice.reducer;
