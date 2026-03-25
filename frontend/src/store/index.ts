import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import authReducer from './auth.slice';
import knowledgeReducer from './knowledge.slice';
import conversationReducer from './conversation.slice';
import contentReducer from './content.slice';
import activityReducer from './activity.slice';
import artifactReducer from './artifact.slice';
import vaultReducer from './vault.slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    knowledge: knowledgeReducer,
    conversation: conversationReducer,
    content: contentReducer,
    activity: activityReducer,
    artifact: artifactReducer,
    vault: vaultReducer,
  },
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
