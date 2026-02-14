import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardPage } from '@/pages/dashboard-page';
import { PlanFormPage } from '@/pages/plan-form-page';
import { PlanDetailPage } from '@/pages/plan-detail-page';
import { AboutPage } from '@/pages/about-page';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/plans/new" element={<PlanFormPage mode="create" />} />
        <Route path="/plans/:id/edit" element={<PlanFormPage mode="edit" />} />
        <Route path="/plans/:id" element={<PlanDetailPage />} />
      </Routes>
    </AppShell>
  );
}
