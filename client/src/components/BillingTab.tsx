import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, History } from "lucide-react";

interface BillingTabProps {
  data: any;
}

export default function BillingTab({ data }: BillingTabProps) {
  const { billing, transactions } = data;

  if (!billing) {
    return (
      <div className="text-center py-8">
        <p className="text-text-light">No billing information available</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Billing Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-text-dark flex items-center">
            <Wallet className="text-tutoring-orange mr-3 h-6 w-6" />
            Billing Summary
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              ${billing.currentBalance}
            </div>
            <div className="text-sm text-text-light">Current Balance</div>
          </div>
          
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-text-light">Monthly Rate:</span>
            <span className="font-medium">${billing.monthlyRate}</span>
          </div>
          
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-text-light">Sessions This Month:</span>
            <span className="font-medium">{billing.sessionsThisMonth}</span>
          </div>
          
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-text-light">Next Payment:</span>
            <span className="font-medium">{billing.nextPaymentDate}</span>
          </div>
          
          <div className="flex justify-between py-2">
            <span className="text-text-light">Payment Method:</span>
            <span className="font-medium">{billing.paymentMethod}</span>
          </div>
          
          <Button className="w-full mt-6 bg-tutoring-blue text-white py-3 px-6 rounded-lg font-semibold hover:bg-opacity-90 transition-colors">
            Update Payment Method
          </Button>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-tutoring-orange text-white p-6">
            <CardTitle className="text-xl font-semibold flex items-center">
              <History className="mr-3 h-6 w-6" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-dark uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-dark uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-dark uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-dark uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((transaction: any) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-text-light">
                        {transaction.date}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-text-dark">
                        {transaction.description}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-dark">
                        ${transaction.amount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-light">
                        No transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 text-center">
              <Button variant="link" className="text-tutoring-blue hover:text-light-blue font-medium transition-colors">
                View All Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
