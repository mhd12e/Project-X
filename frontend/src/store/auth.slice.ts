import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import api from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  needsSetup: boolean | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  needsSetup: null,
  loading: false,
  error: null,
};

export const checkSetupStatus = createAsyncThunk('auth/checkSetup', async () => {
  const { data } = await api.get<{ needsSetup: boolean }>('/auth/setup-status');
  return data;
});

export const register = createAsyncThunk(
  'auth/register',
  async (payload: { name: string; email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/register', payload);
      return data;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      return rejectWithValue(error.response?.data?.message ?? 'Registration failed');
    }
  },
);

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/login', payload);
      return data;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      return rejectWithValue(error.response?.data?.message ?? 'Login failed');
    }
  },
);

export const fetchMe = createAsyncThunk(
  'auth/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/auth/me');
      return data;
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      // Only treat 401 as an auth failure — network errors should not log the user out
      return rejectWithValue({
        message: error.response?.data?.message ?? 'Session expired',
        status: error.response?.status,
      });
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state, action: PayloadAction<{ needsSetup?: boolean } | undefined>) {
      state.user = null;
      state.accessToken = null;
      state.needsSetup = action.payload?.needsSetup ?? null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    },
    clearError(state) {
      state.error = null;
    },
    setOnboardingCompleted(state) {
      if (state.user) {
        state.user.onboardingCompleted = true;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Setup status
      .addCase(checkSetupStatus.fulfilled, (state, action) => {
        state.needsSetup = action.payload.needsSetup;
      })
      // Register
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.needsSetup = false;
        localStorage.setItem('accessToken', action.payload.accessToken);
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        localStorage.setItem('accessToken', action.payload.accessToken);
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch me
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        const payload = action.payload as { status?: number } | undefined;
        // Only clear auth on 401 (invalid token) — not on network errors or server restarts
        if (payload?.status === 401 || payload?.status === 403) {
          state.user = null;
          state.accessToken = null;
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      });
  },
});

export const { logout, clearError, setOnboardingCompleted } = authSlice.actions;
export default authSlice.reducer;
