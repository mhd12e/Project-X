import { Link, useLocation } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useAppSelector } from '@/store';
import { navGroups } from './nav-config';

const pathLabels: Record<string, string> = Object.fromEntries(
  navGroups.flatMap((g) => g.items.map((i) => [i.path, i.title]))
);

interface Crumb {
  label: string;
  path?: string;
  isLast: boolean;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function useDynamicLabel(pathname: string): string | null {
  const knowledgeDoc = useAppSelector((s) => s.knowledge.selectedDocument);
  const chatConv = useAppSelector((s) => s.chat.activeConversation);

  // /app/knowledge/:id → use document title
  if (pathname.match(/^\/app\/knowledge\/[^/]+$/)) {
    return knowledgeDoc
      ? truncate(knowledgeDoc.title || 'Untitled', 40)
      : 'Loading...';
  }

  // /app/chat/:id → use conversation title
  if (pathname.match(/^\/app\/chat\/[^/]+$/)) {
    return chatConv
      ? truncate(chatConv.title || 'New conversation', 40)
      : 'Loading...';
  }

  return null;
}

function getBreadcrumbs(pathname: string, dynamicLabel: string | null): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Project X', path: '/app', isLast: false }];

  // Exact match
  if (pathLabels[pathname]) {
    crumbs.push({ label: pathLabels[pathname], isLast: true });
    return crumbs;
  }

  // Try parent match for nested routes like /app/knowledge/123
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const parentPath = '/' + segments.slice(0, 2).join('/');
    if (pathLabels[parentPath]) {
      crumbs.push({
        label: pathLabels[parentPath],
        path: parentPath,
        isLast: segments.length === 2,
      });
      if (segments.length > 2) {
        crumbs.push({
          label: dynamicLabel ?? segments[segments.length - 1],
          isLast: true,
        });
      }
    }
  }

  return crumbs;
}

export function TopBar() {
  const location = useLocation();
  const dynamicLabel = useDynamicLabel(location.pathname);
  const breadcrumbs = getBreadcrumbs(location.pathname, dynamicLabel);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="contents">
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.isLast ? (
                  <BreadcrumbPage className="max-w-[300px] truncate font-medium">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.path ?? '/app'}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
