import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import NavigationTabs from "@/components/NavigationTabs";
import OverviewTab from "@/components/OverviewTab";
import ScheduleTab from "@/components/ScheduleTab";
import BillingTab from "@/components/BillingTab";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["/api/dashboard"],
  });

  const { data: userData } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tutoring-blue mx-auto mb-4"></div>
          <p className="text-text-light">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData || !userData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-dark">Unable to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        username={userData.parent.name}
        students={userData.students.map((s: any) => s.name)}
      />
      
      <NavigationTabs activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "overview" && <OverviewTab data={dashboardData} />}
        {activeTab === "schedule" && <ScheduleTab data={dashboardData} students={userData.students} />}
        {activeTab === "billing" && <BillingTab data={dashboardData} />}
      </div>
    </div>
  );
}
