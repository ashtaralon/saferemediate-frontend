import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  vulnerabilityId?: string;
  fixDescription?: string;
}

export const SimulateFixModal: React.FC<SimulateFixModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  vulnerabilityId,
  fixDescription,
}) => {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    setError(null);
    try {
      const response = await fetch('/api/proxy/safe-remediate/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vulnerabilityId,
          fixDescription,
        }),
      });

      if (response.status === 403) {
        setError('You do not have permission to execute this fix. Please contact your administrator.');
        toast({
          title: 'Permission Denied',
          description: 'You do not have permission to execute this fix.',
          variant: 'destructive',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to execute fix: ${response.statusText}`);
      }

      const data = await response.json();
      onConfirm();
      toast({
        title: 'Success',
        description: 'Fix executed successfully.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Execute Security Fix</AlertDialogTitle>
          <AlertDialogDescription>
            {fixDescription || 'Are you sure you want to execute this security fix?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">
            {error}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleExecute} disabled={isLoading}>
            {isLoading ? 'Executing...' : 'Execute'}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
