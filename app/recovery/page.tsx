'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface Snapshot {
  snapshot_id: string;
  id: string;
  finding_id: string;
  issue_id: string;
  resource_type: string;
  created_at: string;
  created_by: string;
  reason: string;
  status: string;
  system_name?: string;
}

export default function RecoveryTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { toast } = useToast();

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com';

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/snapshots`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch snapshots: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle both array and object with snapshots array
      const snapshotsArray = Array.isArray(data) ? data : (data.snapshots || []);
      
      setSnapshots(snapshotsArray);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      toast({
        title: 'Error',
        description: 'Failed to load snapshots',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (snapshot: Snapshot) => {
    const snapshotId = snapshot.snapshot_id || snapshot.id;
    
    if (!snapshotId) {
      toast({
        title: 'Error',
        description: 'Invalid snapshot ID',
        variant: 'destructive',
      });
      return;
    }

    try {
      setRestoring(snapshotId);
      
      const response = await fetch(`${backendUrl}/api/snapshots/${snapshotId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to restore: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: `Snapshot ${snapshotId} restored successfully`,
      });

      // Refresh snapshots list
      await fetchSnapshots();
      
    } catch (error) {
      console.error('Error restoring snapshot:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to restore snapshot',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading snapshots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Recovery & Restore</h1>
        <p className="text-gray-600">
          Restore resources to their previous state using snapshots taken before remediation.
        </p>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No snapshots available</p>
          <button
            onClick={fetchSnapshots}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshots.map((snapshot) => {
            const snapshotId = snapshot.snapshot_id || snapshot.id;
            const isRestoring = restoring === snapshotId;
            
            return (
              <div
                key={snapshotId}
                className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {snapshot.current_state?.role_name || snapshot.current_state?.resource_name || snapshot.finding_id || 'Unknown Resource'}
                      </h3>
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                        {snapshot.resource_type || 'Unknown'}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        snapshot.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {snapshot.status || 'ACTIVE'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        <span className="font-medium">Snapshot ID:</span> {snapshotId}
                      </p>
                      <p>
                        <span className="font-medium">Issue ID:</span> {snapshot.finding_id || snapshot.issue_id || 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Created:</span> {formatDate(snapshot.created_at)}
                      </p>
                      {snapshot.reason && (
                        <p>
                          <span className="font-medium">Reason:</span> {snapshot.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRestore(snapshot)}
                    disabled={isRestoring}
                    className={`ml-4 px-4 py-2 rounded font-medium transition-colors ${
                      isRestoring
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isRestoring ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

