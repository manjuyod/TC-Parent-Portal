import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface HeaderProps {
  username: string;
  students: string[];
}

export default function Header({ username, students }: HeaderProps) {
  const [, navigate] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <img 
              src="https://images.unsplash.com/photo-1606761568499-6d2451b23c66?ixlib=rb-4.0.3&auto=format&fit=crop&w=60&h=60" 
              alt="Tutoring Club Logo" 
              className="h-12 w-auto"
            />
            <h1 className="text-2xl font-bold text-tutoring-blue">Tutoring Club Parent Portal</h1>
          </div>
          
          <div className="text-right">
            <div className="font-semibold text-text-dark">Welcome, {username}!</div>
            <div className="text-sm text-text-light">
              Students: {students.join(', ')}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="mt-2 text-sm text-tutoring-blue hover:text-light-blue transition-colors"
            >
              <LogOut className="w-4 h-4 mr-1" />
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
