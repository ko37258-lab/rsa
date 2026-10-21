import { createHashRouter, Navigate, RouterProvider, useRouteError } from "react-router-dom";
import { AppShell } from "@/layout/AppShell";
import { ErrorBox, LinkButton } from "@/components/ui";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import UnitsPage from "@/pages/units/UnitsPage";
import UnitRecordPage from "@/pages/units/UnitRecordPage";
import InquiriesPage from "@/pages/inquiries/InquiriesPage";
import InquiryRecordPage from "@/pages/inquiries/InquiryRecordPage";
import CustomersPage from "@/pages/customers/CustomersPage";
import CustomerRecordPage from "@/pages/customers/CustomerRecordPage";
import LeasesPage from "@/pages/leases/LeasesPage";
import LeaseRecordPage from "@/pages/leases/LeaseRecordPage";
import BillingPage from "@/pages/billing/BillingPage";
import CollectionsPage from "@/pages/collections/CollectionsPage";
import SettlePage from "@/pages/settle/SettlePage";
import LedgerPage from "@/pages/ledger/LedgerPage";
import ReadinessPage from "@/pages/readiness/ReadinessPage";
import IntegrityPage from "@/pages/integrity/IntegrityPage";
import QaPage from "@/pages/qa/QaPage";
import PoliciesPage from "@/pages/policies/PoliciesPage";
import MaterialsPage from "@/pages/materials/MaterialsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import LeasePrintPage from "@/pages/leases/LeasePrintPage";
import InvoicePrintPage from "@/pages/billing/InvoicePrintPage";

function RouteError() {
  const err = useRouteError();
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorBox error={err instanceof Error ? err : new Error("화면을 그리다 문제가 생겼다")} />
      <LinkButton to="/dashboard">대시보드로</LinkButton>
    </div>
  );
}

/**
 * 경로 구성은 원본 홈즈 PMS 와 같다(/dashboard, /units/:id, /leases/:id …).
 * 해시 라우터라 어떤 정적 호스팅에 올려도 새로고침이 깨지지 않는다.
 */
const router = createHashRouter([
  // 인쇄용 문서는 사이드바 없이
  { path: "/print/lease/:leaseId", element: <LeasePrintPage />, errorElement: <RouteError /> },
  { path: "/print/invoice/:invoiceId", element: <InvoicePrintPage />, errorElement: <RouteError /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "analytics", element: <Navigate to="/dashboard" replace /> },
          { path: "units", element: <UnitsPage /> },
          { path: "units/:unitId", element: <UnitRecordPage /> },
          { path: "calendar", element: <Navigate to="/units?view=calendar" replace /> },
          { path: "inquiries", element: <InquiriesPage /> },
          { path: "inquiries/:inquiryId", element: <InquiryRecordPage /> },
          { path: "customers", element: <CustomersPage /> },
          { path: "customers/:customerId", element: <CustomerRecordPage /> },
          { path: "leases", element: <LeasesPage /> },
          { path: "leases/:leaseId", element: <LeaseRecordPage /> },
          { path: "billing", element: <BillingPage /> },
          { path: "collections", element: <CollectionsPage /> },
          { path: "settle", element: <SettlePage /> },
          { path: "ledger", element: <LedgerPage /> },
          { path: "readiness", element: <ReadinessPage /> },
          { path: "integrity", element: <IntegrityPage /> },
          { path: "qa", element: <QaPage /> },
          { path: "policies", element: <PoliciesPage /> },
          { path: "materials", element: <MaterialsPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
