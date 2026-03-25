import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Brain, MessageSquare, Sparkles, Archive,
  Activity, Settings,
} from 'lucide-react';

export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { title: 'Knowledge', path: '/app/knowledge', icon: Brain },
      { title: 'Chat', path: '/app/chat', icon: MessageSquare },
      { title: 'Content', path: '/app/content', icon: Sparkles },
      { title: 'Artifacts', path: '/app/artifacts', icon: Archive },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Activity', path: '/app/activity', icon: Activity },
      { title: 'Settings', path: '/app/settings', icon: Settings },
    ],
  },
];
