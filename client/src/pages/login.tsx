import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import logoPath from "@assets/logo_1755332058201.webp";

export default function Login() {
  const [email, setEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; contactPhone: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid phone number. Please contact your tutoring center.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, contactPhone });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-light-blue to-tutoring-blue flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <CardHeader className="bg-cream p-8 text-center">
          <img 
            src={logoPath} 
            alt="Tutoring Club Logo" 
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-tutoring-blue">Parent Portal Login</h1>
        </CardHeader>
        
        <CardContent className="p-8">
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
            <p className="text-sm text-text-light">
              Enter your email and phone number to access your student information
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" className="block text-sm font-semibold text-text-dark mb-2">
                Email Address (Username)
              </Label>
              <Input
                type="email"
                id="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-tutoring-blue focus:outline-none transition-colors"
              />
            </div>
            
            <div>
              <Label htmlFor="contact_number" className="block text-sm font-semibold text-text-dark mb-2">
                Phone Number (Password)
              </Label>
              <Input
                type="tel"
                id="contact_number"
                placeholder="(555) 123-4567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-tutoring-blue focus:outline-none transition-colors"
              />
            </div>
            
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-tutoring-blue text-white py-3 px-6 rounded-lg font-semibold uppercase tracking-wide hover:bg-opacity-90 hover:transform hover:-translate-y-0.5 transition-all shadow-lg"
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
          
          <div className="text-center mt-6">
            <small className="text-text-light">
              Enter your registered contact number to access your account
            </small>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
