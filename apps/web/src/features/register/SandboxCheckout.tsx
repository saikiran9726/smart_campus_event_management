import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle, CheckCircle2, XCircle, CreditCard, Receipt } from 'lucide-react';

export interface SandboxCheckoutProps {
  eventId: string;
  registrationId: string;
  eventTitle: string;
  amountPaise: number;
  onSuccess: (receipt: Record<string, unknown>) => void;
  onFailure: (errorMsg: string) => void;
  onCancel: () => void;
}

export const SandboxCheckout: React.FC<SandboxCheckoutProps> = ({
  eventId,
  registrationId,
  eventTitle,
  amountPaise,
  onSuccess,
  onFailure,
  onCancel,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const formattedRupees = `₹${(amountPaise / 100).toFixed(2)}`;

  const handleSimulate = async (outcome: 'SUCCESS' | 'FAILED') => {
    setIsProcessing(true);
    try {
      if (outcome === 'SUCCESS') {
        const res = await api.post<{ success: boolean; transactionId: string }>(
          `/events/${eventId}/payments/sandbox`,
          {
            registrationId,
            outcome: 'SUCCESS',
          }
        );
        toast({
          title: 'Payment Simulated Successfully',
          description: `Transaction reference ${res.transactionId || 'SANDBOX_TX_001'} confirmed.`,
        });
        onSuccess(res);
      } else {
        await api.post(`/events/${eventId}/payments/sandbox`, {
          registrationId,
          outcome: 'FAILED',
        });
        toast({
          variant: 'destructive',
          title: 'Simulated Payment Declined',
          description: 'Payment was declined as requested for sandbox failure test.',
        });
        onFailure('Simulated payment failure triggered.');
      }
    } catch {
      // In dev fallback or offline mode
      if (outcome === 'SUCCESS') {
        onSuccess({ transactionId: `TX_${Date.now()}` });
      } else {
        onFailure('Sandbox simulation decline.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border shadow-xl max-w-lg mx-auto" data-testid="sandbox-checkout">
      {/* Test Mode Banner */}
      <div className="bg-amber-500 text-slate-950 font-bold px-4 py-2.5 text-xs flex items-center justify-center gap-2 rounded-t-xl tracking-wide uppercase">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>TEST MODE: no real money, no bank or UPI details collected</span>
      </div>

      <CardHeader className="p-6 pb-3 space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <CreditCard className="h-5 w-5" />
          <CardTitle className="text-xl font-bold">Campus Payment Sandbox</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Simulate payment processing for your campus event registration seat.
        </p>
      </CardHeader>

      <CardContent className="p-6 pt-0 space-y-5">
        {/* Ledger-style receipt */}
        <div className="p-4 rounded-xl border border-dashed border-border bg-muted/30 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="flex items-center gap-1.5 font-sans font-bold text-sm text-foreground">
              <Receipt className="h-4 w-4 text-indigo-500" />
              Eventora Ledger Receipt
            </span>
            <span className="text-[11px] text-muted-foreground tnum">{new Date().toLocaleDateString()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Item / Description</span>
            <span className="font-semibold text-foreground text-right truncate max-w-[200px]">{eventTitle}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Registration Reference</span>
            <span className="text-primary truncate max-w-[200px]">{registrationId}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Subtotal</span>
            <span className="font-semibold tnum">{formattedRupees}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">University Processing Fee</span>
            <span className="font-semibold tnum">₹0.00</span>
          </div>

          <div className="flex justify-between pt-2 border-t border-border font-bold text-sm text-foreground">
            <span className="font-sans">Total Amount</span>
            <span className="text-indigo-600 dark:text-indigo-400 tnum">{formattedRupees}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-6 pt-0 flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-3 w-full">
          <Button
            type="button"
            variant="default"
            disabled={isProcessing}
            onClick={() => handleSimulate('SUCCESS')}
            className="h-12 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white min-h-[48px] inline-flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Simulate Success</span>
          </Button>

          <Button
            type="button"
            variant="destructive"
            disabled={isProcessing}
            onClick={() => handleSimulate('FAILED')}
            className="h-12 font-semibold min-h-[48px] inline-flex items-center justify-center gap-2"
          >
            <XCircle className="h-4 w-4" />
            <span>Simulate Failure</span>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isProcessing}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel & Return
        </Button>
      </CardFooter>
    </Card>
  );
};
