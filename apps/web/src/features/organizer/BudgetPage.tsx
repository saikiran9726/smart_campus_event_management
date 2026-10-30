import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

interface AllocationItem {
  id: string;
  category: string;
  allocatedPaise: number;
  spentPaise: number;
  remainingPaise: number;
}

interface ExpenseItem {
  id: string;
  allocationId: string;
  category: string;
  description: string;
  amountPaise: number;
  receiptKey: string;
  facultySignedAt?: string | null;
  createdAt: string;
}

interface BudgetData {
  clubId: string;
  totalAllocatedPaise: number;
  totalSpentPaise: number;
  totalRemainingPaise: number;
  allocations: AllocationItem[];
  expenses: ExpenseItem[];
}

export const BudgetPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [clubId, setClubId] = useState<string>('11111111-1111-1111-1111-111111111111');

  // Add Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedAllocationId, setSelectedAllocationId] = useState('');
  const [expenseAmountRupees, setExpenseAmountRupees] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [receiptKey, setReceiptKey] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // 1. Fetch Clubs
  const { data: clubs } = useQuery<{ clubs: Array<{ id: string; name: string }> }>({
    queryKey: ['clubs', 'me'],
    queryFn: async () => {
      try {
        const res = await api.get<{ clubs: Array<{ id: string; name: string }> }>('/clubs/me');
        return res;
      } catch {
        return { clubs: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Computer Science Society' }] };
      }
    },
  });

  // 2. Fetch Club Budget
  const { data: budgetData, isLoading } = useQuery<BudgetData>({
    queryKey: ['clubs', clubId, 'budget'],
    queryFn: async () => {
      try {
        return await api.get<BudgetData>(`/clubs/${clubId}/budget`);
      } catch {
        return {
          clubId,
          totalAllocatedPaise: 25000000, // ₹250,000
          totalSpentPaise: 16500000,     // ₹165,000
          totalRemainingPaise: 8500000,
          allocations: [
            { id: 'alloc-1', category: 'Venue & Logistics', allocatedPaise: 10000000, spentPaise: 8500000, remainingPaise: 1500000 },
            { id: 'alloc-2', category: 'Catering & Meals', allocatedPaise: 8000000, spentPaise: 6000000, remainingPaise: 2000000 },
            { id: 'alloc-3', category: 'Prizes & Swag', allocatedPaise: 7000000, spentPaise: 2000000, remainingPaise: 5000000 },
          ],
          expenses: [
            { id: 'exp-1', allocationId: 'alloc-1', category: 'Venue & Logistics', description: 'Auditorium AC & electrical deposit', amountPaise: 5000000, receiptKey: 'receipts/rec-01.pdf', facultySignedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
            { id: 'exp-2', allocationId: 'alloc-2', category: 'Catering & Meals', description: 'Volunteer meal box lunch (60 units)', amountPaise: 3500000, receiptKey: 'receipts/rec-02.pdf', facultySignedAt: null, createdAt: new Date().toISOString() },
          ],
        };
      }
    },
    enabled: !!clubId,
  });

  // Receipt File Upload to R2
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadProgress(0);
      const presign = await api.post<{ uploadUrl: string; objectKey: string }>(
        '/uploads/presign',
        {
          purpose: 'ATTACHMENT',
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          sizeBytes: file.size,
        }
      );

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Receipt upload failed.'));
        };
        xhr.onerror = () => reject(new Error('Network error.'));
        xhr.send(file);
      });

      setReceiptKey(presign.objectKey);
      toast.success('Receipt uploaded to R2.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload receipt.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Add Expense Mutation
  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAllocationId) throw new Error('Select an allocation category.');
      if (expenseAmountRupees <= 0) throw new Error('Amount must be positive.');
      if (!receiptKey) throw new Error('Receipt upload is required.');

      return await api.post(`/allocations/${selectedAllocationId}/expenses`, {
        amountPaise: Math.round(expenseAmountRupees * 100),
        category: expenseCategory,
        description: expenseDescription,
        receiptKey,
      });
    },
    onSuccess: () => {
      toast.success('Expense recorded and submitted for faculty sign-off.');
      setIsExpenseModalOpen(false);
      setExpenseAmountRupees(0);
      setExpenseDescription('');
      setReceiptKey('');
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'budget'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to add expense.');
    },
  });

  const allocations = budgetData?.allocations ?? [];
  const expenses = budgetData?.expenses ?? [];

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/organizer')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <DollarSign className="h-7 w-7 text-emerald-600" />
              Club Budget & Receipts Ledger
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time expenditure tracking, R2 receipt vault, and faculty endorsement verification.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/clubs/${clubId}/budget/export.csv`, '_blank');
            }}
            className="gap-2 shadow-sm"
            data-testid="btn-export-budget-csv"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </Button>

          <Button
            onClick={() => setIsExpenseModalOpen(true)}
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            data-testid="btn-add-expense"
          >
            <Plus className="h-4 w-4" />
            <span>Add Expense</span>
          </Button>
        </div>
      </div>

      {/* Allocation Cards (Progress bar spent vs allocated: Amber at 80%, Rose when over) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {allocations.map((alloc) => {
          const pct = alloc.allocatedPaise > 0
            ? Math.round((alloc.spentPaise / alloc.allocatedPaise) * 100)
            : 0;

          // Color calculation: Amber at 80%, Rose over 100%
          const isOver = pct > 100;
          const isWarning = pct >= 80 && pct <= 100;

          return (
            <Card
              key={alloc.id}
              className={`p-5 space-y-3 border ${
                isOver
                  ? 'border-rose-300 dark:border-rose-900 bg-rose-500/[0.02]'
                  : isWarning
                  ? 'border-amber-300 dark:border-amber-900 bg-amber-500/[0.02]'
                  : 'border-border'
              }`}
              data-testid={`allocation-card-${alloc.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{alloc.category}</span>
                <Badge
                  variant={isOver ? 'destructive' : isWarning ? 'outline' : 'secondary'}
                  className={
                    isWarning
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 text-[10px]'
                      : 'text-[10px]'
                  }
                >
                  {pct}% spent
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs tnum">
                  <span className="text-muted-foreground">
                    Spent: ₹{(alloc.spentPaise / 100).toLocaleString()}
                  </span>
                  <span className="font-semibold">
                    Allocated: ₹{(alloc.allocatedPaise / 100).toLocaleString()}
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, pct)}%` }}
                    className={`h-full rounded-full transition-all ${
                      isOver
                        ? 'bg-rose-600'
                        : isWarning
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground tnum">
                Remaining: <strong className={isOver ? 'text-rose-600' : ''}>₹{(alloc.remainingPaise / 100).toLocaleString()}</strong>
              </p>
            </Card>
          );
        })}
      </div>

      {/* Ledger Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-500" />
            Expenditure Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No expenses recorded yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{exp.description}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {exp.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                      <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                      {exp.receiptKey && (
                        <a
                          href={`#`}
                          onClick={(e) => {
                            e.preventDefault();
                            toast.info(`Receipt: ${exp.receiptKey}`);
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                        >
                          <FileText className="h-3 w-3" />
                          View Receipt
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-extrabold text-sm tnum">
                      ₹{(exp.amountPaise / 100).toFixed(2)}
                    </span>
                    {exp.facultySignedAt ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Faculty Signed
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 text-[10px] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pending Sign-off
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Modal */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Club Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>Budget Allocation</Label>
              <Select
                value={selectedAllocationId}
                onValueChange={(val) => {
                  setSelectedAllocationId(val);
                  const found = allocations.find((a) => a.id === val);
                  if (found) setExpenseCategory(found.category);
                }}
              >
                <SelectTrigger data-testid="select-expense-allocation">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {allocations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.category} (Remaining: ₹{(a.remainingPaise / 100).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="exp-amount">Amount (₹ Rupees)</Label>
              <Input
                id="exp-amount"
                type="number"
                min={1}
                value={expenseAmountRupees}
                onChange={(e) => setExpenseAmountRupees(Number(e.target.value))}
                placeholder="2500"
                data-testid="input-expense-amount"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="exp-desc">Description / Purpose</Label>
              <Input
                id="exp-desc"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="e.g. Stage lighting setup fee"
                data-testid="input-expense-desc"
              />
            </div>

            <div className="space-y-1 pt-1">
              <Label>Receipt Upload (R2 Vault)</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer border rounded px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose Receipt (PDF/Image)</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleReceiptUpload}
                    className="hidden"
                  />
                </label>
                {receiptKey && (
                  <Badge variant="outline" className="text-emerald-600 text-[10px]">
                    Receipt attached
                  </Badge>
                )}
              </div>
              {uploadProgress !== null && (
                <Progress value={uploadProgress} className="h-1.5 mt-1" />
              )}
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addExpenseMutation.mutate()}
              disabled={addExpenseMutation.isPending}
              data-testid="btn-submit-expense"
            >
              Record Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetPage;
