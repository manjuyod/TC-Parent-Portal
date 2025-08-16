import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarX, Edit } from "lucide-react";

interface ScheduleTabProps {
  data: any;
  students: any[];
}

export default function ScheduleTab({ data, students }: ScheduleTabProps) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [currentSession, setCurrentSession] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [requestedChange, setRequestedChange] = useState("");
  const [reason, setReason] = useState("");
  
  const { toast } = useToast();
  const { sessions } = data;

  const scheduleChangeMutation = useMutation({
    mutationFn: async (requestData: any) => {
      const response = await apiRequest("POST", "/api/schedule-change-request", requestData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Request Submitted",
        description: data.message,
      });
      // Reset form
      setSelectedStudent("");
      setCurrentSession("");
      setPreferredDate("");
      setPreferredTime("");
      setRequestedChange("");
      setReason("");
      
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit schedule change request",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudent || !currentSession || !preferredDate || !preferredTime || !requestedChange) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    scheduleChangeMutation.mutate({
      studentId: selectedStudent,
      currentSession,
      preferredDate,
      preferredTime,
      requestedChange,
      reason,
    });
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) return "bg-gray-100 text-gray-800";
    
    switch (status.toLowerCase()) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      {/* Current Schedule */}
      <div className="xl:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-tutoring-orange text-white p-6">
            <CardTitle className="text-xl font-semibold flex items-center">
              <CalendarX className="mr-3 h-6 w-6" />
              Current Schedule
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-tutoring-blue text-white">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Day</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sessions.map((session: any) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-text-dark">
                        {session.studentName}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-light">{session.Day || session.dayOfWeek || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-text-light">
                        {session.Time || `${session.startTime} - ${session.endTime}` || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-light">{session.subject || 'Tutoring'}</td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(session.status)}>
                          {session.status || 'Active'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-light">
                        No scheduled sessions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Change Request */}
      <Card>
        <CardHeader className="bg-tutoring-blue text-white p-6">
          <CardTitle className="text-xl font-semibold flex items-center">
            <Edit className="mr-3 h-6 w-6" />
            Request Change
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="student_select" className="block text-sm font-semibold text-text-dark mb-2">
                Student
              </Label>
              <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="current_session" className="block text-sm font-semibold text-text-dark mb-2">
                Current Session
              </Label>
              <Input
                id="current_session"
                placeholder="e.g., Monday 3:00 PM"
                value={currentSession}
                onChange={(e) => setCurrentSession(e.target.value)}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="preferred_date" className="block text-sm font-semibold text-text-dark mb-2">
                New Date
              </Label>
              <Input
                type="date"
                id="preferred_date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="preferred_time" className="block text-sm font-semibold text-text-dark mb-2">
                Preferred Time
              </Label>
              <Input
                type="time"
                id="preferred_time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="requested_change" className="block text-sm font-semibold text-text-dark mb-2">
                Requested Change
              </Label>
              <Textarea
                id="requested_change"
                rows={3}
                placeholder="Describe what changes you would like to make"
                value={requestedChange}
                onChange={(e) => setRequestedChange(e.target.value)}
                required
                className="resize-none"
              />
            </div>
            
            <div>
              <Label htmlFor="reason" className="block text-sm font-semibold text-text-dark mb-2">
                Reason (Optional)
              </Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder="Please explain the reason for the schedule change..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none"
              />
            </div>
            
            <Button
              type="submit"
              disabled={scheduleChangeMutation.isPending}
              className="w-full bg-tutoring-orange text-white py-3 px-6 rounded-lg font-semibold hover:bg-opacity-90 transition-colors"
            >
              {scheduleChangeMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
