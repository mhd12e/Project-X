import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api from '@/lib/api';

export type ActivityCategory = 'auth' | 'knowledge' | 'chat' | 'retrieval' | 'agent' | 'system';
export type ActivityLevel = 'info' | 'warn' | 'error';

export interface ActivityLogEntry {
  id: string;
  category: ActivityCategory;
  level: ActivityLevel;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  user?: { id: string; name: string } | null;
  createdAt: string;
}

export interface ActivityStats {
  totalToday: number;
  totalThisWeek: number;
  errorCount: number;
  byCategory: Record<string, number>;
}

export interface TimelinePoint {
  timestamp: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

interface ActivityState {
  logs: ActivityLogEntry[];
  total: number;
  stats: ActivityStats | null;
  timeline: TimelinePoint[];
  categories: CategoryCount[];
  loading: boolean;
  statsLoading: boolean;
  chartsLoading: boolean;
  error: string | null;
  filters: {
    category: ActivityCategory | '';
    level: ActivityLevel | '';
    page: number;
  };
  timelineRange: 'day' | 'week' | 'month';
}

const initialState: ActivityState = {
  logs: [],
  total: 0,
  stats: null,
  timeline: [],
  categories: [],
  loading: false,
  statsLoading: false,
  chartsLoading: false,
  error: null,
  filters: {
    category: '',
    level: '',
    page: 1,
  },
  timelineRange: 'week',
};

export const fetchActivityLogs = createAsyncThunk(
  'activity/fetchLogs',
  async (params: { category?: string; level?: string; page?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.level) query.set('level', params.level);
    query.set('page', String(params.page ?? 1));
    query.set('limit', '50');
    const { data } = await api.get<{ data: ActivityLogEntry[]; total: number }>(
      `/activity?${query.toString()}`,
    );
    return data;
  },
);

export const fetchActivityStats = createAsyncThunk(
  'activity/fetchStats',
  async () => {
    const { data } = await api.get<ActivityStats>('/activity/stats');
    return data;
  },
);

export const fetchActivityTimeline = createAsyncThunk(
  'activity/fetchTimeline',
  async (range: 'day' | 'week' | 'month' = 'week') => {
    const { data } = await api.get<TimelinePoint[]>(`/activity/timeline?range=${range}`);
    return data;
  },
);

export const fetchActivityCategories = createAsyncThunk(
  'activity/fetchCategories',
  async (range: 'day' | 'week' | 'month' = 'week') => {
    const { data } = await api.get<CategoryCount[]>(`/activity/categories?range=${range}`);
    return data;
  },
);

const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<ActivityState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setTimelineRange(state, action: PayloadAction<'day' | 'week' | 'month'>) {
      state.timelineRange = action.payload;
    },
    prependLog(state, action: PayloadAction<ActivityLogEntry>) {
      state.logs.unshift(action.payload);
      state.total += 1;
      // Keep list capped
      if (state.logs.length > 100) state.logs.pop();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchActivityLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActivityLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload.data;
        state.total = action.payload.total;
      })
      .addCase(fetchActivityLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch activity logs';
      })
      .addCase(fetchActivityStats.pending, (state) => {
        state.statsLoading = true;
      })
      .addCase(fetchActivityStats.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchActivityStats.rejected, (state) => {
        state.statsLoading = false;
      })
      .addCase(fetchActivityTimeline.pending, (state) => {
        state.chartsLoading = true;
      })
      .addCase(fetchActivityTimeline.fulfilled, (state, action) => {
        state.chartsLoading = false;
        state.timeline = action.payload;
      })
      .addCase(fetchActivityTimeline.rejected, (state) => {
        state.chartsLoading = false;
      })
      .addCase(fetchActivityCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
      });
  },
});

export const { setFilters, setTimelineRange, prependLog } = activitySlice.actions;
export default activitySlice.reducer;
