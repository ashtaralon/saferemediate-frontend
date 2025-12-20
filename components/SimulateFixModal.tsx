import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SimulateFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulate: (input: string) => Promise<void>;
  isLoading?: boolean;
}

export function SimulateFixModal({
  isOpen,
  onClose,
  onSimulate,
  isLoading = false,
}: SimulateFixModalProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!input.trim()) {
      setError('Please enter a value to simulate');
      return;
    }

    try {
      await onSimulate(input);
      setInput('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulate Fix</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="simulate-input">Input Value</Label>
            <Input
              id="simulate-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter value to simulate"
              disabled={isLoading}
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Simulating...' : 'Simulate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
