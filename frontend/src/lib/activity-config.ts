import type { LucideIcon } from 'lucide-react';
import {
  Shield, Brain, MessageSquare, Search, Bot, Server,
} from 'lucide-react';

export const CATEGORY_COLORS: Record<string, string> = {
  auth: '#7c7c78',
  knowledge: '#7a8f74',
  chat: '#8B9A82',
  retrieval: '#b8a88a',
  agent: '#8b9a82',
  content: '#6d8a65',
  system: '#94a3b8',
};

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  auth: Shield,
  knowledge: Brain,
  chat: MessageSquare,
  retrieval: Search,
  agent: Bot,
  system: Server,
};

export const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Auth',
  knowledge: 'Knowledge',
  chat: 'Chat',
  retrieval: 'Retrieval',
  agent: 'Agent',
  system: 'System',
};
