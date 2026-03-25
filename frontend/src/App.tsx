import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HomePage } from '@/pages/home';
import { LoginPage } from '@/pages/auth/login';
import { RegisterPage } from '@/pages/auth/register';
import { OnboardingPage } from '@/pages/onboarding';
import { AuthGuard } from '@/components/layout/auth-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { DashboardPage } from '@/pages/dashboard';
import { KnowledgePage } from '@/pages/knowledge';
import { ChatPage } from '@/pages/chat';
import { ContentPage } from '@/pages/content';
import { ArtifactsPage } from '@/pages/artifacts';
import { ActivityPage } from '@/pages/activity';
import { SettingsPage } from '@/pages/settings';
import { NotFoundPage } from '@/pages/not-found';
import { NotFoundAppPage } from '@/pages/not-found-app';

function App(): React.ReactElement {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app/auth/login" element={<LoginPage />} />
        <Route path="/app/auth/register" element={<RegisterPage />} />
        <Route
          path="/app/onboarding"
          element={
            <AuthGuard>
              <OnboardingPage />
            </AuthGuard>
          }
        />
        <Route
          path="/app"
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/:documentId" element={<KnowledgePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="content/:conversationId" element={<ContentPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundAppPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
