import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarPlus, Receipt, Headphones } from "lucide-react";

interface OverviewTabProps {
  data: any;
}

export default function OverviewTab({ data }: OverviewTabProps) {
  const { students, billing } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Student Cards */}
      {students.map((student: any) => (
        <Card key={student.id} className="hover:shadow-xl transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-text-dark">
                {student.name}
              </CardTitle>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {student.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-text-light">Grade:</span>
              <span className="font-medium">{student.grade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-light">Subject:</span>
              <span className="font-medium">{student.subject}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-light">Next Session:</span>
              <span className="font-medium text-tutoring-blue">{student.nextSession}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-light">Progress:</span>
              <div className="flex items-center space-x-2">
                <Progress value={student.progress} className="w-16" />
                <span className="text-sm font-medium">{student.progress}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-text-dark">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full justify-start text-left p-3 h-auto border border-gray-200 hover:bg-gray-50"
          >
            <CalendarPlus className="h-5 w-5 text-tutoring-orange mr-3" />
            <span className="font-medium">Request Schedule Change</span>
          </Button>
          <Button 
            variant="outline" 
            className="w-full justify-start text-left p-3 h-auto border border-gray-200 hover:bg-gray-50"
          >
            <Receipt className="h-5 w-5 text-tutoring-blue mr-3" />
            <span className="font-medium">View Billing Details</span>
          </Button>
          <Button 
            variant="outline" 
            className="w-full justify-start text-left p-3 h-auto border border-gray-200 hover:bg-gray-50"
          >
            <Headphones className="h-5 w-5 text-light-blue mr-3" />
            <span className="font-medium">Contact Support</span>
          </Button>
        </CardContent>
      </Card>

      {/* Account Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-text-dark">Account Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
            <span className="text-text-light">Current Balance</span>
            <span className="text-2xl font-bold text-green-600">
              ${billing?.currentBalance || "0.00"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-light">This Month's Sessions:</span>
            <span className="font-medium">{billing?.sessionsThisMonth || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-light">Next Payment Due:</span>
            <span className="font-medium">{billing?.nextPaymentDate || "N/A"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
